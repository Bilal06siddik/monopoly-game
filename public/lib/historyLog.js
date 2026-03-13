// ═══════════════════════════════════════════════════════════
//  HISTORY LOG — Event tracker / chat box
// ═══════════════════════════════════════════════════════════

const HistoryLog = (() => {
    const MAX_EVENTS = 50;
    const events = [];

    function init() {
        // Container already exists in HTML
    }

    function render() {
        const container = document.getElementById('history-log-list');
        if (!container) return;

        container.innerHTML = '';
        events.forEach(({ text, type }) => {
            const el = document.createElement('div');
            el.className = `history-item history-${type}`;
            el.innerHTML = `<span class="hl-text">${text}</span>`;
            container.appendChild(el);
        });
        container.scrollTop = container.scrollHeight;
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
