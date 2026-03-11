// ═══════════════════════════════════════════════════════════
//  ACTION CARDS — Custom Chance/Community Chest cards
//  Shared between server and client
// ═══════════════════════════════════════════════════════════

const ACTION_CARDS = [
    // ── Positive Cards (collect money) ────────────────────
    {
        id: 1,
        text: 'Won the Smash Karts tournament. Collect $100.',
        emoji: '🏎️',
        type: 'collect',
        amount: 100
    },
    {
        id: 2,
        text: 'Accepted into the Racing Team. Collect $200.',
        emoji: '🏁',
        type: 'collect',
        amount: 200
    },
    {
        id: 3,
        text: 'Your YouTube channel hit 100K subscribers. Collect $150.',
        emoji: '📺',
        type: 'collect',
        amount: 150
    },
    {
        id: 4,
        text: 'Bank error in your favor. Collect $75.',
        emoji: '🏦',
        type: 'collect',
        amount: 75
    },
    {
        id: 5,
        text: 'Won second place in a coding hackathon. Collect $50.',
        emoji: '💻',
        type: 'collect',
        amount: 50
    },
    {
        id: 6,
        text: 'Birthday gift from your teta. Collect $100.',
        emoji: '🎂',
        type: 'collect',
        amount: 100
    },

    // ── Negative Cards (pay money) ────────────────────────
    {
        id: 7,
        text: 'VIP tickets to Marwan Pablo concert. Pay $150.',
        emoji: '🎤',
        type: 'pay',
        amount: 150
    },
    {
        id: 8,
        text: 'Caught sleeping in Cairo University lecture. Pay $50 fine.',
        emoji: '😴',
        type: 'pay',
        amount: 50
    },
    {
        id: 9,
        text: 'Your phone screen cracked again. Pay $100 for repair.',
        emoji: '📱',
        type: 'pay',
        amount: 100
    },
    {
        id: 10,
        text: 'Traffic violation on Ring Road. Pay $75 fine.',
        emoji: '🚗',
        type: 'pay',
        amount: 75
    },
    {
        id: 11,
        text: 'Forgot to pay internet bill. Pay $30.',
        emoji: '📶',
        type: 'pay',
        amount: 30
    },
    {
        id: 12,
        text: 'Emergency shawarma run at 3 AM. Pay $25.',
        emoji: '🌯',
        type: 'pay',
        amount: 25
    }
];

// Export for Node.js / expose for browser
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ACTION_CARDS;
} else {
    window.ACTION_CARDS = ACTION_CARDS;
}
