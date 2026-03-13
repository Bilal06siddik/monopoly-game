// ═══════════════════════════════════════════════════════════
//  BOARD DATA — 40 tile definitions (shared: server + client)
// ═══════════════════════════════════════════════════════════

const PROPERTY_RENTS = {
    'Boulaq': [2, 10, 20, 30, 160, 250],
    'Imbaba': [4, 20, 60, 180, 320, 450],
    'Faisal': [6, 30, 90, 270, 400, 550],
    'Giza': [6, 30, 90, 270, 400, 550],
    'Cairo University': [8, 40, 100, 300, 450, 600],
    'Tagamo3': [10, 50, 150, 450, 625, 750],
    'Rehab': [10, 50, 150, 450, 625, 750],
    'Cairo Festival City': [12, 60, 180, 500, 700, 900],
    'Dokki': [14, 70, 200, 550, 750, 950],
    'Mohandessin': [14, 70, 200, 550, 750, 950],
    'Zamalek': [12, 60, 180, 500, 700, 900],
    'Heliopolis': [18, 90, 250, 700, 875, 1050],
    'Nasr City': [18, 90, 250, 700, 875, 1050],
    'Maadi': [20, 100, 300, 750, 925, 1100],
    'Ain Sokhna': [22, 110, 330, 800, 975, 1150],
    'Sahel': [22, 110, 330, 800, 975, 1150],
    'Alexandria': [24, 120, 360, 850, 1025, 1200],
    '6th October': [26, 130, 390, 900, 1100, 1275],
    'Sheikh Zayed': [26, 130, 390, 900, 1100, 1275],
    'Smart Village': [28, 150, 450, 1000, 1200, 1400],
    'Madinaty': [35, 175, 500, 1100, 1300, 1500],
    'New Capital': [50, 200, 600, 1400, 1700, 2000]
};

function createProperty(index, name, price, colorGroup, color) {
    const rentTiers = PROPERTY_RENTS[name] || [0, 0, 0, 0, 0, 0];
    return {
        index,
        name,
        type: 'property',
        price,
        rent: rentTiers[0] || 0,
        rentTiers,
        colorGroup,
        color
    };
}

function createSpecialTile(index, name, type, price = 0, rent = 0, color = 0x2d2d44) {
    return { index, name, type, price, rent, colorGroup: null, color };
}

const BOARD_DATA = [
    // ── Bottom row (right to left): indices 0–10 ─────────
    createSpecialTile(0, 'GO', 'corner', 0, 0, 0xffffff),
    createProperty(1, 'Boulaq', 60, 'brown', 0x8B4513),
    createSpecialTile(2, 'Lucky Wheel', 'chance'),
    createProperty(3, 'Imbaba', 60, 'brown', 0x8B4513),
    createSpecialTile(4, 'Income Tax', 'tax', 0, 10, 0x2d2d44),
    {
        index: 5, name: 'Metro Line 1', type: 'railroad',
        price: 200, rent: 25, colorGroup: 'railroad', color: 0x1a1a2e
    },
    createProperty(6, 'Faisal', 100, 'lightblue', 0x87CEEB),
    createSpecialTile(7, 'Happy Birthday!', 'chest'),
    createProperty(8, 'Giza', 100, 'lightblue', 0x87CEEB),
    createProperty(9, 'Cairo University', 120, 'lightblue', 0x87CEEB),
    createSpecialTile(10, 'Just Visiting (Jail)', 'corner', 0, 0, 0xcccccc),

    // ── Left column (bottom to top): indices 11–20 ───────
    createProperty(11, 'Tagamo3', 140, 'pink', 0xDA70D6),
    {
        index: 12, name: 'Dabaa Station (Solar)', type: 'utility',
        price: 150, rent: 0, colorGroup: 'utility', color: 0x2d2d44
    },
    createProperty(13, 'Rehab', 140, 'pink', 0xDA70D6),
    createProperty(14, 'Cairo Festival City', 160, 'pink', 0xDA70D6),
    {
        index: 15, name: 'Metro Line 2', type: 'railroad',
        price: 200, rent: 25, colorGroup: 'railroad', color: 0x1a1a2e
    },
    createProperty(16, 'Dokki', 180, 'orange', 0xFFA500),
    createSpecialTile(17, 'Lucky Wheel', 'chance'),
    createProperty(18, 'Mohandessin', 180, 'orange', 0xFFA500),
    createProperty(19, 'Zamalek', 200, 'orange', 0xFFA500),
    createSpecialTile(20, 'Bailout', 'corner', 0, 0, 0xff4444),

    // ── Top row (left to right): indices 21–30 ────────────
    createProperty(21, 'Heliopolis', 220, 'red', 0xFF0000),
    createSpecialTile(22, 'Happy Birthday!', 'chest'),
    createProperty(23, 'Nasr City', 220, 'red', 0xFF0000),
    createProperty(24, 'Maadi', 240, 'red', 0xFF0000),
    {
        index: 25, name: 'Metro Line 3', type: 'railroad',
        price: 200, rent: 25, colorGroup: 'railroad', color: 0x1a1a2e
    },
    createProperty(26, 'Ain Sokhna', 260, 'yellow', 0xFFFF00),
    createProperty(27, 'Sahel', 260, 'yellow', 0xFFFF00),
    {
        index: 28, name: 'Zaafarana Wind Power', type: 'utility',
        price: 150, rent: 0, colorGroup: 'utility', color: 0x2d2d44
    },
    createProperty(29, 'Alexandria', 280, 'yellow', 0xFFFF00),
    createSpecialTile(30, 'Go To Jail', 'corner', 0, 0, 0x4444ff),

    // ── Right column (top to bottom): indices 31–39 ───────
    createProperty(31, '6th October', 300, 'green', 0x00AA00),
    createProperty(32, 'Sheikh Zayed', 300, 'green', 0x00AA00),
    createSpecialTile(33, 'Lucky Wheel', 'chance'),
    createProperty(34, 'Smart Village', 320, 'green', 0x00AA00),
    {
        index: 35, name: 'Monorail Line', type: 'railroad',
        price: 200, rent: 25, colorGroup: 'railroad', color: 0x1a1a2e
    },
    createSpecialTile(36, 'Happy Birthday!', 'chest'),
    createProperty(37, 'Madinaty', 350, 'darkblue', 0x0000CC),
    createSpecialTile(38, 'Luxury Tax', 'tax', 0, 75, 0x2d2d44),
    createProperty(39, 'New Capital', 400, 'darkblue', 0x0000CC)
];

// Export for Node.js / expose for browser
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BOARD_DATA;
} else {
    window.BOARD_DATA = BOARD_DATA;
}
