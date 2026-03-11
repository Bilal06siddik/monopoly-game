// ═══════════════════════════════════════════════════════════
//  HISTORY LOG — Event tracker / chat box
// ═══════════════════════════════════════════════════════════

const HistoryLog = (() => {
    const MAX_EVENTS = 50;
    const events = [];

    function init() {
        // Container already exists in HTML
    }

    function addEvent(text, type = 'info') {
        const container = document.getElementById('history-log-list');
        if (!container) return;

        const el = document.createElement('div');
        el.className = `history-item history-${type}`;
        el.innerHTML = `<span class="hl-text">${text}</span>`;

        container.appendChild(el);
        events.push({ text, type });

        // Trim old events
        while (container.children.length > MAX_EVENTS) {
            container.removeChild(container.firstChild);
        }

        // Auto-scroll to bottom
        container.scrollTop = container.scrollHeight;
    }

    return { init, addEvent };
})();
