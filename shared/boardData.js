// ═══════════════════════════════════════════════════════════
//  BOARD DATA — 40 tile definitions (shared: server + client)
// ═══════════════════════════════════════════════════════════

const BOARD_DATA = [
    // ── Bottom row (right to left): indices 0–10 ─────────
    {
        index: 0, name: 'GO', type: 'corner',
        price: 0, rent: 0, colorGroup: null, color: 0xffffff
    },
    {
        index: 1, name: 'Hadayek El Ahram', type: 'property',
        price: 400, rent: 2, colorGroup: 'brown', color: 0x8B4513
    },
    {
        index: 2, name: 'Community Chest', type: 'chest',
        price: 0, rent: 0, colorGroup: null, color: 0x2d2d44
    },
    {
        index: 3, name: 'Hadayek October', type: 'property',
        price: 350, rent: 4, colorGroup: 'brown', color: 0x8B4513
    },
    {
        index: 4, name: 'Income Tax', type: 'tax',
        price: 0, rent: 200, colorGroup: null, color: 0x2d2d44
    },
    {
        index: 5, name: 'Metro Line 1', type: 'railroad',
        price: 200, rent: 25, colorGroup: 'railroad', color: 0x1a1a2e
    },
    {
        index: 6, name: 'Imbaba', type: 'property',
        price: 320, rent: 6, colorGroup: 'lightblue', color: 0x87CEEB
    },
    {
        index: 7, name: 'Chance', type: 'chance',
        price: 0, rent: 0, colorGroup: null, color: 0x2d2d44
    },
    {
        index: 8, name: 'Bulaq El Dakrour', type: 'property',
        price: 300, rent: 6, colorGroup: 'lightblue', color: 0x87CEEB
    },
    {
        index: 9, name: 'Mohandeseen', type: 'property',
        price: 300, rent: 8, colorGroup: 'lightblue', color: 0x87CEEB
    },
    {
        index: 10, name: 'Jail', type: 'corner',
        price: 0, rent: 0, colorGroup: null, color: 0xcccccc
    },

    // ── Left column (bottom to top): indices 11–20 ───────
    {
        index: 11, name: 'Maadi Villa', type: 'property',
        price: 280, rent: 10, colorGroup: 'pink', color: 0xDA70D6
    },
    {
        index: 12, name: 'Energy Storage Battery', type: 'utility',
        price: 150, rent: 0, colorGroup: 'utility', color: 0x2d2d44
    },
    {
        index: 13, name: 'Heliopolis Manor', type: 'property',
        price: 260, rent: 10, colorGroup: 'pink', color: 0xDA70D6
    },
    {
        index: 14, name: 'Korba Plaza', type: 'property',
        price: 260, rent: 12, colorGroup: 'pink', color: 0xDA70D6
    },
    {
        index: 15, name: 'Metro Line 2', type: 'railroad',
        price: 200, rent: 25, colorGroup: 'railroad', color: 0x1a1a2e
    },
    {
        index: 16, name: 'Tagamo3 Complex', type: 'property',
        price: 240, rent: 14, colorGroup: 'orange', color: 0xFFA500
    },
    {
        index: 17, name: 'Community Chest', type: 'chest',
        price: 0, rent: 0, colorGroup: null, color: 0x2d2d44
    },
    {
        index: 18, name: 'Rehab City Mall', type: 'property',
        price: 220, rent: 14, colorGroup: 'orange', color: 0xFFA500
    },
    {
        index: 19, name: 'Shorouk Tower', type: 'property',
        price: 220, rent: 16, colorGroup: 'orange', color: 0xFFA500
    },
    {
        index: 20, name: 'Free Parking', type: 'corner',
        price: 0, rent: 0, colorGroup: null, color: 0xff4444
    },

    // ── Top row (left to right): indices 21–30 ────────────
    {
        index: 21, name: 'Sheikh Zayed Hub', type: 'property',
        price: 200, rent: 18, colorGroup: 'red', color: 0xFF0000
    },
    {
        index: 22, name: 'Chance', type: 'chance',
        price: 0, rent: 0, colorGroup: null, color: 0x2d2d44
    },
    {
        index: 23, name: '6th October Strip', type: 'property',
        price: 180, rent: 18, colorGroup: 'red', color: 0xFF0000
    },
    {
        index: 24, name: 'Smart Village Office', type: 'property',
        price: 180, rent: 20, colorGroup: 'red', color: 0xFF0000
    },
    {
        index: 25, name: 'Metro Line 3', type: 'railroad',
        price: 200, rent: 25, colorGroup: 'railroad', color: 0x1a1a2e
    },
    {
        index: 26, name: 'New Capital Block A', type: 'property',
        price: 200, rent: 22, colorGroup: 'yellow', color: 0xFFFF00
    },
    {
        index: 27, name: 'New Capital Block B', type: 'property',
        price: 160, rent: 22, colorGroup: 'yellow', color: 0xFFFF00
    },
    {
        index: 28, name: 'Cloudflare Server Hosting', type: 'utility',
        price: 150, rent: 0, colorGroup: 'utility', color: 0x2d2d44
    },
    {
        index: 29, name: 'Katameya Heights', type: 'property',
        price: 140, rent: 24, colorGroup: 'yellow', color: 0xFFFF00
    },
    {
        index: 30, name: 'Go To Jail', type: 'corner',
        price: 0, rent: 0, colorGroup: null, color: 0x4444ff
    },

    // ── Right column (top to bottom): indices 31–39 ───────
    {
        index: 31, name: 'Sheikh Zayed', type: 'property',
        price: 120, rent: 26, colorGroup: 'green', color: 0x00AA00
    },
    {
        index: 32, name: 'Fifth Settlement', type: 'property',
        price: 120, rent: 26, colorGroup: 'green', color: 0x00AA00
    },
    {
        index: 33, name: 'Community Chest', type: 'chest',
        price: 0, rent: 0, colorGroup: null, color: 0x2d2d44
    },
    {
        index: 34, name: 'Madinaty', type: 'property',
        price: 100, rent: 28, colorGroup: 'green', color: 0x00AA00
    },
    {
        index: 35, name: 'Monorail Line', type: 'railroad',
        price: 200, rent: 25, colorGroup: 'railroad', color: 0x1a1a2e
    },
    {
        index: 36, name: 'Chance', type: 'chance',
        price: 0, rent: 0, colorGroup: null, color: 0x2d2d44
    },
    {
        index: 37, name: 'TCCD Job Fair Booth', type: 'property',
        price: 60, rent: 35, colorGroup: 'darkblue', color: 0x0000CC
    },
    {
        index: 38, name: 'Luxury Tax', type: 'tax',
        price: 0, rent: 100, colorGroup: null, color: 0x2d2d44
    },
    {
        index: 39, name: 'Royal Nile Mansion', type: 'property',
        price: 60, rent: 50, colorGroup: 'darkblue', color: 0x0000CC
    }
];

// Export for Node.js / expose for browser
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BOARD_DATA;
} else {
    window.BOARD_DATA = BOARD_DATA;
}
