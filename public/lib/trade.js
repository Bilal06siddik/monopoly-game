// ═══════════════════════════════════════════════════════════
//  TRADE — Player-to-player trading system
// ═══════════════════════════════════════════════════════════

const TradeSystem = (() => {
    let socket = null;
    let myPlayerId = null;
    let currentPlayers = [];
    let currentProperties = [];
    let targetPlayerId = null;
    let counterTradeId = null;
    let inboxTrades = new Map();

    function init(socketInstance) {
        socket = socketInstance;
        document.getElementById('trade-cancel-btn').addEventListener('click', closeTradeModal);
        document.getElementById('trade-send-btn').addEventListener('click', sendOffer);
        document.getElementById('trade-my-cash').addEventListener('input', updateOfferSummary);
        document.getElementById('trade-target-cash').addEventListener('input', updateOfferSummary);
    }

    function updatePlayerId(id) {
        myPlayerId = id;
    }

    function updateState(players, properties) {
        currentPlayers = players;
        currentProperties = properties;
        updateOfferSummary();
    }

    function getPlayer(playerId) {
        return currentPlayers.find(player => player.id === playerId);
    }

    function upgradeLabel(property) {
        if (!property || property.houses === 0) return '';
        if (property.houses >= 5) return '🏨';
        return '🏠'.repeat(property.houses);
    }

    function isTransferLocked(property) {
        return property?.type === 'property'
            && Boolean(property.colorGroup)
            && currentProperties.some(tile => tile.type === 'property' && tile.colorGroup === property.colorGroup && tile.houses > 0);
    }

    function showValidation(message = '', type = 'info') {
        const element = document.getElementById('trade-validation');
        if (!element) return;
        if (!message) {
            element.className = 'trade-validation hidden';
            element.textContent = '';
            return;
        }
        element.className = `trade-validation ${type}`;
        element.textContent = message;
    }

    function updateOfferSummary() {
        const summary = document.getElementById('trade-summary');
        if (!summary) return;

        const offerCash = Number.parseInt(document.getElementById('trade-my-cash')?.value || '0', 10) || 0;
        const requestCash = Number.parseInt(document.getElementById('trade-target-cash')?.value || '0', 10) || 0;
        const mySelected = [...document.querySelectorAll('#trade-my-props .trade-prop-btn.selected')];
        const theirSelected = [...document.querySelectorAll('#trade-target-props .trade-prop-btn.selected')];

        const offeringParts = [];
        if (offerCash > 0) offeringParts.push(`$${offerCash}`);
        if (mySelected.length > 0) offeringParts.push(`${mySelected.length} property${mySelected.length > 1 ? 'ies' : ''}`);

        const requestingParts = [];
        if (requestCash > 0) requestingParts.push(`$${requestCash}`);
        if (theirSelected.length > 0) requestingParts.push(`${theirSelected.length} property${theirSelected.length > 1 ? 'ies' : ''}`);

        const offeringText = offeringParts.length > 0 ? offeringParts.join(' + ') : 'nothing';
        const requestingText = requestingParts.length > 0 ? requestingParts.join(' + ') : 'nothing';

        summary.textContent = counterTradeId
            ? `Counter-offer: you give ${offeringText} for ${requestingText}.`
            : `Offer summary: you give ${offeringText} for ${requestingText}.`;
    }

    function validateComposer() {
        const modal = document.getElementById('trade-modal');
        const targetId = modal.dataset.targetId;
        const me = getPlayer(myPlayerId);
        const target = getPlayer(targetId);
        if (!me || !target) {
            return { ok: false, message: 'Trade participants are no longer available.' };
        }
        if (target.isBot) {
            return { ok: false, message: 'Bots do not accept trades in test games yet.' };
        }

        const offerProperties = [...document.querySelectorAll('#trade-my-props .trade-prop-btn.selected')]
            .map(button => Number.parseInt(button.dataset.tileIndex, 10));
        const requestProperties = [...document.querySelectorAll('#trade-target-props .trade-prop-btn.selected')]
            .map(button => Number.parseInt(button.dataset.tileIndex, 10));
        const offerCash = Number.parseInt(document.getElementById('trade-my-cash').value || '0', 10) || 0;
        const requestCash = Number.parseInt(document.getElementById('trade-target-cash').value || '0', 10) || 0;

        if (offerCash < 0 || requestCash < 0) {
            return { ok: false, message: 'Trade cash values cannot be negative.' };
        }
        if (offerCash > me.money) {
            return { ok: false, message: 'You do not have enough cash for this offer.' };
        }
        if (requestCash > target.money) {
            return { ok: false, message: `${target.character} does not have that much cash right now.` };
        }
        if (offerProperties.length === 0 && requestProperties.length === 0 && offerCash === 0 && requestCash === 0) {
            return { ok: false, message: 'Add cash or property before sending a trade.' };
        }

        return {
            ok: true,
            offer: {
                targetId,
                offerProperties,
                offerCash,
                requestProperties,
                requestCash,
                counterToTradeId: counterTradeId || null
            }
        };
    }

    function buildPropertyButton(property, side) {
        const button = document.createElement('button');
        button.className = 'trade-prop-btn';
        button.dataset.tileIndex = property.index;
        const icon = upgradeLabel(property);
        const locked = isTransferLocked(property);
        button.innerHTML = locked
            ? `<span>${property.name}<br><small>Set has buildings</small></span><span class="trade-prop-upgrade-icon">${icon || 'Locked'}</span>`
            : `<span>${property.name}${property.isMortgaged ? '<br><small>Mortgaged</small>' : ''}</span><span class="trade-prop-upgrade-icon">${icon}</span>`;

        if (locked) {
            button.disabled = true;
            button.style.opacity = '0.45';
            button.style.cursor = 'not-allowed';
            button.title = 'Sell all buildings in this color group before trading this property.';
            return button;
        }

        button.addEventListener('click', () => {
            button.classList.toggle('selected');
            updateOfferSummary();
        });
        if (side === 'mine' && property.isMortgaged) {
            button.title = 'Mortgaged properties can still be traded.';
        }
        return button;
    }

    function populateTradeColumn(containerId, properties, side) {
        const container = document.getElementById(containerId);
        if (!container) return;

        container.innerHTML = '';
        if (properties.length === 0) {
            container.innerHTML = '<div style="color:var(--text-dim);font-size:12px;">No properties</div>';
            return;
        }

        properties.forEach(property => {
            container.appendChild(buildPropertyButton(property, side));
        });
    }

    function openTradeModal(targetId, options = {}) {
        const modal = document.getElementById('trade-modal');
        if (!modal) return;

        const me = getPlayer(myPlayerId);
        const target = getPlayer(targetId);
        if (!me || !target) return;
        if (target.isBot) {
            Notifications.show('Bots do not accept trades in test games yet.', 'error', 2500);
            return;
        }

        targetPlayerId = targetId;
        counterTradeId = options.counterTradeId || null;
        modal.dataset.targetId = targetId;

        const myProperties = currentProperties.filter(property => property.owner === myPlayerId);
        const targetProperties = currentProperties.filter(property => property.owner === targetId);
        const avatarMap = { Bilo: '🎩', Os: '🏎️', Ziko: '🐕', Maro: '⚓' };

        document.getElementById('trade-my-avatar').textContent = avatarMap[me.character] || '🧑';
        document.getElementById('trade-my-name').textContent = me.character;
        document.getElementById('trade-my-cash-display').textContent = `$${me.money}`;
        document.getElementById('trade-target-avatar').textContent = avatarMap[target.character] || '🧑';
        document.getElementById('trade-target-name').textContent = target.character;
        document.getElementById('trade-target-cash-display').textContent = `$${target.money}`;

        populateTradeColumn('trade-my-props', myProperties, 'mine');
        populateTradeColumn('trade-target-props', targetProperties, 'theirs');

        document.getElementById('trade-my-cash').value = 0;
        document.getElementById('trade-target-cash').value = 0;
        showValidation('');

        const modeLabel = document.getElementById('trade-mode-label');
        if (modeLabel) {
            modeLabel.textContent = counterTradeId ? 'Counter-offer' : 'New offer';
        }

        modal.classList.remove('hidden');
        modal.classList.add('show');

        if (options.prefillOffer) {
            prefillFromOffer(options.prefillOffer);
        } else {
            updateOfferSummary();
        }
    }

    function prefillFromOffer(offer) {
        (offer.requestProperties || []).forEach(index => {
            const button = document.querySelector(`#trade-my-props .trade-prop-btn[data-tile-index="${index}"]`);
            if (button && !button.disabled) button.click();
        });
        (offer.offerProperties || []).forEach(index => {
            const button = document.querySelector(`#trade-target-props .trade-prop-btn[data-tile-index="${index}"]`);
            if (button && !button.disabled) button.click();
        });
        document.getElementById('trade-my-cash').value = offer.requestCash || 0;
        document.getElementById('trade-target-cash').value = offer.offerCash || 0;
        updateOfferSummary();
    }

    function closeTradeModal() {
        const modal = document.getElementById('trade-modal');
        modal.classList.remove('show');
        modal.classList.add('hidden');
        counterTradeId = null;
        targetPlayerId = null;
        showValidation('');
    }

    function sendOffer() {
        const validation = validateComposer();
        if (!validation.ok) {
            showValidation(validation.message, 'error');
            return;
        }

        const isCounterOffer = Boolean(counterTradeId);
        showValidation('');
        socket.emit('trade-offer', validation.offer);
        closeTradeModal();
        Notifications.show(isCounterOffer ? 'Counter-offer sent!' : 'Trade offer sent!', 'info', 3000);
    }

    function updateTradeCount() {
        const countSpan = document.getElementById('trades-count');
        if (countSpan) countSpan.textContent = String(inboxTrades.size);
    }

    function removeTradeCard(cardId) {
        const card = document.getElementById(cardId);
        if (card) card.remove();
        inboxTrades.delete(cardId.replace('tc-', ''));
        updateTradeCount();
    }

    function renderTradeCard(offer) {
        const tradesContent = document.getElementById('trades-content');
        if (!tradesContent) return;

        const cardId = `tc-${offer.id}`;
        const existing = document.getElementById(cardId);
        if (existing) existing.remove();

        inboxTrades.set(offer.id, offer);

        const card = document.createElement('div');
        card.className = 'trade-card';
        card.id = cardId;

        const avatarMap = { Bilo: '🎩', Os: '🏎️', Ziko: '🐕', Maro: '⚓' };
        const avatar = avatarMap[offer.fromCharacter] || '👤';

        let offerString = '';
        if (offer.offerCash > 0) offerString += `<span style="color:var(--accent-gold)">$${offer.offerCash}</span> `;
        (offer.offerProperties || []).forEach(index => {
            const property = currentProperties.find(item => item.index === index);
            if (property) offerString += `<span style="color:var(--accent-green)">${property.name}</span> `;
        });
        if (!offerString) offerString = 'Nothing';

        let requestString = '';
        if (offer.requestCash > 0) requestString += `<span style="color:var(--accent-gold)">$${offer.requestCash}</span> `;
        (offer.requestProperties || []).forEach(index => {
            const property = currentProperties.find(item => item.index === index);
            if (property) requestString += `<span style="color:var(--accent-green)">${property.name}</span> `;
        });
        if (!requestString) requestString = 'Nothing';

        card.innerHTML = `
            <div class="tc-header">
                <span class="pdm-event-avatar" style="width:24px;height:24px;font-size:12px;border:none;">${avatar}</span>
                <span>${offer.isCounterOffer ? 'Counter-offer' : 'Offer'} from ${offer.fromCharacter}</span>
            </div>
            <div class="tc-body">
                <div class="tc-offer"><strong>They offer:</strong> ${offerString}</div>
                <div class="tc-request"><strong>They want:</strong> ${requestString}</div>
            </div>
            <div class="tc-footer">
                <button class="tc-btn accept">Accept</button>
                <button class="tc-btn decline">Decline</button>
                <button class="tc-btn negotiate">Counter</button>
            </div>
        `;

        card.querySelector('.accept').addEventListener('click', () => {
            removeTradeCard(cardId);
            socket.emit('trade-accept', { tradeId: offer.id });
        });
        card.querySelector('.decline').addEventListener('click', () => {
            removeTradeCard(cardId);
            socket.emit('trade-reject', { tradeId: offer.id });
        });
        card.querySelector('.negotiate').addEventListener('click', () => {
            openTradeModal(offer.fromId, {
                counterTradeId: offer.id,
                prefillOffer: offer
            });
        });

        tradesContent.prepend(card);
        updateTradeCount();
        document.getElementById('tab-trades')?.click();
    }

    function showIncomingTrade(offer) {
        renderTradeCard(offer);
    }

    function replaceTrades(trades = []) {
        inboxTrades = new Map();
        const container = document.getElementById('trades-content');
        if (container) container.innerHTML = '';
        trades.forEach(renderTradeCard);
        updateTradeCount();
    }

    function handleTradeInvalidated(data) {
        removeTradeCard(`tc-${data.tradeId}`);
        if (counterTradeId && counterTradeId === data.tradeId) {
            showValidation(data.message, 'error');
            counterTradeId = null;
        }
        Notifications.show(data.message, 'error', 3000);
    }

    function handleTradeValidation(data) {
        if (data?.message) {
            showValidation(data.message, data.ok === false ? 'error' : 'info');
        }
    }

    function dismissTrade(tradeId) {
        removeTradeCard(`tc-${tradeId}`);
    }

    return {
        init,
        updatePlayerId,
        updateState,
        openTradeModal,
        closeTradeModal,
        showIncomingTrade,
        replaceTrades,
        handleTradeInvalidated,
        handleTradeValidation,
        dismissTrade
    };
})();
