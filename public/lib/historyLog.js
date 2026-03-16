// ═══════════════════════════════════════════════════════════
//  HISTORY LOG — Event tracker / chat box
// ═══════════════════════════════════════════════════════════

const HistoryLog = (() => {
    const MAX_EVENTS = 50;
    const events = [];
    let isExpanded = false;
    let isCollapsed = false;

    const TYPE_META = {
        roll: { icon: '🎲', label: 'Roll' },
        buy: { icon: '🏠', label: 'Buy' },
        sell: { icon: '💱', label: 'Sell' },
        rent: { icon: '💸', label: 'Rent' },
        tax: { icon: '🧾', label: 'Tax' },
        card: { icon: '🃏', label: 'Card' },
        auction: { icon: '🔨', label: 'Auction' },
        bid: { icon: '💵', label: 'Bid' },
        trade: { icon: '🤝', label: 'Trade' },
        pass: { icon: '⏭️', label: 'Pass' },
        bankrupt: { icon: '⚠️', label: 'Debt' },
        win: { icon: '🏆', label: 'Win' },
        system: { icon: '📣', label: 'System' },
        info: { icon: 'ℹ️', label: 'Info' }
    };

    function normalizeType(type) {
        const normalized = typeof type === 'string' ? type.trim().toLowerCase() : '';
        return TYPE_META[normalized] ? normalized : 'info';
    }

    function clipText(text, maxLength = 84) {
        if (text.length <= maxLength) return text;
        return `${text.slice(0, maxLength - 1)}…`;
    }

    function simplifyText(rawText, type) {
        let text = String(rawText || '')
            .replace(/\s+/g, ' ')
            .trim()
            .replace(/^[^A-Za-z0-9$]+/, '')
            .trim();

        if (!text) return 'Update';

        text = text.replace(/\s*\((gave .*?)\)\s*$/i, '');

        if (type === 'roll') {
            text = text.replace(
                /^(.+?) rolled (\d+) and went to (.+?)( \(DOUBLES!\))?$/i,
                (_match, player, total, tile, doublesSuffix = '') => `${player} rolled ${total} -> ${tile}${doublesSuffix ? ' (doubles)' : ''}`
            );
        }

        if (type === 'rent') {
            text = text.replace(
                /^(.+?) paid (\$\d+) rent to (.+?) for (.+)$/i,
                (_match, payer, amount, owner, tile) => `${payer} paid ${amount} to ${owner} (${tile})`
            );
        }

        if (type === 'buy') {
            text = text.replace(
                /^(.+?) bought (.+?) for (\$\d+)$/i,
                (_match, player, tile, amount) => `${player} bought ${tile} (${amount})`
            );
            text = text.replace(/ collected the (\$\d+) Bailout fund!?$/i, ' collected $1 bailout');
        }

        if (type === 'tax') {
            text = text.replace(
                /^(.+?) paid (\$\d+) in (.+)$/i,
                (_match, player, amount, source) => `${player} paid ${amount} tax (${source})`
            );
        }

        if (type === 'auction' || type === 'bid') {
            text = text
                .replace(/^Auction started for (.+)!$/i, 'Auction started: $1')
                .replace(/^No bids on (.+)\. Property remains unowned\.?$/i, 'No bids: $1 remains unowned')
                .replace(/^(.+?) won (.+?) for (\$\d+)!$/i, '$1 won $2 ($3)')
                .replace(/^(.+?) bid (\$\d+) on (.+)$/i, '$1 bid $2 ($3)');
        }

        if (type === 'trade') {
            text = text
                .replace(/^(.+?) offered a trade to (.+)$/i, '$1 offered trade -> $2')
                .replace(/^(.+?) accepted trade with (.+)!$/i, '$1 accepted trade with $2')
                .replace(/^(.+?) rejected trade from (.+)$/i, '$1 rejected trade from $2');
        }

        if (type === 'bankrupt') {
            text = text
                .replace(/! Recover before ending the turn or declare bankruptcy\.?$/i, '. Fix debt before turn end.')
                .replace(/ went BANKRUPT!/i, ' went bankrupt');
        }

        if (type === 'card') {
            text = text.replace(/^(.+?):\s*"(.+)"$/i, (_match, player, cardText) => `${player}: ${clipText(cardText, 56)}`);
        }

        if (type === 'pass') {
            text = text.replace(/^(.+?) passed on (.+)$/i, '$1 passed $2');
        }

        text = text
            .replace(/\s{2,}/g, ' ')
            .replace(/\s+([,.!?])/g, '$1')
            .trim();

        return clipText(text);
    }

    function init() {
        const expandBtn = document.getElementById('history-expand-btn');
        const collapseBtn = document.getElementById('history-collapse-btn');
        if (expandBtn) {
            expandBtn.addEventListener('click', () => {
                isExpanded = !isExpanded;
                syncExpandState();
                render();
            });
        }
        if (collapseBtn) {
            collapseBtn.addEventListener('click', () => {
                isCollapsed = !isCollapsed;
                syncExpandState();
            });
        }
        syncExpandState();
    }

    function render() {
        const container = document.getElementById('history-log-list');
        if (!container) return;

        container.innerHTML = '';
        const visibleEvents = [...events].reverse();
        visibleEvents.forEach(({ text, type }) => {
            const normalizedType = normalizeType(type);
            const meta = TYPE_META[normalizedType] || TYPE_META.info;
            const el = document.createElement('div');
            el.className = `history-item history-${normalizedType}`;

            const icon = document.createElement('span');
            icon.className = 'hl-icon';
            icon.setAttribute('aria-hidden', 'true');
            icon.textContent = meta.icon;

            const body = document.createElement('div');
            body.className = 'hl-main';

            const typeEl = document.createElement('span');
            typeEl.className = 'hl-type';
            typeEl.textContent = meta.label;

            const textEl = document.createElement('span');
            textEl.className = 'hl-text';
            textEl.textContent = simplifyText(text, normalizedType);

            body.appendChild(typeEl);
            body.appendChild(textEl);
            el.appendChild(icon);
            el.appendChild(body);
            container.appendChild(el);
        });

        // Newest items render first, so keep the scroll anchored at the top.
        container.scrollTop = 0;
    }

    function syncExpandState() {
        const panel = document.querySelector('.history-log');
        const expandBtn = document.getElementById('history-expand-btn');
        const collapseBtn = document.getElementById('history-collapse-btn');
        panel?.classList.toggle('expanded', isExpanded);
        panel?.classList.toggle('collapsed', isCollapsed);
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('history-layout-change', {
                detail: { expanded: isExpanded, collapsed: isCollapsed }
            }));
        }
        if (expandBtn) {
            expandBtn.textContent = isExpanded ? 'Collapse' : 'Expand';
            expandBtn.setAttribute('aria-expanded', String(isExpanded));
        }
        if (collapseBtn) {
            collapseBtn.setAttribute('aria-expanded', String(!isCollapsed));
            collapseBtn.setAttribute('aria-label', isCollapsed ? 'Expand history and trades' : 'Collapse history and trades');
            collapseBtn.setAttribute('title', isCollapsed ? 'Expand history and trades' : 'Collapse history and trades');
            collapseBtn.textContent = isCollapsed ? '📜' : '🗕';
        }
    }

    function addEvent(text, type = 'info') {
        events.push({ text, type: normalizeType(type) });
        while (events.length > MAX_EVENTS) {
            events.shift();
        }
        render();
    }

    function replaceEvents(nextEvents = []) {
        events.length = 0;
        nextEvents.slice(-MAX_EVENTS).forEach(event => {
            events.push({
                text: event.text,
                type: normalizeType(event.type)
            });
        });
        render();
    }

    return { init, addEvent, replaceEvents };
})();
