// ═══════════════════════════════════════════════════════════
//  LOBBY — Character selection & Socket.io lobby client
// ═══════════════════════════════════════════════════════════

const Lobby = (() => {
    const CHARACTER_AVATARS = {
        'Bilo': '🎩',
        'Os': '🏎️',
        'Ziko': '🐕',
        'Maro': '⚓'
    };

    const CHARACTER_COLORS = {
        'Bilo': '#6c5ce7',
        'Os': '#e17055',
        'Ziko': '#00b894',
        'Maro': '#fdcb6e'
    };

    let socket = null;
    let selectedCharacter = null;
    let lobbyState = null;

    function init(socketInstance) {
        socket = socketInstance;
        bindEvents();
        bindButtons();
        setupErrorDismiss();
    }

    function bindEvents() {
        // Lobby state updates from server
        socket.on('lobby-update', (state) => {
            lobbyState = state;
            renderCharacters(state);
            updateStatus(state);
        });

        // Character confirmed by server
        socket.on('character-confirmed', (data) => {
            selectedCharacter = data.character;
            Notifications.show(
                `You are <strong>${data.character}</strong>!`,
                'success'
            );
        });

        // Character was already taken
        socket.on('character-taken', (data) => {
            showError(data.message);
            Notifications.notifyError(data.message);
        });

        // Generic error
        socket.on('character-error', (data) => {
            Notifications.notifyError(data.message);
        });
    }

    function renderCharacters(state) {
        const grid = document.getElementById('character-grid');
        grid.innerHTML = '';

        state.characters.forEach((char) => {
            const card = document.createElement('div');
            card.className = 'character-card';
            card.id = `char-${char.name}`;

            const isMine = selectedCharacter === char.name;
            const isTaken = char.taken && !isMine;

            if (isMine) card.classList.add('selected');
            if (isTaken) card.classList.add('taken');

            // Color accent border for own selection
            if (isMine) {
                card.style.borderColor = CHARACTER_COLORS[char.name];
                card.style.boxShadow = `0 0 24px ${CHARACTER_COLORS[char.name]}33`;
            }

            card.innerHTML = `
        <span class="char-avatar">${CHARACTER_AVATARS[char.name] || '👤'}</span>
        <span class="char-name">${char.name}</span>
        ${isTaken ? `<span class="char-status">${char.takenByBot ? 'Bot' : 'Taken'}</span>` : ''}
        ${isMine ? '<span class="char-status">You</span>' : ''}
      `;

            // Click to select
            card.addEventListener('click', () => {
                if (isTaken) {
                    showError('Character already taken');
                    return;
                }
                if (isMine) {
                    // Deselect
                    socket.emit('deselect-character');
                    selectedCharacter = null;
                    return;
                }
                socket.emit('select-character', char.name);
            });

            grid.appendChild(card);
        });
    }

    function updateStatus(state) {
        const statusEl = document.getElementById('lobby-status');
        const readyPlayers = state.players.filter(player => player.character);
        const count = readyPlayers.length;
        const total = state.characters.length;
        const botCount = readyPlayers.filter(player => player.isBot).length;
        const humanCount = count - botCount;

        if (count === 0) {
            statusEl.innerHTML = '<span class="dot-pulse"></span> Waiting for players...';
        } else {
            const botText = botCount > 0 ? ` • ${botCount} bot${botCount > 1 ? 's' : ''}` : '';
            statusEl.innerHTML = `<span class="dot-pulse"></span> ${count}/${total} ready (${humanCount} human${humanCount === 1 ? '' : 's'})${botText}`;
        }

        // Show/enable Start Game button when >= 2 players
        const startBtn = document.getElementById('start-game-btn');
        if (startBtn) {
            if (count >= 2) {
                startBtn.classList.remove('disabled');
                startBtn.textContent = '🚀 Start Game';
            } else {
                startBtn.classList.add('disabled');
                startBtn.textContent = 'Need 2+ players';
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
        if (addBotBtn) {
            addBotBtn.addEventListener('click', () => socket.emit('add-random-bot'));
        }

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
        const msgEl = document.getElementById('error-message');
        msgEl.textContent = message;
        overlay.classList.remove('hidden');
    }

    function setupErrorDismiss() {
        const overlay = document.getElementById('error-overlay');
        const btn = document.getElementById('error-dismiss');
        btn.addEventListener('click', () => {
            overlay.classList.add('hidden');
        });
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.classList.add('hidden');
        });
    }

    function hideLobby() {
        document.getElementById('lobby-screen').classList.add('hidden');
    }

    function getSelectedCharacter() {
        return selectedCharacter;
    }

    return { init, hideLobby, getSelectedCharacter };
})();
