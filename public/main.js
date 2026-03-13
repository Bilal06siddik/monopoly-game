// ═══════════════════════════════════════════════════════════
//  MAIN — Entry point: initializes everything & wires events
// ═══════════════════════════════════════════════════════════

(function () {
    'use strict';

    const { scene, camera, renderer } = GameScene.init();
    GameBoard.build(scene);
    GameDice.init(scene);
    GameTokens.init(scene, GameBoard.getTileWorldPosition);
    GameScene.animate();

    const socket = io();
    let mySocketId = null;
    let currentGameState = null;

    // Player color cache (character -> color)
    const CHAR_COLORS = {
        'Bilo': '#6c5ce7', 'Os': '#e17055', 'Ziko': '#00b894', 'Maro': '#fdcb6e'
    };

    function getPlayerColor(playerId) {
        if (!currentGameState) return '#fff';
        const p = currentGameState.players.find(p => p.id === playerId);
        return p ? p.color : '#fff';
    }

    function setCurrentGameState(state) {
        currentGameState = state;
        if (typeof DevPanel !== 'undefined' && DevPanel.updateState) {
            DevPanel.updateState(state);
        }
    }

    function syncTurnTimerUI(state = currentGameState) {
        GameUI.updateTurnTimer(state?.turnTimer || null);
    }

    function syncWorldFromState(state) {
        if (!state) return;

        state.players.forEach(player => {
            if (!player.isActive) return;
            if (!GameTokens.getToken(player.character)) {
                GameTokens.createToken(player.character, scene);
            }
            GameTokens.setTokenPosition(player.character, player.position);
        });

        state.properties.forEach(prop => {
            GameBoard.removeHouses(prop.index, scene);

            const isPurchasable = prop.type === 'property' || prop.type === 'railroad' || prop.type === 'utility';
            if (!isPurchasable) return;

            GameBoard.setMortgaged(prop.index, false);

            if (prop.owner && !prop.isMortgaged) {
                const owner = state.players.find(player => player.id === prop.owner);
                GameBoard.updateTileOwner(prop.index, owner?.color || null);
            }

            if (prop.isMortgaged) {
                GameBoard.setMortgaged(prop.index, true);
            }

            if (prop.houses > 0) {
                GameBoard.addHouse(prop.index, prop.houses, scene);
            }
        });
    }

    function getColorGroupProperties(colorGroup) {
        if (!currentGameState || !colorGroup) return [];
        return currentGameState.properties.filter(prop => prop.type === 'property' && prop.colorGroup === colorGroup);
    }

    function ownsFullColorGroup(playerId, tile) {
        if (!playerId || tile?.type !== 'property' || !tile.colorGroup) return false;
        const group = getColorGroupProperties(tile.colorGroup);
        return group.length > 0 && group.every(prop => prop.owner === playerId);
    }

    function colorGroupHasBuildings(tile) {
        return tile?.type === 'property'
            && Boolean(tile.colorGroup)
            && getColorGroupProperties(tile.colorGroup).some(prop => prop.houses > 0);
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
        mySocketId = socket.id;
        console.log('🔌 Connected:', socket.id);
        Notifications.show('Connected to game server', 'info', 2000);
        GameUI.updateMySocketId(socket.id);
        TradeSystem.updateSocketId(socket.id);
        AuctionSystem.updateSocketId(socket.id);
    });

    socket.on('disconnect', () => {
        Notifications.show('Disconnected from server', 'error', 4000);
    });

    // ── Init all systems ──────────────────────────────────
    Lobby.init(socket);
    GameUI.init(socket);
    GameModals.init(socket);
    HistoryLog.init();
    TradeSystem.init(socket);
    AuctionSystem.init(socket);
    if (typeof DevPanel !== 'undefined') DevPanel.init(socket);

    // ── Init Raycaster for clickable board ─────────────────
    GameBoard.initRaycaster(camera, renderer);
    GameBoard.onTileClick((tileIndex) => {
        if (!currentGameState) return;
        // Don't open modal during dice roll or modal open
        const anyModal = document.querySelector('.modal-overlay.show');
        if (anyModal) return;
        showPropertyDetailsModal(tileIndex);
    });

    // ── History Log ───────────────────────────────────────
    socket.on('history-event', (data) => {
        HistoryLog.addEvent(data.text, data.type);
    });

    // ── Game Started ──────────────────────────────────────
    socket.on('gameStarted', (state) => {
        try {
            setCurrentGameState(state);
            console.log('🎮 Game started! Processing UI transition...', state);
            
            console.log('- Hiding lobby...');
            Lobby.hideLobby();
            
            console.log('- Showing Game UI...');
            GameUI.showGameUI();
            
            console.log('- Syncing board state...');
            syncWorldFromState(state);
            
            console.log('- Updating leaderboard...');
            GameUI.updateLeaderboard(state.players, state.properties);
            
            console.log('- Updating turn indicator...');
            GameUI.updateTurnIndicator(
                state.currentPlayerId,
                state.players[state.currentPlayerIndex].character,
                state.players,
                state
            );
            syncTurnTimerUI(state);
            
            console.log('✅ UI transition complete!');
        } catch (err) {
            console.error('❌ Error during gameStarted transition:', err);
        }
    });

    // ── Dice Rolled ───────────────────────────────────────
    socket.on('dice-rolled', (data) => {
        setCurrentGameState(data.gameState);
        GameUI.showDiceResult(data.die1, data.die2, data.character, data.isDoubles);
        if (data.isDoubles) Notifications.notifyDoubles();

        GameDice.roll(data.die1, data.die2, () => {
            GameTokens.animateMove(
                data.character,
                data.moveResult.oldPosition,
                data.moveResult.newPosition,
                () => {
                    GameUI.updateLeaderboard(data.gameState.players, data.gameState.properties);
                    if (data.playerId === socket.id) socket.emit('move-complete');
                }
            );
        });
    });

    // ── Buy Prompt ────────────────────────────────────────
    socket.on('buy-prompt', (data) => {
        setCurrentGameState(data.gameState);
        GameModals.showBuyModal(data);
        syncTurnTimerUI(data.gameState);
    });

    socket.on('player-deciding', (data) => {
        // Only show in history, not a popup
    });

    // ── Property Bought ───────────────────────────────────
    socket.on('property-bought', (data) => {
        setCurrentGameState(data.gameState);
        if (data.playerId === socket.id) {
            Notifications.show(`🏠 Bought ${data.tileName}!`, 'success', 2500);
        }
        // Color the tile with the owner's color
        const ownerColor = getPlayerColor(data.playerId);
        GameBoard.updateTileOwner(data.tileIndex, ownerColor);
        GameUI.updateLeaderboard(data.gameState.players, data.gameState.properties);
        syncTurnTimerUI(data.gameState);
    });

    // ── Rent Paid ─────────────────────────────────────────
    socket.on('rent-paid', (data) => {
        setCurrentGameState(data.gameState);
        GameModals.showRentPaid(data, data.payerId === socket.id);
        GameUI.updateLeaderboard(data.gameState.players, data.gameState.properties);
        syncTurnTimerUI(data.gameState);
    });

    // ── Tax Paid ──────────────────────────────────────────
    socket.on('tax-paid', (data) => {
        setCurrentGameState(data.gameState);
        GameModals.showTaxPaid(data, data.playerId === socket.id);
        GameUI.updateLeaderboard(data.gameState.players, data.gameState.properties);
        syncTurnTimerUI(data.gameState);
    });

    // ── Card Drawn ────────────────────────────────────────
    socket.on('card-drawn', (data) => {
        setCurrentGameState(data.gameState);
        GameModals.showActionCard(data.card);
        GameUI.updateLeaderboard(data.gameState.players, data.gameState.properties);
        syncTurnTimerUI(data.gameState);
    });

    // ── Bankruptcy ────────────────────────────────────────
    socket.on('player-bankrupt', (data) => {
        setCurrentGameState(data.gameState);
        GameModals.showBankruptcy(data, data.playerId === socket.id);
        GameTokens.removeToken(data.character, scene);
        // Clear all tile ownership colors for this player's old properties
        data.gameState.properties.forEach(prop => {
            if (!prop.owner) GameBoard.updateTileOwner(prop.index, null);
        });
        GameUI.updateLeaderboard(data.gameState.players, data.gameState.properties);
        syncTurnTimerUI(data.gameState);
    });

    // ── Game Over ─────────────────────────────────────────
    socket.on('game-over', (data) => {
        if (data.gameState) setCurrentGameState(data.gameState);
        if (currentGameState) {
            currentGameState.turnTimer = null;
            if (typeof DevPanel !== 'undefined' && DevPanel.updateState) {
                DevPanel.updateState(currentGameState);
            }
        }
        GameUI.updateTurnTimer(null);
        const isMe = data.winner.id === socket.id;
        Notifications.show(
            isMe ? '🏆 You WIN! Congratulations!' : `🏆 ${data.winner.character} wins!`,
            isMe ? 'success' : 'hype', 10000
        );
    });

    // ── Turn Changed ──────────────────────────────────────
    socket.on('turn-changed', (data) => {
        setCurrentGameState(data.gameState);
        GameModals.hideBuyModal();
        GameUI.updateTurnIndicator(data.currentPlayerId, data.currentCharacter, data.gameState.players, data.gameState);
        GameUI.updateLeaderboard(data.gameState.players, data.gameState.properties);
        syncTurnTimerUI(data.gameState);
    });

    // ── Jail Events ──────────────────────────────────────────
    socket.on('sent-to-jail', (data) => {
        setCurrentGameState(data.gameState);
        if (data.playerId === socket.id) {
            Notifications.show('🚔 You were sent to Jail!', 'error', 4000);
        } else {
            Notifications.show(`🚔 ${data.character} was sent to Jail!`, 'info', 3000);
        }
        GameUI.updateLeaderboard(data.gameState.players, data.gameState.properties);
        GameUI.updateTurnIndicator(data.gameState.currentPlayerId, null, data.gameState.players, data.gameState);
        syncTurnTimerUI(data.gameState);
    });

    socket.on('jail-state-changed', (data) => {
        setCurrentGameState(data.gameState);
        GameUI.updateLeaderboard(data.gameState.players, data.gameState.properties);
        GameUI.updateTurnIndicator(data.gameState.currentPlayerId, null, data.gameState.players, data.gameState);
        syncTurnTimerUI(data.gameState);
    });

    socket.on('bailout-collected', (data) => {
        setCurrentGameState(data.gameState);
        if (data.playerId === socket.id) {
            Notifications.show(`💰 You collected $${data.amount} from the Bailout fund!`, 'success', 4000);
        } else {
            Notifications.show(`💰 ${data.character} collected $${data.amount} Bailout!`, 'hype', 3000);
        }
        GameUI.updateLeaderboard(data.gameState.players, data.gameState.properties);
        syncTurnTimerUI(data.gameState);
    });

    // ── Auction Events ────────────────────────────────────
    socket.on('auction-started', (data) => {
        setCurrentGameState(data.gameState);
        GameModals.hideBuyModal();
        AuctionSystem.showAuction(data, data.players);
        Notifications.show(`🔨 Auction: ${data.auction.tileName}!`, 'hype', 3000);
        syncTurnTimerUI(data.gameState);
    });
    socket.on('auction-bid', (data) => { AuctionSystem.onBid(data); });
    socket.on('auction-tick', (data) => { AuctionSystem.onTick(data); });
    socket.on('auction-ended', (data) => {
        setCurrentGameState(data.gameState);
        AuctionSystem.hideAuction();
        if (data.winnerId) {
            const isMe = data.winnerId === socket.id;
            Notifications.show(
                isMe ? `🎉 Won ${data.tileName} for $${data.bid}!`
                    : `🔨 ${data.winnerCharacter} won ${data.tileName}`,
                isMe ? 'success' : 'info', 3000
            );
            // Color the tile with the winner's color
            const winnerColor = getPlayerColor(data.winnerId);
            GameBoard.updateTileOwner(data.tileIndex, winnerColor);
        }
        GameUI.updateLeaderboard(data.gameState.players, data.gameState.properties);
        syncTurnTimerUI(data.gameState);
    });

    // ── Trade Events ──────────────────────────────────────
    socket.on('trade-incoming', (offer) => {
        TradeSystem.showIncomingTrade(offer);
        Notifications.show(`🤝 ${offer.fromCharacter} wants to trade!`, 'hype', 3000);
    });
    socket.on('trade-sent', () => { Notifications.show('Trade sent!', 'success', 2000); });
    socket.on('trade-completed', (data) => {
        setCurrentGameState(data.gameState);
        Notifications.show(`✅ Trade completed!`, 'success', 3000);
        // Re-apply all ownership colors from updated state
        data.gameState.properties.forEach(prop => {
            if (prop.owner) {
                const ownerPlayer = data.gameState.players.find(p => p.id === prop.owner);
                if (ownerPlayer) GameBoard.updateTileOwner(prop.index, ownerPlayer.color);
            }
        });
        GameUI.updateLeaderboard(data.gameState.players, data.gameState.properties);
        syncTurnTimerUI(data.gameState);
    });
    socket.on('trade-rejected', () => { Notifications.show('Trade rejected', 'error', 2000); });

    // ── Upgrade / Downgrade / Mortgage / Sell Events ──────
    socket.on('property-upgraded', (data) => {
        setCurrentGameState(data.gameState);
        GameBoard.addHouse(data.tileIndex, data.houses, scene);
        GameUI.updateLeaderboard(data.gameState.players, data.gameState.properties);
        if (data.playerId === socket.id) {
            Notifications.show(`🏗️ Upgraded ${data.tileName}!`, 'success', 2000);
        }
        syncTurnTimerUI(data.gameState);
    });

    socket.on('property-downgraded', (data) => {
        setCurrentGameState(data.gameState);
        if (data.houses > 0) GameBoard.addHouse(data.tileIndex, data.houses, scene);
        else GameBoard.removeHouses(data.tileIndex, scene);
        GameUI.updateLeaderboard(data.gameState.players, data.gameState.properties);
        syncTurnTimerUI(data.gameState);
    });

    socket.on('property-mortgaged', (data) => {
        setCurrentGameState(data.gameState);
        GameBoard.setMortgaged(data.tileIndex, true);
        GameUI.updateLeaderboard(data.gameState.players, data.gameState.properties);
        if (data.playerId === socket.id) {
            Notifications.show(`🏦 Mortgaged ${data.tileName} (+$${data.mortgageValue})`, 'info', 2500);
        }
        syncTurnTimerUI(data.gameState);
    });

    socket.on('property-unmortgaged', (data) => {
        setCurrentGameState(data.gameState);
        GameBoard.setMortgaged(data.tileIndex, false);
        GameBoard.updateTileOwner(data.tileIndex, getPlayerColor(data.playerId));
        GameUI.updateLeaderboard(data.gameState.players, data.gameState.properties);
        syncTurnTimerUI(data.gameState);
    });

    socket.on('property-sold', (data) => {
        setCurrentGameState(data.gameState);
        GameBoard.removeHouses(data.tileIndex, scene);
        GameBoard.setMortgaged(data.tileIndex, false);
        GameBoard.updateTileOwner(data.tileIndex, null); // clear owner color
        GameUI.updateLeaderboard(data.gameState.players, data.gameState.properties);
        syncTurnTimerUI(data.gameState);
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

    // ── Game State Sync ───────────────────────────────────
    socket.on('game-state-sync', (state) => {
        setCurrentGameState(state);
        if (state.isGameStarted) {
            Lobby.hideLobby();
            GameUI.showGameUI();
            syncWorldFromState(state);
            GameUI.updateLeaderboard(state.players, state.properties);
            const currentP = state.players[state.currentPlayerIndex];
            GameUI.updateTurnIndicator(currentP.id, currentP.character, state.players, state);
            if (state.turnPhase !== 'buying') GameModals.hideBuyModal();
            syncTurnTimerUI(state);
        }
    });

    socket.on('game-error', (data) => {
        Notifications.notifyError(data.message);
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
        document.getElementById('pd-name').textContent = tile.name;

        // Stats grid
        const upgradeCost = tile.price > 0 ? `$${Math.floor(tile.price * 0.5)}` : '—';
        const hotelCost = tile.price > 0 ? `$${Math.floor(tile.price * 2.5)}` : '—';
        document.getElementById('pd-price').textContent = tile.price > 0 ? `$${tile.price}` : '—';
        const hcEl = document.getElementById('pdm-house-cost');
        const htEl = document.getElementById('pdm-hotel-cost');
        if (hcEl) hcEl.textContent = tile.type === 'property' ? upgradeCost : '—';
        if (htEl) htEl.textContent = tile.type === 'property' ? hotelCost : '—';

        // Rent tiers
        const rentTiersEl = document.getElementById('pd-rent-tiers');
        rentTiersEl.innerHTML = '';
        if (tile.type === 'property' && tile.rent > 0) {
            const multipliers = [1, 5, 15, 45, 80, 125];
            const labels = ['No house', '1 house', '2 houses', '3 houses', '4 houses', 'Hotel'];
            multipliers.forEach((m, idx) => {
                const row = document.createElement('div');
                row.className = `pdm-rent-row${prop?.houses === idx ? ' current' : ''}`;
                row.innerHTML = `<span>with ${labels[idx]}</span><span class="pdm-rent-val">$${tile.rent * m}</span>`;
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
        const me = currentGameState.players.find(p => p.id === mySocketId);
        const hasFullSet = ownsFullColorGroup(mySocketId, tile);
        const groupLocked = colorGroupHasBuildings(tile);

        if (prop && prop.owner === mySocketId && tile.type === 'property') {
            const uCost = Math.floor(tile.price * 0.5);
            const dRefund = Math.floor(tile.price * 0.25);

            if (!prop.isMortgaged && prop.houses < 5) {
                const btn = hasFullSet
                    ? createActionButton('upgrade', `⬆ Upgrade<br><small>$${uCost}</small>`, () => {
                        socket.emit('upgrade-property', { tileIndex });
                        hidePropertyDetailsModal();
                    })
                    : createDisabledActionButton(
                        'upgrade',
                        '⬆ Upgrade<br><small>Need full color set</small>',
                        'Own every property in this color group before building.'
                    );
                actionsEl.appendChild(btn);
            }
            if (prop.houses > 0) {
                const btn = createActionButton('downgrade', `⬇ Downgrade<br><small>+$${dRefund}</small>`, () => {
                    socket.emit('downgrade-property', { tileIndex });
                    hidePropertyDetailsModal();
                });
                actionsEl.appendChild(btn);
            }
            if (!prop.isMortgaged && prop.houses === 0) {
                const btn = groupLocked
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
                const btn = createActionButton('mortgage', `🔓 Unmortgage<br><small>$${Math.floor(tile.price * 0.55)}</small>`, () => {
                    socket.emit('unmortgage-property', { tileIndex });
                    hidePropertyDetailsModal();
                });
                actionsEl.appendChild(btn);
            }
            const sellBtn = groupLocked
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

        } else if (prop && prop.owner === mySocketId) {
            if (!prop.isMortgaged) {
                const btn = createActionButton('mortgage', `🏦 Mortgage<br><small>+$${Math.floor(tile.price / 2)}</small>`, () => {
                    socket.emit('mortgage-property', { tileIndex });
                    hidePropertyDetailsModal();
                });
                actionsEl.appendChild(btn);
            } else {
                const btn = createActionButton('mortgage', `🔓 Unmortgage<br><small>$${Math.floor(tile.price * 0.55)}</small>`, () => {
                    socket.emit('unmortgage-property', { tileIndex });
                    hidePropertyDetailsModal();
                });
                actionsEl.appendChild(btn);
            }
            const sellBtn = createActionButton('sell', '💰 Sell<br><small>to Bank</small>', () => {
                socket.emit('sell-property', { tileIndex });
                hidePropertyDetailsModal();
            });
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
            if (ownerAvatar) { ownerAvatar.textContent = '🏦'; ownerAvatar.style.borderColor = ''; }
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
    }

    // Close on overlay click
    document.getElementById('prop-details-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'prop-details-modal') hidePropertyDetailsModal();
    });
    document.getElementById('pd-close-btn')?.addEventListener('click', hidePropertyDetailsModal);

    window.notifyGo = Notifications.notifyGo;
    window.notifyDoubles = Notifications.notifyDoubles;

    console.log(
        '%c🎲 Monopoly Game Loaded!\n%cPhase 5: Textured Board, Clickable Tiles, Upgrades',
        'color: #6c5ce7; font-size: 16px; font-weight: bold;',
        'color: #a29bfe; font-size: 12px;'
    );
})();
