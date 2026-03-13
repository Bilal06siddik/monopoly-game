// ═══════════════════════════════════════════════════════════
//  LOBBY — Arcade Machine Character Selection + Socket.io
// ═══════════════════════════════════════════════════════════

const Lobby = (() => {
    // ── Character Configuration ─────────────────────────────
    // Names MUST match the filenames in public/characters/ (case-sensitive on Linux)
    const CHARACTER_COLORS = {
        'bilo':    '#6c5ce7',
        'osss':    '#e17055',
        'bdlbaky': '#00b894',
        'fawzy':   '#fdcb6e',
        'hamza':   '#00d4ff',
        'missiry': '#ff2d78'
    };

    // Display name overrides (prettier than raw filename)
    const CHARACTER_DISPLAY = {
        'bilo':    'BILO',
        'osss':    'OS',
        'bdlbaky': 'ABDELBAKY',
        'fawzy':   'FAWZY',
        'hamza':   'HAMZA',
        'missiry': 'MISSIRY'
    };

    // Per-character stats — funny/flavour
    const CHARACTER_STATS = {
        'bilo': {
            tradingStyle:  'Refuses to sell anything. Ever.',
            toxicityLevel: 85,
            catchphrase:   '"That\'s my property, habibi."',
            playstyle:     'Hoards railroads & mortgages nothing'
        },
        'osss': {
            tradingStyle:  'Shark investor — buys low, auctions high',
            toxicityLevel: 60,
            catchphrase:   '"I\'ll auction everything. Even your soul."',
            playstyle:     'Somehow always rolls doubles'
        },
        'bdlbaky': {
            tradingStyle:  'Negotiates for 20 mins then says no',
            toxicityLevel: 75,
            catchphrase:   '"Wait, let me think about it..."',
            playstyle:     'Owns all utilities, somehow'
        },
        'fawzy': {
            tradingStyle:  'Impulse buyer — no plan, no regrets',
            toxicityLevel: 50,
            catchphrase:   '"I\'ll buy that. Why not."',
            playstyle:     'Lands on Go To Jail every round'
        },
        'hamza': {
            tradingStyle:  'Silent strategist — says nothing, takes everything',
            toxicityLevel: 40,
            catchphrase:   '*just smiles and collects rent*',
            playstyle:     'Has a monopoly by turn 3'
        },
        'missiry': {
            tradingStyle:  'Pure random chaos — no strategy detected',
            toxicityLevel: 95,
            catchphrase:   '"YOLO." *buys the last railroad*',
            playstyle:     'Rolls & prays. Somehow wins.'
        }
    };

    let socket            = null;
    let selectedCharacter = null;
    let lobbyState        = null;

    // ── Public API ──────────────────────────────────────────
    function init(socketInstance) {
        socket = socketInstance;
        bindEvents();
        bindButtons();
        setupErrorDismiss();
        setupStatsOverlayDismiss();
    }

    // ── Socket Events ───────────────────────────────────────
    function bindEvents() {
        socket.on('lobby-update', (state) => {
            lobbyState = state;
            renderCharacters(state);
            updateStatus(state);
        });

        socket.on('character-confirmed', (data) => {
            selectedCharacter = data.character;
            Notifications.show(
                `You are <strong>${CHARACTER_DISPLAY[data.character] || data.character}</strong>!`,
                'success'
            );
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

    // ── Render Arcade Machines ──────────────────────────────
    function renderCharacters(state) {
        const grid = document.getElementById('character-grid');
        grid.innerHTML = '';

        state.characters.forEach((char) => {
            const isMine  = selectedCharacter === char.name;
            const isTaken = char.taken && !isMine;
            const color   = CHARACTER_COLORS[char.name] || '#6080ff';
            const stats   = CHARACTER_STATS[char.name]  || {};
            const display = CHARACTER_DISPLAY[char.name] || char.name.toUpperCase();

            const machine = document.createElement('div');
            machine.className = 'arcade-machine' +
                (isMine  ? ' selected' : '') +
                (isTaken ? ' taken'    : '');
            machine.id = `char-${char.name}`;
            machine.style.setProperty('--machine-color', color);

            // Taken badge
            let takenBadgeHTML = '';
            if (isTaken) {
                const label = char.takenByBot ? 'BOT' : 'TAKEN';
                takenBadgeHTML = `<div class="taken-badge">${label}</div>`;
            }

            machine.innerHTML = `
                <div class="arcade-cabinet-body">
                    ${takenBadgeHTML}

                    <!-- MARQUEE -->
                    <div class="arcade-marquee">
                        <span class="neon-text">${display}</span>
                    </div>

                    <!-- CRT SCREEN -->
                    <div class="arcade-screen">
                        <div class="arcade-avatar-wrap">
                            <img
                                class="arcade-avatar"
                                src="./characters/${char.name}.png"
                                alt="${display}"
                                onerror="this.onerror=null; this.src='./characters/${char.name}.jpg';"
                            />
                            <button class="carousel-arrow left"  title="Previous skin">◀</button>
                            <button class="carousel-arrow right" title="Next skin">▶</button>
                        </div>
                    </div>

                    <!-- CONTROL PANEL -->
                    <div class="arcade-panel">
                        <div class="panel-deco">
                            <div class="deco-joystick"></div>
                            <div class="deco-btn red"></div>
                            <div class="deco-btn yellow"></div>
                            <div class="deco-btn blue"></div>
                        </div>
                        <button class="arcade-btn" data-char="${char.name}">
                            ▶ PLAYER INFO
                        </button>
                    </div>
                </div>
            `;

            // ── Click handlers ──
            machine.addEventListener('click', (e) => {
                if (e.target.closest('.arcade-btn') ||
                    e.target.closest('.carousel-arrow')) return;
                if (isTaken) return;

                if (isMine) {
                    socket.emit('deselect-character');
                    selectedCharacter = null;
                } else {
                    socket.emit('select-character', char.name);
                }
            });

            machine.querySelector('.carousel-arrow.left').addEventListener('click', (e) => {
                e.stopPropagation();
                animateCarousel(machine, 'left');
            });
            machine.querySelector('.carousel-arrow.right').addEventListener('click', (e) => {
                e.stopPropagation();
                animateCarousel(machine, 'right');
            });

            machine.querySelector('.arcade-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                openStatsPanel(char.name, display, color, stats);
            });

            grid.appendChild(machine);
        });
    }

    // ── Carousel Animation (future-ready) ───────────────────
    function animateCarousel(machine, direction) {
        const avatar = machine.querySelector('.arcade-avatar');
        if (!avatar) return;

        const slideOut = direction === 'right' ? '-50px' : '50px';
        const slideIn  = direction === 'right' ?  '50px' : '-50px';

        avatar.style.transition = 'transform 0.18s ease, opacity 0.18s ease';
        avatar.style.transform  = `translateX(${slideOut})`;
        avatar.style.opacity    = '0';

        setTimeout(() => {
            avatar.style.transition = 'none';
            avatar.style.transform  = `translateX(${slideIn})`;
            setTimeout(() => {
                avatar.style.transition = 'transform 0.18s ease, opacity 0.18s ease';
                avatar.style.transform  = 'translateX(0)';
                avatar.style.opacity    = '1';
            }, 20);
        }, 180);
    }

    // ── Stats Panel ─────────────────────────────────────────
    function openStatsPanel(charName, displayName, color, stats) {
        const overlay = document.getElementById('arcade-stats-overlay');
        const panel   = document.getElementById('arcade-stats-panel');

        overlay.style.setProperty('--stats-color', color);
        panel.style.setProperty('--stats-color', color);

        document.getElementById('stats-char-name').textContent = displayName;

        const avatarEl = document.getElementById('stats-char-avatar');
        avatarEl.src = `./characters/${charName}.png`;
        avatarEl.onerror = function() {
            this.onerror = null;
            this.src = `./characters/${charName}.jpg`;
        };

        document.getElementById('stats-trading').textContent    = stats.tradingStyle  || '???';
        document.getElementById('stats-catchphrase').textContent = stats.catchphrase  || '...';
        document.getElementById('stats-playstyle').textContent  = stats.playstyle     || '???';

        const toxicity = stats.toxicityLevel ?? 50;
        document.getElementById('stats-toxicity-val').textContent = toxicity + '%';
        const bar = document.getElementById('stats-toxicity-bar');
        bar.style.width = '0%';
        setTimeout(() => { bar.style.width = toxicity + '%'; }, 80);

        overlay.classList.add('open');
    }

    function closeStatsPanel() {
        document.getElementById('arcade-stats-overlay').classList.remove('open');
    }

    function setupStatsOverlayDismiss() {
        const overlay = document.getElementById('arcade-stats-overlay');
        if (!overlay) return;
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeStatsPanel();
        });
        const closeBtn = document.getElementById('stats-close-btn');
        if (closeBtn) closeBtn.addEventListener('click', closeStatsPanel);
    }

    // ── Status Bar ──────────────────────────────────────────
    function updateStatus(state) {
        const statusEl     = document.getElementById('lobby-status');
        const readyPlayers = state.players.filter(p => p.character);
        const count        = readyPlayers.length;
        const total        = state.characters.length;
        const botCount     = readyPlayers.filter(p => p.isBot).length;
        const humanCount   = count - botCount;

        if (count === 0) {
            statusEl.innerHTML = '<span class="dot-pulse"></span> Waiting for players...';
        } else {
            const botText = botCount > 0 ? ` • ${botCount} bot${botCount > 1 ? 's' : ''}` : '';
            statusEl.innerHTML =
                `<span class="dot-pulse"></span> ${count}/${total} ready ` +
                `(${humanCount} human${humanCount === 1 ? '' : 's'})${botText}`;
        }

        const startBtn = document.getElementById('start-game-btn');
        if (startBtn) {
            if (count >= 2) {
                startBtn.classList.remove('disabled');
                startBtn.textContent = '▶ START GAME';
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

    // ── Buttons ─────────────────────────────────────────────
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

    // ── Error ────────────────────────────────────────────────
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

    // ── Lifecycle ────────────────────────────────────────────
    function hideLobby() {
        document.getElementById('lobby-screen').classList.add('hidden');
        closeStatsPanel();
    }

    function getSelectedCharacter() { return selectedCharacter; }

    return { init, hideLobby, getSelectedCharacter };
})();
