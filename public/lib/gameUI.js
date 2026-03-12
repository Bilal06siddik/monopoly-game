// ═══════════════════════════════════════════════════════════
//  GAME UI — Leaderboard panel, turn indicator, dice, own auction, jail UI
// ═══════════════════════════════════════════════════════════

const GameUI = (() => {
    let socket = null;
    let mySocketId = null;
    let currentPlayers = [];
    let currentProperties = [];

    function init(socketInstance) {
        socket = socketInstance;
        mySocketId = socket.id;

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

        // Own Auction (step 1) button
        const ownAucBtn = document.getElementById('own-auction-btn');
        if (ownAucBtn) {
            ownAucBtn.addEventListener('click', showOwnAuctionSelector);
        }

        // History vs Trades Tabs
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

        // Jail buttons
        const buyoutBtn = document.getElementById('jail-buyout-btn');
        if (buyoutBtn) {
            buyoutBtn.addEventListener('click', () => {
                socket.emit('buy-out-jail');
            });
        }

        const pardonBtn = document.getElementById('jail-pardon-btn');
        if (pardonBtn) {
            pardonBtn.addEventListener('click', () => {
                if (!pardonBtn.classList.contains('disabled')) {
                    socket.emit('use-pardon');
                }
            });
        }

        // Own auction config — time toggle buttons
        document.addEventListener('click', (e) => {
            if (e.target.matches('.oa-toggle-btn')) {
                document.querySelectorAll('.oa-toggle-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
            }

            // Close buttons
            if (e.target.id === 'own-auction-close') {
                hideModal('own-auction-select');
            }
            if (e.target.id === 'oa-config-close') {
                hideModal('own-auction-config');
            }
        });
    }

    function hideModal(id) {
        const el = document.getElementById(id);
        if (el) {
            el.classList.remove('show');
            el.classList.add('hidden');
        }
    }

    function showGameUI() {
        document.getElementById('game-hud').classList.remove('hidden');
    }

    function hideGameUI() {
        document.getElementById('game-hud').classList.add('hidden');
    }

    function updateMySocketId(id) {
        mySocketId = id;
    }

    function updateTurnTimer(timerState) {
        const el = document.getElementById('turn-timer');
        if (!el) return;

        if (!timerState) {
            el.classList.add('hidden');
            el.classList.remove('warning');
            el.textContent = '';
            return;
        }

        const label = timerState.phase === 'buying' ? 'Buy Window' : 'Turn Timer';
        el.textContent = `${label}: ${timerState.remainingSeconds}s`;
        el.classList.remove('hidden');
        el.classList.toggle('warning', timerState.remainingSeconds <= 10);
    }

    // ── Jail UI ───────────────────────────────────────────
    function renderJailUI(gameState) {
        if (!gameState) return;
        const me = gameState.players.find(p => p.id === mySocketId);
        const isMyTurn = gameState.currentPlayerId === mySocketId;
        const jailDiv = document.getElementById('jail-actions');
        const pardonBtn = document.getElementById('jail-pardon-btn');
        const buyoutBtn = document.getElementById('jail-buyout-btn');
        const rollBtn = document.getElementById('roll-dice-btn');

        if (!jailDiv) return;

        if (me && me.inJail && isMyTurn) {
            jailDiv.classList.remove('hidden');

            // Buyout button — disable if can't afford
            if (buyoutBtn) {
                if (me.money < 50) {
                    buyoutBtn.classList.add('disabled');
                    buyoutBtn.style.opacity = '0.35';
                    buyoutBtn.style.cursor = 'not-allowed';
                } else {
                    buyoutBtn.classList.remove('disabled');
                    buyoutBtn.style.opacity = '';
                    buyoutBtn.style.cursor = '';
                }
            }

            // Enable/disable pardon button
            if (pardonBtn) {
                if (me.pardons > 0) {
                    pardonBtn.classList.remove('disabled');
                    pardonBtn.textContent = `🃏 Use pardon card (${me.pardons})`;
                    pardonBtn.title = `You have ${me.pardons} pardon card(s)`;
                } else {
                    pardonBtn.classList.add('disabled');
                    pardonBtn.textContent = `🃏 Use pardon card`;
                    pardonBtn.title = 'No pardon cards';
                }
            }

            // Roll dice label changes to reflect doubles-only escape
            if (rollBtn && !rollBtn.classList.contains('disabled')) {
                rollBtn.textContent = `🎲 Roll for Doubles`;
            }
        } else {
            jailDiv.classList.add('hidden');
        }
    }

    function updateTurnIndicator(currentPlayerId, currentCharacter, allPlayers, gameState) {
        const indicator = document.getElementById('turn-indicator');
        const isMyTurn = currentPlayerId === mySocketId;

        // Resolve currentCharacter from gameState if not passed
        if (!currentCharacter && gameState) {
            const cp = gameState.players.find(p => p.id === currentPlayerId);
            if (cp) currentCharacter = cp.character;
        }

        // Check if current player is in jail
        let jailText = '';
        if (gameState) {
            const cp = gameState.players.find(p => p.id === currentPlayerId);
            if (cp && cp.inJail) {
                jailText = ` 🔒 (Jail ${cp.jailTurns}/3)`;
            }
        }

        indicator.innerHTML = isMyTurn
            ? `<span class="turn-badge my-turn">🎲 Your Turn!${jailText}</span>`
            : `<span class="turn-badge other-turn">⏳ ${currentCharacter}'s Turn${jailText}</span>`;

        const rollBtn = document.getElementById('roll-dice-btn');
        if (isMyTurn) {
            rollBtn.classList.remove('disabled');
            rollBtn.textContent = '🎲 Roll Dice';
        } else {
            rollBtn.classList.add('disabled');
            rollBtn.textContent = `Waiting for ${currentCharacter}...`;
        }

        // Show/hide jail UI
        renderJailUI(gameState);
        updateTurnTimer(gameState?.turnTimer || null);
    }

    // ── Leaderboard Panel (Right Side) ────────────────────
    function updateLeaderboard(players, properties) {
        currentPlayers = players;
        currentProperties = properties || currentProperties;

        const panel = document.getElementById('leaderboard-panel');
        if (!panel) return;
        panel.innerHTML = '';

        // Sort by money descending
        const sorted = [...players].sort((a, b) => b.money - a.money);

        sorted.forEach((p, idx) => {
            const propCount = currentProperties.filter(pr => pr.owner === p.id).length;
            const el = document.createElement('div');
            el.className = `lb-card${p.id === mySocketId ? ' is-me' : ''}${!p.isActive ? ' bankrupt' : ''}`;
            el.style.borderLeftColor = p.color;

            const jailBadge = p.inJail ? `<span style="font-size:10px;color:#ff6b6b;"> 🔒</span>` : '';

            if (!p.isActive) {
                el.innerHTML = `
          <div class="lb-rank">#${idx + 1}</div>
          <div class="lb-info">
            <span class="lb-name" style="color:${p.color}"><s>${p.character}</s></span>
            <span class="lb-bankrupt">BANKRUPT</span>
          </div>
        `;
            } else {
                el.innerHTML = `
          <div class="lb-rank">#${idx + 1}</div>
          <div class="lb-info">
            <span class="lb-name" style="color:${p.color}">${p.character}${jailBadge}</span>
            <span class="lb-money">$${p.money}</span>
            ${propCount > 0 ? `<span class="lb-props">🏠 ${propCount}</span>` : ''}
          </div>
          ${p.id !== mySocketId && p.isActive ? `<button class="lb-trade-btn" data-player-id="${p.id}">🤝 Trade</button>` : ''}
        `;
            }
            panel.appendChild(el);
        });

        // Bind trade buttons
        panel.querySelectorAll('.lb-trade-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                TradeSystem.openTradeModal(btn.dataset.playerId);
            });
        });

        // Also update state for trade system
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
        const el = document.getElementById('dice-result');
        el.innerHTML = `
      <span class="dr-char">${character}</span>
      <span class="dr-dice">${getDiceFace(die1)} ${getDiceFace(die2)}</span>
      <span class="dr-total">= ${die1 + die2}${isDoubles ? ' 🔥' : ''}</span>
    `;
        el.classList.remove('hidden');
        el.classList.add('show');
        setTimeout(() => el.classList.remove('show'), 3000);
    }

    function getDiceFace(n) {
        return ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'][n] || '🎲';
    }

    // ── Own Auction — Two-step Flow ────────────────────────
    let selectedAuctionTileIndex = null;

    function isGroupLocked(prop) {
        return prop?.type === 'property'
            && Boolean(prop.colorGroup)
            && currentProperties.some(p => p.type === 'property' && p.colorGroup === prop.colorGroup && p.houses > 0);
    }

    function showOwnAuctionSelector() {
        const myProps = currentProperties.filter(p => p.owner === mySocketId);
        if (myProps.length === 0) {
            Notifications.show('You don\'t own any properties to auction.', 'error', 3000);
            return;
        }

        const modal = document.getElementById('own-auction-select');
        const list = document.getElementById('own-auction-list');
        list.innerHTML = '';

        myProps.forEach(prop => {
            const btn = document.createElement('button');
            btn.className = 'oa-prop-btn';
            const houseTxt = prop.houses > 0 ? ` ${'🏠'.repeat(Math.min(prop.houses, 4))}${prop.houses >= 5 ? '🏨' : ''}` : '';
            const locked = isGroupLocked(prop);
            btn.innerHTML = locked
                ? `<span>${prop.name}${houseTxt}<br><small>Sell color-set buildings first</small></span><span class="oa-price">Locked</span>`
                : `<span>${prop.name}${houseTxt}</span><span class="oa-price">$${Math.floor(prop.price / 2)}+</span>`;

            if (locked) {
                btn.disabled = true;
                btn.style.opacity = '0.45';
                btn.style.cursor = 'not-allowed';
                btn.title = 'Sell all buildings in this color group before auctioning this property.';
            } else {
                btn.addEventListener('click', () => {
                    selectedAuctionTileIndex = prop.index;
                    // Move to config modal
                    modal.classList.remove('show');
                    modal.classList.add('hidden');
                    showOwnAuctionConfig(prop);
                });
            }
            list.appendChild(btn);
        });

        modal.classList.remove('hidden');
        modal.classList.add('show');
    }

    function showOwnAuctionConfig(prop) {
        const configModal = document.getElementById('own-auction-config');

        // Set slider max = full property value (price + house values)
        const maxVal = prop.price + (prop.houses * Math.floor(prop.price * 0.25));
        const slider = document.getElementById('oa-price-slider');
        const sliderVal = document.getElementById('oa-slider-value');
        const sliderMax = document.getElementById('oa-slider-max');

        if (slider) {
            slider.max = maxVal;
            slider.value = Math.floor(maxVal / 2); // default: half value
            sliderMax.textContent = `$${maxVal}`;
            sliderVal.textContent = `$${slider.value}`;

            slider.oninput = () => {
                sliderVal.textContent = `$${slider.value}`;
            };
        }

        // Reset time toggles to first
        document.querySelectorAll('.oa-toggle-btn').forEach((b, i) => {
            b.classList.toggle('active', i === 0);
        });

        // Wire conduct button
        const conductBtn = document.getElementById('oa-conduct-btn');
        if (conductBtn) {
            conductBtn.onclick = () => {
                const activeTog = document.querySelector('.oa-toggle-btn.active');
                const resetTime = activeTog ? parseInt(activeTog.dataset.time) : 3;
                const startPrice = slider ? parseInt(slider.value) : 0;

                socket.emit('own-auction', {
                    tileIndex: selectedAuctionTileIndex,
                    startPrice,
                    resetTime
                });

                configModal.classList.remove('show');
                configModal.classList.add('hidden');
            };
        }

        configModal.classList.remove('hidden');
        configModal.classList.add('show');
    }

    return {
        init, showGameUI, hideGameUI,
        updateTurnIndicator, updatePlayerBar, updateLeaderboard,
        showDiceResult, updateMySocketId, renderJailUI, updateTurnTimer
    };
})();
