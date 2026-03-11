// ═══════════════════════════════════════════════════════════
//  NOTIFICATIONS — Popup system (top-right corner)
// ═══════════════════════════════════════════════════════════

const Notifications = (() => {
    const container = document.getElementById('notification-container');

    const ICONS = {
        success: '✅',
        error: '❌',
        hype: '🔥',
        info: '💡'
    };

    /**
     * Show a notification popup.
     * @param {string} message  — Text to display
     * @param {'success'|'error'|'hype'|'info'} type — Notification style
     * @param {number} duration — Auto-dismiss ms (default 4000)
     */
    function show(message, type = 'info', duration = 4000) {
        const el = document.createElement('div');
        el.className = `notification ${type}`;
        el.innerHTML = `
      <span class="notif-icon">${ICONS[type] || ICONS.info}</span>
      <span class="notif-text">${message}</span>
    `;
        container.appendChild(el);

        // Auto dismiss
        const timer = setTimeout(() => dismiss(el), duration);

        // Click to dismiss early
        el.addEventListener('click', () => {
            clearTimeout(timer);
            dismiss(el);
        });
    }

    function dismiss(el) {
        if (el._dismissed) return;
        el._dismissed = true;
        el.classList.add('dismissing');
        el.addEventListener('animationend', () => el.remove());
    }

    // ── Custom trigger functions ──────────────────────────
    function notifyGo() {
        show('mashya ma3ak zy el eshal 💰', 'success', 5000);
    }

    function notifyDoubles() {
        show('wal3a ma3ak yaam 🔥🔥', 'hype', 5000);
    }

    function notifyError(msg) {
        show(msg, 'error', 5000);
    }

    return { show, notifyGo, notifyDoubles, notifyError };
})();
