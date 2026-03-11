// ═══════════════════════════════════════════════════════════
//  TRADE — Player-to-player trading system
// ═══════════════════════════════════════════════════════════

const TradeSystem = (() => {
    let socket = null;
    let mySocketId = null;
    let currentPlayers = [];
    let currentProperties = [];
    let targetPlayerId = null;
    let mySelectedProps = new Set();
    let theirSelectedProps = new Set();

    function init(socketInstance) {
        socket = socketInstance;
        mySocketId = socket.id;

        document.getElementById('trade-cancel-btn').addEventListener('click', closeTradeModal);
        document.getElementById('trade-send-btn').addEventListener('click', sendOffer);
        document.getElementById('trade-accept-btn')?.addEventListener('click', () => { });
        document.getElementById('trade-reject-btn')?.addEventListener('click', () => { });
    }

    function updateSocketId(id) {
        mySocketId = id;
    }

    function updateState(players, properties) {
        currentPlayers = players;
        currentProperties = properties;
    }

    // ── Upgrade level label ────────────────────────────────
    function upgradeLabel(prop) {
        if (!prop || prop.houses === 0) return '';
        if (prop.houses >= 5) return '🏨';
        return '🏠'.repeat(prop.houses);
    }

    // ── Open Trade Modal ───────────────────────────────────
    function openTradeModal(targetId) {
        const modal = document.getElementById('trade-modal');
        if (!modal) return;

        targetPlayerId = targetId;
        mySelectedProps.clear();
        theirSelectedProps.clear();

        const me = currentPlayers.find(p => p.id === mySocketId);
        const target = currentPlayers.find(p => p.id === targetId);
        if (!me || !target) return;

        const myProperties = currentProperties.filter(p => p.owner === mySocketId);
        const targetProperties = currentProperties.filter(p => p.owner === targetId);

        // Populate left (my) column
        const myAva = document.getElementById('trade-my-avatar');
        const myName = document.getElementById('trade-my-name');
        const myCashDisplay = document.getElementById('trade-my-cash-display');
        const myPropsEl = document.getElementById('trade-my-props');
        const avatarMap = { 'Bilo': '🟣', 'Os': '🟠', 'Ziko': '🟢', 'Maro': '🟡' };

        if (myAva) myAva.textContent = avatarMap[me.character] || '🧑';
        if (myName) myName.textContent = me.character;
        if (myCashDisplay) myCashDisplay.textContent = `$${me.money}`;
        if (myPropsEl) {
            myPropsEl.innerHTML = '';
            if (myProperties.length === 0) {
                myPropsEl.innerHTML = '<div style="color:var(--text-dim);font-size:12px;">No properties</div>';
            }
            myProperties.forEach(prop => {
                const btn = document.createElement('button');
                btn.className = 'trade-prop-btn';
                btn.dataset.tileIndex = prop.index;
                const upg = upgradeLabel(prop);
                btn.innerHTML = `<span>${prop.name}</span><span class="trade-prop-upgrade-icon">${upg}</span>`;
                btn.addEventListener('click', () => {
                    if (mySelectedProps.has(prop.index)) {
                        mySelectedProps.delete(prop.index);
                        btn.classList.remove('selected');
                    } else {
                        mySelectedProps.add(prop.index);
                        btn.classList.add('selected');
                    }
                });
                myPropsEl.appendChild(btn);
            });
        }

        // Populate right (target) column
        const targAva = document.getElementById('trade-target-avatar');
        const targName = document.getElementById('trade-target-name');
        const targCashDisplay = document.getElementById('trade-target-cash-display');
        const targPropsEl = document.getElementById('trade-target-props');

        if (targAva) targAva.textContent = avatarMap[target.character] || '🧑';
        if (targName) targName.textContent = target.character;
        if (targCashDisplay) targCashDisplay.textContent = `$${target.money}`;
        if (targPropsEl) {
            targPropsEl.innerHTML = '';
            if (targetProperties.length === 0) {
                targPropsEl.innerHTML = '<div style="color:var(--text-dim);font-size:12px;">No properties</div>';
            }
            targetProperties.forEach(prop => {
                const btn = document.createElement('button');
                btn.className = 'trade-prop-btn';
                btn.dataset.tileIndex = prop.index;
                const upg = upgradeLabel(prop);
                btn.innerHTML = `<span>${prop.name}</span><span class="trade-prop-upgrade-icon">${upg}</span>`;
                btn.addEventListener('click', () => {
                    if (theirSelectedProps.has(prop.index)) {
                        theirSelectedProps.delete(prop.index);
                        btn.classList.remove('selected');
                    } else {
                        theirSelectedProps.add(prop.index);
                        btn.classList.add('selected');
                    }
                });
                targPropsEl.appendChild(btn);
            });
        }

        // Reset cash inputs
        document.getElementById('trade-my-cash').value = 0;
        document.getElementById('trade-target-cash').value = 0;

        modal.dataset.targetId = targetId;
        modal.classList.remove('hidden');
        modal.classList.add('show');
    }

    function closeTradeModal() {
        const modal = document.getElementById('trade-modal');
        modal.classList.remove('show');
        modal.classList.add('hidden');
    }

    function sendOffer() {
        const modal = document.getElementById('trade-modal');
        const targetId = modal.dataset.targetId;

        const mySelectedProps = [...document.querySelectorAll('#trade-my-props .trade-prop-btn.selected')]
            .map(btn => parseInt(btn.dataset.tileIndex));
        const targetSelectedProps = [...document.querySelectorAll('#trade-target-props .trade-prop-btn.selected')]
            .map(btn => parseInt(btn.dataset.tileIndex));
        const offerCash = parseInt(document.getElementById('trade-my-cash').value) || 0;
        const requestCash = parseInt(document.getElementById('trade-target-cash').value) || 0;

        socket.emit('trade-offer', {
            targetId,
            offerProperties: mySelectedProps,
            offerCash,
            requestProperties: targetSelectedProps,
            requestCash
        });

        closeTradeModal();
        Notifications.show('Trade offer sent!', 'info', 3000);
    }

    function updateTradeCount() {
        const count = document.querySelectorAll('.trade-card').length;
        const countSpan = document.getElementById('trades-count');
        if (countSpan) countSpan.textContent = count;
    }

    function removeTradeCard(id) {
        const card = document.getElementById(id);
        if (card) {
            card.remove();
            updateTradeCount();
        }
    }

    // ── Incoming Trade Modal → Trade Card ──────────────────────────────
    function showIncomingTrade(offer) {
        const tradesContent = document.getElementById('trades-content');
        if (!tradesContent) return;

        const cardId = 'tc-' + offer.fromId;
        removeTradeCard(cardId);

        const card = document.createElement('div');
        card.className = 'trade-card';
        card.id = cardId;

        const avatarMap = { 'Bilo': '🎩', 'Os': '🏎️', 'Ziko': '🐕', 'Maro': '⚓' };
        const ava = avatarMap[offer.fromCharacter] || '👤';

        let offerStr = '';
        if (offer.offerCash > 0) offerStr += `<span style="color:var(--accent-gold)">$${offer.offerCash}</span> `;
        (offer.offerProperties || []).forEach(idx => {
            const p = currentProperties.find(x => x.index === idx);
            if (p) offerStr += `<span style="color:var(--accent-green)">${p.name}</span> `;
        });
        if (!offerStr) offerStr = 'Nothing';

        let reqStr = '';
        if (offer.requestCash > 0) reqStr += `<span style="color:var(--accent-gold)">$${offer.requestCash}</span> `;
        (offer.requestProperties || []).forEach(idx => {
            const p = currentProperties.find(x => x.index === idx);
            if (p) reqStr += `<span style="color:var(--accent-green)">${p.name}</span> `;
        });
        if (!reqStr) reqStr = 'Nothing';

        card.innerHTML = `
            <div class="tc-header">
                <span class="pdm-event-avatar" style="width:24px;height:24px;font-size:12px;border:none;">${ava}</span>
                <span>Offer from ${offer.fromCharacter}</span>
            </div>
            <div class="tc-body">
                <div class="tc-offer"><strong>They offer:</strong> ${offerStr}</div>
                <div class="tc-request"><strong>They want:</strong> ${reqStr}</div>
            </div>
            <div class="tc-footer">
                <button class="tc-btn accept">Accept</button>
                <button class="tc-btn decline">Decline</button>
                <button class="tc-btn negotiate">Negotiate</button>
            </div>
        `;

        const btnAccept = card.querySelector('.accept');
        const btnDecline = card.querySelector('.decline');
        const btnNegotiate = card.querySelector('.negotiate');

        btnAccept.addEventListener('click', () => {
            socket.emit('trade-accept', offer); // aliased to backend receiver
            removeTradeCard(cardId);
            document.getElementById('tab-history')?.click();
        });

        btnDecline.addEventListener('click', () => {
            socket.emit('trade-reject', { fromId: offer.fromId }); // aliased to backend receiver
            removeTradeCard(cardId);
        });

        btnNegotiate.addEventListener('click', () => {
            document.getElementById('tab-history')?.click();
            openTradeModal(offer.fromId);
            
            setTimeout(() => {
                (offer.requestProperties || []).forEach(idx => {
                    const btn = document.querySelector(`#trade-my-props .trade-prop-btn[data-tile-index="${idx}"]`);
                    if (btn) btn.click();
                });
                (offer.offerProperties || []).forEach(idx => {
                    const btn = document.querySelector(`#trade-target-props .trade-prop-btn[data-tile-index="${idx}"]`);
                    if (btn) btn.click();
                });
                document.getElementById('trade-my-cash').value = offer.requestCash || 0;
                document.getElementById('trade-target-cash').value = offer.offerCash || 0;
            }, 50);
            removeTradeCard(cardId);
        });

        tradesContent.prepend(card);
        updateTradeCount();
        
        // Optionally switch to Trades tab when offer arrives
        document.getElementById('tab-trades')?.click();
    }

    return { init, updateSocketId, updateState, openTradeModal, closeTradeModal, showIncomingTrade };
})();
