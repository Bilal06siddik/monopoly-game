// ═══════════════════════════════════════════════════════════
//  AUCTION — 3-column auction modal with timer + bidding
// ═══════════════════════════════════════════════════════════

const AuctionSystem = (() => {
    let socket = null;
    let myPlayerId = null;
    let currentAuction = null;
    let currentPlayers = [];

    const DEFAULT_AUCTION_SECONDS = 15;
    const DEFAULT_BID_RESET_SECONDS = 5;
    const BID_INCREMENTS = [2, 5, 10, 25, 50, 100];

    function init(socketInstance) {
        socket = socketInstance;
    }

    function updatePlayerId(id) { myPlayerId = id; }

    function showAuction(auctionData, players) {
        currentAuction = auctionData.auction;
        currentPlayers = players;

        const modal = document.getElementById('auction-modal');

        // ── Left Column: Property Card ──────────────────────
        document.getElementById('auc-prop-name').textContent = currentAuction.tileName;
        document.getElementById('auc-prop-type').textContent =
            currentAuction.tileType === 'railroad' ? '🚂 Railroad' :
                currentAuction.tileType === 'utility' ? '⚡ Utility' : '🏠 Property';
        document.getElementById('auc-prop-price').textContent = `$${currentAuction.tilePrice}`;
        document.getElementById('auc-prop-rent').textContent = `$${currentAuction.tileRent}`;

        const colorDot = document.getElementById('auc-color-dot');
        const colorMap = {
            'brown': '#8B4513', 'lightblue': '#87CEEB', 'pink': '#DA70D6',
            'orange': '#FFA500', 'red': '#FF0000', 'yellow': '#FFFF00',
            'green': '#00AA00', 'darkblue': '#0000CC', 'railroad': '#555', 'utility': '#888'
        };
        colorDot.style.background = colorMap[currentAuction.tileColorGroup] || '#666';

        // ── Middle Column: Bidding ───────────────────────────
        updateBidDisplay();
        updateBidButtons();

        // ── Right Column: Players ───────────────────────────
        updatePlayerList();

        // Timer bar
        updateTimerBar(currentAuction.timeRemaining);

        modal.classList.remove('hidden');
        modal.classList.add('show');
    }

    function updateBidDisplay() {
        const bidderEl = document.getElementById('auc-current-bidder');
        const bidAmountEl = document.getElementById('auc-current-bid-amount');

        if (currentAuction.currentBidderId) {
            bidderEl.textContent = currentAuction.currentBidderCharacter;
            bidAmountEl.textContent = `$${currentAuction.currentBid}`;
        } else {
            bidderEl.textContent = 'No bids yet';
            bidAmountEl.textContent = `$${currentAuction.currentBid}`;
        }
    }

    function updateBidButtons() {
        const grid = document.getElementById('auc-bid-grid');
        grid.innerHTML = '';

        const me = currentPlayers.find(p => p.id === myPlayerId);
        const myMoney = me ? me.money : 0;

        BID_INCREMENTS.forEach(inc => {
            const newBid = currentAuction.currentBid + inc;
            const btn = document.createElement('button');
            btn.className = 'auc-bid-btn';
            btn.innerHTML = `<span class="auc-bid-total">$${newBid}</span><span class="auc-bid-inc">+$${inc}</span>`;

            if (myMoney < newBid) {
                btn.classList.add('disabled');
                btn.disabled = true;
            }

            btn.addEventListener('click', () => {
                if (btn.disabled) return;
                socket.emit('place-bid', { amount: newBid });
            });

            grid.appendChild(btn);
        });
    }

    function updatePlayerList() {
        const list = document.getElementById('auc-player-list');
        list.innerHTML = '';

        currentPlayers.forEach(p => {
            if (!p.isActive) return;
            const displayName = p.name || p.character;
            const el = document.createElement('div');
            el.className = `auc-player${p.id === currentAuction.currentBidderId ? ' leading' : ''}`;
            el.innerHTML = `
        <span class="auc-p-name" style="color:${p.color}">${displayName}</span>
        <span class="auc-p-money${p.money < 0 ? ' negative' : ''}">$${p.money}</span>
      `;
            list.appendChild(el);
        });
    }

    function getTimerMaxSeconds() {
        if (!currentAuction) return DEFAULT_AUCTION_SECONDS;
        if (currentAuction.timerMaxSeconds > 0) return currentAuction.timerMaxSeconds;
        if (currentAuction.currentBidderId) {
            return currentAuction.bidResetSeconds || DEFAULT_BID_RESET_SECONDS;
        }
        return DEFAULT_AUCTION_SECONDS;
    }

    function updateTimerBar(time) {
        const bar = document.getElementById('auc-timer-bar');
        const pct = Math.max(0, Math.min(100, (time / getTimerMaxSeconds()) * 100));
        bar.style.width = `${pct}%`;

        if (time <= 3) bar.style.background = 'var(--accent-red, #ff4444)';
        else if (time <= 7) bar.style.background = 'var(--accent-gold, #fdcb6e)';
        else bar.style.background = 'var(--accent-green, #55efc4)';

        document.getElementById('auc-timer-text').textContent = `${time}s`;
    }

    function onBid(data) {
        currentAuction = data.auction;
        if (data.gameState) {
            currentPlayers = data.gameState.players;
        }
        updateBidDisplay();
        updateBidButtons();
        updatePlayerList();
        updateTimerBar(currentAuction.timeRemaining);
    }

    function onTick(data) {
        if (currentAuction) {
            currentAuction.timeRemaining = data.timeRemaining;
        }
        updateTimerBar(data.timeRemaining);
    }

    function hideAuction() {
        const modal = document.getElementById('auction-modal');
        modal.classList.remove('show');
        modal.classList.add('hidden');
        currentAuction = null;
    }

    return { init, updatePlayerId, showAuction, onBid, onTick, hideAuction };
})();
