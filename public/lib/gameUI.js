// ═══════════════════════════════════════════════════════════
//  GAME UI — Leaderboard panel, turn indicator, dice, own auction, jail UI
// ═══════════════════════════════════════════════════════════

const GameUI = (() => {
    let socket = null;
    let myPlayerId = null;
    let currentHostPlayerId = null;
    let currentPlayers = [];
    let currentProperties = [];
    let diceResultHideTimeout = null;
    let overflowMenuOpen = false;
    let lastRenderedTurnOwnerId = null;
    let hasRenderedTurnState = false;

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
                socket.emit('roll-dice');
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

        const label = timerState.phase === 'buying' ? 'Buy Window' : 'Turn Timer';
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
            jailDiv.classList.remove('hidden');

            if (rollBtn) {
                rollBtn.classList.add('disabled');
                rollBtn.textContent = 'Choose Jail Action';
            }
            if (jailRollBtn) {
                jailRollBtn.classList.remove('disabled');
                jailRollBtn.textContent = '🎲 Roll for Doubles';
                setPromptedActionState(jailRollBtn, true);
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
            && !me?.inJail
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
                title: 'Choose a jail action before ending your turn.'
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
            if (currentPlayer) currentCharacter = currentPlayer.character;
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

            if (!player.isActive) {
                element.innerHTML = `
          <div class="lb-rank">#${index + 1}</div>
          <div class="lb-info">
            <span class="lb-name" style="color:${player.color}"><s>${player.character}</s></span>
            <span class="lb-bankrupt">BANKRUPT</span>
          </div>
        `;
            } else {
                element.innerHTML = `
          <div class="lb-rank">#${index + 1}</div>
          <div class="lb-info">
            <span class="lb-name" style="color:${player.color}">${player.character}${jailBadge}</span>
            ${hostBadge}
            <span class="lb-money">$${player.money}</span>
            ${propertyCount > 0 ? `<span class="lb-props">🏠 ${propertyCount}</span>` : ''}
            ${botBadge}
            ${disconnectedBadge}
          </div>
          ${showTrade || showKick ? `
            <div class="lb-actions">
              ${showTrade ? `<button class="lb-trade-btn" data-player-id="${player.id}">🤝 Trade</button>` : ''}
              ${showKick ? `<button class="lb-kick-btn" data-player-id="${player.id}" data-player-name="${player.character}">Kick</button>` : ''}
            </div>
          ` : ''}
        `;
            }
            panel.appendChild(element);
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

    function showDiceResult(die1, die2, character, isDoubles) {
        const element = document.getElementById('dice-result');
        if (!element) return;

        element.innerHTML = `
      <span class="dr-char">${character}</span>
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
