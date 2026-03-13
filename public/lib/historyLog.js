// ═══════════════════════════════════════════════════════════
//  HISTORY LOG — Event tracker / chat box
// ═══════════════════════════════════════════════════════════

const HistoryLog = (() => {
    const MAX_EVENTS = 50;
    const COLLAPSED_COUNT = 3;
    const events = [];
    let isExpanded = false;

    function init() {
        const expandBtn = document.getElementById('history-expand-btn');
        if (expandBtn) {
            expandBtn.addEventListener('click', () => {
                isExpanded = !isExpanded;
                syncExpandState();
                render();
            });
            syncExpandState();
        }
    }

    function render() {
        const container = document.getElementById('history-log-list');
        if (!container) return;

        container.innerHTML = '';
        const visibleEvents = isExpanded ? events : events.slice(-COLLAPSED_COUNT);
        visibleEvents.forEach(({ text, type }) => {
            const el = document.createElement('div');
            el.className = `history-item history-${type}`;
            el.innerHTML = `<span class="hl-text">${text}</span>`;
            container.appendChild(el);
        });
        container.scrollTop = container.scrollHeight;
    }

    function syncExpandState() {
        const panel = document.querySelector('.history-log');
        const expandBtn = document.getElementById('history-expand-btn');
        panel?.classList.toggle('expanded', isExpanded);
        if (expandBtn) {
            expandBtn.textContent = isExpanded ? 'Collapse' : 'Expand';
            expandBtn.setAttribute('aria-expanded', String(isExpanded));
        }
    }

    function addEvent(text, type = 'info') {
        events.push({ text, type });
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
                type: event.type || 'info'
            });
        });
        render();
    }

    return { init, addEvent, replaceEvents };
})();
