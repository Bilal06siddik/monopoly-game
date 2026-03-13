// ═══════════════════════════════════════════════════════════
//  LOBBY — TCG Title Deed Cards + Socket.io
// ═══════════════════════════════════════════════════════════

const Lobby = (() => {
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
    let lobbyState        = null;

    function init(socketInstance) {
        socket = socketInstance;
        bindEvents();
        bindButtons();
        setupErrorDismiss();
    }

    function bindEvents() {
        socket.on('lobby-update', (state) => {
            lobbyState = state;
            renderCharacters(state);
            updateStatus(state);
        });

        socket.on('character-confirmed', (data) => {
            selectedCharacter = data.character;
            Notifications.show(`Deck Secured: <strong>${CHARACTER_DISPLAY[data.character] || data.character}</strong>`, 'success');
            if (lobbyState) renderCharacters(lobbyState);
        });

        socket.on('character-taken', (data) => {
            showError(data.message);
            Notifications.notifyError(data.message);
        });

        socket.on('character-error', (data) => {
            Notifications.notifyError(data.message);
        });
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

            const wrapper = document.createElement('div');
            wrapper.className = 'tcg-card-wrapper' + (isMine ? ' selected' : '') + (isTaken ? ' taken' : '');
            wrapper.style.setProperty('--char-color', color);
            
            wrapper.innerHTML = `
                <div class="tcg-card-inner">
                    
                    <!-- FRONT OF CARD -->
                    <div class="tcg-card-front">
                        <div class="tcg-card-header">
                            <span class="tcg-card-name">${display}</span>
                        </div>
                        
                        <div class="tcg-artwork-box">
                            <div class="tcg-info-btn" title="View Stats">i</div>
                            <img class="tcg-avatar" src="${imgSrc}" onerror="this.onerror=null; this.src='./characters/${char.name}.svg';" alt="${display}" />
                        </div>

                        <div class="tcg-card-footer">
                            <button class="tcg-select-btn">${isMine ? 'SELECTED' : isTaken ? 'TAKEN' : 'SELECT'}</button>
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
                } else {
                    socket.emit('select-character', char.name);
                }
            });

            // Full card click fallback
            wrapper.addEventListener('click', (e) => {
                if (!e.target.closest('.tcg-info-btn') && !e.target.closest('.tcg-back-btn')) {
                    if (!wrapper.classList.contains('flipped') && !isTaken) {
                        if (isMine) {
                            socket.emit('deselect-character');
                            selectedCharacter = null;
                        } else {
                            socket.emit('select-character', char.name);
                        }
                    }
                }
            });

            grid.appendChild(wrapper);
        });
    }

    function updateStatus(state) {
        const statusEl     = document.getElementById('lobby-status');
        const readyPlayers = state.players.filter(p => p.character);
        const count        = readyPlayers.length;
        const total        = Object.keys(CHARACTER_COLORS).length; // Now 6
        const botCount     = readyPlayers.filter(p => p.isBot).length;
        const humanCount   = count - botCount;

        if (count === 0) {
            statusEl.textContent = 'AWAITING PLAYERS...';
        } else {
            const botText = botCount > 0 ? ` • ${botCount} BOTS` : '';
            statusEl.textContent = `${count}/${total} SELECTED (${humanCount} HUMANS)${botText}`;
        }

        const startBtn = document.getElementById('start-game-btn');
        if (startBtn) {
            if (count >= 2) {
                startBtn.classList.remove('disabled');
                startBtn.textContent = 'START MATCH';
            } else {
                startBtn.classList.add('disabled');
                startBtn.textContent = 'NEED 2+ PLAYERS';
            }
        }

        const clearBotsBtn = document.getElementById('clear-bots-btn');
        if (clearBotsBtn) {
            clearBotsBtn.disabled = botCount === 0;
            clearBotsBtn.classList.toggle('disabled', botCount === 0);
        }
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

    function getSelectedCharacter() { return selectedCharacter; }

    return { init, hideLobby, getSelectedCharacter };
})();
