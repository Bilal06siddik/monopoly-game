// ═══════════════════════════════════════════════════════════
//  DEV PANEL — Local-only shortcuts for faster feature testing
// ═══════════════════════════════════════════════════════════

const DevPanel = (() => {
    let socket = null;
    let currentState = null;
    let enabled = false;
    let panelOpen = false;

    const refs = {};
    const DEFAULT_STATUS = 'Local-only dev tools are ready.';

    function isEnabledContext() {
        const params = new URLSearchParams(window.location.search);
        const host = window.location.hostname;
        return params.get('dev') === '1' || host === 'localhost' || host === '127.0.0.1';
    }

    function init(socketInstance) {
        socket = socketInstance;
        enabled = isEnabledContext();
        cacheRefs();

        if (!enabled || !refs.panel || !refs.toggle) return;

        bindEvents();
        setStatus('Start a game to use dev tools.');

        socket.on('game-error', (data) => {
            setStatus(data?.message || 'Dev command failed.', true);
        });
    }

    function cacheRefs() {
        refs.toggle = document.getElementById('dev-panel-toggle');
        refs.panel = document.getElementById('dev-panel');
        refs.close = document.getElementById('dev-panel-close');
        refs.status = document.getElementById('dev-panel-status');
        refs.playerSelect = document.getElementById('dev-player-select');
        refs.playerSummary = document.getElementById('dev-player-summary');
        refs.moneyInput = document.getElementById('dev-money-input');
        refs.tileSelect = document.getElementById('dev-tile-select');
        refs.tileSummary = document.getElementById('dev-tile-summary');
        refs.houseCount = document.getElementById('dev-house-count');
        refs.groupSelect = document.getElementById('dev-color-group-select');
        refs.setMoneyBtn = document.getElementById('dev-set-money-btn');
        refs.setTurnBtn = document.getElementById('dev-set-turn-btn');
        refs.toggleJailBtn = document.getElementById('dev-toggle-jail-btn');
        refs.teleportBtn = document.getElementById('dev-teleport-btn');
        refs.giveTileBtn = document.getElementById('dev-give-tile-btn');
        refs.clearTileBtn = document.getElementById('dev-clear-tile-btn');
        refs.toggleMortgageBtn = document.getElementById('dev-toggle-mortgage-btn');
        refs.setHousesBtn = document.getElementById('dev-set-houses-btn');
        refs.claimGroupBtn = document.getElementById('dev-claim-group-btn');
    }

    function bindEvents() {
        refs.toggle.addEventListener('click', () => {
            panelOpen = !panelOpen;
            applyVisibility();
        });

        refs.close.addEventListener('click', () => {
            panelOpen = false;
            applyVisibility();
        });

        refs.playerSelect.addEventListener('change', () => {
            syncSelectedPlayer();
            updateActionAvailability();
        });

        refs.tileSelect.addEventListener('change', () => {
            syncSelectedTile();
            updateActionAvailability();
        });

        refs.groupSelect.addEventListener('change', updateActionAvailability);

        refs.setMoneyBtn.addEventListener('click', () => {
            const player = getSelectedPlayer();
            const amount = parseInt(refs.moneyInput.value, 10);
            if (!player || Number.isNaN(amount)) {
                setStatus('Choose a player and enter a valid money amount.', true);
                return;
            }
            runCommand('set-money', { playerId: player.id, amount }, `Money set request sent for ${player.character}.`);
        });

        refs.setTurnBtn.addEventListener('click', () => {
            const player = getSelectedPlayer();
            if (!player) {
                setStatus('Choose a player first.', true);
                return;
            }
            runCommand('set-current-turn', { playerId: player.id }, `${player.character} is being moved to the active turn.`);
        });

        refs.toggleJailBtn.addEventListener('click', () => {
            const player = getSelectedPlayer();
            if (!player) {
                setStatus('Choose a player first.', true);
                return;
            }
            runCommand('toggle-jail', { playerId: player.id }, `Jail state toggle sent for ${player.character}.`);
        });

        refs.teleportBtn.addEventListener('click', () => {
            const player = getSelectedPlayer();
            const tile = getSelectedTile();
            if (!player || !tile) {
                setStatus('Choose both a player and a tile.', true);
                return;
            }
            runCommand('set-position', { playerId: player.id, tileIndex: tile.index }, `${player.character} is moving to tile ${tile.index}.`);
        });

        refs.giveTileBtn.addEventListener('click', () => {
            const player = getSelectedPlayer();
            const tile = getSelectedTile();
            if (!player || !tile || !isPurchasable(tile)) {
                setStatus('Choose a player and a purchasable tile first.', true);
                return;
            }
            runCommand('set-owner', { playerId: player.id, tileIndex: tile.index }, `${player.character} is being given ${tile.name}.`);
        });

        refs.clearTileBtn.addEventListener('click', () => {
            const tile = getSelectedTile();
            if (!tile || !isPurchasable(tile)) {
                setStatus('Choose a purchasable tile first.', true);
                return;
            }
            runCommand('clear-owner', { tileIndex: tile.index }, `${tile.name} is being reset back to the bank.`);
        });

        refs.toggleMortgageBtn.addEventListener('click', () => {
            const tile = getSelectedTile();
            if (!tile || !isPurchasable(tile) || !tile.owner) {
                setStatus('Select an owned purchasable tile to toggle mortgage.', true);
                return;
            }
            runCommand('toggle-mortgage', { tileIndex: tile.index }, `Mortgage toggle sent for ${tile.name}.`);
        });

        refs.setHousesBtn.addEventListener('click', () => {
            const tile = getSelectedTile();
            const houses = parseInt(refs.houseCount.value, 10);
            if (!tile || tile.type !== 'property') {
                setStatus('Choose a street property to edit buildings.', true);
                return;
            }
            if (!tile.owner && houses > 0) {
                setStatus('Give the property an owner before adding buildings.', true);
                return;
            }
            runCommand('set-houses', { tileIndex: tile.index, houses }, `Building level update sent for ${tile.name}.`);
        });

        refs.claimGroupBtn.addEventListener('click', () => {
            const player = getSelectedPlayer();
            const colorGroup = refs.groupSelect.value;
            if (!player || !colorGroup) {
                setStatus('Choose a player and a group first.', true);
                return;
            }
            runCommand('claim-color-group', { playerId: player.id, colorGroup }, `${player.character} is claiming the ${formatGroupName(colorGroup)} group.`);
        });
    }

    function applyVisibility() {
        const hasGame = Boolean(currentState?.isGameStarted);
        refs.toggle.classList.toggle('hidden', !enabled || !hasGame);
        refs.toggle.classList.toggle('active', panelOpen && hasGame);
        refs.panel.classList.toggle('hidden', !enabled || !hasGame || !panelOpen);
    }

    function updateState(state) {
        if (!enabled) return;

        currentState = state;

        if (!state?.isGameStarted) {
            panelOpen = false;
            populatePlayers();
            populateTiles();
            populateGroups();
            syncSelectedPlayer();
            syncSelectedTile();
            updateActionAvailability();
            applyVisibility();
            setStatus('Start a game to use dev tools.');
            return;
        }

        populatePlayers();
        populateTiles();
        populateGroups();
        syncSelectedPlayer();
        syncSelectedTile();
        updateActionAvailability();
        applyVisibility();

        if (!refs.status.textContent || refs.status.textContent === 'Start a game to use dev tools.') {
            setStatus(DEFAULT_STATUS);
        }
    }

    function populatePlayers() {
        const selectedId = refs.playerSelect.value;
        refs.playerSelect.innerHTML = '';

        if (!currentState?.players?.length) {
            refs.playerSelect.innerHTML = '<option value="">No players</option>';
            return;
        }

        currentState.players.forEach((player) => {
            const option = document.createElement('option');
            option.value = player.id;
            option.textContent = `${player.character}${player.id === currentState.currentPlayerId ? ' (Turn)' : ''}${player.isActive ? '' : ' - OUT'}`;
            refs.playerSelect.appendChild(option);
        });

        refs.playerSelect.value = currentState.players.some((player) => player.id === selectedId)
            ? selectedId
            : (currentState.currentPlayerId || currentState.players[0].id);
    }

    function populateTiles() {
        const selectedIndex = refs.tileSelect.value;
        refs.tileSelect.innerHTML = '';

        const properties = currentState?.properties || GameBoard.getTileData() || [];
        if (!properties.length) {
            refs.tileSelect.innerHTML = '<option value="">No tiles</option>';
            return;
        }

        properties.forEach((tile) => {
            const option = document.createElement('option');
            option.value = String(tile.index);
            option.textContent = `${tile.index}. ${tile.name}`;
            refs.tileSelect.appendChild(option);
        });

        if (properties.some((tile) => String(tile.index) === selectedIndex)) {
            refs.tileSelect.value = selectedIndex;
            return;
        }

        const player = getSelectedPlayer();
        refs.tileSelect.value = player ? String(player.position) : String(properties[0].index);
    }

    function populateGroups() {
        const selectedGroup = refs.groupSelect.value;
        refs.groupSelect.innerHTML = '';

        const groups = [];
        const seen = new Set();

        (currentState?.properties || []).forEach((tile) => {
            if (!tile.colorGroup || seen.has(tile.colorGroup)) return;
            seen.add(tile.colorGroup);
            groups.push(tile.colorGroup);
        });

        if (groups.length === 0) {
            refs.groupSelect.innerHTML = '<option value="">No groups</option>';
            return;
        }

        groups.forEach((group) => {
            const option = document.createElement('option');
            option.value = group;
            option.textContent = formatGroupName(group);
            refs.groupSelect.appendChild(option);
        });

        refs.groupSelect.value = groups.includes(selectedGroup) ? selectedGroup : groups[0];
    }

    function syncSelectedPlayer() {
        const player = getSelectedPlayer();

        if (!player) {
            refs.playerSummary.textContent = 'No player selected.';
            refs.moneyInput.value = '';
            refs.toggleJailBtn.textContent = 'Toggle Jail';
            return;
        }

        refs.moneyInput.value = player.money;
        refs.toggleJailBtn.textContent = player.inJail ? 'Release Jail' : 'Send Jail';
        refs.playerSummary.textContent = [
            `Cash: $${player.money}`,
            `Tile: ${player.position}`,
            player.inJail ? `In jail (${player.jailTurns}/3)` : 'Free',
            player.isActive ? 'Active' : 'Out'
        ].join(' | ');
    }

    function syncSelectedTile() {
        const tile = getSelectedTile();

        if (!tile) {
            refs.tileSummary.textContent = 'No tile selected.';
            refs.houseCount.value = '0';
            refs.toggleMortgageBtn.textContent = 'Toggle Mortgage';
            return;
        }

        refs.houseCount.value = String(tile.houses || 0);
        refs.toggleMortgageBtn.textContent = tile.isMortgaged ? 'Unmortgage' : 'Mortgage';

        const owner = tile.owner ? currentState.players.find((player) => player.id === tile.owner) : null;
        const ownerText = owner ? owner.character : 'Bank';
        const buildingText = tile.type === 'property'
            ? (tile.houses >= 5 ? 'Hotel' : `${tile.houses || 0} house${tile.houses === 1 ? '' : 's'}`)
            : tile.type;

        refs.tileSummary.textContent = [
            `Type: ${tile.type}`,
            `Owner: ${ownerText}`,
            `Price: $${tile.price || 0}`,
            tile.type === 'property' ? `Buildings: ${buildingText}` : null,
            tile.isMortgaged ? 'Mortgaged' : 'Unmortgaged'
        ].filter(Boolean).join(' | ');
    }

    function updateActionAvailability() {
        const hasGame = Boolean(currentState?.isGameStarted);
        const player = getSelectedPlayer();
        const tile = getSelectedTile();
        const hasOwnedTile = Boolean(tile?.owner);
        const propertyTile = tile?.type === 'property';
        const purchasableTile = isPurchasable(tile);

        refs.setMoneyBtn.disabled = !hasGame || !player;
        refs.setTurnBtn.disabled = !hasGame || !player || !player.isActive;
        refs.toggleJailBtn.disabled = !hasGame || !player || !player.isActive;
        refs.teleportBtn.disabled = !hasGame || !player || !tile;
        refs.giveTileBtn.disabled = !hasGame || !player || !purchasableTile;
        refs.clearTileBtn.disabled = !hasGame || !purchasableTile;
        refs.toggleMortgageBtn.disabled = !hasGame || !purchasableTile || !hasOwnedTile;
        refs.houseCount.disabled = !hasGame || !propertyTile;
        refs.setHousesBtn.disabled = !hasGame || !propertyTile;
        refs.claimGroupBtn.disabled = !hasGame || !player || !player.isActive || !refs.groupSelect.value;
    }

    function isPurchasable(tile) {
        return tile && (tile.type === 'property' || tile.type === 'railroad' || tile.type === 'utility');
    }

    function getSelectedPlayer() {
        if (!currentState?.players?.length) return null;
        return currentState.players.find((player) => player.id === refs.playerSelect.value) || null;
    }

    function getSelectedTile() {
        if (!currentState?.properties?.length) return null;
        const tileIndex = parseInt(refs.tileSelect.value, 10);
        if (Number.isNaN(tileIndex)) return null;
        return currentState.properties.find((tile) => tile.index === tileIndex) || null;
    }

    function runCommand(type, payload, statusText) {
        if (!enabled || !socket) return;
        if (!currentState?.isGameStarted) {
            setStatus('Start a game before using dev tools.', true);
            return;
        }

        socket.emit('dev-command', { type, ...payload });
        setStatus(statusText);
    }

    function formatGroupName(group) {
        const overrides = {
            lightblue: 'Light Blue',
            darkblue: 'Dark Blue'
        };
        if (overrides[group]) return overrides[group];
        return group.charAt(0).toUpperCase() + group.slice(1);
    }

    function setStatus(message, isError = false) {
        if (!refs.status) return;
        refs.status.textContent = message;
        refs.status.style.color = isError ? 'var(--accent-red)' : 'var(--text-secondary)';
    }

    return { init, updateState };
})();
