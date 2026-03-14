// ═══════════════════════════════════════════════════════════
//  LOBBY — TCG Title Deed Cards + Socket.io
// ═══════════════════════════════════════════════════════════

const Lobby = (() => {
    const TOKEN_OPTIONS = window.TokenCatalog?.TOKEN_OPTIONS || [];

    // Exactly 6 Players
    const CHARACTER_COLORS = {
        'bilo':    '#8e44ad', // Deep Purple
        'osss':    '#f1c40f', // Gold
        'bdlbaky': '#2ecc71', // Emerald Green
        'fawzy':   '#e74c3c', // Crimson Red
        'hamza':   '#3498db', // Ocean Blue
        'missiry': '#e61a8d'  // Hot Pink
    };

    const CHARACTER_DISPLAY = {
        'bilo':    'BILO',
        'osss':    'OS',
        'bdlbaky': 'ABDELBAKY',
        'fawzy':   'FAWZY',
        'hamza':   'HAMZA',
        'missiry': 'MISSIRY'
    };

    // User-provided TCG Data
    const CHARACTER_STATS = {
        'bilo': { 
            trait: 'Shark Investor', 
            toxicityLevel: '80%', 
            toxBar: '████████░░',
            quote: '"I literally coded this board."' 
        },
        'osss': { 
            trait: 'Transport Monopoly', 
            toxicityLevel: '90%', 
            toxBar: '█████████░',
            quote: '"Hat el ajar ya basha."' 
        },
        'bdlbaky': { 
            trait: 'Zero Liquidity Hoarder', 
            toxicityLevel: '100%', 
            toxBar: '██████████',
            quote: '"Ya gama3a ana ba-khsar!"' 
        },
        'fawzy': { 
            trait: 'Dice Manipulator', 
            toxicityLevel: '30%', 
            toxBar: '███░░░░░░░',
            quote: '"Oops, double 6 again?"' 
        },
        'hamza': { 
            trait: 'Clueless Negotiator', 
            toxicityLevel: '0%', 
            toxBar: '░░░░░░░░░░',
            quote: '"Hwa ana 3alaya el door?"' 
        },
        'missiry': { 
            trait: 'Harmlessly Chaotic', 
            toxicityLevel: '40%', 
            toxBar: '████░░░░░░',
            quote: '"Ha-falsakou kolokou!"' 
        }
    };

    let socket            = null;
    let selectedCharacter = null;
    let selectedToken     = null;
    let myPlayerId        = null;
    let lobbyState        = null;
    let useCustomColor    = false;
    let selectedCustomColor = '#ffffff';

    function init(socketInstance) {
        socket = socketInstance;
        bindEvents();
        bindButtons();
        bindCustomColorControls();
        setupErrorDismiss();
    }

    function bindEvents() {
        socket.on('player-session', (data) => {
            myPlayerId = data.playerId || null;
            selectedCharacter = data.character || null;
            selectedToken = data.tokenId || null;
            useCustomColor = Boolean(normalizeHexColor(data.customColor));
            selectedCustomColor = normalizeHexColor(data.customColor) || selectedCustomColor;
            syncCustomColorControls();
            if (lobbyState) {
                renderCharacters(lobbyState);
                renderTokens(lobbyState);
            }
        });

        socket.on('lobby-update', (state) => {
            lobbyState = state;
            renderCharacters(state);
            renderTokens(state);
            updateStatus(state);
            renderHostControls(state);
        });

        socket.on('character-confirmed', (data) => {
            selectedCharacter = data.character;
            selectedToken = data.tokenId || selectedToken;
            useCustomColor = Boolean(normalizeHexColor(data.customColor));
            selectedCustomColor = normalizeHexColor(data.customColor) || selectedCustomColor;
            syncCustomColorControls();
            Notifications.show(`Deck Secured: <strong>${CHARACTER_DISPLAY[data.character] || data.character}</strong>`, 'success');
            if (lobbyState) {
                renderCharacters(lobbyState);
                renderTokens(lobbyState);
            }
        });

        socket.on('token-confirmed', (data) => {
            selectedToken = data.tokenId || null;
            Notifications.show(`Token Ready: <strong>${getTokenLabel(selectedToken)}</strong>`, 'success');
            if (lobbyState) {
                renderCharacters(lobbyState);
                renderTokens(lobbyState);
            }
        });

        socket.on('character-taken', (data) => {
            showError(data.message);
            Notifications.notifyError(data.message);
        });

        socket.on('character-error', (data) => {
            Notifications.notifyError(data.message);
        });
    }

    function getTokenLabel(tokenId) {
        const normalizedTokenId = typeof tokenId === 'string' ? tokenId : '';
        const fromLobbyState = lobbyState?.tokens?.find(token => token.id === normalizedTokenId);
        const fromCatalog = TOKEN_OPTIONS.find(token => token.id === normalizedTokenId);
        return fromLobbyState?.label || fromCatalog?.label || normalizedTokenId || 'Unknown Token';
    }

    function normalizeHexColor(value) {
        return /^#[0-9a-f]{6}$/i.test(value || '') ? value.toLowerCase() : null;
    }

    function getSelectedLobbyColor() {
        return useCustomColor ? normalizeHexColor(selectedCustomColor) : null;
    }

    function persistSelectedCharacterColor() {
        if (!socket || !selectedCharacter) return;
        socket.emit('update-custom-color', {
            customColor: getSelectedLobbyColor()
        });
    }

    function syncCustomColorControls() {
        const toggle = document.getElementById('custom-color-toggle');
        const picker = document.getElementById('custom-color-picker');
        const value = document.getElementById('custom-color-value');
        if (!toggle || !picker || !value) return;

        toggle.checked = useCustomColor;
        picker.disabled = !useCustomColor;
        picker.value = normalizeHexColor(selectedCustomColor) || '#ffffff';
        value.textContent = useCustomColor ? picker.value.toUpperCase() : 'Default';
    }

    function renderCharacters(state) {
        const grid = document.getElementById('character-grid');
        grid.innerHTML = '';

        // Safely filter out anyone not in our 6 (in case server has leftover state during transition)
        const validCharacters = state.characters.filter(char => CHARACTER_COLORS[char.name]);

        validCharacters.forEach((char) => {
            const isMine  = selectedCharacter === char.name;
            const isTaken = char.taken && !isMine;
            const color   = CHARACTER_COLORS[char.name];
            const stats   = CHARACTER_STATS[char.name];
            const display = CHARACTER_DISPLAY[char.name];
            const imgSrc  = `./characters/${char.name}.png`;
            const statusLabel = isMine ? 'SELECTED' : isTaken ? (char.offline ? 'OFFLINE' : 'TAKEN') : 'SELECT';
            const tokenText = isMine && selectedToken
                ? `TOKEN • ${getTokenLabel(selectedToken).toUpperCase()}`
                : '&nbsp;';

            const wrapper = document.createElement('div');
            wrapper.className = 'tcg-card-wrapper' + (isMine ? ' selected' : '') + (isTaken ? ' taken' : '');
            wrapper.style.setProperty('--char-color', color);
            
            wrapper.innerHTML = `
                <div class="tcg-card-inner">
                    
                    <!-- FRONT OF CARD -->
                    <div class="tcg-card-front">
                        <div class="tcg-card-header">
                            <img src="/images/bank-el-haz-logo.png" class="tcg-card-logo" alt="Bank El Haz" />
                            <span class="tcg-card-name">${display}</span>
                        </div>
                        
                        <div class="tcg-artwork-box">
                            <div class="tcg-info-btn" title="View Stats">i</div>
                            <img class="tcg-avatar" src="${imgSrc}" onerror="this.onerror=null; this.src='./characters/${char.name}.svg';" alt="${display}" />
                        </div>

                        <div class="tcg-card-footer">
                            <div class="tcg-card-token">${tokenText}</div>
                            <button class="tcg-select-btn">${statusLabel}</button>
                        </div>
                    </div>

                    <!-- BACK OF CARD (STATS) -->
                    <div class="tcg-card-back">
                        <div class="tcg-back-header">
                            <h3 class="tcg-back-title">DETAILS</h3>
                            <button class="tcg-back-btn">RETURN ↩</button>
                        </div>

                        <div class="tcg-stats-content">
                            <div class="tcg-data-block">
                                <span class="data-label">TRAIT</span>
                                <span class="data-val">${stats.trait}</span>
                            </div>

                            <div class="tcg-data-block">
                                <span class="data-label">TOXICITY LEVEL</span>
                                <div class="toxicity-bar"><div class="tox-fill" style="width: ${stats.toxicityLevel}"></div></div>
                                <div class="tox-labels"><span>ZEN</span><span>TOXIC</span></div>
                            </div>

                            <div class="tcg-data-block">
                                <span class="data-label">QUOTE</span>
                                <span class="data-quote">${stats.quote}</span>
                            </div>
                        </div>
                    </div>

                </div>
            `;

            // Click Handlers
            
            // Flip to Back
            wrapper.querySelector('.tcg-info-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                wrapper.classList.add('flipped');
            });

            // Flip to Front
            wrapper.querySelector('.tcg-back-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                wrapper.classList.remove('flipped');
            });

            // Select Card
            wrapper.querySelector('.tcg-select-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                if (wrapper.classList.contains('flipped')) return; 
                if (isTaken) return;

                if (isMine) {
                    socket.emit('deselect-character');
                    selectedCharacter = null;
                    selectedToken = null;
                } else {
                    socket.emit('select-character', {
                        name: char.name,
                        customColor: getSelectedLobbyColor()
                    });
                }
            });

            // Full card click fallback
            wrapper.addEventListener('click', (e) => {
                if (!e.target.closest('.tcg-info-btn') && !e.target.closest('.tcg-back-btn')) {
                    if (!wrapper.classList.contains('flipped') && !isTaken) {
                        if (isMine) {
                            socket.emit('deselect-character');
                            selectedCharacter = null;
                            selectedToken = null;
                        } else {
                            socket.emit('select-character', {
                                name: char.name,
                                customColor: getSelectedLobbyColor()
                            });
                        }
                    }
                }
            });

            grid.appendChild(wrapper);
        });
    }

    function renderTokens(state) {
        const grid = document.getElementById('token-grid');
        const hint = document.getElementById('token-selection-hint');
        if (!grid || !hint) return;

        const tokens = Array.isArray(state?.tokens) && state.tokens.length
            ? state.tokens
            : TOKEN_OPTIONS.map(token => ({
                id: token.id,
                label: token.label
            }));
        const canSelectToken = Boolean(selectedCharacter);

        hint.textContent = canSelectToken
            ? 'Choose pawn, battleship, or sports car. Multiple players can use the same token.'
            : 'Pick a character first to unlock token choices.';

        grid.innerHTML = '';

        tokens.forEach(token => {
            const isMine = selectedToken === token.id;
            const statusLabel = isMine ? 'SELECTED' : 'AVAILABLE';
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'token-option-card'
                + (isMine ? ' selected' : '')
                + (!canSelectToken ? ' disabled' : '');
            btn.disabled = !canSelectToken;
            btn.innerHTML = `
                <span class="token-option-preview token-${token.id}">
                    <span class="token-preview-silhouette"></span>
                </span>
                <span class="token-option-name">${token.label}</span>
                <span class="token-option-status">${statusLabel}</span>
            `;

            btn.addEventListener('click', () => {
                if (!canSelectToken || isMine) return;
                socket.emit('select-token', token.id);
            });

            grid.appendChild(btn);
        });
    }

    function updateStatus(state) {
        const statusEl     = document.getElementById('lobby-status');
        const readyPlayers = state.players.filter(p => p.character);
        const count        = readyPlayers.length;
        const total        = Object.keys(CHARACTER_COLORS).length; // Now 6
        const botCount     = readyPlayers.filter(p => p.isBot).length;
        const humanCount   = count - botCount;
        const isHost       = Boolean(state?.hostPlayerId && myPlayerId && state.hostPlayerId === myPlayerId);

        if (count === 0) {
            statusEl.textContent = 'AWAITING PLAYERS...';
        } else {
            const botText = botCount > 0 ? ` • ${botCount} BOTS` : '';
            statusEl.textContent = `${count}/${total} SELECTED (${humanCount} HUMANS)${botText}`;
        }

        const startBtn = document.getElementById('start-game-btn');
        if (startBtn) {
            const disabled = !isHost || count < 2;
            startBtn.disabled = disabled;
            startBtn.classList.toggle('disabled', disabled);

            if (!isHost) {
                startBtn.textContent = count >= 2 ? 'HOST STARTS MATCH' : 'WAITING FOR HOST';
            } else if (count >= 2) {
                startBtn.textContent = 'START MATCH';
            } else {
                startBtn.textContent = 'NEED 2+ PLAYERS';
            }
        }

        const addBotBtn = document.getElementById('add-bot-btn');
        if (addBotBtn) {
            addBotBtn.disabled = !isHost;
            addBotBtn.classList.toggle('disabled', !isHost);
        }

        const clearBotsBtn = document.getElementById('clear-bots-btn');
        if (clearBotsBtn) {
            const disabled = !isHost || botCount === 0;
            clearBotsBtn.disabled = disabled;
            clearBotsBtn.classList.toggle('disabled', disabled);
        }
    }

    function renderHostControls(state) {
        const panel = document.getElementById('persistent-host-controls');
        const list = document.getElementById('host-player-list');
        if (!panel || !list) return;

        const isHost = Boolean(state?.hostPlayerId && myPlayerId && state.hostPlayerId === myPlayerId);
        panel.classList.toggle('hidden', !isHost);
        list.innerHTML = '';

        if (!isHost) {
            return;
        }

        const members = Array.isArray(state?.members) ? state.members : [];
        const visibleMembers = members.filter(member => !member.isHost);

        if (visibleMembers.length === 0) {
            list.innerHTML = '<div class="host-player-empty">No other players are in the room yet.</div>';
            return;
        }

        visibleMembers.forEach(member => {
            const row = document.createElement('div');
            row.className = 'host-player-row';

            const displayName = member.character || member.name || 'Unselected player';
            const tags = [
                member.isBot ? 'BOT' : 'PLAYER',
                member.character ? 'LOCKED IN' : 'UNSELECTED',
                member.isOnline ? 'ONLINE' : 'OFFLINE'
            ];

            row.innerHTML = `
                <div class="host-player-meta">
                    <div class="host-player-name">${displayName}</div>
                    <div class="host-player-tags">${tags.map(tag => `<span class="host-player-tag">${tag}</span>`).join('')}</div>
                </div>
                <button class="secondary-lobby-btn subtle host-kick-btn" type="button">KICK</button>
            `;

            row.querySelector('.host-kick-btn').addEventListener('click', () => {
                const targetLabel = member.character || member.name || 'this player';
                if (!window.confirm(`Kick ${targetLabel} from the room?`)) return;
                socket.emit('kick-player', { playerId: member.playerId });
            });

            list.appendChild(row);
        });
    }

    function bindButtons() {
        const addBotBtn = document.getElementById('add-bot-btn');
        if (addBotBtn) addBotBtn.addEventListener('click', () => socket.emit('add-random-bot'));

        const clearBotsBtn = document.getElementById('clear-bots-btn');
        if (clearBotsBtn) {
            clearBotsBtn.addEventListener('click', () => {
                if (clearBotsBtn.disabled) return;
                socket.emit('clear-lobby-bots');
            });
        }

        const hostControlsToggle = document.getElementById('host-controls-toggle');
        const hostControlsClose = document.getElementById('host-controls-close');

        hostControlsToggle?.addEventListener('click', () => {
            const panel = document.getElementById('persistent-host-controls');
            setHostControlsOpen(panel?.classList.contains('hidden'));
        });

        hostControlsClose?.addEventListener('click', () => setHostControlsOpen(false));
    }

    function bindCustomColorControls() {
        const toggle = document.getElementById('custom-color-toggle');
        const picker = document.getElementById('custom-color-picker');
        if (!toggle || !picker) return;

        toggle.addEventListener('change', () => {
            useCustomColor = toggle.checked;
            syncCustomColorControls();
            persistSelectedCharacterColor();
        });

        picker.addEventListener('input', () => {
            selectedCustomColor = normalizeHexColor(picker.value) || '#ffffff';
            syncCustomColorControls();
            persistSelectedCharacterColor();
        });

        syncCustomColorControls();
    }

    function setHostControlsOpen(isOpen) {
        const panel = document.getElementById('persistent-host-controls');
        const toggle = document.getElementById('host-controls-toggle');
        if (!panel) return;

        panel.classList.toggle('hidden', !isOpen);
        if (toggle) {
            toggle.setAttribute('aria-expanded', String(Boolean(isOpen)));
            toggle.textContent = isOpen ? 'Hide Host Controls' : 'Host Controls';
        }
    }

    function showError(message) {
        const overlay = document.getElementById('error-overlay');
        const msgEl   = document.getElementById('error-message');
        msgEl.textContent = message;
        overlay.classList.remove('hidden');
    }

    function setupErrorDismiss() {
        const overlay = document.getElementById('error-overlay');
        const btn     = document.getElementById('error-dismiss');
        if (!btn || !overlay) return;
        btn.addEventListener('click', () => overlay.classList.add('hidden'));
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.classList.add('hidden');
        });
    }

    function hideLobby() {
        document.getElementById('lobby-screen').classList.add('hidden');
    }

    function showLobby() {
        document.getElementById('lobby-screen').classList.remove('hidden');
    }

    function getSelectedCharacter() { return selectedCharacter; }

    return { init, hideLobby, showLobby, getSelectedCharacter };
})();
