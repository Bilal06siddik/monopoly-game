// ═══════════════════════════════════════════════════════════
//  MODALS — Buy property modal + Action card flip animation
// ═══════════════════════════════════════════════════════════

const GameModals = (() => {
    let socket = null;

    function init(socketInstance) {
        socket = socketInstance;
        setupBuyModal();
    }

    // ── Buy Property Modal ────────────────────────────────
    function showBuyModal(data) {
        const modal = document.getElementById('buy-modal');
        const nameEl = document.getElementById('buy-prop-name');
        const priceEl = document.getElementById('buy-prop-price');
        const typeEl = document.getElementById('buy-prop-type');
        const buyBtn = document.getElementById('buy-btn');
        const passBtn = document.getElementById('pass-btn');

        nameEl.textContent = data.tileName;
        priceEl.textContent = `$${data.price}`;
        typeEl.textContent = data.tileType === 'railroad' ? '🚂 Railroad'
            : data.tileType === 'utility' ? '⚡ Utility'
                : `🏠 ${data.colorGroup || 'Property'}`;

        if (data.canAfford) {
            buyBtn.classList.remove('disabled');
            buyBtn.textContent = `Buy for $${data.price}`;
        } else {
            buyBtn.classList.add('disabled');
            buyBtn.textContent = 'Cannot Afford';
        }

        // Color accent
        const colorMap = {
            'brown': '#8B4513', 'lightblue': '#87CEEB', 'pink': '#DA70D6',
            'orange': '#FFA500', 'red': '#FF0000', 'yellow': '#FFFF00',
            'green': '#00AA00', 'darkblue': '#0000CC', 'railroad': '#555',
            'utility': '#888'
        };
        const accent = colorMap[data.colorGroup] || colorMap[data.tileType] || '#6c5ce7';
        modal.querySelector('.buy-modal-card').style.borderTopColor = accent;

        modal.classList.remove('hidden');
        modal.classList.add('show');

        // Store tile index for buy handler
        modal.dataset.tileIndex = data.tileIndex;
    }

    function hideBuyModal() {
        const modal = document.getElementById('buy-modal');
        modal.classList.remove('show');
        modal.classList.add('hidden');
    }

    function setupBuyModal() {
        document.getElementById('buy-btn').addEventListener('click', () => {
            const modal = document.getElementById('buy-modal');
            const tileIndex = parseInt(modal.dataset.tileIndex);
            if (document.getElementById('buy-btn').classList.contains('disabled')) return;
            socket.emit('buy-property', { tileIndex });
            hideBuyModal();
        });

        document.getElementById('pass-btn').addEventListener('click', () => {
            socket.emit('pass-property');
            hideBuyModal();
        });
    }

    // ── Action Card Modal (3D Flip Animation) ─────────────
    function showActionCard(card, result = {}, callback) {
        const overlay = document.getElementById('card-modal');
        const inner = document.getElementById('card-inner');
        const frontEmoji = document.getElementById('card-front-emoji');
        const backEmoji = document.getElementById('card-back-emoji');
        const backText = document.getElementById('card-back-text');
        const backAmount = document.getElementById('card-back-amount');

        // Reset
        inner.classList.remove('flipped');

        // Set front
        frontEmoji.textContent = '🃏';

        // Set back content
        backEmoji.textContent = card.emoji || '🎲';
        backText.textContent = result.detailText || card.text;

        if (result.amountLabel) {
            backAmount.textContent = result.amountLabel;
            const amountClass = result.amountLabel.startsWith('+')
                ? 'positive'
                : result.amountLabel.startsWith('-')
                    ? 'negative'
                    : 'neutral';
            backAmount.className = `card-amount ${amountClass}`;
        } else if (card.type === 'collect' || card.type === 'pay') {
            backAmount.textContent = card.type === 'collect'
                ? `+$${card.amount}`
                : `-$${card.amount}`;
            backAmount.className = `card-amount ${card.type === 'collect' ? 'positive' : 'negative'}`;
        } else {
            backAmount.textContent = card.text;
            backAmount.className = 'card-amount neutral';
        }

        // Show overlay
        overlay.classList.remove('hidden');
        overlay.classList.add('show');

        // Flip after a brief delay
        setTimeout(() => {
            inner.classList.add('flipped');
        }, 400);

        // Auto-dismiss after reading
        setTimeout(() => {
            overlay.classList.remove('show');
            overlay.classList.add('hidden');
            if (callback) callback();
        }, 4000);
    }

    // ── Rent Notification ─────────────────────────────────
    function showRentPaid(data, isMe, iAmOwner = false) {
        if (isMe) {
            Notifications.show(
                `Paid <strong>$${data.amount}</strong> rent to <strong>${data.ownerCharacter}</strong> for ${data.tileName}`,
                'error', 5000
            );
        } else if (iAmOwner) {
            Notifications.show(
                `<strong>${data.payerCharacter}</strong> paid you <strong>$${data.amount}</strong> rent for ${data.tileName}`,
                'success', 5000
            );
        }
    }

    // ── Tax Notification ──────────────────────────────────
    function showTaxPaid(data, isMe) {
        if (isMe) {
            Notifications.show(
                `Paid <strong>$${data.amount}</strong> in ${data.tileName}`,
                'error', 4000
            );
        }
    }

    // ── Bankruptcy Overlay ────────────────────────────────
    function showBankruptcy(data, isMe) {
        if (isMe) {
            Notifications.show('💀 You are BANKRUPT! Game over for you.', 'error', 8000);
        } else {
            Notifications.show(
                `💀 <strong>${data.character}</strong> went bankrupt!`,
                'hype', 5000
            );
        }
    }

    // ── Property Bought Notification ──────────────────────
    function showPropertyBought(data, isMe) {
        if (isMe) {
            Notifications.show(
                `🏠 You bought <strong>${data.tileName}</strong> for $${data.price}!`,
                'success', 4000
            );
        } else {
            Notifications.show(
                `🏠 <strong>${data.character}</strong> bought <strong>${data.tileName}</strong>`,
                'info', 3000
            );
        }
    }

    return {
        init, showBuyModal, hideBuyModal, showActionCard,
        showRentPaid, showTaxPaid, showBankruptcy, showPropertyBought
    };
})();
