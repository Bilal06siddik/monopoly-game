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
    const viewedSkinByCharacter = new Map();

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
            if (lobbyState) {
                renderCharacters(lobbyState);
                renderTokens(lobbyState);
                renderBoardVotes(lobbyState);
            }
        });

        socket.on('lobby-update', (state) => {
            lobbyState = state;
            renderCharacters(state);
            renderTokens(state);
            renderBoardVotes(state);
            updateStatus(state);
            renderHostControls(state);
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
        if (!socket || !getSelectedChampionId()) return;
        socket.emit('update-custom-color', {
            customColor: getSelectedLobbyColor()
        });
    }

    function persistSelectedCharacterSkin(skinId) {
        if (!socket || !getSelectedChampionId() || !skinId) return;
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
                    socket.emit('deselect-character');
                    setSelectedChampion(null);
                    selectedToken = null;
                    return;
                }

                const selectData = {
                        name: char.name,
                        skinId: stateRef.currentSkin?.id || null,
                        customColor: getSelectedLobbyColor()
                };

                if (char.name === 'custom') {
                    buildCustomCharacterPayload(selectData);
                }

                socket.emit('select-character', selectData);
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
        const grid = document.getElementById('map-vote-grid');
        const hint = document.getElementById('map-vote-hint');
        if (!grid || !hint) return;

        const options = Array.isArray(state?.boardOptions) ? state.boardOptions : [];
        const members = Array.isArray(state?.members) ? state.members : [];
        const myVoteId = members.find(member => member.playerId === myPlayerId)?.boardVoteId || null;
        const selectedBoardId = state?.selectedBoardId || options.find(option => option.isSelected)?.id || 'egypt';

        hint.textContent = `Every human player gets one vote. Winning map: ${(options.find(option => option.id === selectedBoardId)?.name || 'Egypt').toUpperCase()}.`;
        grid.innerHTML = '';

        options.forEach(option => {
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'map-vote-card'
                + (option.id === myVoteId ? ' selected' : '')
                + (option.id === selectedBoardId ? ' leading' : '');
            card.innerHTML = `
                <div class="map-vote-title-row">
                    <h3 class="map-vote-name">${option.name}</h3>
                    <span class="map-vote-badge">${option.id === myVoteId ? 'Your Vote' : 'Vote'}</span>
                </div>
                <p class="map-vote-description">${option.description || 'Choose this map for the next match.'}</p>
                <div class="map-vote-meta">
                    <span class="map-vote-count">${option.votes} vote${option.votes === 1 ? '' : 's'}</span>
                    <span class="map-vote-visual">${(MAP_VISUALS[option.id] || []).map(src => `<img src="${src}" alt="" />`).join('')}</span>
                </div>
            `;

            card.addEventListener('click', () => {
                if (option.id === myVoteId) return;
                socket.emit('vote-board-map', { boardId: option.id });
            });

            grid.appendChild(card);
        });
    }

    function updateStatus(state) {
        const statusEl     = document.getElementById('lobby-status');
        const readyPlayers = state.players.filter(p => p.character);
        const count        = readyPlayers.length;
        const botCount     = readyPlayers.filter(p => p.isBot).length;
        const humanCount   = count - botCount;
        const isHost       = Boolean(state?.hostPlayerId && myPlayerId && state.hostPlayerId === myPlayerId);
        const selectedBoardName = state?.boardOptions?.find(option => option.id === state?.selectedBoardId)?.name || 'Egypt';

        if (count === 0) {
            statusEl.textContent = 'AWAITING PLAYERS...';
        } else {
            const botText = botCount > 0 ? ` • ${botCount} BOTS` : '';
            statusEl.textContent = `${count} READY (${humanCount} HUMANS)${botText} • MAP ${selectedBoardName.toUpperCase()}`;
        }

        const startBtn = document.getElementById('start-game-btn');
        if (startBtn) {
            const disabled = !isHost || count < 2;
            startBtn.disabled = disabled;
            startBtn.classList.toggle('disabled', disabled);

            if (!isHost) {
                startBtn.textContent = count >= 2 ? `HOST STARTS ${selectedBoardName.toUpperCase()}` : 'WAITING FOR HOST';
            } else if (count >= 2) {
                startBtn.textContent = `START ${selectedBoardName.toUpperCase()}`;
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
    }

    function getSelectedCharacter() { return getSelectedChampionId(); }

    return { init, hideLobby, showLobby, getSelectedCharacter };
})();
