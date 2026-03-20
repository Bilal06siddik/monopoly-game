// ═══════════════════════════════════════════════════════════
//  GAME UI — Leaderboard panel, turn indicator, dice, own auction, jail UI
// ═══════════════════════════════════════════════════════════

const GameUI = (() => {
    const CHARACTER_SKIN_IMAGE_MAP = {
        bilo: {
            'casual-player': './characters/bilo-common.png',
            'rap-mogul': './characters/bilo-rapper.png',
            'anfield-mind': './characters/bilo-liver.png',
            'brand-strategist': './characters/bilo-coddi.png',
            'shark-investor': './characters/bilo.webp'
        }
    };

    let socket = null;
    let myPlayerId = null;
    let currentHostPlayerId = null;
    let currentPlayers = [];
    let currentProperties = [];
    let diceResultHideTimeout = null;
    let overflowMenuOpen = false;
    let lastRenderedTurnOwnerId = null;
    let hasRenderedTurnState = false;
    let avatarPreviewElement = null;
    let leaderboardCollapsed = false;

    function resetTurnAwareness() {
        lastRenderedTurnOwnerId = null;
        hasRenderedTurnState = false;
    }

    function primeAudio() {
        if (typeof GameAudio !== 'undefined' && typeof GameAudio.prime === 'function') {
            GameAudio.prime();
        }
    }

    function notifyMyTurn(rollButtonState, endTurnState, me) {
        if (typeof GameAudio !== 'undefined' && typeof GameAudio.playTurnAlert === 'function') {
            GameAudio.playTurnAlert();
        }

        if (typeof Notifications !== 'undefined' && typeof Notifications.show === 'function') {
            const message = rollButtonState?.canRoll
                ? 'Your turn! Roll the dice.'
                : endTurnState?.canEndTurn
                    ? 'Your turn! End your turn when ready.'
                    : me?.inJail
                        ? 'Your turn! Choose a jail action.'
                        : 'Your turn!';
            Notifications.show(message, 'success', 2200);
        }
    }

    function setPromptedActionState(button, isPrompted) {
        if (!button) return;
        button.classList.toggle('prompting-action', Boolean(isPrompted) && !button.classList.contains('disabled'));
    }

    function ensureAvatarPreviewElement() {
        if (avatarPreviewElement) return avatarPreviewElement;

        avatarPreviewElement = document.createElement('div');
        avatarPreviewElement.className = 'lb-avatar-hover-preview';
        avatarPreviewElement.innerHTML = `
            <img class="lb-avatar-hover-image" src="" alt="" />
            <div class="lb-avatar-hover-name"></div>
        `;
        document.body.appendChild(avatarPreviewElement);
        return avatarPreviewElement;
    }

    function positionAvatarPreview(avatarElement, event = null) {
        if (!avatarPreviewElement || !avatarElement) return;

        const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
        const edgePadding = 8;
        const pointerOffset = 14;

        let x;
        let y;
        if (event && typeof event.clientX === 'number' && typeof event.clientY === 'number') {
            x = event.clientX + pointerOffset;
            y = event.clientY + pointerOffset;
        } else {
            const avatarRect = avatarElement.getBoundingClientRect();
            x = avatarRect.right + 10;
            y = avatarRect.top;
        }

        const previewRect = avatarPreviewElement.getBoundingClientRect();
        if (x + previewRect.width + edgePadding > viewportWidth) {
            const anchorRect = avatarElement.getBoundingClientRect();
            x = anchorRect.left - previewRect.width - 10;
        }
        if (y + previewRect.height + edgePadding > viewportHeight) {
            y = viewportHeight - previewRect.height - edgePadding;
        }

        x = Math.max(edgePadding, x);
        y = Math.max(edgePadding, y);

        avatarPreviewElement.style.left = `${Math.round(x)}px`;
        avatarPreviewElement.style.top = `${Math.round(y)}px`;
    }

    function showAvatarPreview(avatarElement, event = null) {
        if (!avatarElement) return;

        const preview = ensureAvatarPreviewElement();
        const previewSrc = avatarElement.dataset.previewSrc || avatarElement.getAttribute('src') || '';
        const previewName = avatarElement.dataset.previewName || avatarElement.getAttribute('alt') || 'Player';
        const previewColor = avatarElement.dataset.previewColor || '#ffffff';

        const image = preview.querySelector('.lb-avatar-hover-image');
        const name = preview.querySelector('.lb-avatar-hover-name');
        if (!image || !name) return;

        image.src = previewSrc;
        image.alt = previewName;
        name.textContent = previewName;

        preview.style.setProperty('--lb-preview-color', previewColor);
        preview.classList.add('show');
        positionAvatarPreview(avatarElement, event);
    }

    function hideAvatarPreview() {
        if (!avatarPreviewElement) return;
        avatarPreviewElement.classList.remove('show');
    }

    function getPlayerAvatarSrc(player) {
        if (player?.customAvatarUrl) return player.customAvatarUrl;
        if (player?.character === 'custom') return './characters/custom.svg';

        const characterId = String(player?.character || '').toLowerCase();
        const skinId = String(player?.skinId || '').toLowerCase();
        const mappedSkin = CHARACTER_SKIN_IMAGE_MAP[characterId]?.[skinId];
        if (mappedSkin) return mappedSkin;

        return `./characters/${characterId}.webp`;
    }

    function syncLeaderboardCollapseState() {
        const wrapper = document.getElementById('leaderboard-wrapper');
        const button = document.getElementById('leaderboard-collapse-btn');
        if (!wrapper || !button) return;

        wrapper.classList.toggle('collapsed', leaderboardCollapsed);
        button.setAttribute('aria-expanded', String(!leaderboardCollapsed));
        button.setAttribute('aria-label', leaderboardCollapsed ? 'Expand leaderboard' : 'Collapse leaderboard');
        button.setAttribute('title', leaderboardCollapsed ? 'Expand leaderboard' : 'Collapse leaderboard');
    }

    function init(socketInstance) {
        socket = socketInstance;
        if (typeof GameAudio !== 'undefined' && typeof GameAudio.init === 'function') {
            GameAudio.init();
        }

        const rollBtn = document.getElementById('roll-dice-btn');
        rollBtn.addEventListener('click', () => {
            if (rollBtn.classList.contains('disabled')) return;
            primeAudio();
            socket.emit('roll-dice');
            rollBtn.classList.add('disabled');
            rollBtn.textContent = 'Rolling...';
            setPromptedActionState(rollBtn, false);
        });

        const endTurnBtn = document.getElementById('end-turn-btn');
        if (endTurnBtn) {
            endTurnBtn.addEventListener('click', () => {
                if (endTurnBtn.classList.contains('disabled')) return;
                primeAudio();
                endTurnBtn.classList.add('disabled');
                setPromptedActionState(endTurnBtn, false);
                socket.emit('end-turn');
            });
        }

        const jailRollBtn = document.getElementById('jail-roll-btn');
        if (jailRollBtn) {
            jailRollBtn.addEventListener('click', () => {
                if (jailRollBtn.classList.contains('disabled')) return;
                primeAudio();
                socket.emit('jail-roll');
            });
        }

        const startBtn = document.getElementById('start-game-btn');
        if (startBtn) {
            startBtn.addEventListener('click', () => {
                primeAudio();
                socket.emit('requestStartGame');
            });
        }

        const overflowBtn = document.getElementById('action-overflow-btn');
        const overflowMenu = document.getElementById('action-overflow-menu');
        if (overflowBtn && overflowMenu) {
            overflowBtn.addEventListener('click', event => {
                event.stopPropagation();
                setOverflowMenuOpen(!overflowMenuOpen);
            });
        }

        const ownAuctionBtn = document.getElementById('own-auction-btn');
        if (ownAuctionBtn) {
            ownAuctionBtn.addEventListener('click', () => {
                if (ownAuctionBtn.classList.contains('disabled')) return;
                setOverflowMenuOpen(false);
                showOwnAuctionSelector();
            });
        }

        const declareBankruptcyBtn = document.getElementById('declare-bankruptcy-btn');
        if (declareBankruptcyBtn) {
            declareBankruptcyBtn.addEventListener('click', () => {
                if (declareBankruptcyBtn.classList.contains('disabled')) return;
                setOverflowMenuOpen(false);
                if (!window.confirm('Declare bankruptcy and leave the match? This cannot be undone.')) return;
                socket.emit('declare-bankruptcy');
            });
        }

        const leaderboardCollapseBtn = document.getElementById('leaderboard-collapse-btn');
        if (leaderboardCollapseBtn) {
            leaderboardCollapseBtn.addEventListener('click', () => {
                leaderboardCollapsed = !leaderboardCollapsed;
                hideAvatarPreview();
                syncLeaderboardCollapseState();
            });
            syncLeaderboardCollapseState();
        }

        const tabHistory = document.getElementById('tab-history');
        const tabTrades = document.getElementById('tab-trades');
        const contentHistory = document.getElementById('history-content');
        const contentTrades = document.getElementById('trades-content');

        if (tabHistory && tabTrades) {
            tabHistory.addEventListener('click', () => {
                tabHistory.classList.add('active');
                tabTrades.classList.remove('active');
                contentHistory.classList.remove('hidden');
                contentTrades.classList.add('hidden');
            });

            tabTrades.addEventListener('click', () => {
                tabTrades.classList.add('active');
                tabHistory.classList.remove('active');
                contentTrades.classList.remove('hidden');
                contentHistory.classList.add('hidden');
            });
        }

        const buyoutBtn = document.getElementById('jail-buyout-btn');
        if (buyoutBtn) {
            buyoutBtn.addEventListener('click', () => {
                primeAudio();
                socket.emit('buy-out-jail');
            });
        }

        const pardonBtn = document.getElementById('jail-pardon-btn');
        if (pardonBtn) {
            pardonBtn.addEventListener('click', () => {
                if (!pardonBtn.classList.contains('disabled')) {
                    primeAudio();
                    socket.emit('use-pardon');
                }
            });
        }

        document.addEventListener('click', e => {
            if (overflowMenuOpen && !e.target.closest('.action-overflow')) {
                setOverflowMenuOpen(false);
            }

            if (e.target.matches('.oa-toggle-btn')) {
                document.querySelectorAll('.oa-toggle-btn').forEach(button => button.classList.remove('active'));
                e.target.classList.add('active');
            }

            if (e.target.id === 'own-auction-close') {
                hideModal('own-auction-select');
            }
            if (e.target.id === 'oa-config-close') {
                hideModal('own-auction-config');
            }
        });
    }

    function hideModal(id) {
        const element = document.getElementById(id);
        if (element) {
            element.classList.remove('show');
            element.classList.add('hidden');
        }
    }

    function showGameUI() {
        document.getElementById('game-hud').classList.remove('hidden');
        setOverflowMenuOpen(false);
    }

    function hideGameUI() {
        document.getElementById('game-hud').classList.add('hidden');
        setOverflowMenuOpen(false);
        hideAvatarPreview();
        resetTurnAwareness();
        setPromptedActionState(document.getElementById('roll-dice-btn'), false);
        setPromptedActionState(document.getElementById('end-turn-btn'), false);
        setPromptedActionState(document.getElementById('jail-roll-btn'), false);
    }

    function updateMyPlayerId(id) {
        if (myPlayerId !== id) {
            resetTurnAwareness();
        }
        myPlayerId = id;
    }

    function updateHostPlayerId(id) {
        currentHostPlayerId = id || null;
    }

    function updateTurnTimer(timerState) {
        const element = document.getElementById('turn-timer');
        if (!element) return;

        if (!timerState) {
            element.classList.add('hidden');
            element.classList.remove('warning');
            element.textContent = '';
            return;
        }

        const label = timerState.phase === 'waiting'
            ? 'Roll Timer'
            : timerState.phase === 'buying'
                ? 'Buy Window'
                : timerState.phase === 'done'
                    ? 'End Turn Timer'
                    : 'Turn Timer';
        element.textContent = `${label}: ${timerState.remainingSeconds}s`;
        element.classList.remove('hidden');
        element.classList.toggle('warning', timerState.remainingSeconds <= 10);
    }

    function setOverflowMenuOpen(isOpen) {
        overflowMenuOpen = Boolean(isOpen);
        const overflowBtn = document.getElementById('action-overflow-btn');
        const overflowMenu = document.getElementById('action-overflow-menu');
        if (!overflowBtn || !overflowMenu) return;

        overflowBtn.setAttribute('aria-expanded', String(overflowMenuOpen));
        overflowBtn.classList.toggle('active', overflowMenuOpen);
        overflowMenu.classList.toggle('hidden', !overflowMenuOpen);
    }

    function renderJailUI(gameState) {
        if (!gameState) return;

        const me = gameState.players.find(player => player.id === myPlayerId);
        const isMyTurn = gameState.currentPlayerId === myPlayerId;
        const jailDiv = document.getElementById('jail-actions');
        const pardonBtn = document.getElementById('jail-pardon-btn');
        const buyoutBtn = document.getElementById('jail-buyout-btn');
        const rollBtn = document.getElementById('roll-dice-btn');
        const jailRollBtn = document.getElementById('jail-roll-btn');

        if (!jailDiv) return;
        if (gameState.pauseState) {
            jailDiv.classList.add('hidden');
            setPromptedActionState(jailRollBtn, false);
            return;
        }

        if (me && me.inJail && isMyTurn) {
            const canAttemptJailRoll = gameState?.turnPhase === 'waiting';
            jailDiv.classList.remove('hidden');

            if (rollBtn) {
                rollBtn.classList.add('disabled');
                rollBtn.textContent = canAttemptJailRoll ? 'Choose Jail Action' : 'Turn Complete';
            }
            if (jailRollBtn) {
                jailRollBtn.classList.toggle('disabled', !canAttemptJailRoll);
                jailRollBtn.textContent = canAttemptJailRoll ? '🎲 Roll for Doubles' : '🎲 Roll Used';
                jailRollBtn.title = canAttemptJailRoll
                    ? 'Roll once to try for doubles.'
                    : 'You already used your jail roll this turn.';
                setPromptedActionState(jailRollBtn, canAttemptJailRoll);
            }

            if (buyoutBtn) {
                const disabled = me.money < 50;
                buyoutBtn.classList.toggle('disabled', disabled);
                buyoutBtn.style.opacity = disabled ? '0.35' : '';
                buyoutBtn.style.cursor = disabled ? 'not-allowed' : '';
                buyoutBtn.textContent = '💸 Pay $50 and End Turn';
            }

            if (pardonBtn) {
                if (me.pardons > 0) {
                    pardonBtn.classList.remove('disabled');
                    pardonBtn.textContent = `🃏 Use pardon card (${me.pardons})`;
                    pardonBtn.title = `You have ${me.pardons} pardon card(s)`;
                } else {
                    pardonBtn.classList.add('disabled');
                    pardonBtn.textContent = '🃏 Use pardon card';
                    pardonBtn.title = 'No pardon cards';
                }
            }

            return;
        }

        jailDiv.classList.add('hidden');
        if (jailRollBtn) {
            jailRollBtn.classList.add('disabled');
            setPromptedActionState(jailRollBtn, false);
        }
    }

    function updateOverflowActions(gameState, me) {
        const ownAuctionBtn = document.getElementById('own-auction-btn');
        const declareBankruptcyBtn = document.getElementById('declare-bankruptcy-btn');
        const overflowWrapper = document.querySelector('.action-overflow');
        if (!ownAuctionBtn || !declareBankruptcyBtn || !overflowWrapper) return;

        const canManageAssets = Boolean(
            me?.isActive
            && myPlayerId
            && typeof MonopolyRules !== 'undefined'
            && typeof MonopolyRules.canManageAssets === 'function'
            && MonopolyRules.canManageAssets({
                currentPlayerId: gameState?.currentPlayerId || null,
                pauseState: gameState?.pauseState || null,
                turnPhase: gameState?.turnPhase || null
            }, myPlayerId)
        );
        const hasAuctionableProperty = currentProperties.some(property => property.owner === myPlayerId && !isGroupLocked(property));
        const canDeclareBankruptcy = Boolean(me?.isActive && (me?.bankruptcyDeadline || (typeof me?.money === 'number' && me.money < 0)));

        overflowWrapper.classList.toggle('hidden', !me?.isActive);

        ownAuctionBtn.classList.toggle('disabled', !canManageAssets || !hasAuctionableProperty);
        ownAuctionBtn.title = !canManageAssets
            ? 'You can start an own auction only on your turn.'
            : !hasAuctionableProperty
                ? 'You need an eligible property to auction.'
                : 'Put one of your properties up for auction.';

        declareBankruptcyBtn.classList.toggle('disabled', !canDeclareBankruptcy);
        declareBankruptcyBtn.title = canDeclareBankruptcy
            ? 'Leave the match and surrender your assets.'
            : 'Declare bankruptcy when you are in debt.';

        if (!me?.isActive) {
            setOverflowMenuOpen(false);
        }
    }

    function getRollButtonState(isMyTurn, currentCharacter, gameState, me) {
        const activeCharacter = currentCharacter || 'current player';

        if (!isMyTurn) {
            return {
                canRoll: false,
                text: `Waiting for ${activeCharacter}...`,
                title: `It is ${activeCharacter}'s turn.`
            };
        }

        if (me?.inJail) {
            return {
                canRoll: false,
                text: 'Choose Jail Action',
                title: 'Use a jail action to continue.'
            };
        }

        if (me?.bankruptcyDeadline || (typeof me?.money === 'number' && me.money < 0)) {
            return {
                canRoll: false,
                text: 'Recover From Debt',
                title: 'Recover from debt or declare bankruptcy before continuing.'
            };
        }

        switch (gameState?.turnPhase) {
            case 'waiting':
                return {
                    canRoll: true,
                    text: gameState?.hasPendingExtraRoll ? '🎲 Roll Again' : '🎲 Roll Dice',
                    title: gameState?.hasPendingExtraRoll
                        ? 'You rolled doubles. Roll again.'
                        : 'Roll the dice to start your move.'
                };
            case 'rolling':
                return {
                    canRoll: false,
                    text: 'Rolling...',
                    title: 'The dice are already rolling.'
                };
            case 'moving':
                return {
                    canRoll: false,
                    text: 'Resolving Move...',
                    title: 'Wait for your move to finish resolving.'
                };
            case 'buying':
                return {
                    canRoll: false,
                    text: 'Choose Buy or Pass',
                    title: 'Buy the property or pass before you can end the turn.'
                };
            case 'auctioning':
                return {
                    canRoll: false,
                    text: 'Auction in Progress',
                    title: 'Finish the auction before continuing.'
                };
            case 'done':
                return {
                    canRoll: false,
                    text: 'Turn Complete',
                    title: 'You can end your turn now.'
                };
            default:
                return {
                    canRoll: false,
                    text: 'Action In Progress',
                    title: 'Finish the current action before continuing.'
                };
        }
    }

    function getEndTurnState(isMyTurn, currentCharacter, gameState, me) {
        const canEndTurn = isMyTurn
            && gameState?.turnPhase === 'done'
            && (typeof me?.money !== 'number' || me.money >= 0);

        if (canEndTurn) {
            return {
                canEndTurn,
                title: 'End your turn.'
            };
        }

        if (!isMyTurn) {
            return {
                canEndTurn,
                title: currentCharacter
                    ? `Wait for ${currentCharacter} to finish their turn.`
                    : 'Wait for the active player to finish their turn.'
            };
        }

        if (me?.inJail) {
            return {
                canEndTurn,
                title: canEndTurn
                    ? 'Your jail action is complete. End your turn.'
                    : 'Choose a jail action before ending your turn.'
            };
        }

        if (me?.bankruptcyDeadline || (typeof me?.money === 'number' && me.money < 0)) {
            return {
                canEndTurn,
                title: 'Recover from debt or declare bankruptcy before ending your turn.'
            };
        }

        switch (gameState?.turnPhase) {
            case 'waiting':
                return {
                    canEndTurn,
                    title: 'Roll the dice before ending your turn.'
                };
            case 'rolling':
            case 'moving':
                return {
                    canEndTurn,
                    title: 'Wait for the move to finish before ending your turn.'
                };
            case 'buying':
                return {
                    canEndTurn,
                    title: 'Buy the property or pass before ending your turn.'
                };
            case 'auctioning':
                return {
                    canEndTurn,
                    title: 'Finish the auction before ending your turn.'
                };
            default:
                return {
                    canEndTurn,
                    title: 'Finish the current action before ending your turn.'
                };
        }
    }

    function updateTurnIndicator(currentPlayerId, currentCharacter, allPlayers, gameState) {
        const indicator = document.getElementById('turn-indicator');
        const rollBtn = document.getElementById('roll-dice-btn');
        const endTurnBtn = document.getElementById('end-turn-btn');
        const me = gameState?.players?.find(player => player.id === myPlayerId) || null;

        if (!indicator || !rollBtn) return;

        if (!currentCharacter && gameState) {
            const currentPlayer = gameState.players.find(player => player.id === currentPlayerId);
            if (currentPlayer) currentCharacter = currentPlayer.name || currentPlayer.character;
        }

        if (gameState?.pauseState) {
            indicator.innerHTML = `<span class="turn-badge other-turn">⏸ Paused - waiting for ${gameState.pauseState.character} to reconnect</span>`;
            rollBtn.classList.add('disabled');
            rollBtn.textContent = 'Game Paused';
            setPromptedActionState(rollBtn, false);
            if (endTurnBtn) {
                endTurnBtn.classList.add('disabled');
                endTurnBtn.classList.remove('hidden');
                setPromptedActionState(endTurnBtn, false);
            }
            renderJailUI(gameState);
            updateTurnTimer(null);
            lastRenderedTurnOwnerId = currentPlayerId || null;
            hasRenderedTurnState = true;
            return;
        }

        const isMyTurn = currentPlayerId === myPlayerId;
        const shouldNotifyMyTurn = isMyTurn && (!hasRenderedTurnState || lastRenderedTurnOwnerId !== currentPlayerId);
        let jailText = '';
        if (gameState) {
            const currentPlayer = gameState.players.find(player => player.id === currentPlayerId);
            if (currentPlayer?.inJail) {
                jailText = ` 🔒 (Jail ${currentPlayer.jailTurns}/3)`;
            }
        }

        indicator.innerHTML = isMyTurn
            ? `<span class="turn-badge my-turn">${gameState?.hasPendingExtraRoll ? '🎲 Roll Again!' : '🎲 Your Turn!'}${jailText}</span>`
            : `<span class="turn-badge other-turn">⏳ ${currentCharacter}'s Turn${jailText}</span>`;

        const rollButtonState = getRollButtonState(isMyTurn, currentCharacter, gameState, me);
        rollBtn.classList.toggle('disabled', !rollButtonState.canRoll);
        rollBtn.textContent = rollButtonState.text;
        rollBtn.title = rollButtonState.title;
        setPromptedActionState(rollBtn, rollButtonState.canRoll);

        // End Turn button: enabled when it's my turn and not blocked by jail.
        let endTurnState = null;
        if (endTurnBtn) {
            endTurnState = getEndTurnState(isMyTurn, currentCharacter, gameState, me);
            endTurnBtn.classList.toggle('hidden', Boolean(isMyTurn && gameState?.hasPendingExtraRoll));
            endTurnBtn.classList.toggle('disabled', !endTurnState.canEndTurn);
            endTurnBtn.textContent = '⏭ End Turn';
            endTurnBtn.title = endTurnState.title;
            setPromptedActionState(endTurnBtn, endTurnState.canEndTurn);
        }

        if (!me?.isActive) {
            setOverflowMenuOpen(false);
        }

        renderJailUI(gameState);
        updateOverflowActions(gameState, me);
        if (shouldNotifyMyTurn) {
            notifyMyTurn(rollButtonState, endTurnState, me);
        }
        lastRenderedTurnOwnerId = currentPlayerId || null;
        hasRenderedTurnState = true;
        updateTurnTimer(gameState?.turnTimer || null);
    }

    function updateLeaderboard(players, properties) {
        currentPlayers = players;
        currentProperties = properties || currentProperties;

        const panel = document.getElementById('leaderboard-panel');
        if (!panel) return;
        hideAvatarPreview();
        panel.innerHTML = '';

        const sorted = [...players].sort((left, right) => {
            if (left.isActive !== right.isActive) return left.isActive ? -1 : 1;
            return right.money - left.money;
        });

        sorted.forEach((player, index) => {
            const propertyCount = currentProperties.filter(property => property.owner === player.id).length;
            const botBadge = player.isBot ? `<span class="lb-disconnected">Bot</span>` : '';
            const disconnectedBadge = player.isConnected ? '' : `<span class="lb-disconnected">Offline</span>`;
            const hostBadge = player.id === currentHostPlayerId ? `<span class="lb-host-badge">Host</span>` : '';
            const jailBadge = player.inJail ? `<span style="font-size:10px;color:#ff6b6b;"> 🔒</span>` : '';
            const isHostViewer = myPlayerId && currentHostPlayerId && myPlayerId === currentHostPlayerId;
            const showTrade = player.id !== myPlayerId && player.isActive;
            const showKick = isHostViewer && player.id !== myPlayerId;
            
            const element = document.createElement('div');
            element.className = `lb-card${player.id === myPlayerId ? ' is-me' : ''}${!player.isActive ? ' bankrupt' : ''}`;
            element.style.setProperty('--card-color', player.color);

            const avatarSrc = getPlayerAvatarSrc(player);
            const displayName = player.name || player.character;

            if (!player.isActive) {
                element.innerHTML = `
                    <div class="lb-rank">#${index + 1}</div>
                    <img class="lb-avatar" src="${avatarSrc}" style="border-color: ${player.color}" alt="${displayName}">
                    <div class="lb-player-info">
                        <div class="lb-name-badges">
                            <span class="lb-name" style="color:${player.color}"><s>${displayName}</s></span>
                            <span class="lb-bankrupt">BANKRUPT</span>
                        </div>
                    </div>
                `;
            } else {
                element.innerHTML = `
                    <div class="lb-rank">#${index + 1}</div>
                    <img class="lb-avatar" src="${avatarSrc}" style="border-color: ${player.color}" alt="${displayName}">
                    <div class="lb-player-info">
                        <div class="lb-name-badges">
                            <span class="lb-name" style="color:${player.color}">${displayName}</span>${jailBadge}
                            ${hostBadge} ${botBadge} ${disconnectedBadge}
                        </div>
                        ${propertyCount > 0 ? `<div class="lb-props-row"><span class="lb-props">🏠 ${propertyCount}</span></div>` : ''}
                    </div>
                    <div class="lb-money">$${player.money}</div>
                    ${showTrade || showKick ? `
                        <div class="lb-actions">
                            ${showTrade ? `<button class="lb-trade-btn" data-player-id="${player.id}">🤝 Trade</button>` : ''}
                            ${showKick ? `<button class="lb-kick-btn" data-player-id="${player.id}" data-player-name="${displayName}">Kick</button>` : ''}
                        </div>
                    ` : ''}
                `;
            }

            const avatarElement = element.querySelector('.lb-avatar');
            if (avatarElement) {
                avatarElement.dataset.previewSrc = avatarSrc;
                avatarElement.dataset.previewName = displayName;
                avatarElement.dataset.previewColor = player.color || '#ffffff';
                avatarElement.tabIndex = 0;
            }

            panel.appendChild(element);
        });

        panel.querySelectorAll('.lb-avatar').forEach(avatarElement => {
            avatarElement.addEventListener('mouseenter', event => {
                showAvatarPreview(event.currentTarget, event);
            });
            avatarElement.addEventListener('mousemove', event => {
                positionAvatarPreview(event.currentTarget, event);
            });
            avatarElement.addEventListener('mouseleave', () => {
                hideAvatarPreview();
            });
            avatarElement.addEventListener('focus', event => {
                showAvatarPreview(event.currentTarget);
            });
            avatarElement.addEventListener('blur', () => {
                hideAvatarPreview();
            });
        });

        panel.querySelectorAll('.lb-trade-btn').forEach(button => {
            button.addEventListener('click', () => {
                TradeSystem.openTradeModal(button.dataset.playerId);
            });
        });

        panel.querySelectorAll('.lb-kick-btn').forEach(button => {
            button.addEventListener('click', () => {
                const playerName = button.dataset.playerName || 'this player';
                if (!window.confirm(`Kick ${playerName} from the room?`)) return;
                socket.emit('kick-player', { playerId: button.dataset.playerId });
            });
        });

        if (typeof TradeSystem !== 'undefined') {
            TradeSystem.updateState(players, currentProperties);
        }
    }

    function updatePlayerBar(players, properties) {
        currentPlayers = players;
        if (properties) currentProperties = properties;
        updateLeaderboard(players, properties);
    }

    function showDiceResult(die1, die2, character, isDoubles, playerName) {
        const element = document.getElementById('dice-result');
        if (!element) return;

        const displayName = playerName || character;
        element.innerHTML = `
      <span class="dr-char">${displayName}</span>
      <span class="dr-dice">${getDiceFace(die1)} ${getDiceFace(die2)}</span>
      <span class="dr-total">= ${die1 + die2}${isDoubles ? ' 🔥' : ''}</span>
    `;
        if (diceResultHideTimeout) {
            clearTimeout(diceResultHideTimeout);
            diceResultHideTimeout = null;
        }
        element.classList.remove('hidden');
        element.classList.add('show');
        diceResultHideTimeout = setTimeout(() => {
            element.classList.remove('show');
            element.classList.add('hidden');
            diceResultHideTimeout = null;
        }, 4000);
    }

    function getDiceFace(value) {
        return ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'][value] || '🎲';
    }

    let selectedAuctionTileIndex = null;

    function isGroupLocked(property) {
        return property?.type === 'property'
            && Boolean(property.colorGroup)
            && currentProperties.some(tile => tile.type === 'property' && tile.colorGroup === property.colorGroup && tile.houses > 0);
    }

    function showOwnAuctionSelector() {
        const myProperties = currentProperties.filter(property => property.owner === myPlayerId);
        if (myProperties.length === 0) {
            Notifications.show('You do not own any properties to auction.', 'error', 3000);
            return;
        }

        const modal = document.getElementById('own-auction-select');
        const list = document.getElementById('own-auction-list');
        list.innerHTML = '';

        myProperties.forEach(property => {
            const button = document.createElement('button');
            button.className = 'oa-prop-btn';
            const houseText = property.houses > 0
                ? ` ${'🏠'.repeat(Math.min(property.houses, 4))}${property.houses >= 5 ? '🏨' : ''}`
                : '';
            const locked = isGroupLocked(property);
            button.innerHTML = locked
                ? `<span>${property.name}${houseText}<br><small>Sell color-set buildings first</small></span><span class="oa-price">Locked</span>`
                : `<span>${property.name}${houseText}</span><span class="oa-price">$${Math.floor(property.price / 2)}+</span>`;

            if (locked) {
                button.disabled = true;
                button.style.opacity = '0.45';
                button.style.cursor = 'not-allowed';
                button.title = 'Sell all buildings in this color group before auctioning this property.';
            } else {
                button.addEventListener('click', () => {
                    selectedAuctionTileIndex = property.index;
                    modal.classList.remove('show');
                    modal.classList.add('hidden');
                    showOwnAuctionConfig(property);
                });
            }

            list.appendChild(button);
        });

        modal.classList.remove('hidden');
        modal.classList.add('show');
    }

    function showOwnAuctionConfig(property) {
        const configModal = document.getElementById('own-auction-config');
        const maxValue = property.price + (property.houses * Math.floor(property.price * 0.25));
        const slider = document.getElementById('oa-price-slider');
        const sliderValue = document.getElementById('oa-slider-value');
        const sliderMax = document.getElementById('oa-slider-max');

        if (slider) {
            slider.max = maxValue;
            slider.value = Math.floor(maxValue / 2);
            sliderMax.textContent = `$${maxValue}`;
            sliderValue.textContent = `$${slider.value}`;
            slider.oninput = () => {
                sliderValue.textContent = `$${slider.value}`;
            };
        }

        document.querySelectorAll('.oa-toggle-btn').forEach((button, index) => {
            button.classList.toggle('active', index === 0);
        });

        const conductBtn = document.getElementById('oa-conduct-btn');
        if (conductBtn) {
            conductBtn.onclick = () => {
                const startPrice = slider ? Number.parseInt(slider.value, 10) : 0;
                socket.emit('own-auction', {
                    tileIndex: selectedAuctionTileIndex,
                    startPrice
                });
                configModal.classList.remove('show');
                configModal.classList.add('hidden');
            };
        }

        configModal.classList.remove('hidden');
        configModal.classList.add('show');
    }

    return {
        init,
        showGameUI,
        hideGameUI,
        updateTurnIndicator,
        updatePlayerBar,
        updateLeaderboard,
        showDiceResult,
        updateMyPlayerId,
        updateHostPlayerId,
        renderJailUI,
        updateTurnTimer
    };
})();
