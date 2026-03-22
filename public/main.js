// ═══════════════════════════════════════════════════════════
//  MAIN — Entry point: initializes everything & wires events
// ═══════════════════════════════════════════════════════════

(function () {
    'use strict';

    const SESSION_TOKEN_KEY = 'monopoly-session-token';
    const ROOM_CODE_KEY = 'monopoly-room-code';
    const hasExistingSession = Boolean(sessionStorage.getItem(SESSION_TOKEN_KEY) || localStorage.getItem(SESSION_TOKEN_KEY));
    
    // --- INTRO ANIMATION SEQUENCE ---
    (function initIntro() {
        const introScreen = document.getElementById('intro-screen');
        if (!introScreen) return;

        if (hasExistingSession) {
            introScreen.remove();
            return;
        }

        // Sequence: 
        // 1. Pop-in completes (2s)
        // 2. Fade out entire screen (after 5.5s)

        setTimeout(() => {
            introScreen.classList.add('fade-out');
            // Allow game interaction once it starts fading
            introScreen.style.pointerEvents = 'none';
        }, 5500);

        setTimeout(() => {
            introScreen.remove();
        }, 7000);
    })();

    let scene = null;
    let camera = null;
    let renderer = null;
    let hasStartedRuntime = false;
    const BOARD_MAPS = window.BOARD_MAPS || {};
    const DEFAULT_VIEW_MODE = 'isometric';
    const sessionToken = getOrCreateSessionToken();
    const initialRoomCode = resolveInitialRoomCode();
    const socket = io({ autoConnect: false, auth: { sessionToken, roomCode: initialRoomCode || undefined } });
    const {
        normalizeSerializedGameState = (state) => state,
        isStaleSerializedGameState = () => false
    } = window.MonopolyStateSync || {};
    let myPlayerId = null;
    let currentGameState = null;
    let currentBoardId = window.DEFAULT_BOARD_ID || 'egypt';
    let activeRoomCode = initialRoomCode;
    let focusedTileIndex = null;
    function shouldFastForwardHiddenTabAnimation() {
        if (document.visibilityState !== 'visible') return true;
        if (typeof document.hasFocus === 'function') {
            return !document.hasFocus();
        }
        return false;
    }

    function isCompactGameplayLayout() {
        const width = window.innerWidth || document.documentElement.clientWidth || 0;
        return width < 1200;
    }

    const fallbackGameplayBridge = {
        mount: () => {},
        update: () => {},
        destroy: () => {}
    };
    const gameHud = document.getElementById('game-hud');
    const gameplayUiRoot = document.getElementById('gameplay-ui-root');
    let isGameStartTransitionRunning = false;
    let isGameStartPreLocked = false;
    let allowGameStartSkip = false;
    let gameStartWasSkipped = false;
    let resolveGameStartSkip = null;
    let gameStartPreLockTimeoutId = null;
    let gameStartSkipRevealTimeoutId = null;
    const cameraViewBtn = document.getElementById('camera-view-btn');
    const cameraTopdownBtn = document.getElementById('camera-topdown-btn');
    const cameraIsoBtn = document.getElementById('camera-iso-btn');
    const cameraResetBtn = document.getElementById('camera-reset-btn');
    const viewDockToggle = document.getElementById('view-dock-toggle');
    const viewDock = document.getElementById('view-dock');
    const roomGate = document.getElementById('room-gate');
    const roomGateStatus = document.getElementById('room-gate-status');
    const roomCodeInput = document.getElementById('room-code-input');
    const loadGameInput = document.getElementById('load-game-input');
    const hostControlsShell = document.getElementById('host-controls-shell');
    const hostTurnTimerEnabledInput = document.getElementById('host-turn-timer-enabled');
    const hostExtendTimer15Btn = document.getElementById('host-extend-timer-15-btn');
    const hostExtendTimer30Btn = document.getElementById('host-extend-timer-30-btn');
    const hostTurnTimerStatus = document.getElementById('host-turn-timer-status');
    const gameStartOverlay = document.getElementById('game-start-overlay');
    const gameStartPlayerSequence = document.getElementById('game-start-player-sequence');
    const gameStartTitle = document.getElementById('game-start-title');
    const gameStartSubtitle = document.getElementById('game-start-subtitle');
    const gameStartCountdown = document.getElementById('game-start-countdown');
    const gameStartSkipBtn = document.getElementById('game-start-skip');
    let topBarResizeObserver = null;
    let lobbyState = null;
    let gameplayUiMounted = false;
    let gameplayUiMountTimer = null;
    let actionCardFlipTimeout = null;
    let actionCardDismissTimeout = null;
    let diceResultTimeout = null;
    const uiState = {
        historyEvents: [],
        pendingTrades: [],
        buyPrompt: null,
        auctionState: null,
        ownAuction: { open: false, selectedTileIndex: null, startPrice: 0, timeSeconds: 3 },
        tradeComposer: { open: false, targetId: null, counterTradeId: null, offerCash: 0, requestCash: 0, offerProperties: [], requestProperties: [], validation: null },
        tradeIncomingModalTradeId: null,
        propertyDetailsTileIndex: null,
        summary: null,
        endStats: { visible: false, summary: null, winner: null },
        actionCard: null,
        diceResult: null,
        overflowOpen: false,
        leaderboardCollapsed: false,
        hostControlsOpen: false,
        lowerTab: 'history',
        lowerExpanded: false,
        lowerCollapsed: false,
        viewDockOpen: false
    };

    function wait(ms) {
        return new Promise(resolve => window.setTimeout(resolve, ms));
    }

    function getStartTransitionPlayers(state) {
        return (state?.players || []).map((player) => ({
            name: player.name || player.character || 'Player',
            character: player.character || 'custom',
            skinId: player.skinId || null,
            image: player.customAvatarUrl
                || (player.character ? `./characters/${player.character}.webp` : './characters/custom.svg')
        }));
    }

    function getTransitionSkinMeta(player) {
        const lobbyApi = window.Lobby;
        if (lobbyApi?.getChampionSkinMeta) {
            return lobbyApi.getChampionSkinMeta(player.character, player.skinId, player.image);
        }
        return {
            title: player.character || 'Champion',
            rarity: 'common',
            image: player.image
        };
    }

    function clearGameStartPreLockTimeout() {
        if (gameStartPreLockTimeoutId) {
            window.clearTimeout(gameStartPreLockTimeoutId);
            gameStartPreLockTimeoutId = null;
        }
    }

    function clearGameStartSkipRevealTimeout() {
        if (gameStartSkipRevealTimeoutId) {
            window.clearTimeout(gameStartSkipRevealTimeoutId);
            gameStartSkipRevealTimeoutId = null;
        }
    }

    function lockGameStartUI({ withFailSafe = false } = {}) {
        isGameStartPreLocked = true;
        document.body.classList.add('game-start-transitioning');
        if (withFailSafe) {
            clearGameStartPreLockTimeout();
            gameStartPreLockTimeoutId = window.setTimeout(() => {
                if (!isGameStartTransitionRunning) {
                    cancelGameStartTransition();
                }
            }, 5000);
        }
    }

    function unlockGameStartUI() {
        clearGameStartPreLockTimeout();
        isGameStartPreLocked = false;
        document.body.classList.remove('game-start-transitioning');
    }

    function resetGameStartOverlay() {
        clearGameStartSkipRevealTimeout();
        gameStartOverlay?.classList.add('hidden');
        gameStartOverlay?.classList.remove('is-zooming', 'is-flashing');
        if (gameStartOverlay) {
            gameStartOverlay.dataset.phase = 'idle';
        }
        gameStartOverlay?.setAttribute('aria-hidden', 'true');
        if (gameStartPlayerSequence) gameStartPlayerSequence.innerHTML = '';
        gameStartCountdown?.classList.add('hidden');
        gameStartCountdown?.classList.remove('show');
        if (gameStartCountdown) gameStartCountdown.textContent = '3';
        if (gameStartTitle) gameStartTitle.textContent = 'MATCH STARTING';
        if (gameStartSubtitle) gameStartSubtitle.textContent = 'Lock in. Power up. Enter the board.';
        gameStartSkipBtn?.classList.add('hidden');
    }

    function setGameStartPhase(phase) {
        if (gameStartOverlay) {
            gameStartOverlay.dataset.phase = phase;
        }
    }

    function cancelGameStartTransition() {
        allowGameStartSkip = false;
        gameStartWasSkipped = false;
        resolveGameStartSkip = null;
        resetGameStartOverlay();
        unlockGameStartUI();
        isGameStartTransitionRunning = false;
    }

    function waitForTransitionStep(ms, { allowSkip = false } = {}) {
        return new Promise((resolve) => {
            const timer = window.setTimeout(() => {
                if (resolveGameStartSkip === handleSkip) {
                    resolveGameStartSkip = null;
                }
                resolve();
            }, ms);

            function handleSkip() {
                window.clearTimeout(timer);
                resolveGameStartSkip = null;
                resolve();
            }

            if (allowSkip) {
                resolveGameStartSkip = handleSkip;
            }
        });
    }

    async function playPlayerIntroSequence(players) {
        if (!gameStartPlayerSequence) return;
        for (const player of players) {
            const skinMeta = getTransitionSkinMeta(player);
            const card = document.createElement('div');
            card.className = `game-start-player-card rarity-${skinMeta.rarity || 'common'}`;
            card.innerHTML = `
                <img class="game-start-player-avatar" src="${skinMeta.image}" alt="${player.name}" />
                <div class="game-start-player-name">${player.name}</div>
                <div class="game-start-player-role">${player.character?.toUpperCase?.() || 'CHAMPION'} • ${skinMeta.title}</div>
                <div class="game-start-player-rarity">${String(skinMeta.rarity || 'common').toUpperCase()}</div>
            `;
            gameStartPlayerSequence.innerHTML = '';
            gameStartPlayerSequence.appendChild(card);
            if (gameStartTitle) gameStartTitle.textContent = 'INTRODUCING';
            if (gameStartSubtitle) gameStartSubtitle.textContent = `${player.name} • ${skinMeta.title}`;
            requestAnimationFrame(() => card.classList.add('show'));
            if (typeof GameAudio !== 'undefined' && typeof GameAudio.playLobbyReadyPulse === 'function') {
                GameAudio.playLobbyReadyPulse();
            }
            await waitForTransitionStep(320);
        }
    }

    async function playGameStartTransition(state) {
        if (isGameStartTransitionRunning) {
            return;
        }

        isGameStartTransitionRunning = true;
        gameStartWasSkipped = false;
        lockGameStartUI();
        resetGameStartOverlay();
        gameStartOverlay?.classList.remove('hidden');
        gameStartOverlay?.setAttribute('aria-hidden', 'false');
        setGameStartPhase('confirm');

        const players = getStartTransitionPlayers(state);
        if (gameStartTitle) gameStartTitle.textContent = 'SQUAD READY';
        if (gameStartSubtitle) gameStartSubtitle.textContent = 'Power signatures aligned. Syncing the arena.';
        await waitForTransitionStep(180);
        setGameStartPhase('focus');
        gameStartOverlay?.classList.add('is-zooming');
        await waitForTransitionStep(180);
        setGameStartPhase('introductions');
        await playPlayerIntroSequence(players);

        if (gameStartTitle) gameStartTitle.textContent = 'GET READY';
        if (gameStartSubtitle) gameStartSubtitle.textContent = 'All players confirmed. Entering the match.';
        await waitForTransitionStep(320);

        setGameStartPhase('countdown');
        if (gameStartTitle) gameStartTitle.textContent = 'MATCH STARTING';
        if (gameStartSubtitle) gameStartSubtitle.textContent = '3 • 2 • 1';
        gameStartCountdown?.classList.remove('hidden');

        clearGameStartSkipRevealTimeout();
        gameStartSkipRevealTimeoutId = window.setTimeout(() => {
            allowGameStartSkip = true;
            gameStartSkipBtn?.classList.remove('hidden');
        }, 1200);

        for (const step of ['3', '2', '1']) {
            if (gameStartCountdown) {
                gameStartCountdown.textContent = step;
                gameStartCountdown.classList.remove('show');
                void gameStartCountdown.offsetWidth;
                gameStartCountdown.classList.add('show');
            }
            if (typeof GameAudio !== 'undefined' && typeof GameAudio.playCountdownTick === 'function') {
                GameAudio.playCountdownTick(Number(step));
            }
            await waitForTransitionStep(520, { allowSkip: allowGameStartSkip });
            if (gameStartWasSkipped) {
                break;
            }
        }

        setGameStartPhase('launch');
        gameStartOverlay?.classList.add('is-flashing');
        if (typeof GameAudio !== 'undefined' && typeof GameAudio.playMatchStartImpact === 'function') {
            GameAudio.playMatchStartImpact();
        }
        await waitForTransitionStep(240);
        gameStartOverlay?.classList.remove('is-flashing');
        allowGameStartSkip = false;
        gameStartSkipBtn?.classList.add('hidden');
        resetGameStartOverlay();
        unlockGameStartUI();
        isGameStartTransitionRunning = false;
    }

    function startRuntime() {
        if (hasStartedRuntime) return;
        hasStartedRuntime = true;

        const runtime = GameScene.init();
        scene = runtime.scene;
        camera = runtime.camera;
        renderer = runtime.renderer;

        GameBoard.build(scene, renderer);
        GameDice.init(scene);
        GameTokens.init(scene, GameBoard.getTileWorldPosition);
        GameBoard.initRaycaster(camera, renderer);
        GameBoard.onTileClick((tileIndex) => {
            if (!currentGameState) return;
            if (uiState.buyPrompt || uiState.auctionState || uiState.tradeComposer.open || uiState.tradeIncomingModalTradeId || uiState.ownAuction.open || uiState.actionCard) return;
            setFocusedTile(tileIndex);
            openPropertyDetails(tileIndex);
        });
        GameScene.animate(renderRuntimeUI);
    }

    function scheduleRuntimeStart() {
        if (hasStartedRuntime) return;

        if (hasExistingSession) {
            startRuntime();
            return;
        }

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                if (typeof window.requestIdleCallback === 'function') {
                    window.requestIdleCallback(() => startRuntime(), { timeout: 800 });
                    return;
                }
                window.setTimeout(startRuntime, 0);
            });
        });
    }

    function resolveBoardId(boardId) {
        return BOARD_MAPS[boardId] ? boardId : (window.DEFAULT_BOARD_ID || 'egypt');
    }

    function getBoardTiles(boardId = currentBoardId) {
        return BOARD_MAPS[resolveBoardId(boardId)]?.tiles || GameBoard.getTileData();
    }

    function syncBoardSelection(boardId = currentGameState?.boardId || currentBoardId) {
        const resolvedBoardId = resolveBoardId(boardId);
        if (resolvedBoardId === currentBoardId && GameBoard.getCurrentBoardId?.() === resolvedBoardId) {
            return;
        }
        currentBoardId = resolvedBoardId;
        GameBoard.setBoardMap(resolvedBoardId, scene, renderer);
    }

    function getViewDockElement() {
        return document.getElementById('view-dock');
    }

    function getViewDockToggleElement() {
        return document.getElementById('view-dock-toggle');
    }

    function getTopBarElement() {
        return document.querySelector('.gpu-top-bar');
    }

    function resetOwnAuctionState() {
        uiState.ownAuction = { open: false, selectedTileIndex: null, startPrice: 0, timeSeconds: 3 };
    }

    function resetTradeComposer() {
        uiState.tradeComposer = { open: false, targetId: null, counterTradeId: null, offerCash: 0, requestCash: 0, offerProperties: [], requestProperties: [], validation: null };
    }

    function setDiceResult(payload) {
        if (diceResultTimeout) clearTimeout(diceResultTimeout);
        uiState.diceResult = payload;
        refreshGameplayUI();
        diceResultTimeout = window.setTimeout(() => {
            uiState.diceResult = null;
            refreshGameplayUI();
        }, 4000);
    }

    function clearActionCardTimers() {
        if (actionCardFlipTimeout) {
            clearTimeout(actionCardFlipTimeout);
            actionCardFlipTimeout = null;
        }
        if (actionCardDismissTimeout) {
            clearTimeout(actionCardDismissTimeout);
            actionCardDismissTimeout = null;
        }
    }

    function finishActionCard(cardState = uiState.actionCard) {
        if (!cardState || cardState.completed) return;

        cardState.completed = true;
        clearActionCardTimers();
        if (uiState.actionCard === cardState) {
            uiState.actionCard = null;
            refreshGameplayUI();
        }
        if (typeof cardState.callback === 'function') {
            cardState.callback();
        }
    }

    function showActionCard(card, result = {}, callback, options = {}) {
        clearActionCardTimers();
        const actionCardState = {
            card,
            result,
            phase: 'front',
            callback,
            completed: false
        };
        uiState.actionCard = actionCardState;
        refreshGameplayUI();

        if (options?.skipAnimation === true) {
            finishActionCard(actionCardState);
            return;
        }

        actionCardFlipTimeout = window.setTimeout(() => {
            if (uiState.actionCard !== actionCardState || actionCardState.completed) return;
            actionCardState.phase = 'flipped';
            refreshGameplayUI();
        }, 400);
        actionCardDismissTimeout = window.setTimeout(() => {
            finishActionCard(actionCardState);
        }, 4000);
    }

    function updatePendingTrades(trades = currentGameState?.pendingTrades || []) {
        uiState.pendingTrades = Array.isArray(trades) ? trades.map(trade => ({ ...trade })) : [];
    }

    function updateHistoryEvents(events = currentGameState?.historyEvents || []) {
        uiState.historyEvents = Array.isArray(events)
            ? events.slice(-50).map(event => ({ text: event.text, type: event.type }))
            : [];
    }

    function buildOrientationState() {
        const width = window.innerWidth || document.documentElement.clientWidth || 0;
        const height = window.innerHeight || document.documentElement.clientHeight || 0;
        const isPortrait = height > width;
        const isPhoneWidth = Math.min(width, height) <= 812;
        return {
            width,
            height,
            isPortrait,
            shouldRotate: isPortrait && isPhoneWidth
        };
    }

    function buildGameplaySnapshot() {
        return {
            visible: Boolean(currentGameState?.isGameStarted),
            myPlayerId,
            roomCode: activeRoomCode,
            viewMode: GameScene.getViewMode?.() || DEFAULT_VIEW_MODE,
            gameState: currentGameState,
            lobbyState,
            orientation: buildOrientationState(),
            ui: {
                historyEvents: uiState.historyEvents,
                pendingTrades: uiState.pendingTrades,
                buyPrompt: uiState.buyPrompt,
                auctionState: uiState.auctionState,
                ownAuction: uiState.ownAuction,
                tradeComposer: uiState.tradeComposer,
                tradeIncomingModalTradeId: uiState.tradeIncomingModalTradeId,
                propertyDetailsTileIndex: uiState.propertyDetailsTileIndex,
                summary: uiState.summary,
                endStats: uiState.endStats,
                actionCard: uiState.actionCard,
                diceResult: uiState.diceResult,
                overflowOpen: uiState.overflowOpen,
                leaderboardCollapsed: uiState.leaderboardCollapsed,
                hostControlsOpen: uiState.hostControlsOpen,
                lowerTab: uiState.lowerTab,
                lowerExpanded: uiState.lowerExpanded,
                lowerCollapsed: uiState.lowerCollapsed,
                viewDockOpen: uiState.viewDockOpen
            }
        };
    }

    function getGameplayBridge() {
        return window.GameplayUIBridge || fallbackGameplayBridge;
    }

    function refreshGameplayUI() {
        if (!gameplayUiMounted) {
            mountGameplayUi();
        }
        getGameplayBridge().update(buildGameplaySnapshot());
        syncTopDownHudLayout();
    }

    function closePropertyDetails() {
        uiState.propertyDetailsTileIndex = null;
        setFocusedTile(null);
        refreshGameplayUI();
    }

    function openPropertyDetails(tileIndex) {
        if (!currentGameState) return;
        const tile = getBoardTiles(currentGameState?.boardId)[tileIndex];
        if (!tile || tile.type === 'corner') return;
        uiState.propertyDetailsTileIndex = tileIndex;
        setFocusedTile(tileIndex);
        refreshGameplayUI();
    }

    function closeIncomingTradeModal() {
        uiState.tradeIncomingModalTradeId = null;
        refreshGameplayUI();
    }

    function openTradeComposer(targetId, options = {}) {
        const offer = options.prefillOffer || null;
        uiState.tradeComposer = {
            open: true,
            targetId,
            counterTradeId: options.counterTradeId || null,
            offerCash: offer?.requestCash || 0,
            requestCash: offer?.offerCash || 0,
            offerProperties: Array.isArray(offer?.requestProperties) ? [...offer.requestProperties] : [],
            requestProperties: Array.isArray(offer?.offerProperties) ? [...offer.offerProperties] : [],
            validation: null
        };
        uiState.lowerTab = 'trades';
        uiState.tradeIncomingModalTradeId = null;
        refreshGameplayUI();
    }

    function validateTradeComposer() {
        const composer = uiState.tradeComposer;
        const me = currentGameState?.players?.find(player => player.id === myPlayerId);
        const target = currentGameState?.players?.find(player => player.id === composer.targetId);
        if (!me || !target) {
            return { ok: false, message: 'Trade participants are no longer available.' };
        }
        if (composer.offerCash < 0 || composer.requestCash < 0) {
            return { ok: false, message: 'Trade cash values cannot be negative.' };
        }
        if (composer.offerCash > me.money) {
            return { ok: false, message: 'You do not have enough cash for this offer.' };
        }
        if (composer.requestCash > target.money) {
            return { ok: false, message: `${target.character} does not have that much cash right now.` };
        }
        if (!composer.offerProperties.length && !composer.requestProperties.length && !composer.offerCash && !composer.requestCash) {
            return { ok: false, message: 'Add cash or property before sending a trade.' };
        }
        return {
            ok: true,
            offer: {
                targetId: composer.targetId,
                offerProperties: composer.offerProperties,
                offerCash: composer.offerCash,
                requestProperties: composer.requestProperties,
                requestCash: composer.requestCash,
                counterToTradeId: composer.counterTradeId || null
            }
        };
    }

    function mountGameplayUi() {
        if (gameplayUiMounted || !gameplayUiRoot) return;

        const gameplayBridge = window.GameplayUIBridge;
        if (!gameplayBridge || typeof gameplayBridge.mount !== 'function') {
            if (!gameplayUiMountTimer) {
                gameplayUiMountTimer = window.setTimeout(() => {
                    gameplayUiMountTimer = null;
                    mountGameplayUi();
                }, 50);
            }
            return;
        }

        gameplayBridge.mount(gameplayUiRoot, {
            toggleViewDock: () => {
                uiState.viewDockOpen = !uiState.viewDockOpen;
                refreshGameplayUI();
            },
            setViewMode: (mode) => {
                const nextMode = mode === 'third-person' && GameScene.getViewMode() === 'third-person'
                    ? DEFAULT_VIEW_MODE
                    : mode === 'top-down' && GameScene.getViewMode() === 'top-down'
                        ? DEFAULT_VIEW_MODE
                        : mode;
                if (GameScene.setViewMode(nextMode)) {
                    if (nextMode !== 'top-down') {
                        uiState.viewDockOpen = false;
                    }
                    syncCameraViewState();
                }
            },
            resetView: () => {
                GameScene.resetBoardView();
                syncCameraViewState();
            },
            rollDice: () => socket.emit('roll-dice'),
            endTurn: () => socket.emit('end-turn'),
            jailRoll: () => socket.emit('jail-roll'),
            buyOutJail: () => socket.emit('buy-out-jail'),
            usePardon: () => socket.emit('use-pardon'),
            toggleOverflow: () => {
                uiState.overflowOpen = !uiState.overflowOpen;
                refreshGameplayUI();
            },
            openOwnAuction: () => {
                uiState.overflowOpen = false;
                uiState.ownAuction.open = true;
                refreshGameplayUI();
            },
            closeOwnAuction: () => {
                resetOwnAuctionState();
                refreshGameplayUI();
            },
            selectOwnAuctionProperty: (tileIndex) => {
                const property = currentGameState?.properties?.find(item => item.index === tileIndex);
                const maxValue = property ? property.price + ((property.houses || 0) * Math.floor(property.price * 0.25)) : 0;
                uiState.ownAuction = {
                    open: true,
                    selectedTileIndex: tileIndex,
                    startPrice: Math.floor(maxValue / 2),
                    timeSeconds: 3
                };
                refreshGameplayUI();
            },
            setOwnAuctionTime: (seconds) => {
                uiState.ownAuction.timeSeconds = seconds;
                refreshGameplayUI();
            },
            setOwnAuctionPrice: (value) => {
                uiState.ownAuction.startPrice = value;
                refreshGameplayUI();
            },
            submitOwnAuction: () => {
                socket.emit('own-auction', {
                    tileIndex: uiState.ownAuction.selectedTileIndex,
                    startPrice: uiState.ownAuction.startPrice
                });
                resetOwnAuctionState();
                refreshGameplayUI();
            },
            declareBankruptcy: () => {
                if (!window.confirm('Declare bankruptcy and leave the match? This cannot be undone.')) return;
                uiState.overflowOpen = false;
                socket.emit('declare-bankruptcy');
                refreshGameplayUI();
            },
            openTradeComposer: (targetId) => openTradeComposer(targetId),
            closeTradeComposer: () => {
                resetTradeComposer();
                refreshGameplayUI();
            },
            toggleTradeProperty: (side, tileIndex) => {
                const key = side === 'offer' ? 'offerProperties' : 'requestProperties';
                const current = new Set(uiState.tradeComposer[key]);
                if (current.has(tileIndex)) current.delete(tileIndex);
                else current.add(tileIndex);
                uiState.tradeComposer[key] = [...current];
                refreshGameplayUI();
            },
            setTradeCash: (side, value) => {
                const key = side === 'offer' ? 'offerCash' : 'requestCash';
                uiState.tradeComposer[key] = Math.max(0, Number.parseInt(value, 10) || 0);
                refreshGameplayUI();
            },
            submitTradeOffer: () => {
                const validation = validateTradeComposer();
                uiState.tradeComposer.validation = validation.ok ? null : { ok: false, message: validation.message };
                refreshGameplayUI();
                if (!validation.ok) return;
                socket.emit('trade-offer', validation.offer);
                resetTradeComposer();
                Notifications.show(validation.offer.counterToTradeId ? 'Counter-offer sent!' : 'Trade offer sent!', 'info', 3000);
                refreshGameplayUI();
            },
            acceptTrade: (tradeId) => {
                closeIncomingTradeModal();
                socket.emit('trade-accept', { tradeId });
            },
            rejectTrade: (tradeId) => {
                closeIncomingTradeModal();
                socket.emit('trade-reject', { tradeId });
            },
            cancelTrade: (tradeId) => socket.emit('trade-cancel', { tradeId }),
            counterTrade: (tradeId) => {
                const trade = uiState.pendingTrades.find(item => item.id === tradeId);
                if (!trade) return;
                openTradeComposer(trade.fromId, { counterTradeId: trade.id, prefillOffer: trade });
            },
            closeIncomingTradeModal,
            toggleLeaderboard: () => {
                uiState.leaderboardCollapsed = !uiState.leaderboardCollapsed;
                refreshGameplayUI();
            },
            toggleHostControls: () => {
                uiState.hostControlsOpen = !uiState.hostControlsOpen;
                if (uiState.hostControlsOpen && isCompactGameplayLayout()) {
                    uiState.lowerCollapsed = true;
                }
                refreshGameplayUI();
            },
            setLowerTab: (tab) => {
                uiState.lowerTab = tab;
                refreshGameplayUI();
            },
            toggleFeedExpanded: () => {
                uiState.lowerExpanded = !uiState.lowerExpanded;
                refreshGameplayUI();
            },
            toggleFeedCollapsed: () => {
                uiState.lowerCollapsed = !uiState.lowerCollapsed;
                if (!uiState.lowerCollapsed && isCompactGameplayLayout()) {
                    uiState.hostControlsOpen = false;
                }
                refreshGameplayUI();
            },
            buyProperty: (tileIndex) => {
                socket.emit('buy-property', { tileIndex });
                uiState.buyPrompt = null;
                refreshGameplayUI();
            },
            passProperty: () => {
                socket.emit('pass-property');
                uiState.buyPrompt = null;
                refreshGameplayUI();
            },
            placeBid: (amount) => socket.emit('place-bid', { amount }),
            closePropertyDetails,
            runPropertyAction: (action, tileIndex) => {
                const eventByAction = {
                    upgrade: 'upgrade-property',
                    downgrade: 'downgrade-property',
                    mortgage: 'mortgage-property',
                    unmortgage: 'unmortgage-property',
                    sell: 'sell-property'
                };
                if (!eventByAction[action]) return;
                socket.emit(eventByAction[action], { tileIndex });
                closePropertyDetails();
            },
            copyInvite: () => copyInvite(),
            saveGame: () => socket.emit('save-game'),
            loadGame: () => {
                if (!window.confirm('Loading a saved game will replace the current match state for everyone in the room. Continue?')) return;
                loadGameInput?.click();
            },
            endMatch: () => {
                if (!window.confirm('End the current match and return everyone to the lobby?')) return;
                socket.emit('end-game');
            },
            endRoom: () => {
                if (!window.confirm('End the room for everyone?')) return;
                socket.emit('end-room');
            },
            setTurnTimerEnabled: (enabled) => socket.emit('host-set-turn-timer-enabled', { enabled: Boolean(enabled) }),
            extendTurnTimer: (seconds) => socket.emit('host-extend-turn-timer', { seconds }),
            kickPlayer: (playerId, playerName) => {
                if (!window.confirm(`Kick ${playerName || 'this player'} from the room?`)) return;
                socket.emit('kick-player', { playerId });
            },
            closeSummary: () => {
                uiState.summary = null;
                refreshGameplayUI();
            },
            closeEndStats: () => {
                uiState.endStats = { visible: false, summary: null, winner: null };
                refreshGameplayUI();
            }
        });
        gameplayUiMounted = true;
        refreshGameplayUI();
    }

    function getStoredValue(key) {
        return sessionStorage.getItem(key) || localStorage.getItem(key);
    }

    function persistValue(key, value) {
        if (!value) return;
        sessionStorage.setItem(key, value);
        localStorage.setItem(key, value);
    }

    function clearStoredValue(key) {
        sessionStorage.removeItem(key);
        localStorage.removeItem(key);
    }

    function getOrCreateSessionToken() {
        let token = getStoredValue(SESSION_TOKEN_KEY);
        if (!token) {
            token = window.crypto?.randomUUID?.() || `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
            persistValue(SESSION_TOKEN_KEY, token);
        }
        persistValue(SESSION_TOKEN_KEY, token);
        return token;
    }

    function normalizeRoomCode(value) {
        return (typeof value === 'string' ? value : '')
            .trim()
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '')
            .slice(0, 12);
    }

    function resolveInitialRoomCode() {
        const params = new URLSearchParams(window.location.search);
        const roomFromUrl = normalizeRoomCode(params.get('room'));
        if (roomFromUrl) {
            persistValue(ROOM_CODE_KEY, roomFromUrl);
            return roomFromUrl;
        }

        return normalizeRoomCode(getStoredValue(ROOM_CODE_KEY));
    }

    function generateRoomCode() {
        return Math.random().toString(36).slice(2, 8).toUpperCase();
    }

    function buildInviteUrl(roomCode = activeRoomCode) {
        return `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
    }

    function setRoomCode(roomCode) {
        activeRoomCode = normalizeRoomCode(roomCode);
        if (!activeRoomCode) return;
        persistValue(ROOM_CODE_KEY, activeRoomCode);
        const url = new URL(window.location.href);
        url.searchParams.set('room', activeRoomCode);
        window.history.replaceState({}, '', url);
        socket.auth = { sessionToken, roomCode: activeRoomCode };
    }

    function clearRoomCode() {
        activeRoomCode = null;
        clearStoredValue(ROOM_CODE_KEY);
        const url = new URL(window.location.href);
        url.searchParams.delete('room');
        window.history.replaceState({}, '', url);
    }

    function setRoomGateStatus(message = '') {
        if (roomGateStatus) roomGateStatus.textContent = message;
    }

    function showRoomGate(message = '') {
        roomGate?.classList.remove('hidden');
        setRoomGateStatus(message);
        roomCodeInput?.focus();
    }

    function hideRoomGate() {
        roomGate?.classList.add('hidden');
        setRoomGateStatus('');
    }

    function connectToRoom(roomCode) {
        startRuntime();
        const normalized = normalizeRoomCode(roomCode);
        if (!normalized) {
            showRoomGate('Enter a valid room code.');
            return;
        }

        setRoomCode(normalized);
        hideRoomGate();
        if (socket.connected) {
            socket.disconnect();
        }
        socket.connect();
    }

    async function copyInvite(roomCode = activeRoomCode) {
        const inviteUrl = buildInviteUrl(roomCode);
        try {
            await navigator.clipboard.writeText(inviteUrl);
            Notifications.show('Invite link copied', 'success', 2000);
        } catch (error) {
            Notifications.show(inviteUrl, 'info', 5000);
        }
    }

    function setTopDownViewOptionsOpen(isOpen) {
        const nextState = Boolean(isOpen);
        uiState.viewDockOpen = nextState;
        document.body.classList.toggle('top-down-view-options-open', nextState);
        refreshGameplayUI();
        syncTopDownHudLayout();
    }

    function downloadSaveState(saveState) {
        const jsonString = JSON.stringify(saveState, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `monopoly-save-${Date.now()}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    function getTileDisplayRent(prop, properties = currentGameState?.properties || []) {
        if (!prop || !prop.owner) {
            return { amount: prop?.price ?? 0, label: prop?.price > 0 ? `$${prop.price}` : '—' };
        }

        if (prop.type === 'utility') {
            const ownedUtilities = MonopolyRules.getOwnedPropertyCount(properties, prop.owner, 'utility');
            const label = ownedUtilities >= 2 ? 'Dice x10' : 'Dice x4';
            return { amount: null, label };
        }

        if (prop.type === 'railroad') {
            const ownedRailroads = MonopolyRules.getOwnedPropertyCount(properties, prop.owner, 'railroad');
            const tiers = [25, 50, 100, 400];
            const index = Math.min(Math.max(ownedRailroads - 1, 0), tiers.length - 1);
            const amount = tiers[index];
            return { amount, label: `$${amount}` };
        }

        const amount = MonopolyRules.calculateRent(properties, prop, 7);
        return { amount, label: amount > 0 ? `$${amount}` : '—' };
    }

    function hideEndStatsScreen() {
        uiState.endStats = { visible: false, summary: null, winner: null };
        refreshGameplayUI();
    }

    function showEndStatsScreen(summary, winner) {
        if (!summary) return;
        uiState.endStats = { visible: true, summary, winner };
        refreshGameplayUI();
    }

    function getTurnTimerPhaseLabel(phase) {
        return phase === 'waiting'
            ? 'Roll Timer'
            : phase === 'buying'
                ? 'Buy Window'
                : phase === 'done'
                    ? 'End Turn Timer'
                    : 'Turn Timer';
    }

    function syncHostTimerControls(state = currentGameState) {
        refreshGameplayUI();
    }

    function syncRoomChrome(state = currentGameState) {
        const roomCode = normalizeRoomCode(state?.roomCode || activeRoomCode);
        const hostPlayerId = state?.hostPlayerId || currentGameState?.hostPlayerId || null;
        const isHost = Boolean(hostPlayerId && myPlayerId && hostPlayerId === myPlayerId);
        const isGameStarted = typeof state?.isGameStarted === 'boolean'
            ? state.isGameStarted
            : Boolean(currentGameState?.isGameStarted);
        const roomBanner = document.getElementById('room-banner');
        const roomCodeDisplay = document.getElementById('room-code-display');
        const lobbyEndBtn = document.getElementById('end-room-btn');

        roomBanner?.classList.toggle('hidden', !roomCode);
        if (roomCodeDisplay) roomCodeDisplay.textContent = roomCode || '------';
        if (hudRoomCode) hudRoomCode.textContent = roomCode ? `Room ${roomCode}` : 'Room';
        hudRoomChip?.classList.toggle('hidden', !roomCode);
        hostControlsShell?.classList.toggle('hidden', !isHost || !isGameStarted);
        lobbyEndBtn?.classList.toggle('hidden', !isHost);
        if (!isHost) {
            uiState.hostControlsOpen = false;
        }
        syncHostTimerControls(state);
        refreshGameplayUI();
    }

    function setFocusedTile(tileIndex) {
        focusedTileIndex = typeof tileIndex === 'number' ? tileIndex : null;
        GameBoard.setFocusedTile(focusedTileIndex);
    }

    function syncBoardTextProfile() {
        const viewMode = GameScene.getViewMode();
        if (viewMode === 'third-person') {
            GameBoard.setTextProfile('third-person');
            return;
        }

        GameBoard.setTextProfile(viewMode === 'top-down' ? 'top-down' : 'isometric');
    }

    function isTypingTarget() {
        const activeTag = document.activeElement?.tagName;
        return activeTag === 'INPUT' || activeTag === 'TEXTAREA' || document.activeElement?.isContentEditable;
    }

    function renderRuntimeUI() {
        syncBoardTextProfile();
    }

    function fastForwardTransientAnimations() {
        if (typeof GameDice !== 'undefined' && typeof GameDice.fastForwardRoll === 'function') {
            GameDice.fastForwardRoll();
        }
        if (typeof GameTokens !== 'undefined' && typeof GameTokens.fastForwardAnimations === 'function') {
            GameTokens.fastForwardAnimations();
        }
        finishActionCard();
    }

    document.addEventListener('visibilitychange', () => {
        if (!shouldFastForwardHiddenTabAnimation()) return;
        fastForwardTransientAnimations();
    });
    window.addEventListener('blur', fastForwardTransientAnimations);
    window.addEventListener('pagehide', fastForwardTransientAnimations);

    function syncTopDownHudLayout() {
        const topBar = getTopBarElement();
        const viewDockToggle = getViewDockToggleElement();
        const viewDock = getViewDockElement();
        if (!topBar) return;

        const topBarHeight = Math.max(Math.ceil(topBar.getBoundingClientRect().height), 0);
        const toggleHeight = viewDockToggle ? Math.max(Math.ceil(viewDockToggle.getBoundingClientRect().height), 0) : 0;
        const isTopDown = document.body.dataset.viewMode === 'top-down';
        const isViewOptionsOpen = isTopDown && document.body.classList.contains('top-down-view-options-open');
        const viewDockHeight = isViewOptionsOpen && viewDock
            ? Math.max(Math.ceil(viewDock.getBoundingClientRect().height), 0)
            : 0;
        const toggleTop = 68 + topBarHeight + 12;
        const viewDockTop = toggleTop + toggleHeight + 8;
        const actionDockTop = viewDockTop + (isViewOptionsOpen ? viewDockHeight + 8 : 0);

        document.body.style.setProperty('--top-down-top-bar-height', `${topBarHeight}px`);
        document.body.style.setProperty('--top-down-view-toggle-top', `${toggleTop}px`);
        document.body.style.setProperty('--top-down-view-dock-top', `${viewDockTop}px`);
        document.body.style.setProperty('--top-down-action-dock-top', `${actionDockTop}px`);
    }

    function setCurrentGameState(state) {
        const normalizedState = normalizeSerializedGameState(state, currentGameState);
        if (isStaleSerializedGameState(normalizedState, currentGameState)) {
            return false;
        }

        currentGameState = normalizedState;
        if (typeof DevPanel !== 'undefined' && DevPanel.updateState) {
            DevPanel.updateState(normalizedState);
        }
        syncRoomChrome(normalizedState);
        syncCameraViewState();
        return true;
    }

    function getCurrentPlayerTokenGroup() {
        if (!currentGameState || !myPlayerId) return null;
        const me = currentGameState.players.find(player => player.id === myPlayerId && player.isActive);
        if (!me) return null;
        return GameTokens.getToken(me.id)?.group || null;
    }

    function syncCameraViewState() {
        const tokenGroup = getCurrentPlayerTokenGroup();
        GameScene.setFollowTarget(tokenGroup);
        const viewMode = GameScene.getViewMode();
        document.body.dataset.viewMode = viewMode;
        const isTopDown = viewMode === 'top-down';
        if (!isTopDown) {
            uiState.viewDockOpen = false;
            setTopDownViewOptionsOpen(false);
        }
        syncBoardTextProfile();
        refreshGameplayUI();
        syncTopDownHudLayout();
    }

    function showLuckPopup(duration = 3500) {
        const popup = document.getElementById('luck-popup');
        if (!popup) return;
        
        popup.classList.remove('hidden');
        // Small delay to ensure CSS transition works if it was just unhidden
        requestAnimationFrame(() => {
            popup.classList.add('active');
        });

        setTimeout(() => {
            popup.classList.remove('active');
            setTimeout(() => {
                popup.classList.add('hidden');
            }, 600); // Wait for transition out
        }, duration);
    }

    function syncWorldFromState(state) {
        if (!state) return;

        GameBoard.updateBailoutAmount(state.taxPool || 0);

        const activePlayerIds = new Set(state.players.filter(player => player.isActive).map(player => player.id));
        Object.keys(GameTokens.getAllTokens()).forEach(playerId => {
            if (!activePlayerIds.has(playerId)) {
                GameTokens.removeToken(playerId, scene);
            }
        });

        state.players.forEach(player => {
            if (!player.isActive) return;
            if (!GameTokens.getToken(player.id)) {
                GameTokens.createToken(player, scene);
            }
            GameTokens.syncToken(player, player.id === state.currentPlayerId);
            GameTokens.setTokenPosition(player.id, player.position);
        });

        GameTokens.layoutTokens(state.players);

        state.properties.forEach(prop => {
            GameBoard.removeHouses(prop.index, scene);

            const isPurchasable = prop.type === 'property' || prop.type === 'railroad' || prop.type === 'utility';
            if (!isPurchasable) return;

            const owner = prop.owner
                ? state.players.find(player => player.id === prop.owner)
                : null;
            // #6: Only show owner color if the owner is still active (not bankrupt)
            const ownerColor = (owner && owner.isActive) ? owner.color : null;
            const displayRent = getTileDisplayRent(prop, state.properties);
            GameBoard.updateTileOwner(prop.index, ownerColor, {
                ...prop,
                displayRent: displayRent.amount,
                displayRentLabel: displayRent.label
            });
            GameBoard.setMortgaged(prop.index, Boolean(prop.isMortgaged));

            if (prop.houses > 0) {
                GameBoard.addHouse(prop.index, prop.houses, scene);
            }
        });

        // #17: Update building transparency based on player positions
        const playerPositions = new Set();
        state.players.forEach(player => {
            if (player.isActive) playerPositions.add(player.position);
        });
        state.properties.forEach(prop => {
            GameBoard.setTileOccupied(prop.index, prop.houses > 0 && playerPositions.has(prop.index));
        });

        syncCameraViewState();
    }

    function syncHistoryFromState(state) {
        updateHistoryEvents(state?.historyEvents);
    }

    function maybeRestoreBuyPrompt(state) {
        if (!state || state.turnPhase !== 'buying' || state.currentPlayerId !== myPlayerId) {
            uiState.buyPrompt = null;
            return;
        }

        const me = state.players.find(player => player.id === myPlayerId);
        const tile = me ? state.properties[me.position] : null;
        if (!tile || tile.owner !== null) {
            uiState.buyPrompt = null;
            return;
        }

        uiState.buyPrompt = {
            playerId: myPlayerId,
            tileIndex: tile.index,
            tileName: tile.name,
            tileType: tile.type,
            price: tile.price,
            colorGroup: tile.colorGroup,
            canAfford: (me?.money || 0) >= tile.price
        };
    }

    function syncPendingTrades(state) {
        updatePendingTrades(state?.pendingTrades);
    }

    function syncAuctionFromState(state) {
        uiState.auctionState = state?.auctionState ? { ...state.auctionState } : null;
    }

    function applyState(state, { syncWorld = true, syncHistory = true, syncTrades = true, syncAuction = true, syncBuyPrompt = true } = {}) {
        if (!state) return;
        // Ignore any snapshot that finished animating after a newer authoritative state already arrived.
        if (!setCurrentGameState(state)) return;

        const appliedState = currentGameState;
        syncBoardSelection(appliedState.boardId);
        if (syncWorld) syncWorldFromState(appliedState);
        else {
            GameTokens.layoutTokens(appliedState.players || []);
            syncCameraViewState();
        }
        if (syncHistory) syncHistoryFromState(appliedState);
        if (syncTrades) syncPendingTrades(appliedState);
        if (syncAuction) syncAuctionFromState(appliedState);
        if (appliedState.isGameStarted) {
            Lobby.hideLobby();
            gameHud?.classList.remove('hidden');
        } else {
            Lobby.showLobby();
            gameHud?.classList.add('hidden');
            updatePendingTrades([]);
            uiState.buyPrompt = null;
            uiState.auctionState = null;
            uiState.propertyDetailsTileIndex = null;
            uiState.summary = null;
            uiState.endStats = { visible: false, summary: null, winner: null };
            resetOwnAuctionState();
            resetTradeComposer();
            closeIncomingTradeModal();
        }
        if (syncBuyPrompt) maybeRestoreBuyPrompt(appliedState);
        refreshGameplayUI();
    }

    function ownsFullColorGroup(playerId, tile) {
        if (!playerId || tile?.type !== 'property' || !tile.colorGroup || !currentGameState) return false;
        return MonopolyRules.playerOwnsFullColorGroup(currentGameState.properties, playerId, tile.colorGroup);
    }

    function colorGroupHasBuildings(tile) {
        return tile?.type === 'property'
            && Boolean(tile.colorGroup)
            && currentGameState
            && MonopolyRules.colorGroupHasBuildings(currentGameState.properties, tile.colorGroup);
    }

    function colorGroupHasMortgaged(tile) {
        return tile?.type === 'property'
            && Boolean(tile.colorGroup)
            && currentGameState
            && MonopolyRules.colorGroupHasMortgaged(currentGameState.properties, tile.colorGroup);
    }

    function canManageAssetsNow() {
        if (!currentGameState || !myPlayerId) return false;
        return MonopolyRules.canManageAssets({
            currentPlayerId: currentGameState.currentPlayerId,
            pauseState: currentGameState.pauseState,
            turnPhase: currentGameState.turnPhase
        }, myPlayerId);
    }

    function showSummaryModal(summary) {
        if (!summary) return;
        uiState.summary = summary;
        refreshGameplayUI();
    }

    socket.on('connect', () => {
        console.log('🔌 Connected:', socket.id);
        hideRoomGate();
        Notifications.show('Connected to game server', 'info', 2000);
    });

    socket.on('disconnect', () => {
        cancelGameStartTransition();
        Notifications.show('Disconnected from server', 'error', 4000);
    });

    socket.on('player-session', (data) => {
        if (data.sessionToken) {
            persistValue(SESSION_TOKEN_KEY, data.sessionToken);
        }
        myPlayerId = data.playerId || null;
        const hostPlayerId = currentGameState?.hostPlayerId || lobbyState?.hostPlayerId || null;
        uiState.hostControlsOpen = Boolean(hostPlayerId && myPlayerId === hostPlayerId ? uiState.hostControlsOpen : false);
        if (currentGameState) {
            applyState(currentGameState, { syncWorld: false, syncHistory: false });
        } else {
            syncRoomChrome();
            syncCameraViewState();
        }
    });

    socket.on('lobby-update', (state) => {
        lobbyState = state;
        syncBoardSelection(state?.selectedBoardId || state?.boardId);
        GameUI.updateHostPlayerId(state?.hostPlayerId || null);
        if (!state?.isGameStarted && isGameStartPreLocked && !isGameStartTransitionRunning) {
            cancelGameStartTransition();
        }
        syncRoomChrome(state);
        refreshGameplayUI();
    });

    socket.on('room-error', (data) => {
        clearRoomCode();
        setTimeout(() => window.location.assign(window.location.pathname), 150);
        Notifications.show(data?.message || 'Room unavailable', 'error', 4000);
    });

    socket.on('room-ended', (data) => {
        cancelGameStartTransition();
        clearRoomCode();
        Notifications.show(data?.message || 'Room ended', 'info', 5000);
        setTimeout(() => window.location.assign(window.location.pathname), 250);
    });

    socket.on('player-kicked', (data) => {
        cancelGameStartTransition();
        clearRoomCode();
        Notifications.show(data?.message || 'You were removed from the room.', 'error', 5000);
        setTimeout(() => window.location.assign(window.location.pathname), 250);
    });

    socket.on('game-ended-by-host', (data) => {
        Notifications.show(data?.message || 'The host ended the current match.', 'info', 5000);
        uiState.summary = null;
        hideEndStatsScreen();
    });

    socket.on('game-saved', (data) => {
        downloadSaveState(data.saveState);
        Notifications.show('Save file downloaded.', 'success', 2500);
    });

    socket.on('game-loaded', () => {
        Notifications.show('Saved game loaded for the room.', 'success', 2500);
    });

    // ── Init all systems ──────────────────────────────────
    Lobby.init(socket);
    GameUI.init(socket);
    GameModals.init(socket);
    if (typeof GameAudio !== 'undefined') GameAudio.init();
    HistoryLog.init();
    TradeSystem.init(socket);
    AuctionSystem.init(socket);
    if (typeof DevPanel !== 'undefined') DevPanel.init(socket);
    mountGameplayUi();
    GameBoard.setTextProfile(DEFAULT_VIEW_MODE);
    GameScene.onViewModeChange(() => {
        syncCameraViewState();
    });

    if (getTopBarElement() || getViewDockToggleElement() || getViewDockElement()) {
        syncTopDownHudLayout();
        if (typeof ResizeObserver !== 'undefined') {
            topBarResizeObserver = new ResizeObserver(() => {
                syncTopDownHudLayout();
            });
            [getTopBarElement(), getViewDockToggleElement(), getViewDockElement()].filter(Boolean).forEach(element => {
                topBarResizeObserver.observe(element);
            });
        }
        window.addEventListener('resize', syncTopDownHudLayout);
        window.addEventListener('resize', refreshGameplayUI);
        window.addEventListener('history-layout-change', syncTopDownHudLayout);
    }

    loadGameInput?.addEventListener('change', (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (loadEvent) => {
            try {
                const saveState = JSON.parse(loadEvent.target?.result);
                socket.emit('load-game', { saveState });
            } catch (error) {
                Notifications.notifyError('Invalid save file format.');
            }
        };
        reader.readAsText(file);
        event.target.value = '';
    });

    hostTurnTimerEnabledInput?.addEventListener('change', () => {
        socket.emit('host-set-turn-timer-enabled', {
            enabled: Boolean(hostTurnTimerEnabledInput.checked)
        });
    });

    hostExtendTimer15Btn?.addEventListener('click', () => {
        if (hostExtendTimer15Btn.disabled) return;
        socket.emit('host-extend-turn-timer', { seconds: 15 });
    });

    hostExtendTimer30Btn?.addEventListener('click', () => {
        if (hostExtendTimer30Btn.disabled) return;
        socket.emit('host-extend-turn-timer', { seconds: 30 });
    });

    gameStartSkipBtn?.addEventListener('click', () => {
        if (!allowGameStartSkip) return;
        allowGameStartSkip = false;
        gameStartWasSkipped = true;
        gameStartSkipBtn.classList.add('hidden');
        if (typeof GameAudio !== 'undefined' && typeof GameAudio.playUiClick === 'function') {
            GameAudio.playUiClick();
        }
        if (resolveGameStartSkip) {
            resolveGameStartSkip();
            resolveGameStartSkip = null;
        }
    });

    window.addEventListener('lobby-start-requested', () => {
        lockGameStartUI({ withFailSafe: true });
    });

    viewDockToggle?.addEventListener('click', () => {
        setTopDownViewOptionsOpen(!document.body.classList.contains('top-down-view-options-open'));
    });
    document.getElementById('create-room-btn')?.addEventListener('click', () => {
        connectToRoom(generateRoomCode());
    });

    document.getElementById('join-room-btn')?.addEventListener('click', () => {
        connectToRoom(roomCodeInput?.value || '');
    });

    roomCodeInput?.addEventListener('input', () => {
        roomCodeInput.value = normalizeRoomCode(roomCodeInput.value);
        setRoomGateStatus('');
    });

    roomCodeInput?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            connectToRoom(roomCodeInput.value);
        }
    });

    document.getElementById('copy-room-link-btn')?.addEventListener('click', () => copyInvite());
    document.getElementById('host-copy-room-link-btn')?.addEventListener('click', () => copyInvite());
    document.getElementById('end-room-btn')?.addEventListener('click', () => {
        if (!window.confirm('End this room for everyone?')) return;
        socket.emit('end-room');
    });
    document.getElementById('host-end-room-btn')?.addEventListener('click', () => {
        if (!window.confirm('End this room for everyone?')) return;
        socket.emit('end-room');
    });
    document.getElementById('host-end-match-btn')?.addEventListener('click', () => {
        if (!window.confirm('End the current match and return everyone to the lobby?')) return;
        socket.emit('end-game');
    });

    if (activeRoomCode) {
        connectToRoom(activeRoomCode);
    } else {
        showRoomGate();
    }

    syncCameraViewState();

    document.addEventListener('keydown', (event) => {
        if (isTypingTarget()) return;

        const key = event.key.toLowerCase();
        if (key === 'escape') {
            if (document.body.classList.contains('top-down-view-options-open')) {
                setTopDownViewOptionsOpen(false);
                return;
            }
        }
        if (key === 'r') {
            event.preventDefault();
            GameScene.resetBoardView();
            syncCameraViewState();
        }
    });

    scheduleRuntimeStart();

    // ── History Log ───────────────────────────────────────
    socket.on('history-event', (data) => {
        uiState.historyEvents.push({ text: data.text, type: data.type });
        uiState.historyEvents = uiState.historyEvents.slice(-50);
        refreshGameplayUI();
    });

    socket.on('gameStarted', async (state) => {
        if (isGameStartPreLocked || !currentGameState?.isGameStarted) {
            await playGameStartTransition(state);
        }
        applyState(state);
    });

    socket.on('dice-rolled', (data) => {
        if (!setCurrentGameState(data.gameState)) return;
        setDiceResult({
            die1: data.die1,
            die2: data.die2,
            character: data.character,
            playerName: data.playerName,
            isDoubles: data.isDoubles
        });
        if (data.isDoubles) Notifications.notifyDoubles();
        if (typeof GameAudio !== 'undefined' && typeof GameAudio.playDiceRoll === 'function') {
            GameAudio.playDiceRoll({ isDoubles: data.isDoubles });
        }

        GameDice.roll(data.die1, data.die2, () => {
            GameTokens.animateMove(
                data.playerId,
                data.moveResult.oldPosition,
                data.moveResult.newPosition,
                () => {
                    applyState(data.gameState, { syncWorld: false, syncHistory: false, syncTrades: false, syncAuction: false, syncBuyPrompt: false });
                    if (data.playerId === myPlayerId) {
                        // Trigger luck popup if landed exactly on GO (index 0)
                        if (data.moveResult.newPosition === 0) {
                            showLuckPopup();
                        }
                        socket.emit('move-complete');
                    }
                },
                { skipAnimation: shouldFastForwardHiddenTabAnimation() }
            );
        }, { skipAnimation: shouldFastForwardHiddenTabAnimation() });
    });

    socket.on('buy-prompt', (data) => {
        if (!setCurrentGameState(data.gameState)) return;
        uiState.buyPrompt = {
            playerId: data.playerId,
            tileIndex: data.tileIndex,
            tileName: data.tileName,
            tileType: data.tileType,
            price: data.price,
            colorGroup: data.colorGroup,
            canAfford: data.canAfford
        };
        refreshGameplayUI();
    });

    socket.on('player-deciding', (data) => {
        if (data?.gameState) {
            applyState(data.gameState, {
                syncHistory: false,
                syncTrades: false,
                syncAuction: false,
                syncBuyPrompt: false
            });
        }
    });

    socket.on('property-bought', (data) => {
        applyState(data.gameState, { syncHistory: false, syncTrades: false, syncAuction: false });
        if (data.playerId === myPlayerId) {
            Notifications.show(`🏠 Bought ${data.tileName}!`, 'success', 2500);
        }
    });

    socket.on('rent-paid', (data) => {
        applyState(data.gameState, { syncHistory: false, syncTrades: false, syncAuction: false, syncBuyPrompt: false });
        if (data.payerId === myPlayerId) {
            Notifications.show(`Paid <strong>$${data.amount}</strong> rent to <strong>${data.ownerCharacter}</strong> for ${data.tileName}`, 'error', 5000);
        } else if (data.ownerId === myPlayerId) {
            Notifications.show(`<strong>${data.payerCharacter}</strong> paid you <strong>$${data.amount}</strong> rent for ${data.tileName}`, 'success', 5000);
        }
    });

    socket.on('tax-paid', (data) => {
        applyState(data.gameState, { syncHistory: false, syncTrades: false, syncAuction: false, syncBuyPrompt: false });
        if (data.playerId === myPlayerId) {
            Notifications.show(`Paid <strong>$${data.amount}</strong> in ${data.tileName}`, 'error', 4000);
        }
    });

    socket.on('card-drawn', (data) => {
        if (!setCurrentGameState(data.gameState)) return;
        const onAfterCard = () => {
            if (data.result?.moveResult) {
                GameTokens.animateMove(
                    data.playerId,
                    data.result.moveResult.oldPosition,
                    data.result.moveResult.newPosition,
                    () => {
                        applyState(data.gameState, { syncWorld: false, syncHistory: false, syncTrades: false, syncAuction: false, syncBuyPrompt: false });
                        if (data.playerId === myPlayerId) {
                            socket.emit('move-complete');
                        }
                    },
                    { skipAnimation: shouldFastForwardHiddenTabAnimation() }
                );
                return;
            }

            applyState(data.gameState, { syncWorld: true, syncHistory: false, syncTrades: false, syncAuction: false, syncBuyPrompt: false });
        };

        showActionCard(data.card, data.result, onAfterCard, {
            skipAnimation: shouldFastForwardHiddenTabAnimation()
        });
    });

    socket.on('player-bankrupt', (data) => {
        applyState(data.gameState, { syncHistory: false, syncTrades: true, syncAuction: true, syncBuyPrompt: false });
        Notifications.show(
            data.playerId === myPlayerId
                ? '💀 You are BANKRUPT! Game over for you.'
                : `💀 <strong>${data.character}</strong> went bankrupt!`,
            data.playerId === myPlayerId ? 'error' : 'hype',
            data.playerId === myPlayerId ? 8000 : 5000
        );
    });

    socket.on('bankruptcy-warning', (data) => {
        applyState(data.gameState, { syncHistory: false, syncTrades: true, syncAuction: true, syncBuyPrompt: false });
        const isMe = data.playerId === myPlayerId;
        Notifications.show(
            isMe
                ? `You are at $${data.money}. Recover before ending your turn, or use Declare Bankruptcy.`
                : `${data.character} is in debt and must recover before ending the turn.`,
            isMe ? 'error' : 'info',
            5000
        );
    });

    socket.on('bankruptcy-resolved', (data) => {
        applyState(data.gameState, { syncHistory: false, syncTrades: true, syncAuction: true, syncBuyPrompt: false });
        if (data.survived) {
            Notifications.show(
                data.playerId === myPlayerId
                    ? 'You recovered from debt.'
                    : `${data.character} recovered from debt.`,
                'success',
                3000
            );
        }
    });

    socket.on('game-over', (data) => {
        if (data.gameState) {
            applyState(data.gameState, { syncTrades: true, syncAuction: true, syncBuyPrompt: false });
        }
        showEndStatsScreen(data.summary, data.winner);
    });
    socket.on('turn-changed', (data) => {
        applyState(data.gameState, { syncHistory: false, syncTrades: false, syncAuction: false });
    });

    socket.on('sent-to-jail', (data) => {
        applyState(data.gameState, { syncHistory: false, syncTrades: false, syncAuction: false, syncBuyPrompt: false });
        if (data.playerId === myPlayerId) {
            Notifications.show('🚔 You were sent to Jail!', 'error', 4000);
        } else {
            Notifications.show(`🚔 ${data.character} was sent to Jail!`, 'info', 3000);
        }
    });

    socket.on('jail-state-changed', (data) => {
        applyState(data.gameState, { syncHistory: false, syncTrades: false, syncAuction: false, syncBuyPrompt: false });
    });

    socket.on('bailout-collected', (data) => {
        applyState(data.gameState, { syncHistory: false, syncTrades: false, syncAuction: false, syncBuyPrompt: false });
        if (data.playerId === myPlayerId) {
            Notifications.show(`💰 You collected $${data.amount} from the Bailout fund!`, 'success', 4000);
            if (data.amount > 0) {
                showLuckPopup();
            }
        } else {
            Notifications.show(`💰 ${data.character} collected $${data.amount} Bailout!`, 'hype', 3000);
        }
    });

    socket.on('auction-started', (data) => {
        applyState({ ...data.gameState, auctionState: data.auction }, { syncHistory: false, syncTrades: false, syncBuyPrompt: false });
        uiState.buyPrompt = null;
        uiState.auctionState = { ...data.auction };
        refreshGameplayUI();
        Notifications.show(`🔨 Auction: ${data.auction.tileName}!`, 'hype', 3000);
    });
    socket.on('auction-bid', (data) => {
        uiState.auctionState = { ...data.auction };
        if (data.gameState?.players && currentGameState) {
            currentGameState.players = data.gameState.players;
        }
        refreshGameplayUI();
    });
    socket.on('auction-tick', (data) => {
        if (uiState.auctionState) {
            uiState.auctionState = { ...uiState.auctionState, timeRemaining: data.timeRemaining };
            refreshGameplayUI();
        }
    });
    socket.on('auction-ended', (data) => {
        applyState(data.gameState, { syncHistory: false, syncTrades: false, syncAuction: true, syncBuyPrompt: true });
        uiState.auctionState = null;
        refreshGameplayUI();
        if (data.winnerId) {
            const isMe = data.winnerId === myPlayerId;
            Notifications.show(
                isMe ? `🎉 Won ${data.tileName} for $${data.bid}!` : `🔨 ${data.winnerCharacter} won ${data.tileName}`,
                isMe ? 'success' : 'info',
                3000
            );
        }
    });

    socket.on('trade-incoming', (offer) => {
        updatePendingTrades([offer, ...uiState.pendingTrades.filter(item => item.id !== offer.id)]);
        uiState.tradeIncomingModalTradeId = offer.id;
        uiState.lowerTab = 'trades';
        refreshGameplayUI();
        Notifications.show(`${offer.isCounterOffer ? '↩️' : '🤝'} ${offer.fromCharacter} sent ${offer.isCounterOffer ? 'a counter-offer' : 'a trade offer'}!`, 'hype', 3000);
    });
    socket.on('trade-sent', (data) => {
        if (data?.replacedTradeId) {
            updatePendingTrades(uiState.pendingTrades.filter(trade => trade.id !== data.replacedTradeId));
        }
        if (data?.trade) {
            updatePendingTrades([data.trade, ...uiState.pendingTrades.filter(item => item.id !== data.trade.id)]);
            uiState.lowerTab = 'trades';
            refreshGameplayUI();
        }
        Notifications.show('Trade sent!', 'success', 2000);
    });
    socket.on('trade-completed', (data) => {
        updatePendingTrades(uiState.pendingTrades.filter(trade => trade.id !== data.tradeId));
        applyState(data.gameState, { syncHistory: false, syncTrades: true, syncAuction: false, syncBuyPrompt: false });
        Notifications.show('✅ Trade completed!', 'success', 3000);
    });
    socket.on('trade-rejected', (data) => {
        if (data?.tradeId) {
            updatePendingTrades(uiState.pendingTrades.filter(trade => trade.id !== data.tradeId));
            refreshGameplayUI();
        }
        Notifications.show('Trade rejected', 'error', 2000);
    });
    socket.on('trade-cancelled', (data) => {
        if (data?.tradeId) {
            updatePendingTrades(uiState.pendingTrades.filter(trade => trade.id !== data.tradeId));
            refreshGameplayUI();
        }
        Notifications.show(data?.message || 'Trade cancelled', 'info', 2500);
    });
    socket.on('trade-invalidated', (data) => {
        updatePendingTrades(uiState.pendingTrades.filter(trade => trade.id !== data.tradeId));
        if (uiState.tradeComposer.counterTradeId === data.tradeId) {
            uiState.tradeComposer.validation = { ok: false, message: data.message };
            uiState.tradeComposer.counterTradeId = null;
        }
        if (uiState.tradeIncomingModalTradeId === data.tradeId) {
            uiState.tradeIncomingModalTradeId = null;
        }
        refreshGameplayUI();
        Notifications.show(data.message, 'error', 3000);
    });
    socket.on('trade-validation', (data) => {
        if (data?.message) {
            uiState.tradeComposer.validation = { ok: data.ok !== false, message: data.message };
            refreshGameplayUI();
        }
    });

    socket.on('property-upgraded', (data) => {
        applyState(data.gameState, { syncHistory: false, syncTrades: false, syncAuction: false, syncBuyPrompt: false });
        if (data.playerId === myPlayerId) {
            Notifications.show(`🏗️ Upgraded ${data.tileName}!`, 'success', 2000);
        }
    });

    socket.on('property-downgraded', (data) => {
        applyState(data.gameState, { syncHistory: false, syncTrades: false, syncAuction: false, syncBuyPrompt: false });
    });

    socket.on('property-mortgaged', (data) => {
        applyState(data.gameState, { syncHistory: false, syncTrades: false, syncAuction: false, syncBuyPrompt: false });
        if (data.playerId === myPlayerId) {
            Notifications.show(`🏦 Mortgaged ${data.tileName} (+$${data.mortgageValue})`, 'info', 2500);
        }
    });

    socket.on('property-unmortgaged', (data) => {
        applyState(data.gameState, { syncHistory: false, syncTrades: false, syncAuction: false, syncBuyPrompt: false });
    });

    socket.on('property-sold', (data) => {
        applyState(data.gameState, { syncHistory: false, syncTrades: false, syncAuction: false, syncBuyPrompt: false });
    });

    socket.on('turn-timer-start', (data) => {
        if (!currentGameState) currentGameState = { turnTimer: data };
        else currentGameState.turnTimer = data;
        syncHostTimerControls(currentGameState);
    });

    socket.on('turn-timer-tick', (data) => {
        if (!currentGameState) currentGameState = { turnTimer: data };
        else currentGameState.turnTimer = data;
        syncHostTimerControls(currentGameState);
    });

    socket.on('turn-timer-stop', () => {
        if (currentGameState) currentGameState.turnTimer = null;
        syncHostTimerControls(currentGameState);
    });

    socket.on('game-paused', (data) => {
        if (!currentGameState) return;
        currentGameState.pauseState = data.pauseState;
        syncHostTimerControls(currentGameState);
        Notifications.show(`⏸ Game paused while waiting for ${data.pauseState.character} to reconnect.`, 'info', 4000);
    });

    socket.on('game-resumed', (data) => {
        applyState(data.gameState, { syncHistory: false, syncTrades: false, syncAuction: false, syncBuyPrompt: true });
        Notifications.show('▶️ Game resumed.', 'success', 2500);
    });

    socket.on('game-state-sync', (state) => {
        applyState(state);
    });

    socket.on('game-error', (data) => {
        if (isGameStartPreLocked && !currentGameState?.isGameStarted) {
            cancelGameStartTransition();
        }
        Notifications.notifyError(data.message);
        refreshGameplayUI();
    });

    window.notifyGo = Notifications.notifyGo;
    window.notifyDoubles = Notifications.notifyDoubles;

    console.log(
        '%c🎲 Monopoly Game Loaded!\n%cPhase 5: Textured Board, Clickable Tiles, Upgrades',
        'color: #6c5ce7; font-size: 16px; font-weight: bold;',
        'color: #a29bfe; font-size: 12px;'
    );
})();
