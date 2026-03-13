// ═══════════════════════════════════════════════════════════
//  GAME UI — Leaderboard panel, turn indicator, dice, own auction, jail UI
// ═══════════════════════════════════════════════════════════

const GameUI = (() => {
    let socket = null;
    let myPlayerId = null;
    let currentPlayers = [];
    let currentProperties = [];

    function init(socketInstance) {
        socket = socketInstance;

        const rollBtn = document.getElementById('roll-dice-btn');
        rollBtn.addEventListener('click', () => {
            if (rollBtn.classList.contains('disabled')) return;
            socket.emit('roll-dice');
            rollBtn.classList.add('disabled');
            rollBtn.textContent = 'Rolling...';
        });

        const startBtn = document.getElementById('start-game-btn');
        if (startBtn) {
            startBtn.addEventListener('click', () => socket.emit('requestStartGame'));
        }

        const ownAucBtn = document.getElementById('own-auction-btn');
        if (ownAucBtn) {
            ownAucBtn.addEventListener('click', showOwnAuctionSelector);
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
            buyoutBtn.addEventListener('click', () => socket.emit('buy-out-jail'));
        }

        const pardonBtn = document.getElementById('jail-pardon-btn');
        if (pardonBtn) {
            pardonBtn.addEventListener('click', () => {
                if (!pardonBtn.classList.contains('disabled')) {
                    socket.emit('use-pardon');
                }
            });
        }

        document.addEventListener('click', e => {
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
    }

    function hideGameUI() {
        document.getElementById('game-hud').classList.add('hidden');
    }

    function updateMyPlayerId(id) {
        myPlayerId = id;
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

    function renderJailUI(gameState) {
        if (!gameState) return;

        const me = gameState.players.find(player => player.id === myPlayerId);
        const isMyTurn = gameState.currentPlayerId === myPlayerId;
        const jailDiv = document.getElementById('jail-actions');
        const pardonBtn = document.getElementById('jail-pardon-btn');
        const buyoutBtn = document.getElementById('jail-buyout-btn');
        const rollBtn = document.getElementById('roll-dice-btn');

        if (!jailDiv) return;
        if (gameState.pauseState) {
            jailDiv.classList.add('hidden');
            return;
        }

        if (me && me.inJail && isMyTurn) {
            jailDiv.classList.remove('hidden');

            if (buyoutBtn) {
                const disabled = me.money < 50;
                buyoutBtn.classList.toggle('disabled', disabled);
                buyoutBtn.style.opacity = disabled ? '0.35' : '';
                buyoutBtn.style.cursor = disabled ? 'not-allowed' : '';
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

            if (rollBtn && !rollBtn.classList.contains('disabled')) {
                rollBtn.textContent = '🎲 Roll for Doubles';
            }
            return;
        }

        jailDiv.classList.add('hidden');
    }

    function updateTurnIndicator(currentPlayerId, currentCharacter, allPlayers, gameState) {
        const indicator = document.getElementById('turn-indicator');
        const rollBtn = document.getElementById('roll-dice-btn');
        const ownAuctionBtn = document.getElementById('own-auction-btn');

        if (!indicator || !rollBtn) return;

        if (!currentCharacter && gameState) {
            const currentPlayer = gameState.players.find(player => player.id === currentPlayerId);
            if (currentPlayer) currentCharacter = currentPlayer.character;
        }

        if (gameState?.pauseState) {
            indicator.innerHTML = `<span class="turn-badge other-turn">⏸ Paused - waiting for ${gameState.pauseState.character} to reconnect</span>`;
            rollBtn.classList.add('disabled');
            rollBtn.textContent = 'Game Paused';
            if (ownAuctionBtn) ownAuctionBtn.classList.add('disabled');
            renderJailUI(gameState);
            updateTurnTimer(null);
            return;
        }

        const isMyTurn = currentPlayerId === myPlayerId;
        let jailText = '';
        if (gameState) {
            const currentPlayer = gameState.players.find(player => player.id === currentPlayerId);
            if (currentPlayer?.inJail) {
                jailText = ` 🔒 (Jail ${currentPlayer.jailTurns}/3)`;
            }
        }

        indicator.innerHTML = isMyTurn
            ? `<span class="turn-badge my-turn">🎲 Your Turn!${jailText}</span>`
            : `<span class="turn-badge other-turn">⏳ ${currentCharacter}'s Turn${jailText}</span>`;

        if (isMyTurn) {
            rollBtn.classList.remove('disabled');
            rollBtn.textContent = '🎲 Roll Dice';
        } else {
            rollBtn.classList.add('disabled');
            rollBtn.textContent = `Waiting for ${currentCharacter}...`;
        }

        if (ownAuctionBtn) {
            ownAuctionBtn.classList.toggle('disabled', !isMyTurn);
        }

        renderJailUI(gameState);
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
            const jailBadge = player.inJail ? `<span style="font-size:10px;color:#ff6b6b;"> 🔒</span>` : '';
            const element = document.createElement('div');
            element.className = `lb-card${player.id === myPlayerId ? ' is-me' : ''}${!player.isActive ? ' bankrupt' : ''}`;
            element.style.borderLeftColor = player.color;

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
            <span class="lb-money">$${player.money}</span>
            ${propertyCount > 0 ? `<span class="lb-props">🏠 ${propertyCount}</span>` : ''}
            ${botBadge}
            ${disconnectedBadge}
          </div>
          ${player.id !== myPlayerId && player.isActive ? `<button class="lb-trade-btn" data-player-id="${player.id}">🤝 Trade</button>` : ''}
        `;
            }
            panel.appendChild(element);
        });

        panel.querySelectorAll('.lb-trade-btn').forEach(button => {
            button.addEventListener('click', () => {
                TradeSystem.openTradeModal(button.dataset.playerId);
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
        element.classList.remove('hidden');
        element.classList.add('show');
        setTimeout(() => element.classList.remove('show'), 3000);
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
        if (document.getElementById('own-auction-btn')?.classList.contains('disabled')) {
            Notifications.show('Only the active player can start an own auction right now.', 'error', 2500);
            return;
        }

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
        renderJailUI,
        updateTurnTimer
    };
})();
