// ═══════════════════════════════════════════════════════════
//  LOBBY — TCG Title Deed Cards + Socket.io
// ═══════════════════════════════════════════════════════════

const Lobby = (() => {
    const TOKEN_OPTIONS = window.TokenCatalog?.TOKEN_OPTIONS || [];
    const MAX_CUSTOM_AVATAR_BYTES = 2 * 1024 * 1024;
    const ALLOWED_CUSTOM_AVATAR_MIME_TYPES = new Set([
        'image/png',
        'image/jpeg',
        'image/webp',
        'image/gif'
    ]);

    // Named characters stay exclusive; custom can be reused by every player.
    const CHARACTER_COLORS = {
        'bilo':    '#8e44ad', // Deep Purple
        'osss':    '#f1c40f', // Gold
        'bdlbaky': '#2ecc71', // Emerald Green
        'fawzy':   '#e74c3c', // Crimson Red
        'hamza':   '#3498db', // Ocean Blue
        'missiry': '#e61a8d',  // Hot Pink
        'custom':  '#95a5a6'   // Slate Grey
    };

    const CHARACTER_DISPLAY = {
        'bilo':    'BILO',
        'osss':    'OS',
        'bdlbaky': 'ABDELBAKY',
        'fawzy':   'FAWZY',
        'hamza':   'HAMZA',
        'missiry': 'MISSIRY',
        'custom':  'CUSTOM'
    };

    const CHARACTER_RARITY = {
        'bilo': 'epic',
        'osss': 'gold',
        'bdlbaky': 'special',
        'fawzy': 'common',
        'hamza': 'common',
        'missiry': 'rare',
        'custom': 'special'
    };

    const MAP_VISUALS = {
        egypt: ['/images/flags/egypt.svg'],
        countries: [
            '/images/flags/india.svg',
            '/images/flags/turkey.svg',
            '/images/flags/canada.svg',
            '/images/flags/uk.svg'
        ]
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
        },
        'custom': {
            trait: 'The Wildcard',
            toxicityLevel: '???%',
            toxBar: '░░░░░░░░░░',
            quote: '"Who am I? You decide."'
        }
    };

    const CHARACTER_CARD_PROFILE = {
        'bilo': {
            role: 'Money Magnet',
            archetype: 'Capital Predator',
            stats: [
                { icon: '💰', label: 'Profit', value: 10 },
                { icon: '🤝', label: 'Trade', value: 6 },
                { icon: '🎲', label: 'Luck', value: 5 },
                { icon: '🌀', label: 'Chaos', value: 4 }
            ],
            passive: 'Market Sweep',
            ability: 'Earns more from developed zones and pressures weak owners into quick exits.',
            playstyle: 'Snowballs from early income leads and dominates long-term board value.',
            businessBehavior: 'Buys prime assets early, protects monopolies, and waits for high-margin flips.',
            sellStyle: 'Expensive',
            mindset: 'Greedy and tactical',
            skins: ['Founder BILO', 'Night Exchange']
        },
        'osss': {
            role: 'Route King',
            archetype: 'Transit Baron',
            stats: [
                { icon: '💰', label: 'Profit', value: 8 },
                { icon: '🤝', label: 'Trade', value: 7 },
                { icon: '🎲', label: 'Luck', value: 7 },
                { icon: '🌀', label: 'Chaos', value: 6 }
            ],
            passive: 'Fare Collector',
            ability: 'Turns network control into steady cash flow and wins through map pressure.',
            playstyle: 'Controls movement lanes and punishes opponents who ignore infrastructure.',
            businessBehavior: 'Invests in connected sets, values transport leverage, and times trades carefully.',
            sellStyle: 'Premium',
            mindset: 'Tactical and patient',
            skins: ['Metro Magnate', 'Golden Conductor']
        },
        'bdlbaky': {
            role: 'Chaos Banker',
            archetype: 'Liquidity Hoarder',
            stats: [
                { icon: '💰', label: 'Profit', value: 9 },
                { icon: '🤝', label: 'Trade', value: 5 },
                { icon: '🎲', label: 'Luck', value: 8 },
                { icon: '🌀', label: 'Chaos', value: 9 }
            ],
            passive: 'Panic Vault',
            ability: 'Weaponizes scarcity, squeezes negotiations, and thrives when others are desperate.',
            playstyle: 'Disruptive controller who punishes weak cash flow and sudden risk.',
            businessBehavior: 'Holds assets longer than expected, demands overpay, and exploits emergency sales.',
            sellStyle: 'Very expensive',
            mindset: 'Greedy and risky',
            skins: ['Vaultbreaker', 'Bank Run']
        },
        'fawzy': {
            role: 'Roll Tactician',
            archetype: 'Chance Hacker',
            stats: [
                { icon: '💰', label: 'Profit', value: 5 },
                { icon: '🤝', label: 'Trade', value: 7 },
                { icon: '🎲', label: 'Luck', value: 10 },
                { icon: '🌀', label: 'Chaos', value: 6 }
            ],
            passive: 'Loaded Rhythm',
            ability: 'Converts lucky turns into tactical openings and accelerates momentum off events.',
            playstyle: 'Flexible opportunist who capitalizes on variance better than everyone else.',
            businessBehavior: 'Trades when the numbers line up, pivots quickly, and chases swing turns.',
            sellStyle: 'Fair',
            mindset: 'Risky and tactical',
            skins: ['Lucky Streak', 'Casino Wireframe']
        },
        'hamza': {
            role: 'Wild Rookie',
            archetype: 'Unstable Starter',
            stats: [
                { icon: '💰', label: 'Profit', value: 4 },
                { icon: '🤝', label: 'Trade', value: 5 },
                { icon: '🎲', label: 'Luck', value: 7 },
                { icon: '🌀', label: 'Chaos', value: 8 }
            ],
            passive: 'Beginner Bounce',
            ability: 'Mistakes sometimes become unexpected wins, creating sharp momentum swings.',
            playstyle: 'Unpredictable scrambler with explosive upside and messy board decisions.',
            businessBehavior: 'Buys impulsively, sells inconsistently, and can stumble into strong positions.',
            sellStyle: 'Cheap',
            mindset: 'Risky',
            skins: ['Street Starter', 'Blue Screen Hero']
        },
        'missiry': {
            role: 'Glitch Dealer',
            archetype: 'Chaos Merchant',
            stats: [
                { icon: '💰', label: 'Profit', value: 6 },
                { icon: '🤝', label: 'Trade', value: 8 },
                { icon: '🎲', label: 'Luck', value: 8 },
                { icon: '🌀', label: 'Chaos', value: 10 }
            ],
            passive: 'Noise Engine',
            ability: 'Destabilizes table logic, creates weird offers, and profits from confusion.',
            playstyle: 'High-pressure disruptor who thrives on unpredictable negotiations and off-meta lines.',
            businessBehavior: 'Makes strange offers, pivots fast, and can bait players into bad exchanges.',
            sellStyle: 'Variable',
            mindset: 'Greedy, risky, and chaotic',
            skins: ['Static Queen', 'Neon Menace']
        },
        'custom': {
            role: 'Player Forge',
            archetype: 'Wildcard Prototype',
            stats: [
                { icon: '💰', label: 'Profit', value: 7 },
                { icon: '🤝', label: 'Trade', value: 7 },
                { icon: '🎲', label: 'Luck', value: 7 },
                { icon: '🌀', label: 'Chaos', value: 7 }
            ],
            passive: 'Identity Shift',
            ability: 'A flexible blank slate that can evolve into any table persona.',
            playstyle: 'Balanced all-rounder with room for future customization systems.',
            businessBehavior: 'Adapts to the room, mirrors strong strategies, and fills gaps in team identity.',
            sellStyle: 'Adaptive',
            mindset: 'Tactical',
            skins: ['Default Frame', 'Future Legendary Slot']
        }
    };

    const CHARACTER_SKINS = {
        'bilo': [
            {
                id: 'casual-player',
                title: 'Casual Player',
                rarity: 'common',
                image: './characters/bilo-common.png',
                stats: [
                    { icon: '💰', label: 'Profit', value: 5 },
                    { icon: '🤝', label: 'Trade', value: 4 },
                    { icon: '🎲', label: 'Luck', value: 6 },
                    { icon: '🌀', label: 'Chaos', value: 3 }
                ]
            },
            {
                id: 'rap-mogul',
                title: 'Rap Mogul',
                rarity: 'rare',
                image: './characters/bilo-rapper.png',
                stats: [
                    { icon: '💰', label: 'Profit', value: 7 },
                    { icon: '🤝', label: 'Trade', value: 6 },
                    { icon: '🎲', label: 'Luck', value: 5 },
                    { icon: '🌀', label: 'Chaos', value: 7 }
                ]
            },
            {
                id: 'anfield-mind',
                title: 'Anfield Mind',
                rarity: 'epic',
                image: './characters/bilo-liver.png',
                stats: [
                    { icon: '💰', label: 'Profit', value: 8 },
                    { icon: '🤝', label: 'Trade', value: 7 },
                    { icon: '🎲', label: 'Luck', value: 5 },
                    { icon: '🌀', label: 'Chaos', value: 5 }
                ]
            },
            {
                id: 'brand-strategist',
                title: 'Brand Strategist',
                rarity: 'gold',
                image: './characters/bilo-coddi.png',
                stats: [
                    { icon: '💰', label: 'Profit', value: 9 },
                    { icon: '🤝', label: 'Trade', value: 9 },
                    { icon: '🎲', label: 'Luck', value: 4 },
                    { icon: '🌀', label: 'Chaos', value: 4 }
                ]
            },
            {
                id: 'shark-investor',
                title: 'Shark Investor',
                rarity: 'legendary',
                image: './characters/bilo.webp',
                stats: [
                    { icon: '💰', label: 'Profit', value: 10 },
                    { icon: '🤝', label: 'Trade', value: 8 },
                    { icon: '🎲', label: 'Luck', value: 5 },
                    { icon: '🌀', label: 'Chaos', value: 6 }
                ]
            }
        ]
    };

    let socket            = null;
    let selectedChampion  = null;
    let selectedToken     = null;
    let myPlayerId        = null;
    let lobbyState        = null;
    let useCustomColor    = false;
    let selectedCustomColor = '#ffffff';
    let localCustomAvatar = null; // base64 data URL for local preview
    let localCustomName   = '';
    let hostControlsOpen  = true;
    let currentChampionModalState = null;
    let currentScreen     = 'character-select';
    const viewedSkinByCharacter = new Map();
    const LOBBY_MODES = [
        {
            id: 'classic',
            name: 'Classic Monopoly',
            description: 'Current live ruleset with private rooms, host controls, and map voting.',
            status: 'Live'
        },
        {
            id: 'rush',
            name: 'Rush Rules',
            description: 'Shorter match presets are planned for future updates.',
            status: 'Soon'
        }
    ];

    function sanitizeCustomName(value) {
        const raw = typeof value === 'string' ? value.trim() : '';
        return raw.slice(0, 15);
    }

    function escapeHtmlAttr(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function setSelectedChampion(championId, skinId = null) {
        selectedChampion = championId
            ? {
                championId,
                skinId: skinId || null
            }
            : null;
    }

    function getSelectedChampionId() {
        return selectedChampion?.championId || null;
    }

    function getSelectedSkinId() {
        return selectedChampion?.skinId || null;
    }

    function setCurrentScreen(screenId) {
        currentScreen = screenId === 'party-lobby' ? 'party-lobby' : 'character-select';
        if (currentScreen !== 'party-lobby') {
            closeAllLobbyPopups();
        }
        document.getElementById('character-select-screen')?.classList.toggle('hidden', currentScreen !== 'character-select');
        document.getElementById('party-lobby-screen')?.classList.toggle('hidden', currentScreen !== 'party-lobby');
        document.body.classList.toggle('lobby-popup-open', Boolean(
            !document.getElementById('mode-popup-overlay')?.classList.contains('hidden')
            || !document.getElementById('map-popup-overlay')?.classList.contains('hidden')
        ));
    }

    function setLobbyPopupOpen(popupName, isOpen) {
        const normalized = popupName === 'map'
            ? 'map'
            : 'mode';
        const overlay = document.getElementById(`${normalized}-popup-overlay`);
        if (!overlay) return;
        overlay.classList.toggle('hidden', !isOpen);
        overlay.setAttribute('aria-hidden', String(!isOpen));
        document.body.classList.toggle('lobby-popup-open', Boolean(
            !document.getElementById('mode-popup-overlay')?.classList.contains('hidden')
            || !document.getElementById('map-popup-overlay')?.classList.contains('hidden')
        ));
    }

    function closeAllLobbyPopups() {
        setLobbyPopupOpen('mode', false);
        setLobbyPopupOpen('map', false);
    }

    function syncCurrentScreen() {
        if (getSelectedChampionId() && currentScreen !== 'character-select') {
            setCurrentScreen('party-lobby');
            return;
        }
        if (!getSelectedChampionId()) {
            setCurrentScreen('character-select');
        }
    }

    function findSkinIndexById(skins, skinId) {
        if (!Array.isArray(skins) || !skins.length || !skinId) return 0;
        const index = skins.findIndex((skin) => skin?.id === skinId);
        return index >= 0 ? index : 0;
    }

    function validateCustomAvatarFile(file) {
        if (!file) return 'Choose an image file first.';
        if (!String(file.type || '').startsWith('image/')) {
            return 'Avatar must be an image file.';
        }
        if (!ALLOWED_CUSTOM_AVATAR_MIME_TYPES.has(file.type)) {
            return 'Use PNG, JPG, WEBP, or GIF for custom avatar images.';
        }
        if (file.size > MAX_CUSTOM_AVATAR_BYTES) {
            return 'Avatar image must be 2MB or smaller.';
        }
        return null;
    }

    function normalizeCustomAvatarDataUrl(value) {
        if (typeof value !== 'string') {
            return { avatarUrl: null, error: null };
        }

        const normalized = value.trim();
        if (!normalized) {
            return { avatarUrl: null, error: null };
        }

        const match = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i.exec(normalized);
        if (!match) {
            return {
                avatarUrl: null,
                error: 'Custom avatar format is invalid. Please upload a PNG, JPG, WEBP, or GIF image.'
            };
        }

        const mimeType = match[1].toLowerCase();
        if (!ALLOWED_CUSTOM_AVATAR_MIME_TYPES.has(mimeType)) {
            return {
                avatarUrl: null,
                error: 'Use PNG, JPG, WEBP, or GIF for custom avatar images.'
            };
        }

        const base64Payload = match[2].replace(/\s+/g, '');
        if (!base64Payload || !/^[a-z0-9+/]+={0,2}$/i.test(base64Payload) || base64Payload.length % 4 !== 0) {
            return {
                avatarUrl: null,
                error: 'Custom avatar data is invalid. Please upload the image again.'
            };
        }

        const padding = base64Payload.endsWith('==') ? 2 : (base64Payload.endsWith('=') ? 1 : 0);
        const binarySize = Math.floor((base64Payload.length * 3) / 4) - padding;
        if (!Number.isFinite(binarySize) || binarySize <= 0) {
            return {
                avatarUrl: null,
                error: 'Custom avatar data is invalid. Please upload the image again.'
            };
        }

        if (binarySize > MAX_CUSTOM_AVATAR_BYTES) {
            return {
                avatarUrl: null,
                error: 'Avatar image must be 2MB or smaller.'
            };
        }

        return {
            avatarUrl: `data:${mimeType};base64,${base64Payload}`,
            error: null
        };
    }

    function buildCustomCharacterPayload(selectData) {
        selectData.customName = sanitizeCustomName(localCustomName) || 'Custom Player';

        const avatarResult = normalizeCustomAvatarDataUrl(localCustomAvatar);
        localCustomAvatar = avatarResult.avatarUrl;
        if (avatarResult.error) {
            Notifications.notifyError(avatarResult.error);
        }
        selectData.customAvatarUrl = avatarResult.avatarUrl || null;
    }

    function init(socketInstance) {
        socket = socketInstance;
        ensureChampionModal();
        bindEvents();
        bindButtons();
        bindCustomColorControls();
        setupErrorDismiss();
        setCurrentScreen('character-select');
        renderModeControls();
    }

    function bindEvents() {
        socket.on('player-session', (data) => {
            myPlayerId = data.playerId || null;
            setSelectedChampion(data.character || null, data.skinId || viewedSkinByCharacter.get(data.character) || null);
            if (data.character && data.skinId) {
                viewedSkinByCharacter.set(data.character, data.skinId);
            }
            selectedToken = data.tokenId || null;
            localCustomName = sanitizeCustomName(data.customName || data.name || localCustomName);
            localCustomAvatar = normalizeCustomAvatarDataUrl(data.customAvatarUrl || localCustomAvatar).avatarUrl;
            useCustomColor = Boolean(normalizeHexColor(data.customColor));
            selectedCustomColor = normalizeHexColor(data.customColor) || selectedCustomColor;
            syncCustomColorControls();
            if (data.character && !lobbyState) {
                setCurrentScreen('party-lobby');
            }
            syncCurrentScreen();
            if (lobbyState) {
                renderCharacters(lobbyState);
                renderTokens(lobbyState);
                renderBoardVotes(lobbyState);
                renderPartyLobby(lobbyState);
            }
        });

        socket.on('lobby-update', (state) => {
            lobbyState = state;
            renderCharacters(state);
            renderTokens(state);
            renderBoardVotes(state);
            renderPartyLobby(state);
            updatePartyStatus(state);
            renderHostControls(state);
            syncCurrentScreen();
        });

        socket.on('character-confirmed', (data) => {
            setSelectedChampion(data.character || null, data.skinId || viewedSkinByCharacter.get(data.character) || null);
            if (data.character && data.skinId) {
                viewedSkinByCharacter.set(data.character, data.skinId);
            }
            selectedToken = data.tokenId || selectedToken;
            localCustomName = sanitizeCustomName(data.customName || localCustomName);
            localCustomAvatar = normalizeCustomAvatarDataUrl(data.customAvatarUrl || localCustomAvatar).avatarUrl;
            useCustomColor = Boolean(normalizeHexColor(data.customColor));
            selectedCustomColor = normalizeHexColor(data.customColor) || selectedCustomColor;
            syncCustomColorControls();
            const confirmedSkinLabel = data.skinId
                ? (getChampionSkins(data.character, '', CHARACTER_CARD_PROFILE[data.character] || CHARACTER_CARD_PROFILE.custom)
                    .find((skin) => skin.id === data.skinId)?.title || data.skinId)
                : null;
            const confirmationText = confirmedSkinLabel
                ? `Deck Secured: <strong>${CHARACTER_DISPLAY[data.character] || data.character}</strong> | ${confirmedSkinLabel}`
                : `Deck Secured: <strong>${CHARACTER_DISPLAY[data.character] || data.character}</strong>`;
            Notifications.show(confirmationText, 'success');
            setCurrentScreen('party-lobby');
            if (lobbyState) {
                renderCharacters(lobbyState);
                renderTokens(lobbyState);
                renderPartyLobby(lobbyState);
            }
        });

        socket.on('token-confirmed', (data) => {
            selectedToken = data.tokenId || null;
            Notifications.show(`Token Ready: <strong>${getTokenLabel(selectedToken)}</strong>`, 'success');
            if (lobbyState) {
                renderCharacters(lobbyState);
                renderTokens(lobbyState);
                renderPartyLobby(lobbyState);
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

    function playLobbySound(methodName) {
        if (typeof GameAudio === 'undefined') return;
        const fn = GameAudio?.[methodName];
        if (typeof fn === 'function') {
            fn();
        }
    }

    function getChampionSkins(characterName, fallbackImage, cardProfile) {
        const configured = CHARACTER_SKINS[characterName];
        if (Array.isArray(configured) && configured.length > 0) {
            return configured;
        }

        return [{
            id: `${characterName}-default`,
            title: cardProfile?.role || CHARACTER_DISPLAY[characterName] || characterName,
            rarity: CHARACTER_RARITY[characterName] || 'common',
            image: fallbackImage,
            stats: cardProfile?.stats || []
        }];
    }

    function persistSelectedCharacterColor() {
        const myMember = getMyLobbyMember();
        if (!socket || currentScreen !== 'party-lobby' || !myMember?.character || !getSelectedChampionId()) return;
        socket.emit('update-custom-color', {
            customColor: getSelectedLobbyColor()
        });
    }

    function persistSelectedCharacterSkin(skinId) {
        const myMember = getMyLobbyMember();
        if (!socket || currentScreen !== 'party-lobby' || !myMember?.character || !getSelectedChampionId() || !skinId) return;
        socket.emit('update-character-skin', {
            skinId
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

    function getMyLobbyMember(state = lobbyState) {
        const members = Array.isArray(state?.members) ? state.members : [];
        return members.find(member => member.playerId === myPlayerId) || null;
    }

    function getCharacterDisplayName(characterId) {
        return CHARACTER_DISPLAY[characterId] || String(characterId || 'Unknown').toUpperCase();
    }

    function getCharacterSkinTitle(characterId, skinId) {
        if (!characterId) return 'No skin selected';
        const profile = CHARACTER_CARD_PROFILE[characterId] || CHARACTER_CARD_PROFILE.custom;
        const fallbackImage = characterId === 'custom' ? (localCustomAvatar || './characters/custom.svg') : `./characters/${characterId}.webp`;
        const skin = getChampionSkins(characterId, fallbackImage, profile)
            .find((item) => item.id === skinId);
        return skin?.title || profile.role || 'Default Skin';
    }

    function getChampionSkinMeta(characterId, skinId, fallbackAvatar = null) {
        if (!characterId) {
            return {
                title: 'No skin selected',
                rarity: 'common',
                image: fallbackAvatar || './characters/custom.svg'
            };
        }
        const profile = CHARACTER_CARD_PROFILE[characterId] || CHARACTER_CARD_PROFILE.custom;
        const fallbackImage = fallbackAvatar || (characterId === 'custom'
            ? (localCustomAvatar || './characters/custom.svg')
            : `./characters/${characterId}.webp`);
        const skins = getChampionSkins(characterId, fallbackImage, profile);
        const skin = skins.find((item) => item.id === skinId) || skins[0];
        return {
            title: skin?.title || profile.role || 'Default Skin',
            rarity: skin?.rarity || 'common',
            image: skin?.image || fallbackImage
        };
    }

    function isLobbyHost(state = lobbyState) {
        return Boolean(state?.hostPlayerId && myPlayerId && state.hostPlayerId === myPlayerId);
    }

    function getLobbyMemberAvatar(member) {
        if (!member?.character) return './characters/custom.svg';
        if (member.character === 'custom') {
            return member.customAvatarUrl || localCustomAvatar || './characters/custom.svg';
        }
        const profile = CHARACTER_CARD_PROFILE[member.character] || CHARACTER_CARD_PROFILE.custom;
        const skins = getChampionSkins(member.character, `./characters/${member.character}.webp`, profile);
        return skins.find((skin) => skin.id === member.skinId)?.image || `./characters/${member.character}.webp`;
    }

    function renderCharacters(state) {
        const grid = document.getElementById('character-grid');
        grid.innerHTML = '';

        // Safely filter out anyone not in our 6 (in case server has leftover state during transition)
        const validCharacters = state.characters.filter(char => CHARACTER_COLORS[char.name]);

        validCharacters.forEach((char) => {
            const isMine  = getSelectedChampionId() === char.name;
            const isTaken = char.name === 'custom' ? false : (char.taken && !isMine);
            const color   = CHARACTER_COLORS[char.name];
            const stats   = CHARACTER_STATS[char.name];
            const display = CHARACTER_DISPLAY[char.name];
            const imgSrc  = `./characters/${char.name}.webp`;
            const statusLabel = isMine ? 'SELECTED' : isTaken ? (char.offline ? 'OFFLINE' : 'TAKEN') : 'SELECT';
            const customAvatarSrc = isMine
                ? (localCustomAvatar || './characters/custom.svg')
                : './characters/custom.svg';
            const escapedCustomName = escapeHtmlAttr(localCustomName);
            const cardProfile = CHARACTER_CARD_PROFILE[char.name] || CHARACTER_CARD_PROFILE.custom;
            const championSkins = getChampionSkins(
                char.name,
                char.name === 'custom' ? customAvatarSrc : imgSrc,
                cardProfile
            );
            const preferredSkinId = (isMine ? getSelectedSkinId() : null) || viewedSkinByCharacter.get(char.name) || championSkins[0]?.id || null;
            const currentSkinIndex = findSkinIndexById(championSkins, preferredSkinId);
            const currentSkin = championSkins[currentSkinIndex];
            const portraitSrc = currentSkin?.image || (char.name === 'custom' ? customAvatarSrc : imgSrc);
            const rarity = currentSkin?.rarity || CHARACTER_RARITY[char.name] || 'common';
            const skinTitle = escapeHtmlAttr(currentSkin?.title || cardProfile.role || stats.trait);
            const statMarkup = (currentSkin?.stats || cardProfile.stats).map((item) => `
                <div class="tcg-stat-chip">
                    <span class="tcg-stat-icon">${item.icon}</span>
                    <span class="tcg-stat-value">${item.value}</span>
                    <span class="tcg-stat-label">${escapeHtmlAttr(item.label)}</span>
                </div>
            `).join('');
            const tokenText = isMine && selectedToken
                ? `TOKEN • ${getTokenLabel(selectedToken).toUpperCase()}`
                : '&nbsp;';

            const wrapper = document.createElement('div');
            wrapper.className = 'tcg-card-wrapper' + (isMine ? ' selected' : '') + (isTaken ? ' taken' : '');
            wrapper.style.setProperty('--char-color', color);
            wrapper.dataset.rarity = rarity;
            
            wrapper.innerHTML = `
                <div class="tcg-card-inner">
                    
                    <!-- FRONT OF CARD -->
                    <div class="tcg-card-front">
                        <div class="tcg-card-rarity">${rarity}</div>
                        <div class="tcg-card-selected-badge">LOCKED IN</div>
                        
                        <div class="tcg-artwork-box">
                            <button class="tcg-skin-arrow tcg-skin-arrow-left ${championSkins.length > 1 ? '' : 'hidden'}" type="button" aria-label="Previous skin">‹</button>
                            <button class="tcg-skin-arrow tcg-skin-arrow-right ${championSkins.length > 1 ? '' : 'hidden'}" type="button" aria-label="Next skin">›</button>
                            <div class="tcg-info-btn" title="View Stats">i</div>
                            ${char.name === 'custom' && !isTaken ? `
                                <div class="tcg-custom-inputs">
                                    <div class="tcg-custom-field">
                                        <span class="tcg-field-label">NAME YOUR CHARACTER</span>
                                        <input type="text" class="tcg-custom-name-input" placeholder="Enter Name..." maxlength="15" value="${escapedCustomName}" />
                                    </div>
                                    <div class="tcg-custom-field">
                                        <span class="tcg-field-label">PLAYER AVATAR</span>
                                        <label class="tcg-custom-file-label">
                                            <input type="file" class="tcg-custom-file-input" accept="image/png,image/jpeg,image/webp,image/gif" />
                                            <span>📷 UPLOAD PHOTO</span>
                                        </label>
                                    </div>
                                </div>
                            ` : ''}
                            <img class="tcg-avatar ${char.name === 'custom' ? 'custom-avatar' : ''}" 
                                 src="${portraitSrc}" 
                                 loading="lazy" decoding="async" fetchpriority="low" 
                                 onerror="this.onerror=null; this.src='./characters/${char.name}.svg';" 
                                 alt="${display}" />
                        </div>

                        <div class="tcg-card-meta">
                            <div class="tcg-card-name">${display}</div>
                            <div class="tcg-card-skin-title">${skinTitle}</div>
                            <div class="tcg-card-stats-row">${statMarkup}</div>
                        </div>

                        <div class="tcg-card-footer">
                            <div class="tcg-card-footer-top">
                                <div class="tcg-card-token">${tokenText}</div>
                                <button class="tcg-flip-trigger" type="button">PROFILE</button>
                            </div>
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

            const avatarImg = wrapper.querySelector('.tcg-avatar');
            const rarityLabel = wrapper.querySelector('.tcg-card-rarity');
            const roleEl = wrapper.querySelector('.tcg-card-skin-title');
            const statRow = wrapper.querySelector('.tcg-card-stats-row');
            const cardBack = wrapper.querySelector('.tcg-card-back');
            const stateRef = {
                characterName: char.name,
                display,
                profile: cardProfile,
                skins: championSkins,
                skinIndex: currentSkinIndex,
                get currentSkin() {
                    return this.skins[this.skinIndex] || this.skins[0];
                }
            };

            function renderCardSkin(nextIndex, { animate = true, playSound = false } = {}) {
                stateRef.skinIndex = ((nextIndex % stateRef.skins.length) + stateRef.skins.length) % stateRef.skins.length;
                const skin = stateRef.currentSkin;
                const nextStatsMarkup = (skin?.stats || cardProfile.stats).map((item) => `
                    <div class="tcg-stat-chip">
                        <span class="tcg-stat-icon">${item.icon}</span>
                        <span class="tcg-stat-value">${item.value}</span>
                        <span class="tcg-stat-label">${escapeHtmlAttr(item.label)}</span>
                    </div>
                `).join('');
                wrapper.dataset.rarity = skin?.rarity || 'common';
                wrapper.dataset.skinTitle = skin?.title || '';
                viewedSkinByCharacter.set(char.name, skin?.id || stateRef.skins[0]?.id || null);
                roleEl.textContent = skin?.title || cardProfile.role || stats.trait;
                rarityLabel.textContent = skin?.rarity || 'common';
                statRow.innerHTML = nextStatsMarkup;
                if (animate) {
                    wrapper.classList.remove('skin-transition');
                    void wrapper.offsetWidth;
                    wrapper.classList.add('skin-transition');
                }
                if (avatarImg) {
                    avatarImg.src = skin?.image || portraitSrc;
                }
                if (cardBack) {
                    cardBack.querySelector('.data-val').textContent = cardProfile.role;
                }
                if (getSelectedChampionId() === char.name) {
                    setSelectedChampion(char.name, skin?.id || null);
                    persistSelectedCharacterSkin(skin?.id || null);
                }
                if (currentChampionModalState?.cardState === stateRef) {
                    updateChampionModalContent(currentChampionModalState);
                }
                if (playSound) playLobbySound('playSkinSwap');
            }

            function cycleLocalSkin(direction) {
                if (stateRef.skins.length < 2) return;
                renderCardSkin(stateRef.skinIndex + direction, { animate: true, playSound: true });
            }

            stateRef.applySkin = renderCardSkin;
            wrapper._cardState = stateRef;

            // Click Handlers
            function selectChampionCard() {
                if (wrapper.classList.contains('flipped')) return;
                if (isTaken) return;

                wrapper.classList.remove('selection-burst');
                void wrapper.offsetWidth;
                wrapper.classList.add('selection-burst');
                playLobbySound('playSelectConfirm');

                if (isMine) {
                    setSelectedChampion(null);
                    if (lobbyState) {
                        renderCharacters(lobbyState);
                        renderCharacterSelectSummary(lobbyState);
                    }
                    return;
                }

                setSelectedChampion(char.name, stateRef.currentSkin?.id || null);
                viewedSkinByCharacter.set(char.name, stateRef.currentSkin?.id || null);
                if (lobbyState) {
                    renderCharacters(lobbyState);
                    renderCharacterSelectSummary(lobbyState);
                }
            }
            
            // Champion Profile Modal
            wrapper.querySelector('.tcg-info-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                playLobbySound('playPopupOpen');
                openChampionModal(stateRef);
            });

            wrapper.querySelector('.tcg-skin-arrow-left')?.addEventListener('click', (e) => {
                e.stopPropagation();
                cycleLocalSkin(-1);
            });

            wrapper.querySelector('.tcg-skin-arrow-right')?.addEventListener('click', (e) => {
                e.stopPropagation();
                cycleLocalSkin(1);
            });

            wrapper.querySelector('.tcg-flip-trigger')?.addEventListener('click', (e) => {
                e.stopPropagation();
                wrapper.classList.add('flipped');
                playLobbySound('playUiClick');
            });

            // Flip to Front
            wrapper.querySelector('.tcg-back-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                wrapper.classList.remove('flipped');
                playLobbySound('playUiClick');
            });

            // Select Card
            wrapper.querySelector('.tcg-select-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                selectChampionCard();
            });

            wrapper.addEventListener('mouseenter', () => {
                playLobbySound('playUiHover');
            }, { once: true });

            // Custom Input Handlers
            if (char.name === 'custom' && !isTaken) {
                const nameInput = wrapper.querySelector('.tcg-custom-name-input');
                const fileInput = wrapper.querySelector('.tcg-custom-file-input');

                nameInput?.addEventListener('input', (e) => {
                    localCustomName = sanitizeCustomName(e.target.value);
                    if (nameInput.value !== localCustomName) {
                        nameInput.value = localCustomName;
                    }
                });

                fileInput?.addEventListener('change', (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;

                    const validationError = validateCustomAvatarFile(file);
                    if (validationError) {
                        e.target.value = '';
                        Notifications.notifyError(validationError);
                        return;
                    }

                    const reader = new FileReader();
                    reader.onerror = () => {
                        e.target.value = '';
                        Notifications.notifyError('Could not read that image. Try another file.');
                    };
                    reader.onload = (event) => {
                        const base64Data = typeof event?.target?.result === 'string'
                            ? event.target.result
                            : null;
                        if (!base64Data) {
                            Notifications.notifyError('Could not read that image. Try another file.');
                            return;
                        }
                        const avatarResult = normalizeCustomAvatarDataUrl(base64Data);
                        if (avatarResult.error) {
                            Notifications.notifyError(avatarResult.error);
                            return;
                        }
                        localCustomAvatar = avatarResult.avatarUrl;
                        const avatarImg = wrapper.querySelector('.tcg-avatar');
                        if (avatarImg) avatarImg.src = avatarResult.avatarUrl;
                        Notifications.show('Custom avatar uploaded.', 'success');
                    };
                    reader.readAsDataURL(file);
                });

                // Prevent flip when clicking inputs
                nameInput?.addEventListener('click', e => e.stopPropagation());
                fileInput?.closest('label')?.addEventListener('click', e => e.stopPropagation());
            }

            // Full card click fallback
            wrapper.addEventListener('click', (e) => {
                if (
                    e.target.closest('.tcg-info-btn')
                    || e.target.closest('.tcg-back-btn')
                    || e.target.closest('.tcg-select-btn')
                    || e.target.closest('.tcg-flip-trigger')
                    || e.target.closest('.tcg-skin-arrow')
                    || e.target.closest('.tcg-custom-inputs')
                ) {
                    return;
                }

                if (wrapper.classList.contains('flipped')) {
                    return;
                }

                selectChampionCard();
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
        const canSelectToken = Boolean(getSelectedChampionId());

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

    function renderBoardVotes(state) {
        const previewGrid = document.getElementById('map-vote-grid');
        const hostGrid = document.getElementById('host-map-grid');
        const hint = document.getElementById('map-vote-hint');
        const options = Array.isArray(state?.boardOptions) ? state.boardOptions : [];
        const selectedBoardId = state?.selectedBoardId || options.find(option => option.isSelected)?.id || 'egypt';
        const isHost = isLobbyHost(state);

        if (hint) {
            const selectedLabel = options.find(option => option.id === selectedBoardId)?.name || 'Egypt';
            hint.textContent = isHost
                ? `You control the board choice for this room. Current map: ${selectedLabel.toUpperCase()}.`
                : `The host controls the board choice. Current map: ${selectedLabel.toUpperCase()}.`;
        }

        [previewGrid, hostGrid].forEach((grid, index) => {
            if (!grid) return;
            const isCompact = index === 1;
            grid.innerHTML = '';

            options.forEach(option => {
                const card = document.createElement('button');
                card.type = 'button';
                card.className = 'map-vote-card'
                    + (option.id === selectedBoardId ? ' leading selected' : '')
                    + (isHost ? ' is-clickable' : ' is-disabled');
                card.disabled = !isHost;
                card.innerHTML = `
                    <div class="map-vote-title-row">
                        <h3 class="map-vote-name">${option.name}</h3>
                        <span class="map-vote-badge">${option.id === selectedBoardId ? 'Selected' : isHost ? 'Set Map' : 'Host Pick'}</span>
                    </div>
                    <p class="map-vote-description">${option.description || 'Choose this map for the next match.'}</p>
                    <div class="map-vote-meta">
                        <span class="map-vote-count">${option.id === selectedBoardId ? 'Current board' : `${option.votes} vote${option.votes === 1 ? '' : 's'}`}</span>
                        <span class="map-vote-visual">${(MAP_VISUALS[option.id] || []).map(src => `<img src="${src}" alt="" />`).join('')}</span>
                    </div>
                `;
                card.addEventListener('click', () => {
                    if (!isHost || option.id === selectedBoardId) return;
                    socket.emit('host-set-board-map', { boardId: option.id });
                    setLobbyPopupOpen('map', false);
                });
                grid.appendChild(card);
            });
        });
    }

    function renderModeControls(state) {
        const previewGrid = document.getElementById('mode-grid');
        const hostGrid = document.getElementById('host-mode-grid');
        const isHost = isLobbyHost(state);
        const modes = Array.isArray(state?.modeOptions) && state.modeOptions.length ? state.modeOptions : LOBBY_MODES;

        [previewGrid, hostGrid].forEach((grid) => {
            if (!grid) return;
            grid.innerHTML = '';

            modes.forEach((mode) => {
                const isSelected = Boolean(mode.isSelected);
                const isAvailable = mode.isAvailable !== false;
                const card = document.createElement('button');
                card.type = 'button';
                card.className = `mode-card${isSelected ? ' is-active' : ''}${isHost && isAvailable ? ' is-clickable' : ' is-disabled'}`;
                card.disabled = !isHost || !isAvailable;
                card.innerHTML = `
                    <div>
                        <div class="mode-name">${escapeHtmlAttr(mode.name)}</div>
                        <div class="mode-desc">${escapeHtmlAttr(mode.description || '')}</div>
                    </div>
                    <div class="mode-badge">${isSelected ? 'Selected' : isAvailable ? 'Host Pick' : 'Soon'}</div>
                `;
                card.addEventListener('click', () => {
                    if (!isHost || !isAvailable || isSelected) return;
                    socket.emit('host-set-lobby-mode', { modeId: mode.id });
                    setLobbyPopupOpen('mode', false);
                });
                grid.appendChild(card);
            });
        });
    }

    function renderMatchInfo(state) {
        const grid = document.getElementById('match-info-grid');
        if (!grid) return;
        const selectedBoardName = state?.boardOptions?.find(option => option.id === state?.selectedBoardId)?.name || 'Egypt';
        const items = [
            { label: 'Room Code', value: state?.roomCode || '------' },
            { label: 'Players', value: `${state?.joinedPlayerCount || 0} joined` },
            { label: 'Host', value: state?.hostName || 'Host' },
            { label: 'Map', value: selectedBoardName }
        ];
        grid.innerHTML = items.map(item => `
            <div class="match-info-item">
                <div class="match-info-label">${escapeHtmlAttr(item.label)}</div>
                <div class="match-info-value">${escapeHtmlAttr(item.value)}</div>
            </div>
        `).join('');
    }

    function renderHostControlsPanel(state) {
        const panel = document.getElementById('host-controls-panel');
        const copy = document.getElementById('host-controls-copy');
        const botSummary = document.getElementById('host-bot-summary');
        if (!panel || !copy || !botSummary) return;

        const isHost = isLobbyHost(state);
        const botCount = state?.players?.filter(player => player.isBot).length || 0;
        panel.classList.toggle('host-controls-readonly', !isHost);
        copy.textContent = isHost
            ? 'You are the host. Choose the map, manage bots, and launch the room.'
            : 'Only the host can edit the map, bots, and launch the match.';
        botSummary.textContent = botCount > 0
            ? `${botCount} bot${botCount === 1 ? '' : 's'} currently in the lobby.`
            : 'No bots in lobby.';
    }

    function renderControlDock(state) {
        const selectedBoard = state?.boardOptions?.find(option => option.id === state?.selectedBoardId)
            || state?.boardOptions?.find(option => option.isSelected)
            || null;
        const selectedMode = state?.modeOptions?.find(option => option.isSelected)
            || null;
        const modeName = document.getElementById('mode-current-name');
        const modeCopy = document.getElementById('mode-current-copy');
        const mapName = document.getElementById('map-current-name');
        const mapCopy = document.getElementById('map-current-copy');
        const modeBtn = document.getElementById('open-mode-popup-btn');
        const mapBtn = document.getElementById('open-map-popup-btn');
        const isHost = isLobbyHost(state);

        if (modeName) modeName.textContent = selectedMode?.name || state?.selectedModeName || 'Classic';
        if (modeCopy) modeCopy.textContent = selectedMode?.description || 'Current room mode.';
        if (mapName) mapName.textContent = selectedBoard?.name || 'Egypt';
        if (mapCopy) mapCopy.textContent = selectedBoard?.description || 'Current board selection.';

        if (modeBtn) {
            modeBtn.disabled = false;
            modeBtn.classList.toggle('readonly', !isHost);
            modeBtn.textContent = isHost ? 'CHANGE MODE' : 'VIEW MODE';
        }
        if (mapBtn) {
            mapBtn.disabled = false;
            mapBtn.classList.toggle('readonly', !isHost);
            mapBtn.textContent = isHost ? 'CHANGE MAP' : 'VIEW MAP';
        }
    }

    function renderPartyReadyList(state) {
        const list = document.getElementById('party-ready-list');
        if (!list) return;

        const members = (Array.isArray(state?.members) ? state.members : [])
            .filter(member => member.character)
            .slice(0, 4);

        list.innerHTML = members.map(member => `
            <div class="party-ready-row ${member.isReady ? 'is-ready' : 'is-waiting'}">
                <span class="party-ready-name">${escapeHtmlAttr(member.name || member.character || 'Player')}</span>
                <span class="party-ready-state">${member.isReady ? 'Ready' : 'Not Ready'}</span>
            </div>
        `).join('');
    }

    function renderPartyLobby(state) {
        renderCharacterSelectSummary(state);
        renderPartySlotsPanel(state);
        renderMatchInfo(state);
        renderBoardVotes(state);
        renderModeControls(state);
        renderHostControlsPanel(state);
        renderControlDock(state);
        renderPartyReadyList(state);
    }

    function renderCharacterSelectSummary(state) {
        const title = document.getElementById('character-select-selection-title');
        const copy = document.getElementById('character-select-selection-copy');
        const confirmBtn = document.getElementById('confirm-character-btn');
        if (!title || !copy || !confirmBtn) return;

        const draftChampionId = getSelectedChampionId();
        const draftSkinId = getSelectedSkinId();
        const confirmedMember = getMyLobbyMember(state);
        const selectedColorLabel = getSelectedLobbyColor()?.toUpperCase() || 'Default';

        if (!draftChampionId) {
            title.textContent = 'No Champion Locked';
            copy.textContent = 'Choose a champion first, tweak the token color if you want, then confirm to enter the party lobby.';
            confirmBtn.disabled = true;
            confirmBtn.classList.add('disabled');
            confirmBtn.textContent = 'CONFIRM SELECTION';
            return;
        }

        const alreadyConfirmed = confirmedMember?.character === draftChampionId
            && (confirmedMember?.skinId || null) === (draftSkinId || null);

        title.textContent = getCharacterDisplayName(draftChampionId);
        copy.textContent = `${getCharacterSkinTitle(draftChampionId, draftSkinId)} • Token color: ${selectedColorLabel}. ${alreadyConfirmed ? 'Selection confirmed. Enter the party lobby when you are ready.' : 'Confirm to lock this loadout and move into the party lobby.'}`;
        confirmBtn.disabled = false;
        confirmBtn.classList.remove('disabled');
        confirmBtn.textContent = alreadyConfirmed ? 'ENTER PARTY LOBBY' : 'CONFIRM SELECTION';
    }

    function renderPartySlots(state) {
        const slotsEl = document.getElementById('party-lobby-slots');
        const hintEl = document.getElementById('party-slot-hint');
        const stageStatusEl = document.getElementById('party-stage-status');
        if (!slotsEl || !hintEl) return;

        const members = Array.isArray(state?.members) ? state.members : [];
        const filledSlots = members.slice(0, 4);
        const readyCount = filledSlots.filter(member => member.character && member.isReady).length;
        const selectedCount = filledSlots.filter(member => member.character).length;

        hintEl.textContent = selectedCount
            ? `${readyCount}/${selectedCount} players ready. The host can launch once at least two selected players are ready.`
            : 'Invite players to the room, then everyone can lock in and ready up here.';
        if (stageStatusEl) {
            stageStatusEl.textContent = selectedCount
                ? `${selectedCount} confirmed loadout${selectedCount === 1 ? '' : 's'} on stage. Ready players glow brighter when they are locked in.`
                : 'Confirmed champions appear here while everyone readies up for the match.';
        }

        slotsEl.innerHTML = '';

        filledSlots.forEach((member, index) => {
            const card = document.createElement('article');
            const hasCharacter = Boolean(member.character);
            const skinMeta = getChampionSkinMeta(member.character, member.skinId, getLobbyMemberAvatar(member));
            card.className = hasCharacter
                ? `party-slot-card${member.isReady ? ' is-ready' : ''} rarity-${skinMeta.rarity || 'common'}`
                : 'party-slot-card is-empty';

            if (!hasCharacter) {
                card.innerHTML = `
                    <div class="party-slot-badge">Slot ${index + 1}</div>
                    <div>Waiting for player</div>
                `;
                slotsEl.appendChild(card);
                return;
            }

            const displayName = member.name || getCharacterDisplayName(member.character);
            const roleLabel = `${getCharacterDisplayName(member.character)} • ${getCharacterSkinTitle(member.character, member.skinId)}`;
            const tags = [member.isHost ? 'Host' : 'Member', member.isBot ? 'Bot' : (member.isOnline ? 'Online' : 'Offline')].join(' • ');
            card.innerHTML = `
                <div class="party-slot-top">
                    <div class="party-slot-badge">Slot ${index + 1}</div>
                    <div class="party-slot-state ${member.isReady ? 'is-ready' : 'is-waiting'}">${member.isReady ? 'Ready' : 'Not Ready'}</div>
                </div>
                <div class="party-slot-player">
                    <img class="party-slot-avatar" src="${getLobbyMemberAvatar(member)}" alt="${escapeHtmlAttr(displayName)}" />
                    <div>
                        <div class="party-slot-name">${escapeHtmlAttr(displayName)}</div>
                        <div class="party-slot-role">${escapeHtmlAttr(roleLabel)}</div>
                    </div>
                </div>
                <div class="party-slot-meta">
                    <div class="party-slot-copy">${escapeHtmlAttr(tags)}</div>
                    <div class="party-slot-token">${escapeHtmlAttr(getTokenLabel(member.tokenId))}</div>
                </div>
                <div class="party-slot-footer">
                    <div class="party-slot-copy">${member.boardVoteId ? `Map Vote • ${member.boardVoteId.toUpperCase()}` : 'No map vote yet'}</div>
                </div>
            `;
            slotsEl.appendChild(card);
        });

        for (let index = filledSlots.length; index < 4; index += 1) {
            const card = document.createElement('article');
            card.className = 'party-slot-card is-empty';
            card.innerHTML = `
                <div class="party-slot-badge">Slot ${index + 1}</div>
                <div>Open lobby slot</div>
            `;
            slotsEl.appendChild(card);
        }
    }

    function renderPartySlotsPanel(state) {
        const slotsEl = document.getElementById('party-lobby-slots');
        const hintEl = document.getElementById('party-slot-hint');
        const stageStatusEl = document.getElementById('party-stage-status');
        if (!slotsEl || !hintEl) return;

        const members = Array.isArray(state?.members) ? state.members : [];
        const filledSlots = members.slice(0, 6);
        const readyCount = filledSlots.filter(member => member.character && member.isReady).length;
        const selectedCount = filledSlots.filter(member => member.character).length;

        hintEl.textContent = selectedCount
            ? `${readyCount}/${selectedCount} players ready. The host can launch once at least two selected players are ready.`
            : 'Invite players to the room, then everyone can lock in and ready up here.';
        if (stageStatusEl) {
            stageStatusEl.textContent = selectedCount
                ? `${selectedCount} confirmed loadout${selectedCount === 1 ? '' : 's'} on stage. Ready players glow brighter when they are locked in.`
                : 'Confirmed champions appear here while everyone readies up for the match.';
        }

        slotsEl.innerHTML = '';

        filledSlots.forEach((member, index) => {
            const card = document.createElement('article');
            if (!member.character) {
                card.className = 'party-slot-card is-empty';
                card.innerHTML = `
                    <div class="party-slot-empty-plus">+</div>
                    <div class="party-slot-badge">Slot ${index + 1}</div>
                    <div class="party-slot-empty-title">Waiting for player</div>
                    <div class="party-slot-empty-copy">Invite link holders can join this room and appear here.</div>
                `;
                slotsEl.appendChild(card);
                return;
            }

            const skinMeta = getChampionSkinMeta(member.character, member.skinId, getLobbyMemberAvatar(member));
            const displayName = member.name || getCharacterDisplayName(member.character);
            const roleLabel = `${getCharacterDisplayName(member.character)} • ${skinMeta.title}`;
            const tags = [
                member.isBot ? 'Bot' : (member.isOnline ? 'Online' : 'Offline'),
                `Rarity ${String(skinMeta.rarity || 'common').toUpperCase()}`
            ].join(' • ');
            const isLocalPlayer = member.playerId === myPlayerId;
            const rarityClass = `rarity-${skinMeta.rarity || 'common'}`;

            card.className = `party-slot-card ${rarityClass}${member.isReady ? ' is-ready' : ' is-waiting'}${member.isHost ? ' is-host-player' : ''}${isLocalPlayer ? ' is-local-player' : ''}`;
            card.innerHTML = `
                <div class="party-slot-spotlight"></div>
                <div class="party-slot-fog"></div>
                <div class="party-slot-light-streak"></div>
                <div class="party-slot-aura"></div>
                <div class="party-slot-underlight"></div>
                <div class="party-slot-frame"></div>
                <div class="party-slot-top">
                    <div class="party-slot-badge-row">
                        <div class="party-slot-badge">${`Slot ${index + 1}`}</div>
                        ${member.isHost ? '<div class="party-slot-host-badge">Crown Host</div>' : ''}
                        ${isLocalPlayer ? '<div class="party-slot-you-badge">You</div>' : ''}
                    </div>
                    <div class="party-slot-state ${member.isReady ? 'is-ready' : 'is-waiting'}">${member.isReady ? 'READY' : 'NOT READY'}</div>
                </div>
                <div class="party-slot-stage">
                    <div class="party-slot-portrait-shell">
                        <div class="party-slot-pedestal-shadow"></div>
                        <div class="party-slot-pedestal-glow"></div>
                        <div class="party-slot-pedestal-ring"></div>
                        <div class="party-slot-pedestal"></div>
                        <div class="party-slot-portrait-glow"></div>
                        <div class="party-slot-character-wrap">
                            <img class="party-slot-avatar" src="${skinMeta.image}" alt="${escapeHtmlAttr(displayName)}" />
                        </div>
                    </div>
                    <div class="party-slot-player">
                        <div class="party-slot-name">${escapeHtmlAttr(displayName)}</div>
                        <div class="party-slot-role">${escapeHtmlAttr(roleLabel)}</div>
                        <div class="party-slot-copy">${escapeHtmlAttr(tags)}</div>
                    </div>
                </div>
                <div class="party-slot-meta">
                    <div class="party-slot-meta-chip">
                        <span class="party-slot-meta-label">Token</span>
                        <span class="party-slot-token">${escapeHtmlAttr(getTokenLabel(member.tokenId))}</span>
                    </div>
                    <div class="party-slot-meta-chip">
                        <span class="party-slot-meta-label">Skin Tier</span>
                        <span class="party-slot-token">${escapeHtmlAttr(String(skinMeta.rarity || 'common').toUpperCase())}</span>
                    </div>
                </div>
                <div class="party-slot-footer">
                    <div class="party-slot-copy">${member.isHost ? 'Room leader' : 'Party member'}</div>
                    <div class="party-slot-copy">${member.isReady ? 'Loadout locked in' : 'Awaiting ready signal'}</div>
                </div>
            `;
            slotsEl.appendChild(card);
        });

        for (let index = filledSlots.length; index < 6; index += 1) {
            const card = document.createElement('article');
            card.className = 'party-slot-card is-empty';
            card.innerHTML = `
                <div class="party-slot-empty-plus">+</div>
                <div class="party-slot-badge">Slot ${index + 1}</div>
                <div class="party-slot-empty-title">Open lobby slot</div>
                <div class="party-slot-empty-copy">Waiting for another challenger to join the room.</div>
            `;
            slotsEl.appendChild(card);
        }
    }

    function updateStatus(state) {
        const statusEl     = document.getElementById('lobby-status');
        const readySummaryEl = document.getElementById('party-ready-summary');
        const readyPlayers = state.players.filter(p => p.character && p.isReady);
        const selectedPlayers = state.players.filter(p => p.character);
        const count        = readyPlayers.length;
        const selectedCount = selectedPlayers.length;
        const botCount     = readyPlayers.filter(p => p.isBot).length;
        const totalBotCount = state.players.filter(p => p.isBot).length;
        const humanCount   = count - botCount;
        const everyoneReady = selectedCount > 0 && selectedPlayers.every(player => player.isReady);
        const isHost       = Boolean(state?.hostPlayerId && myPlayerId && state.hostPlayerId === myPlayerId);
        const myMember     = getMyLobbyMember(state);
        const amReady      = Boolean(myMember?.isReady);
        const selectedBoardName = state?.boardOptions?.find(option => option.id === state?.selectedBoardId)?.name || 'Egypt';
        const selectedModeName = state?.selectedModeName || 'Classic';

        if (selectedCount === 0) {
            statusEl.textContent = 'Awaiting party';
            readySummaryEl.textContent = 'No one has locked in a champion yet.';
        } else {
            const botText = botCount > 0 ? ` • ${botCount} BOTS` : '';
            statusEl.textContent = `${count} READY (${humanCount} HUMANS)${botText} • MAP ${selectedBoardName.toUpperCase()}`;
        }

        if (selectedCount > 0) {
            const botSummary = botCount > 0 ? ` • ${botCount} bots ready` : '';
            statusEl.textContent = `${count}/${selectedCount} ready`;
            readySummaryEl.textContent = `${humanCount} humans ready${botSummary} • map ${selectedBoardName}`;
        }

        if (selectedCount > 0 && readySummaryEl) {
            readySummaryEl.textContent = `${humanReadyCount} humans ready${totalBotCount > 0 ? ` • ${totalBotCount} bots in lobby` : ''} • map ${selectedBoardName}`;
        }

        const readyToggleBtn = document.getElementById('ready-toggle-btn');
        if (readyToggleBtn) {
            const canReady = Boolean(myMember?.character);
            readyToggleBtn.disabled = !canReady;
            readyToggleBtn.classList.toggle('disabled', !canReady);
            readyToggleBtn.textContent = !canReady
                ? 'LOCK IN A CHAMPION'
                : amReady
                    ? 'UNREADY'
                    : 'READY UP';
        }

        const startBtn = document.getElementById('start-game-btn');
        if (startBtn) {
            const disabled = !isHost || count < 2;
            startBtn.disabled = disabled;
            startBtn.classList.toggle('disabled', disabled);

            if (!isHost) {
                startBtn.textContent = count >= 2 ? `HOST STARTS ${selectedBoardName.toUpperCase()}` : 'WAITING FOR READY PLAYERS';
            } else if (count >= 2) {
                startBtn.textContent = `START ${selectedBoardName.toUpperCase()}`;
            } else {
                startBtn.textContent = 'NEED 2 READY PLAYERS';
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

        const selectedChampionTitle = document.getElementById('party-selected-champion');
        const selectedSkinTitle = document.getElementById('party-selected-skin');
        if (selectedChampionTitle && selectedSkinTitle) {
            if (myMember?.character) {
                selectedChampionTitle.textContent = getCharacterDisplayName(myMember.character);
                selectedSkinTitle.textContent = `${getCharacterSkinTitle(myMember.character, myMember.skinId)} • ${amReady ? 'Ready' : 'Not Ready'}`;
            } else {
                selectedChampionTitle.textContent = 'No champion selected';
                selectedSkinTitle.textContent = 'Return to character select to lock in your champion and skin.';
            }
        }
    }

    function updatePartyStatus(state) {
        const statusEl = document.getElementById('lobby-status');
        const readySummaryEl = document.getElementById('party-ready-summary');
        const startHintEl = document.getElementById('start-match-hint');
        const readyPlayers = state.players.filter(player => player.character && player.isReady);
        const selectedPlayers = state.players.filter(player => player.character);
        const count = readyPlayers.length;
        const selectedCount = selectedPlayers.length;
        const totalBotCount = state.players.filter(player => player.isBot).length;
        const humanReadyCount = readyPlayers.filter(player => !player.isBot).length;
        const everyoneReady = selectedCount > 0 && selectedPlayers.every(player => player.isReady);
        const isHost = isLobbyHost(state);
        const myMember = getMyLobbyMember(state);
        const amReady = Boolean(myMember?.isReady);
        const selectedBoardName = state?.boardOptions?.find(option => option.id === state?.selectedBoardId)?.name || 'Egypt';
        const selectedModeName = state?.selectedModeName || 'Classic';

        if (selectedCount === 0) {
            if (statusEl) statusEl.textContent = 'Awaiting party';
            if (readySummaryEl) readySummaryEl.textContent = 'No one has locked in a champion yet.';
        } else {
            if (statusEl) statusEl.textContent = `${count} / ${selectedCount} READY`;
            if (readySummaryEl) {
                readySummaryEl.textContent = `${humanReadyCount} humans ready${totalBotCount > 0 ? ` • ${totalBotCount} bots in lobby` : ''} • map ${selectedBoardName} • mode ${selectedModeName}`;
            }
        }

        const readyToggleBtn = document.getElementById('ready-toggle-btn');
        if (readyToggleBtn) {
            const canReady = Boolean(myMember?.character);
            readyToggleBtn.disabled = !canReady;
            readyToggleBtn.classList.toggle('disabled', !canReady);
            readyToggleBtn.classList.toggle('is-ready', canReady && amReady);
            readyToggleBtn.textContent = !canReady
                ? 'LOCK IN A CHAMPION'
                : amReady
                    ? 'NOT READY'
                    : 'READY';
        }

        const startBtn = document.getElementById('start-game-btn');
        if (startBtn) {
            const canStart = isHost && selectedCount >= 2 && everyoneReady;
            startBtn.disabled = !canStart;
            startBtn.classList.toggle('disabled', !canStart);
            startBtn.classList.toggle('is-ready-to-launch', canStart);
            if (!isHost) {
                startBtn.textContent = everyoneReady && selectedCount >= 2
                    ? `HOST STARTS ${selectedBoardName.toUpperCase()}`
                    : 'WAITING FOR HOST';
            } else if (canStart) {
                startBtn.textContent = `START ${selectedBoardName.toUpperCase()}`;
            } else if (selectedCount < 2) {
                startBtn.textContent = 'NEED 2 PLAYERS';
            } else {
                startBtn.textContent = 'WAIT FOR PARTY READY';
            }
        }

        if (startHintEl) {
            startHintEl.textContent = isHost
                ? (selectedCount < 2
                    ? 'Invite at least one more player before launching.'
                    : everyoneReady
                        ? 'Your party is fully ready. Launch the match when you want.'
                        : 'Every selected player must ready up before the match can begin.')
                : (myMember?.character
                    ? (amReady ? 'You are ready. Waiting on the rest of the party and the host.' : 'Ready up to signal that your loadout is locked in.')
                    : 'Lock in a champion before you can ready up.');
        }

        const addBotBtn = document.getElementById('add-bot-btn');
        if (addBotBtn) {
            addBotBtn.disabled = !isHost;
            addBotBtn.classList.toggle('disabled', !isHost);
        }

        const clearBotsBtn = document.getElementById('clear-bots-btn');
        if (clearBotsBtn) {
            const disabled = !isHost || totalBotCount === 0;
            clearBotsBtn.disabled = disabled;
            clearBotsBtn.classList.toggle('disabled', disabled);
        }

        const selectedChampionTitle = document.getElementById('party-selected-champion');
        const selectedSkinTitle = document.getElementById('party-selected-skin');
        if (selectedChampionTitle && selectedSkinTitle) {
            if (myMember?.character) {
                const skinMeta = getChampionSkinMeta(myMember.character, myMember.skinId, getLobbyMemberAvatar(myMember));
                selectedChampionTitle.textContent = getCharacterDisplayName(myMember.character);
                selectedSkinTitle.textContent = `${skinMeta.title} • ${String(skinMeta.rarity || 'common').toUpperCase()} • ${amReady ? 'Ready' : 'Not Ready'}`;
            } else {
                selectedChampionTitle.textContent = 'No champion selected';
                selectedSkinTitle.textContent = 'Return to character select to lock in your champion and skin.';
            }
        }
    }

    function renderHostControls(state) {
        syncHostControlsAvailability(state);

        const panel = document.getElementById('persistent-host-controls');
        const list = document.getElementById('host-player-list');
        if (!panel || !list) return;

        const isHost = Boolean(state?.hostPlayerId && myPlayerId && state.hostPlayerId === myPlayerId);
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

            const displayName = member.name || member.character || 'Unselected player';
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
                const targetLabel = member.name || member.character || 'this player';
                if (!window.confirm(`Kick ${targetLabel} from the room?`)) return;
                socket.emit('kick-player', { playerId: member.playerId });
            });

            list.appendChild(row);
        });
    }

    function bindButtons() {
        const confirmCharacterBtn = document.getElementById('confirm-character-btn');
        confirmCharacterBtn?.addEventListener('click', () => {
            const selectedChampionId = getSelectedChampionId();
            if (!selectedChampionId) return;

            const selectedSkinId = getSelectedSkinId();
            const myMember = getMyLobbyMember();
            const desiredColor = getSelectedLobbyColor();
            const alreadyConfirmed = myMember?.character === selectedChampionId
                && (myMember?.skinId || null) === (selectedSkinId || null)
                && (normalizeHexColor(myMember?.customColor) || null) === desiredColor;

            if (alreadyConfirmed) {
                setCurrentScreen('party-lobby');
                return;
            }

            const selectData = {
                name: selectedChampionId,
                skinId: selectedSkinId,
                customColor: desiredColor
            };

            if (selectedChampionId === 'custom') {
                buildCustomCharacterPayload(selectData);
            }

            socket.emit('select-character', selectData);
        });

        const changeChampionBtn = document.getElementById('change-champion-btn');
        changeChampionBtn?.addEventListener('click', () => {
            const myMember = getMyLobbyMember();
            if (myMember?.isReady) {
                socket.emit('set-player-ready', { isReady: false });
            }
            if (myMember?.character) {
                socket.emit('deselect-character');
            }
            setSelectedChampion(null);
            setCurrentScreen('character-select');
            if (lobbyState) {
                renderCharacters(lobbyState);
                renderCharacterSelectSummary(lobbyState);
            }
        });

        document.getElementById('open-map-popup-btn')?.addEventListener('click', () => {
            setLobbyPopupOpen('map', true);
        });

        document.getElementById('close-mode-popup-btn')?.addEventListener('click', () => setLobbyPopupOpen('mode', false));
        document.getElementById('close-map-popup-btn')?.addEventListener('click', () => setLobbyPopupOpen('map', false));
        document.querySelectorAll('[data-popup-close]').forEach((el) => {
            el.addEventListener('click', () => setLobbyPopupOpen(el.getAttribute('data-popup-close'), false));
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                closeAllLobbyPopups();
            }
        });

        const readyToggleBtn = document.getElementById('ready-toggle-btn');
        readyToggleBtn?.addEventListener('click', () => {
            const myMember = getMyLobbyMember();
            if (!myMember?.character) return;
            socket.emit('set-player-ready', { isReady: !myMember.isReady });
        });

        const startBtn = document.getElementById('start-game-btn');
        startBtn?.addEventListener('click', () => {
            if (startBtn.disabled) return;
            window.dispatchEvent(new CustomEvent('lobby-start-requested'));
            socket.emit('requestStartGame');
        });

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
            setHostControlsOpen(!hostControlsOpen);
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
            if (lobbyState) renderCharacterSelectSummary(lobbyState);
            persistSelectedCharacterColor();
        });

        picker.addEventListener('input', () => {
            selectedCustomColor = normalizeHexColor(picker.value) || '#ffffff';
            syncCustomColorControls();
            if (lobbyState) renderCharacterSelectSummary(lobbyState);
            persistSelectedCharacterColor();
        });

        syncCustomColorControls();
    }

    function setHostControlsOpen(isOpen) {
        const panel = document.getElementById('persistent-host-controls');
        const toggle = document.getElementById('host-controls-toggle');
        if (!panel) return;

        hostControlsOpen = Boolean(isOpen);
        panel.classList.toggle('is-collapsed', !hostControlsOpen);
        if (toggle) {
            toggle.setAttribute('aria-expanded', String(hostControlsOpen));
            toggle.textContent = hostControlsOpen ? 'Hide Host Controls' : 'Open Host Controls';
        }
    }

    function syncHostControlsAvailability(state) {
        const shell = document.getElementById('host-controls-shell');
        const isHost = Boolean(state?.hostPlayerId && myPlayerId && state.hostPlayerId === myPlayerId);
        shell?.classList.toggle('hidden', !isHost);

        if (!isHost) {
            hostControlsOpen = true;
            const panel = document.getElementById('persistent-host-controls');
            panel?.classList.remove('is-collapsed');
        }

        setHostControlsOpen(hostControlsOpen);
    }

    function showError(message) {
        const overlay = document.getElementById('error-overlay');
        const msgEl   = document.getElementById('error-message');
        msgEl.textContent = message;
        overlay.classList.remove('hidden');
    }

    function ensureChampionModal() {
        if (document.getElementById('champion-profile-modal')) return;

        const modal = document.createElement('div');
        modal.id = 'champion-profile-modal';
        modal.className = 'modal-overlay champion-profile-modal hidden';
        modal.innerHTML = `
            <div class="champion-profile-card">
                <button type="button" class="champion-profile-close" aria-label="Close champion profile">X</button>
                <div class="champion-profile-content"></div>
            </div>
        `;

        const host = document.getElementById('lobby-screen') || document.body;
        host.appendChild(modal);

        modal.addEventListener('click', (event) => {
            if (event.target === modal) closeChampionModal();
        });

        modal.querySelector('.champion-profile-close')?.addEventListener('click', closeChampionModal);

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') closeChampionModal();
        });
    }

    function updateChampionModalContent(modalState) {
        const { modal, content, cardState } = modalState || {};
        if (!modal || !content || !cardState) return;

        const characterName = cardState.characterName;
        const stats = CHARACTER_STATS[characterName];
        const profile = cardState.profile || CHARACTER_CARD_PROFILE[characterName] || CHARACTER_CARD_PROFILE.custom;
        const currentSkin = cardState.currentSkin;
        const rarity = currentSkin?.rarity || CHARACTER_RARITY[characterName] || 'common';
        const display = CHARACTER_DISPLAY[characterName] || characterName;
        if (!stats || !profile) return;

        const statMarkup = (currentSkin?.stats || profile.stats).map((item) => `
            <div class="champion-modal-stat">
                <span class="champion-modal-stat-icon">${item.icon}</span>
                <div>
                    <div class="champion-modal-stat-label">${escapeHtmlAttr(item.label)}</div>
                    <div class="champion-modal-stat-value">${item.value}/10</div>
                </div>
            </div>
        `).join('');

        const skinsMarkup = cardState.skins.map((skin, index) => `
            <button type="button" class="champion-skin-slot ${index === cardState.skinIndex ? 'is-active' : ''}" data-skin-index="${index}">
                <div class="champion-skin-thumb" style="background-image:url('${skin.image}')"></div>
                <div class="champion-skin-name">${escapeHtmlAttr(skin.title)}</div>
            </button>
        `).join('');

        content.innerHTML = `
            <div class="champion-profile-hero rarity-${rarity}">
                <div class="champion-profile-portrait">
                    <button type="button" class="champion-profile-arrow champion-profile-arrow-left ${cardState.skins.length > 1 ? '' : 'hidden'}" aria-label="Previous skin">‹</button>
                    <button type="button" class="champion-profile-arrow champion-profile-arrow-right ${cardState.skins.length > 1 ? '' : 'hidden'}" aria-label="Next skin">›</button>
                    <img src="${currentSkin?.image}" alt="${escapeHtmlAttr(display)}" class="champion-profile-avatar ${characterName === 'custom' ? 'custom-avatar' : ''}" />
                </div>
                <div class="champion-profile-header">
                    <div class="champion-profile-rarity">${rarity}</div>
                    <h2 class="champion-profile-name">${escapeHtmlAttr(display)}</h2>
                    <div class="champion-profile-skin-name">${escapeHtmlAttr(currentSkin?.title || profile.role)}</div>
                    <div class="champion-profile-role">${escapeHtmlAttr(profile.role || stats.trait)}</div>
                    <div class="champion-profile-archetype">${escapeHtmlAttr(profile.archetype)}</div>
                    <div class="champion-profile-trait">${escapeHtmlAttr(stats.trait)}</div>
                    <p class="champion-profile-summary">${escapeHtmlAttr(profile.playstyle)}</p>
                </div>
            </div>
            <div class="champion-profile-grid">
                <section class="champion-profile-panel">
                    <h3>Champion Identity</h3>
                    <div class="champion-profile-feature-title">${escapeHtmlAttr(profile.role || stats.trait)}</div>
                    <p>${escapeHtmlAttr(stats.trait)} - ${escapeHtmlAttr(profile.ability)}</p>
                </section>
                <section class="champion-profile-panel">
                    <h3>Champion Stats</h3>
                    <div class="champion-modal-stats-grid">${statMarkup}</div>
                </section>
                <section class="champion-profile-panel">
                    <h3>Signature Edge</h3>
                    <div class="champion-profile-feature-title">${escapeHtmlAttr(profile.passive)}</div>
                    <p>${escapeHtmlAttr(profile.ability)}</p>
                </section>
                <section class="champion-profile-panel">
                    <h3>Market Behavior</h3>
                    <p>${escapeHtmlAttr(profile.businessBehavior)}</p>
                    <div class="champion-behavior-row">
                        <span>Sells:</span>
                        <strong>${escapeHtmlAttr(profile.sellStyle)}</strong>
                    </div>
                    <div class="champion-behavior-row">
                        <span>Mindset:</span>
                        <strong>${escapeHtmlAttr(profile.mindset)}</strong>
                    </div>
                </section>
                <section class="champion-profile-panel">
                    <h3>Playstyle</h3>
                    <div class="champion-profile-feature-title">${escapeHtmlAttr(profile.archetype)}</div>
                    <p>${escapeHtmlAttr(profile.playstyle)}</p>
                    <p>${escapeHtmlAttr(stats.quote)}</p>
                </section>
                <section class="champion-profile-panel champion-skins-panel">
                    <div class="champion-panel-head">
                        <h3>Skins</h3>
                        <span>Future Skin System</span>
                    </div>
                    <div class="champion-skin-carousel">${skinsMarkup}</div>
                </section>
            </div>
        `;

        content.querySelector('.champion-profile-arrow-left')?.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            cardState.applySkin(cardState.skinIndex - 1, { animate: true, playSound: true });
        });
        content.querySelector('.champion-profile-arrow-right')?.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            cardState.applySkin(cardState.skinIndex + 1, { animate: true, playSound: true });
        });
        content.querySelectorAll('.champion-skin-slot').forEach((button) => {
            button.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                const nextIndex = Number(button.dataset.skinIndex);
                if (Number.isFinite(nextIndex)) {
                    cardState.applySkin(nextIndex, { animate: true, playSound: true });
                }
            });
        });
    }

    function openChampionModal(cardState) {
        const modal = document.getElementById('champion-profile-modal');
        const content = modal?.querySelector('.champion-profile-content');
        if (!modal || !content || !cardState) return;
        currentChampionModalState = { modal, content, cardState };
        updateChampionModalContent(currentChampionModalState);
        modal.classList.remove('hidden');
        modal.classList.add('show');
    }

    function closeChampionModal() {
        const modal = document.getElementById('champion-profile-modal');
        if (!modal || modal.classList.contains('hidden')) return;
        modal.classList.remove('show');
        modal.classList.add('hidden');
        currentChampionModalState = null;
        playLobbySound('playPopupClose');
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
        closeChampionModal();
        document.getElementById('lobby-screen').classList.add('hidden');
    }

    function showLobby() {
        document.getElementById('lobby-screen').classList.remove('hidden');
        syncCurrentScreen();
    }

    function getSelectedCharacter() { return getSelectedChampionId(); }

    return { init, hideLobby, showLobby, getSelectedCharacter, getChampionSkinMeta };
})();
