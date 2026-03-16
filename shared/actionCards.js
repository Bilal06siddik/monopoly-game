// ═══════════════════════════════════════════════════════════
//  ACTION CARDS — Rich shared action-card definitions
// ═══════════════════════════════════════════════════════════

const ACTION_CARDS = [
    {
        id: 1,
        text: 'Advance to GO. Collect $400.',
        emoji: '🏁',
        type: 'moveAbsolute',
        targetIndex: 0,
        collectGoOnPass: true,
        collectGoOnLand: true
    },
    {
        id: 2,
        text: 'Go to Jail. Go directly to Jail. Do not pass GO, do not collect $200.',
        emoji: '🚓',
        type: 'moveAbsolute',
        targetIndex: 10,
        sendToJail: true,
        collectGoOnPass: false,
        collectGoOnLand: false
    },
    {
        id: 3,
        text: 'Go back 3 spaces.',
        emoji: '↩️',
        type: 'moveRelative',
        steps: -3
    },
    {
        id: 4,
        text: 'Take a trip to Metro Line 1.',
        emoji: '🚂',
        type: 'moveAbsolute',
        targetIndex: 5,
        collectGoOnPass: true,
        collectGoOnLand: false
    },
    {
        id: 5,
        text: 'Advance to Sheikh Zayed.',
        emoji: '🏘️',
        type: 'moveAbsolute',
        targetIndex: 32,
        collectGoOnPass: true,
        collectGoOnLand: false
    },
    {
        id: 6,
        text: 'Advance token to the nearest railroad and pay double rent if owned.',
        emoji: '🚆',
        type: 'moveNearest',
        targetType: 'railroad'
    },
    {
        id: 7,
        text: 'Advance token to the nearest utility. If owned, pay 10 times the dice roll.',
        emoji: '⚡',
        type: 'moveNearest',
        targetType: 'utility'
    },
    {
        id: 8,
        text: 'Won the Smash Karts tournament. Collect $100.',
        emoji: '🏎️',
        type: 'collect',
        amount: 100
    },
    {
        id: 9,
        text: 'Accepted into the Racing Team. Collect $200.',
        emoji: '🏆',
        type: 'collect',
        amount: 200
    },
    {
        id: 10,
        text: 'Your YouTube channel hit 100K subscribers. Collect $150.',
        emoji: '📺',
        type: 'collect',
        amount: 150
    },
    {
        id: 11,
        text: 'Bank error in your favor. Collect $75.',
        emoji: '🏦',
        type: 'collect',
        amount: 75
    },
    {
        id: 12,
        text: 'It is your birthday. Collect $25 from every player.',
        emoji: '🎂',
        type: 'collectFromEach',
        amount: 25
    },
    {
        id: 13,
        text: 'Get Out of Jail Free. This card may be kept until needed or sold.',
        emoji: '🃏',
        type: 'pardon'
    },
    {
        id: 14,
        text: 'VIP tickets to Marwan Pablo concert. Pay $150.',
        emoji: '🎤',
        type: 'pay',
        amount: 150
    },
    {
        id: 15,
        text: 'Traffic violation on Ring Road. Pay $75 fine.',
        emoji: '🚗',
        type: 'pay',
        amount: 75
    },
    {
        id: 16,
        text: 'Emergency shawarma run at 3 AM. Pay $25.',
        emoji: '🌯',
        type: 'pay',
        amount: 25
    }
];

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ACTION_CARDS;
} else {
    window.ACTION_CARDS = ACTION_CARDS;
}
