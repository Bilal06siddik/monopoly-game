// ═══════════════════════════════════════════════════════════
//  MAIN — Entry point: initializes everything & wires events
// ═══════════════════════════════════════════════════════════

(function () {
    'use strict';
    
    // --- INTRO ANIMATION SEQUENCE ---
    (function initIntro() {
        const introScreen = document.getElementById('intro-screen');
        if (!introScreen) return;

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

    const { scene, camera, renderer } = GameScene.init();
    GameBoard.build(scene, renderer);
    GameDice.init(scene);
    GameTokens.init(scene, GameBoard.getTileWorldPosition);

    const SESSION_TOKEN_KEY = 'monopoly-session-token';
    const ROOM_CODE_KEY = 'monopoly-room-code';
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
    let activeRoomCode = initialRoomCode;
    let focusedTileIndex = null;
    const cameraViewBtn = document.getElementById('camera-view-btn');
    const cameraTopdownBtn = document.getElementById('camera-topdown-btn');
    const cameraIsoBtn = document.getElementById('camera-iso-btn');
    const cameraResetBtn = document.getElementById('camera-reset-btn');
    const viewDockToggle = document.getElementById('view-dock-toggle');
    const viewDock = document.getElementById('view-dock');
    const roomGate = document.getElementById('room-gate');
    const roomGateStatus = document.getElementById('room-gate-status');
    const roomCodeInput = document.getElementById('room-code-input');
    const topBar = document.querySelector('.top-bar');
    const saveGameBtn = document.getElementById('save-game-btn');
    const loadGameBtn = document.getElementById('load-game-btn');
    const loadGameInput = document.getElementById('load-game-input');
    let topBarResizeObserver = null;

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
        document.body.classList.toggle('top-down-view-options-open', nextState);
        if (viewDockToggle) {
            viewDockToggle.setAttribute('aria-expanded', String(nextState));
            viewDockToggle.textContent = nextState ? '✕ View' : '👁 View';
        }
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
            const amount = 25 * Math.pow(2, Math.max(ownedRailroads - 1, 0));
            return { amount, label: `$${amount}` };
        }

        const amount = MonopolyRules.calculateRent(properties, prop, 7);
        return { amount, label: amount > 0 ? `$${amount}` : '—' };
    }

    function hideEndStatsScreen() {
        const screen = document.getElementById('end-stats-screen');
        if (!screen) return;
        screen.classList.remove('visible');
        screen.classList.add('hidden');
    }

    function showEndStatsScreen(summary, winner) {
        const screen = document.getElementById('end-stats-screen');
        const titleEl = document.getElementById('es-winner-title');
        const gridEl = document.getElementById('es-player-grid');
        if (!screen || !titleEl || !gridEl || !summary) return;

        const placements = Array.isArray(summary.placements) ? summary.placements : [];
        const winnerName = winner?.character || placements.find(player => player.isWinner)?.character || 'Winner';
        titleEl.textContent = winner?.id === myPlayerId ? 'You Win!' : `${winnerName} Wins!`;

        gridEl.innerHTML = placements.map(player => `
            <div class="end-stats-card${player.isWinner ? ' winner' : ''}">
                <div class="esc-avatar">${player.isWinner ? '👑' : player.isActive ? '👤' : '💀'}</div>
                <div class="esc-name" style="color:${player.color}">${player.character}</div>
                <div class="esc-stat"><span class="esc-stat-label">Placement</span><span class="esc-stat-value">#${player.placement}</span></div>
                <div class="esc-stat"><span class="esc-stat-label">Net Worth</span><span class="esc-stat-value money">$${player.netWorth}</span></div>
                <div class="esc-stat"><span class="esc-stat-label">Properties</span><span class="esc-stat-value">${player.propertiesOwned}</span></div>
                <div class="esc-stat"><span class="esc-stat-label">Rent Paid</span><span class="esc-stat-value">$${player.stats?.rentPaid ?? 0}</span></div>
                <div class="esc-stat"><span class="esc-stat-label">Rent Recv</span><span class="esc-stat-value">$${player.stats?.rentReceived ?? 0}</span></div>
            </div>
        `).join('');

        screen.classList.remove('hidden');
        screen.classList.add('visible');
    }

    function syncRoomChrome(state = currentGameState) {
        const roomCode = normalizeRoomCode(state?.roomCode || activeRoomCode);
        const isHost = Boolean(state?.hostPlayerId && myPlayerId && state.hostPlayerId === myPlayerId);
        const isGameStarted = Boolean(state?.isGameStarted);
        const roomBanner = document.getElementById('room-banner');
        const roomCodeDisplay = document.getElementById('room-code-display');
        const lobbyEndBtn = document.getElementById('end-room-btn');
        const hudRoomChip = document.getElementById('hud-room-chip');
        const hudRoomCode = document.getElementById('hud-room-code');
        const hudEndGameBtn = document.getElementById('hud-end-game-btn');
        const hudEndBtn = document.getElementById('hud-end-room-btn');

        roomBanner?.classList.toggle('hidden', !roomCode);
        if (roomCodeDisplay) roomCodeDisplay.textContent = roomCode || '------';
        if (hudRoomCode) hudRoomCode.textContent = roomCode ? `Room ${roomCode}` : 'Room';
        hudRoomChip?.classList.toggle('hidden', !roomCode);
        lobbyEndBtn?.classList.toggle('hidden', !isHost);
        hudEndGameBtn?.classList.toggle('hidden', !isHost || !isGameStarted);
        hudEndBtn?.classList.toggle('hidden', !isHost);
        if (saveGameBtn) saveGameBtn.disabled = !isHost || !isGameStarted;
        if (loadGameBtn) loadGameBtn.disabled = !isHost || isGameStarted;
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

    function syncTopDownHudLayout() {
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
        const normalizedState = normalizeSerializedGameState(state);
        if (isStaleSerializedGameState(normalizedState, currentGameState)) {
            return false;
        }

        currentGameState = normalizedState;
        GameUI.updateHostPlayerId(normalizedState?.hostPlayerId || null);
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
        const canFollow = Boolean(tokenGroup);
        const viewMode = GameScene.getViewMode();
        document.body.dataset.viewMode = viewMode;
        const isThirdPerson = viewMode === 'third-person';
        const isTopDown = viewMode === 'top-down';
        const isIsometric = viewMode === 'isometric';

        // #13: Each button shows its view name and is highlighted (active) when that view is active
        if (cameraIsoBtn) {
            cameraIsoBtn.classList.toggle('active', isIsometric);
            cameraIsoBtn.setAttribute('aria-pressed', String(isIsometric));
        }
        if (cameraViewBtn) {
            cameraViewBtn.disabled = !canFollow;
            cameraViewBtn.classList.toggle('active', isThirdPerson);
            cameraViewBtn.setAttribute('aria-pressed', String(isThirdPerson));
            cameraViewBtn.textContent = '🎥 Third Person';
            cameraViewBtn.title = canFollow
                ? 'Follow your token in third person'
                : 'Join a game to enable third-person view';
        }
        if (cameraTopdownBtn) {
            cameraTopdownBtn.classList.toggle('active', isTopDown);
            cameraTopdownBtn.setAttribute('aria-pressed', String(isTopDown));
            cameraTopdownBtn.textContent = '⬆ Top Down';
        }
        if (cameraResetBtn) {
            cameraResetBtn.title = 'Recenter the isometric framing and reset zoom';
        }
        if (!isTopDown) {
            setTopDownViewOptionsOpen(false);
        }
        syncBoardTextProfile();
        syncTopDownHudLayout();
    }

    function syncTurnTimerUI(state = currentGameState) {
        GameUI.updateTurnTimer(state?.pauseState ? null : (state?.turnTimer || null));
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
        if (state?.historyEvents) {
            HistoryLog.replaceEvents(state.historyEvents);
        }
    }

    function maybeRestoreBuyPrompt(state) {
        if (!state || state.turnPhase !== 'buying' || state.currentPlayerId !== myPlayerId) {
            GameModals.hideBuyModal();
            return;
        }

        const me = state.players.find(player => player.id === myPlayerId);
        const tile = me ? state.properties[me.position] : null;
        if (!tile || tile.owner !== null) {
            GameModals.hideBuyModal();
            return;
        }

        GameModals.showBuyModal({
            playerId: myPlayerId,
            tileIndex: tile.index,
            tileName: tile.name,
            tileType: tile.type,
            price: tile.price,
            colorGroup: tile.colorGroup,
            canAfford: (me?.money || 0) >= tile.price,
            gameState: state
        });
    }

    function syncPendingTrades(state) {
        if (Array.isArray(state?.pendingTrades)) {
            TradeSystem.replaceTrades(state.pendingTrades);
        }
    }

    function syncAuctionFromState(state) {
        if (!state?.auctionState) {
            AuctionSystem.hideAuction();
            return;
        }

        AuctionSystem.showAuction({ auction: state.auctionState }, state.players);
    }

    function applyState(state, { syncWorld = true, syncHistory = true, syncTrades = true, syncAuction = true, syncBuyPrompt = true } = {}) {
        if (!state) return;
        // Ignore any snapshot that finished animating after a newer authoritative state already arrived.
        if (!setCurrentGameState(state)) return;

        const appliedState = currentGameState;
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
            GameUI.showGameUI();
            GameUI.updateLeaderboard(appliedState.players, appliedState.properties);
            const currentPlayer = appliedState.players[appliedState.currentPlayerIndex];
            if (currentPlayer) {
                GameUI.updateTurnIndicator(currentPlayer.id, currentPlayer.character, appliedState.players, appliedState);
            }
        } else {
            Lobby.showLobby();
            GameUI.hideGameUI();
            GameUI.updateLeaderboard([], []);
            GameUI.updateTurnTimer(null);
            hideSummaryModal();
        }
        if (syncBuyPrompt) maybeRestoreBuyPrompt(appliedState);
        syncTurnTimerUI(appliedState);
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
        const modal = document.getElementById('summary-modal');
        if (!modal || !summary) return;

        const winner = summary.placements.find(player => player.isWinner);
        document.getElementById('summary-winner').textContent = winner
            ? `${winner.character} wins the match`
            : 'Match complete';

        const minutes = Math.floor((summary.durationMs || 0) / 60000);
        const seconds = Math.floor(((summary.durationMs || 0) % 60000) / 1000);
        document.getElementById('summary-meta').textContent = `Turns: ${summary.turnCount} • Duration: ${minutes}m ${seconds}s`;

        document.getElementById('summary-placements').innerHTML = summary.placements.map(player => `
            <div class="summary-placement${player.playerId === myPlayerId ? ' is-me' : ''}">
                <div>
                    <strong>#${player.placement} ${player.character}</strong>
                    <div>Cash: $${player.money} • Net worth: $${player.netWorth}</div>
                </div>
                <div class="summary-stats-inline">
                    <span>Cards ${player.stats.cardsDrawn}</span>
                    <span>GO ${player.stats.goPasses}</span>
                    <span>Trades ${player.stats.tradesCompleted}</span>
                </div>
            </div>
        `).join('');

        document.getElementById('summary-visited').innerHTML = (summary.topVisitedProperties || []).map(property => `
            <div class="summary-list-row">
                <span>${property.name}</span>
                <strong>${property.landedCount}</strong>
            </div>
        `).join('') || '<div class="summary-list-row empty">No visits recorded.</div>';

        document.getElementById('summary-rent').innerHTML = (summary.topRentProperties || []).map(property => `
            <div class="summary-list-row">
                <span>${property.name}</span>
                <strong>$${property.rentCollected}</strong>
            </div>
        `).join('') || '<div class="summary-list-row empty">No rent recorded.</div>';

        modal.classList.remove('hidden');
        modal.classList.add('show');
    }

    function createActionButton(variant, html, onClick) {
        const btn = document.createElement('button');
        btn.className = `pdm-action-btn ${variant}`;
        btn.innerHTML = html;
        btn.onclick = onClick;
        return btn;
    }

    function createDisabledActionButton(variant, html, title) {
        const btn = document.createElement('button');
        btn.className = `pdm-action-btn ${variant} disabled`;
        btn.innerHTML = html;
        btn.disabled = true;
        if (title) btn.title = title;
        return btn;
    }

    socket.on('connect', () => {
        console.log('🔌 Connected:', socket.id);
        hideRoomGate();
        Notifications.show('Connected to game server', 'info', 2000);
    });

    socket.on('disconnect', () => {
        Notifications.show('Disconnected from server', 'error', 4000);
    });

    socket.on('player-session', (data) => {
        if (data.sessionToken) {
            persistValue(SESSION_TOKEN_KEY, data.sessionToken);
        }
        myPlayerId = data.playerId || null;
        GameUI.updateMyPlayerId(myPlayerId);
        TradeSystem.updatePlayerId(myPlayerId);
        AuctionSystem.updatePlayerId(myPlayerId);
        if (currentGameState) {
            applyState(currentGameState, { syncWorld: false, syncHistory: false });
        } else {
            syncRoomChrome();
            syncCameraViewState();
        }
    });

    socket.on('lobby-update', (state) => {
        GameUI.updateHostPlayerId(state?.hostPlayerId || null);
        syncRoomChrome(state);
    });

    socket.on('room-error', (data) => {
        clearRoomCode();
        setTimeout(() => window.location.assign(window.location.pathname), 150);
        Notifications.show(data?.message || 'Room unavailable', 'error', 4000);
    });

    socket.on('room-ended', (data) => {
        clearRoomCode();
        Notifications.show(data?.message || 'Room ended', 'info', 5000);
        setTimeout(() => window.location.assign(window.location.pathname), 250);
    });

    socket.on('player-kicked', (data) => {
        clearRoomCode();
        Notifications.show(data?.message || 'You were removed from the room.', 'error', 5000);
        setTimeout(() => window.location.assign(window.location.pathname), 250);
    });

    socket.on('game-ended-by-host', (data) => {
        Notifications.show(data?.message || 'The host ended the current match.', 'info', 5000);
        hideSummaryModal();
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
    HistoryLog.init();
    TradeSystem.init(socket);
    AuctionSystem.init(socket);
    if (typeof DevPanel !== 'undefined') DevPanel.init(socket);
    GameBoard.setTextProfile(DEFAULT_VIEW_MODE);
    GameScene.onViewModeChange(() => {
        syncCameraViewState();
    });

    if (topBar || viewDockToggle || viewDock) {
        syncTopDownHudLayout();
        if (typeof ResizeObserver !== 'undefined') {
            topBarResizeObserver = new ResizeObserver(() => {
                syncTopDownHudLayout();
            });
            [topBar, viewDockToggle, viewDock].filter(Boolean).forEach(element => {
                topBarResizeObserver.observe(element);
            });
        }
        window.addEventListener('resize', syncTopDownHudLayout);
    }

    saveGameBtn?.addEventListener('click', () => {
        if (saveGameBtn.disabled) return;
        socket.emit('save-game');
    });

    loadGameBtn?.addEventListener('click', () => {
        if (loadGameBtn.disabled) return;
        if (!window.confirm('Loading a saved game will replace the current match state for everyone in the room. Continue?')) return;
        loadGameInput?.click();
    });

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
    document.getElementById('hud-copy-room-link-btn')?.addEventListener('click', () => copyInvite());
    document.getElementById('end-room-btn')?.addEventListener('click', () => {
        if (!window.confirm('End this room for everyone?')) return;
        socket.emit('end-room');
    });
    document.getElementById('hud-end-room-btn')?.addEventListener('click', () => {
        if (!window.confirm('End this room for everyone?')) return;
        socket.emit('end-room');
    });
    document.getElementById('hud-end-game-btn')?.addEventListener('click', () => {
        if (!window.confirm('End the current match and return everyone to the lobby?')) return;
        socket.emit('end-game');
    });

    if (activeRoomCode) {
        connectToRoom(activeRoomCode);
    } else {
        showRoomGate();
    }

    // #13: Isometric button — always switches to isometric
    cameraIsoBtn?.addEventListener('click', () => {
        if (GameScene.getViewMode() !== 'isometric') {
            GameScene.setViewMode('isometric');
            syncCameraViewState();
        } else {
            GameScene.resetBoardView();
            syncCameraViewState();
        }
    });

    if (cameraViewBtn) {
        cameraViewBtn.addEventListener('click', () => {
            // Toggle third person: if already in it, switch to isometric
            const nextMode = GameScene.getViewMode() === 'third-person' ? DEFAULT_VIEW_MODE : 'third-person';
            if (GameScene.setViewMode(nextMode)) {
                syncCameraViewState();
            }
        });
        syncCameraViewState();
    }

    cameraTopdownBtn?.addEventListener('click', () => {
        // Toggle top-down: if already in it, switch to isometric
        const nextMode = GameScene.getViewMode() === 'top-down' ? DEFAULT_VIEW_MODE : 'top-down';
        if (GameScene.setViewMode(nextMode)) {
            syncCameraViewState();
        }
    });

    cameraResetBtn?.addEventListener('click', () => {
        GameScene.resetBoardView();
        syncCameraViewState();
    });

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

    // ── Init Raycaster for clickable board ─────────────────
    GameBoard.initRaycaster(camera, renderer);
    GameBoard.onTileClick((tileIndex) => {
        if (!currentGameState) return;
        // Don't open modal during dice roll or modal open
        const anyModal = document.querySelector('.modal-overlay.show');
        if (anyModal) return;
        setFocusedTile(tileIndex);
        showPropertyDetailsModal(tileIndex);
    });
    GameScene.animate(renderRuntimeUI);

    // ── History Log ───────────────────────────────────────
    socket.on('history-event', (data) => {
        HistoryLog.addEvent(data.text, data.type);
    });

    socket.on('gameStarted', (state) => {
        applyState(state);
    });

    socket.on('dice-rolled', (data) => {
        if (!setCurrentGameState(data.gameState)) return;
        GameUI.showDiceResult(data.die1, data.die2, data.character, data.isDoubles);
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
                }
            );
        });
    });

    socket.on('buy-prompt', (data) => {
        if (!setCurrentGameState(data.gameState)) return;
        GameModals.showBuyModal(data);
        syncTurnTimerUI(currentGameState);
    });

    socket.on('player-deciding', () => { });

    socket.on('property-bought', (data) => {
        applyState(data.gameState, { syncHistory: false, syncTrades: false, syncAuction: false });
        if (data.playerId === myPlayerId) {
            Notifications.show(`🏠 Bought ${data.tileName}!`, 'success', 2500);
        }
    });

    socket.on('rent-paid', (data) => {
        applyState(data.gameState, { syncHistory: false, syncTrades: false, syncAuction: false, syncBuyPrompt: false });
        GameModals.showRentPaid(data, data.payerId === myPlayerId, data.ownerId === myPlayerId);
    });

    socket.on('tax-paid', (data) => {
        applyState(data.gameState, { syncHistory: false, syncTrades: false, syncAuction: false, syncBuyPrompt: false });
        GameModals.showTaxPaid(data, data.playerId === myPlayerId);
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
                    }
                );
                return;
            }

            applyState(data.gameState, { syncWorld: true, syncHistory: false, syncTrades: false, syncAuction: false, syncBuyPrompt: false });
        };

        GameModals.showActionCard(data.card, data.result, onAfterCard);
    });

    socket.on('player-bankrupt', (data) => {
        applyState(data.gameState, { syncHistory: false, syncTrades: true, syncAuction: true, syncBuyPrompt: false });
        GameModals.showBankruptcy(data, data.playerId === myPlayerId);
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
        GameUI.updateTurnTimer(null);
        showEndStatsScreen(data.summary, data.winner);
    });

    document.getElementById('es-return-btn')?.addEventListener('click', () => {
        hideEndStatsScreen();
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
        GameModals.hideBuyModal();
        Notifications.show(`🔨 Auction: ${data.auction.tileName}!`, 'hype', 3000);
    });
    socket.on('auction-bid', (data) => { AuctionSystem.onBid(data); });
    socket.on('auction-tick', (data) => { AuctionSystem.onTick(data); });
    socket.on('auction-ended', (data) => {
        applyState(data.gameState, { syncHistory: false, syncTrades: false, syncAuction: true, syncBuyPrompt: true });
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
        TradeSystem.showIncomingTrade(offer);
        Notifications.show(`${offer.isCounterOffer ? '↩️' : '🤝'} ${offer.fromCharacter} sent ${offer.isCounterOffer ? 'a counter-offer' : 'a trade offer'}!`, 'hype', 3000);
    });
    socket.on('trade-sent', (data) => {
        if (data?.replacedTradeId) {
            TradeSystem.handleTradeInvalidated({
                tradeId: data.replacedTradeId,
                message: 'The original offer was replaced by your counter-offer.',
                code: 'countered'
            });
        }
        if (data?.trade) {
            TradeSystem.showSentTrade(data.trade);
        }
        Notifications.show('Trade sent!', 'success', 2000);
    });
    socket.on('trade-completed', (data) => {
        TradeSystem.dismissTrade(data.tradeId);
        applyState(data.gameState, { syncHistory: false, syncTrades: true, syncAuction: false, syncBuyPrompt: false });
        Notifications.show('✅ Trade completed!', 'success', 3000);
    });
    socket.on('trade-rejected', (data) => {
        if (data?.tradeId) {
            TradeSystem.dismissTrade(data.tradeId);
        }
        Notifications.show('Trade rejected', 'error', 2000);
    });
    socket.on('trade-invalidated', (data) => {
        TradeSystem.handleTradeInvalidated(data);
    });
    socket.on('trade-validation', (data) => {
        TradeSystem.handleTradeValidation(data);
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
        GameUI.updateTurnTimer(data);
    });

    socket.on('turn-timer-tick', (data) => {
        if (!currentGameState) currentGameState = { turnTimer: data };
        else currentGameState.turnTimer = data;
        GameUI.updateTurnTimer(data);
    });

    socket.on('turn-timer-stop', () => {
        if (currentGameState) currentGameState.turnTimer = null;
        GameUI.updateTurnTimer(null);
    });

    socket.on('game-paused', (data) => {
        if (!currentGameState) return;
        currentGameState.pauseState = data.pauseState;
        GameUI.updateTurnIndicator(currentGameState.currentPlayerId, null, currentGameState.players, currentGameState);
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
        Notifications.notifyError(data.message);
        if (currentGameState?.players?.length) {
            const currentPlayer = currentGameState.players[currentGameState.currentPlayerIndex];
            if (currentPlayer) {
                GameUI.updateTurnIndicator(currentPlayer.id, currentPlayer.character, currentGameState.players, currentGameState);
            }
        }
    });

    // ═══════════════════════════════════════════════════════
    //  PROPERTY DETAILS MODAL — 2-column gidd.io layout
    // ═══════════════════════════════════════════════════════
    function showPropertyDetailsModal(tileIndex) {
        if (!currentGameState) return;
        const tile = BOARD_DATA[tileIndex];
        const prop = currentGameState.properties[tileIndex];
        if (!tile) return;

        // Don't show modal for corners
        if (tile.type === 'corner') return;

        const modal = document.getElementById('prop-details-modal');

        const colorMap = {
            'brown': '#8B4513', 'lightblue': '#87CEEB', 'pink': '#DA70D6',
            'orange': '#FFA500', 'red': '#FF0000', 'yellow': '#FFD700',
            'green': '#00AA00', 'darkblue': '#0000CC', 'railroad': '#555',
            'utility': '#888'
        };
        const accent = colorMap[tile.colorGroup] || colorMap[tile.type] || '#6c5ce7';

        // ── LEFT COLUMN ──────────────────────────────────
        // Color block
        const colorBlock = document.getElementById('pdm-color-block');
        if (colorBlock) colorBlock.style.background = accent;

        // Type badge
        const typeBadge = document.getElementById('pdm-type-badge');
        if (typeBadge) {
            typeBadge.textContent = tile.type === 'railroad' ? '🚂 Railroad'
                : tile.type === 'utility' ? '⚡ Utility'
                    : tile.type === 'tax' ? '💸 Tax'
                        : tile.type === 'chance' || tile.type === 'chest' ? '🃏 Card'
                            : '🏠 Property';
        }

        // Name
        const nameEl = document.getElementById('pd-name');
        if (tile.type === 'railroad') {
            nameEl.innerHTML = `<img src="/images/metro-logo.png" class="pdm-railroad-icon"> ${tile.name}`;
        } else {
            nameEl.textContent = tile.name;
        }

        // Stats grid
        const upgradeCost = tile.price > 0 ? `$${Math.floor(tile.price * 0.5)}` : '—';
        const hotelCost = tile.price > 0 ? `$${Math.floor(tile.price * 2.5)}` : '—';
        const currentCost = getTileDisplayRent(prop, currentGameState.properties);
        const priceLabelEl = document.getElementById('pdm-price-label');
        if (priceLabelEl) {
            priceLabelEl.textContent = prop?.owner ? 'Rent' : 'Price';
        }
        document.getElementById('pd-price').textContent = prop?.owner ? currentCost.label : (tile.price > 0 ? `$${tile.price}` : '—');
        const hcEl = document.getElementById('pdm-house-cost');
        const htEl = document.getElementById('pdm-hotel-cost');
        if (hcEl) hcEl.textContent = tile.type === 'property' ? upgradeCost : '—';
        if (htEl) htEl.textContent = tile.type === 'property' ? hotelCost : '—';

        // Rent tiers
        const rentTiersEl = document.getElementById('pd-rent-tiers');
        rentTiersEl.innerHTML = '';
        if (tile.type === 'property' && tile.rent > 0) {
            const ownerHasFullSet = prop?.owner && ownsFullColorGroup(prop.owner, tile);
            const rentTiers = Array.isArray(tile.rentTiers) && tile.rentTiers.length === 6
                ? [...tile.rentTiers]
                : null;
            const amounts = rentTiers
                ? [ownerHasFullSet ? rentTiers[0] * 2 : rentTiers[0], ...rentTiers.slice(1)]
                : [
                    tile.rent * (ownerHasFullSet ? 2 : 1),
                    tile.rent * 5,
                    tile.rent * 15,
                    tile.rent * 45,
                    tile.rent * 80,
                    tile.rent * 125
                ];
            const labels = [
                ownerHasFullSet ? 'No house (set bonus)' : 'No house',
                '1 house',
                '2 houses',
                '3 houses',
                '4 houses',
                'Hotel'
            ];
            amounts.forEach((amount, idx) => {
                const row = document.createElement('div');
                row.className = `pdm-rent-row${prop?.houses === idx ? ' current' : ''}`;
                row.innerHTML = `<span>with ${labels[idx]}</span><span class="pdm-rent-val">$${amount}</span>`;
                rentTiersEl.appendChild(row);
            });
        } else if (tile.type === 'railroad') {
            [1, 2, 3, 4].forEach(n => {
                const row = document.createElement('div');
                row.className = 'pdm-rent-row';
                row.innerHTML = `<span>${n} Railroad${n > 1 ? 's' : ''}</span><span class="pdm-rent-val">$${25 * Math.pow(2, n - 1)}</span>`;
                rentTiersEl.appendChild(row);
            });
        } else if (tile.type === 'utility') {
            [{ n: 1, t: 'Dice × 4' }, { n: 2, t: 'Dice × 10' }].forEach(({ n, t }) => {
                const row = document.createElement('div');
                row.className = 'pdm-rent-row';
                row.innerHTML = `<span>${n} Utility</span><span class="pdm-rent-val">${t}</span>`;
                rentTiersEl.appendChild(row);
            });
        }

        // Action buttons (2x2 grid)
        const actionsEl = document.getElementById('pd-actions');
        actionsEl.innerHTML = '';
        const me = currentGameState.players.find(p => p.id === myPlayerId);
        const hasFullSet = ownsFullColorGroup(myPlayerId, tile);
        const groupLocked = colorGroupHasBuildings(tile);
        const groupMortgaged = colorGroupHasMortgaged(tile);
        const canManage = canManageAssetsNow();

        if (prop && prop.owner === myPlayerId && tile.type === 'property') {
            const uCost = Math.floor(tile.price * 0.5);
            const dRefund = Math.floor(tile.price * 0.25);
            const upgradeValidation = MonopolyRules.validateUpgrade(currentGameState.properties, myPlayerId, tileIndex);
            const downgradeValidation = MonopolyRules.validateDowngrade(currentGameState.properties, myPlayerId, tileIndex);

            if (!prop.isMortgaged && prop.houses < 5) {
                const btn = canManage && upgradeValidation.ok && me.money >= uCost
                    ? createActionButton('upgrade', `⬆ Upgrade<br><small>$${uCost}</small>`, () => {
                        socket.emit('upgrade-property', { tileIndex });
                        hidePropertyDetailsModal();
                    })
                    : createDisabledActionButton(
                        'upgrade',
                        `⬆ Upgrade<br><small>${!canManage ? 'Your turn only' : me.money < uCost ? 'Not enough cash' : 'Unavailable'}</small>`,
                        !canManage
                            ? 'Only the active player can build right now.'
                            : upgradeValidation.ok
                                ? `Need $${uCost} to upgrade this property.`
                                : upgradeValidation.message
                    );
                actionsEl.appendChild(btn);
            }
            if (prop.houses > 0) {
                const btn = canManage && downgradeValidation.ok
                    ? createActionButton('downgrade', `⬇ Downgrade<br><small>+$${dRefund}</small>`, () => {
                        socket.emit('downgrade-property', { tileIndex });
                        hidePropertyDetailsModal();
                    })
                    : createDisabledActionButton(
                        'downgrade',
                        `⬇ Downgrade<br><small>${!canManage ? 'Your turn only' : 'Unavailable'}</small>`,
                        !canManage ? 'Only the active player can sell buildings right now.' : downgradeValidation.message
                    );
                actionsEl.appendChild(btn);
            }
            if (!prop.isMortgaged && prop.houses === 0) {
                const btn = !canManage
                    ? createDisabledActionButton(
                        'mortgage',
                        '🏦 Mortgage<br><small>Your turn only</small>',
                        'Only the active player can mortgage property right now.'
                    )
                    : groupLocked
                    ? createDisabledActionButton(
                        'mortgage',
                        '🏦 Mortgage<br><small>Set has buildings</small>',
                        'Sell all buildings in this color set before mortgaging.'
                    )
                    : createActionButton('mortgage', `🏦 Mortgage<br><small>+$${Math.floor(tile.price / 2)}</small>`, () => {
                        socket.emit('mortgage-property', { tileIndex });
                        hidePropertyDetailsModal();
                    });
                actionsEl.appendChild(btn);
            }
            if (prop.isMortgaged) {
                const unmortgageCost = Math.floor(tile.price * 0.55);
                const btn = canManage && me.money >= unmortgageCost
                    ? createActionButton('mortgage', `🔓 Unmortgage<br><small>$${unmortgageCost}</small>`, () => {
                        socket.emit('unmortgage-property', { tileIndex });
                        hidePropertyDetailsModal();
                    })
                    : createDisabledActionButton(
                        'mortgage',
                        `🔓 Unmortgage<br><small>${!canManage ? 'Your turn only' : 'Not enough cash'}</small>`,
                        !canManage ? 'Only the active player can unmortgage property right now.' : `Need $${unmortgageCost} to unmortgage this property.`
                    );
                actionsEl.appendChild(btn);
            }
            const sellBtn = !canManage
                ? createDisabledActionButton(
                    'sell',
                    '💰 Sell<br><small>Your turn only</small>',
                    'Only the active player can sell property right now.'
                )
                : groupLocked
                ? createDisabledActionButton(
                    'sell',
                    '💰 Sell<br><small>Set has buildings</small>',
                    'Sell all buildings in this color set before selling this property.'
                )
                : createActionButton('sell', '💰 Sell<br><small>to Bank</small>', () => {
                    socket.emit('sell-property', { tileIndex });
                    hidePropertyDetailsModal();
                });
            actionsEl.appendChild(sellBtn);

        } else if (prop && prop.owner === myPlayerId) {
            if (!prop.isMortgaged) {
                const btn = canManage
                    ? createActionButton('mortgage', `🏦 Mortgage<br><small>+$${Math.floor(tile.price / 2)}</small>`, () => {
                        socket.emit('mortgage-property', { tileIndex });
                        hidePropertyDetailsModal();
                    })
                    : createDisabledActionButton(
                        'mortgage',
                        '🏦 Mortgage<br><small>Your turn only</small>',
                        'Only the active player can mortgage property right now.'
                    );
                actionsEl.appendChild(btn);
            } else {
                const unmortgageCost = Math.floor(tile.price * 0.55);
                const btn = canManage && me.money >= unmortgageCost
                    ? createActionButton('mortgage', `🔓 Unmortgage<br><small>$${unmortgageCost}</small>`, () => {
                        socket.emit('unmortgage-property', { tileIndex });
                        hidePropertyDetailsModal();
                    })
                    : createDisabledActionButton(
                        'mortgage',
                        `🔓 Unmortgage<br><small>${!canManage ? 'Your turn only' : 'Not enough cash'}</small>`,
                        !canManage ? 'Only the active player can unmortgage property right now.' : `Need $${unmortgageCost} to unmortgage this property.`
                    );
                actionsEl.appendChild(btn);
            }
            const sellBtn = canManage
                ? createActionButton('sell', '💰 Sell<br><small>to Bank</small>', () => {
                    socket.emit('sell-property', { tileIndex });
                    hidePropertyDetailsModal();
                })
                : createDisabledActionButton(
                    'sell',
                    '💰 Sell<br><small>Your turn only</small>',
                    'Only the active player can sell property right now.'
                );
            actionsEl.appendChild(sellBtn);
        }

        // My cash footer
        const myCashEl = document.getElementById('pdm-my-cash');
        if (myCashEl && me) myCashEl.textContent = `$${me.money}`;

        // ── RIGHT COLUMN ─────────────────────────────────
        // Owner info
        const ownerEl = document.getElementById('pd-owner');
        const ownerAvatar = document.getElementById('pdm-owner-avatar');
        if (prop && prop.owner) {
            const ownerPlayer = currentGameState.players.find(p => p.id === prop.owner);
            const ownerName = ownerPlayer?.character || 'Unknown';
            const ownerColor = ownerPlayer?.color || '#6c5ce7';
            if (ownerEl) {
                ownerEl.innerHTML = `<span style="color:${ownerColor}">${ownerName}</span>`;
                if (prop.isMortgaged) ownerEl.innerHTML += ` <span class="pdm-mortgaged-tag">MORTGAGED</span>`;
            }
            if (ownerAvatar) {
                ownerAvatar.style.borderColor = ownerColor;
                const avatarMap = { 'Bilo': '🟣', 'Os': '🟠', 'Ziko': '🟢', 'Maro': '🟡' };
                ownerAvatar.textContent = avatarMap[ownerName] || '👤';
            }
        } else {
            if (ownerEl) ownerEl.textContent = 'Unowned';
            if (ownerAvatar) {
                if (tile.type === 'railroad') {
                    ownerAvatar.innerHTML = `<img src="/images/metro-logo.png" style="width:70%; height:70%; object-fit:contain;">`;
                    ownerAvatar.style.borderColor = 'rgba(108, 92, 231, 0.2)';
                } else {
                    ownerAvatar.textContent = '🏦';
                    ownerAvatar.style.borderColor = '';
                }
            }
        }

        // Analytics
        const landedEl = document.getElementById('pdm-landed-count');
        const rentEl = document.getElementById('pdm-rent-collected');
        if (landedEl) landedEl.textContent = prop?.landedCount ?? 0;
        if (rentEl) rentEl.textContent = `$${prop?.rentCollected ?? 0}`;

        // Timeline
        const timeline = document.getElementById('pd-timeline');
        if (timeline) {
            timeline.innerHTML = '';
            const history = prop?.history || [];
            if (history.length === 0) {
                timeline.innerHTML = `<div class="pdm-timeline-empty">No activity yet</div>`;
            } else {
                [...history].reverse().forEach(event => {
                    const div = document.createElement('div');
                    div.className = 'pdm-timeline-event';
                    const typeLabel = event.type === 'buy' ? 'bought property'
                        : event.type === 'rent' ? 'paid rent'
                            : event.type === 'trade' ? 'received by trade'
                                : event.type;
                    const amountText = event.amount ? `$${event.amount}` : '';
                    const avatarMap = { 'Bilo': '🟣', 'Os': '🟠', 'Ziko': '🟢', 'Maro': '🟡' };
                    const ava = avatarMap[event.character] || '👤';
                    div.innerHTML = `
                        <div class="pdm-event-avatar" style="background:${event.color}22;border-color:${event.color}66">${ava}</div>
                        <div class="pdm-event-body">
                            <div class="pdm-event-text">${typeLabel}</div>
                            <div class="pdm-event-player" style="color:${event.color}">${event.character}</div>
                        </div>
                        ${amountText ? `<div class="pdm-event-amount">${amountText}</div>` : ''}
                    `;
                    timeline.appendChild(div);
                });
            }
        }

        modal.classList.remove('hidden');
        modal.classList.add('show');
    }

    function hidePropertyDetailsModal() {
        const modal = document.getElementById('prop-details-modal');
        modal.classList.remove('show');
        modal.classList.add('hidden');
        setFocusedTile(null);
    }

    function hideSummaryModal() {
        const modal = document.getElementById('summary-modal');
        if (!modal) return;
        modal.classList.remove('show');
        modal.classList.add('hidden');
    }

    // Close on overlay click
    document.getElementById('prop-details-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'prop-details-modal') hidePropertyDetailsModal();
    });
    document.getElementById('pd-close-btn')?.addEventListener('click', hidePropertyDetailsModal);
    document.getElementById('summary-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'summary-modal') hideSummaryModal();
    });
    document.getElementById('summary-close-btn')?.addEventListener('click', hideSummaryModal);

    window.notifyGo = Notifications.notifyGo;
    window.notifyDoubles = Notifications.notifyDoubles;

    console.log(
        '%c🎲 Monopoly Game Loaded!\n%cPhase 5: Textured Board, Clickable Tiles, Upgrades',
        'color: #6c5ce7; font-size: 16px; font-weight: bold;',
        'color: #a29bfe; font-size: 12px;'
    );
})();
