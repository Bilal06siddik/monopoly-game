// ═══════════════════════════════════════════════════════════
//  BOARD DATA — Shared board catalog for every playable map
// ═══════════════════════════════════════════════════════════

const DEFAULT_BOARD_ID = 'egypt';

const PROPERTY_RENTS = {
    Boulaq: [2, 10, 20, 30, 160, 250],
    Imbaba: [4, 20, 60, 180, 320, 450],
    Faisal: [6, 30, 90, 270, 400, 550],
    Giza: [6, 30, 90, 270, 400, 550],
    'Cairo University': [8, 40, 100, 300, 450, 600],
    Tagamo3: [10, 50, 150, 450, 625, 750],
    Rehab: [10, 50, 150, 450, 625, 750],
    'Cairo Festival City': [12, 60, 180, 500, 700, 900],
    Dokki: [14, 70, 200, 550, 750, 950],
    Mohandessin: [14, 70, 200, 550, 750, 950],
    Zamalek: [12, 60, 180, 500, 700, 900],
    Heliopolis: [18, 90, 250, 700, 875, 1050],
    'Nasr City': [18, 90, 250, 700, 875, 1050],
    Maadi: [20, 100, 300, 750, 925, 1100],
    'Ain Sokhna': [22, 110, 330, 800, 975, 1150],
    Sahel: [22, 110, 330, 800, 975, 1150],
    Alexandria: [24, 120, 360, 850, 1025, 1200],
    '6th October': [26, 130, 390, 900, 1100, 1275],
    'Sheikh Zayed': [26, 130, 390, 900, 1100, 1275],
    'Smart Village': [28, 150, 450, 1000, 1200, 1400],
    Madinaty: [35, 175, 500, 1100, 1300, 1500],
    'New Capital': [50, 200, 600, 1400, 1700, 2000],
    Delhi: [2, 10, 20, 30, 160, 250],
    Mumbai: [4, 20, 60, 180, 320, 450],
    Izmir: [6, 30, 90, 270, 400, 550],
    Ankara: [6, 30, 90, 270, 400, 550],
    Istanbul: [8, 40, 100, 300, 450, 600],
    Vancouver: [10, 50, 150, 450, 625, 750],
    Montreal: [10, 50, 150, 450, 625, 750],
    Toronto: [12, 60, 180, 500, 700, 900],
    Brighton: [14, 70, 200, 550, 750, 950],
    Manchester: [14, 70, 200, 550, 750, 950],
    London: [12, 60, 180, 500, 700, 900],
    Rome: [18, 90, 250, 700, 875, 1050],
    Venice: [18, 90, 250, 700, 875, 1050],
    Florence: [20, 100, 300, 750, 925, 1100],
    Suwon: [22, 110, 330, 800, 975, 1150],
    Busan: [22, 110, 330, 800, 975, 1150],
    Seoul: [24, 120, 360, 850, 1025, 1200],
    Odessa: [26, 130, 390, 900, 1100, 1275],
    Kharkiv: [26, 130, 390, 900, 1100, 1275],
    Kyiv: [28, 150, 450, 1000, 1200, 1400],
    Geneva: [35, 175, 500, 1100, 1300, 1500],
    Zurich: [50, 200, 600, 1400, 1700, 2000]
};

const COUNTRY_FLAG_STYLES = {
    india: {
        label: 'India',
        image: '/images/flags/india.svg'
    },
    turkey: {
        label: 'Turkey',
        image: '/images/flags/turkey.svg'
    },
    canada: {
        label: 'Canada',
        image: '/images/flags/canada.svg'
    },
    uk: {
        label: 'United Kingdom',
        image: '/images/flags/uk.svg'
    },
    italy: {
        label: 'Italy',
        image: '/images/flags/italy.svg'
    },
    'south-korea': {
        label: 'South Korea',
        image: '/images/flags/south-korea.svg'
    },
    ukraine: {
        label: 'Ukraine',
        image: '/images/flags/ukraine.svg'
    },
    switzerland: {
        label: 'Switzerland',
        image: '/images/flags/switzerland.svg'
    }
};

function createProperty(index, name, price, colorGroup, color, extras = {}) {
    const rentTiers = PROPERTY_RENTS[name] || [0, 0, 0, 0, 0, 0];
    return {
        index,
        name,
        type: 'property',
        price,
        rent: rentTiers[0] || 0,
        rentTiers,
        colorGroup,
        color,
        ...extras
    };
}

function createRailroad(index, name, extras = {}) {
    return {
        index,
        name,
        type: 'railroad',
        price: 200,
        rent: 25,
        colorGroup: 'railroad',
        color: 0x1a1a2e,
        ...extras
    };
}

function createUtility(index, name, extras = {}) {
    return {
        index,
        name,
        type: 'utility',
        price: 150,
        rent: 0,
        colorGroup: 'utility',
        color: 0x2d2d44,
        ...extras
    };
}

function createSpecialTile(index, name, type, price = 0, rent = 0, color = 0x2d2d44, extras = {}) {
    return { index, name, type, price, rent, colorGroup: null, color, ...extras };
}

function withFlagStyle(styleId, extras = {}) {
    const style = COUNTRY_FLAG_STYLES[styleId] || null;
    if (!style) return extras;
    return {
        ...extras,
        flagLabel: style.label,
        flagImage: style.image,
        bandStyle: 'flag-image'
    };
}

const EGYPT_BOARD_DATA = [
    createSpecialTile(0, 'GO', 'corner', 0, 0, 0xffffff),
    createProperty(1, 'Boulaq', 60, 'brown', 0x8B4513),
    createSpecialTile(2, 'Lucky Wheel', 'chance'),
    createProperty(3, 'Imbaba', 60, 'brown', 0x8B4513),
    createSpecialTile(4, 'Income Tax', 'tax', 0, 10, 0x2d2d44),
    createRailroad(5, 'Metro Line 1', { iconImage: 'metro' }),
    createProperty(6, 'Faisal', 100, 'lightblue', 0x87CEEB),
    createSpecialTile(7, 'Happy Birthday!', 'chest'),
    createProperty(8, 'Giza', 100, 'lightblue', 0x87CEEB),
    createProperty(9, 'Cairo University', 120, 'lightblue', 0x87CEEB),
    createSpecialTile(10, 'Just Visiting (Jail)', 'corner', 0, 0, 0xcccccc),
    createProperty(11, 'Tagamo3', 140, 'pink', 0xDA70D6),
    createUtility(12, 'Dabaa Station', { iconText: '☀️', utilityKind: 'solar' }),
    createProperty(13, 'Rehab', 140, 'pink', 0xDA70D6),
    createProperty(14, 'Cairo Festival City', 160, 'pink', 0xDA70D6),
    createRailroad(15, 'Metro Line 2', { iconImage: 'metro' }),
    createProperty(16, 'Dokki', 180, 'orange', 0xFFA500),
    createSpecialTile(17, 'Lucky Wheel', 'chance'),
    createProperty(18, 'Mohandessin', 180, 'orange', 0xFFA500),
    createProperty(19, 'Zamalek', 200, 'orange', 0xFFA500),
    createSpecialTile(20, 'Bailout', 'corner', 0, 0, 0xff4444),
    createProperty(21, 'Heliopolis', 220, 'red', 0xFF0000),
    createSpecialTile(22, 'Happy Birthday!', 'chest'),
    createProperty(23, 'Nasr City', 220, 'red', 0xFF0000),
    createProperty(24, 'Maadi', 240, 'red', 0xFF0000),
    createRailroad(25, 'Metro Line 3', { iconImage: 'metro' }),
    createProperty(26, 'Ain Sokhna', 260, 'yellow', 0xFFFF00),
    createProperty(27, 'Sahel', 260, 'yellow', 0xFFFF00),
    createUtility(28, 'Zaafarana Wind Power', { iconText: '🌬️', utilityKind: 'wind' }),
    createProperty(29, 'Alexandria', 280, 'yellow', 0xFFFF00),
    createSpecialTile(30, 'Go To Jail', 'corner', 0, 0, 0x4444ff),
    createProperty(31, '6th October', 300, 'green', 0x00AA00),
    createProperty(32, 'Sheikh Zayed', 300, 'green', 0x00AA00),
    createSpecialTile(33, 'Lucky Wheel', 'chance'),
    createProperty(34, 'Smart Village', 320, 'green', 0x00AA00),
    createRailroad(35, 'Monorail Line', { iconText: '🚝' }),
    createSpecialTile(36, 'Happy Birthday!', 'chest'),
    createProperty(37, 'Madinaty', 350, 'darkblue', 0x0000CC),
    createSpecialTile(38, 'Luxury Tax', 'tax', 0, 75, 0x2d2d44),
    createProperty(39, 'New Capital', 400, 'darkblue', 0x0000CC)
];

const COUNTRIES_BOARD_DATA = [
    createSpecialTile(0, 'GO', 'corner', 0, 0, 0xffffff),
    createProperty(1, 'Delhi', 60, 'brown', 0x8B4513, withFlagStyle('india')),
    createSpecialTile(2, 'Lucky Wheel', 'chance'),
    createProperty(3, 'Mumbai', 60, 'brown', 0x8B4513, withFlagStyle('india')),
    createSpecialTile(4, 'Income Tax', 'tax', 0, 10, 0x2d2d44),
    createRailroad(5, 'India Railroad', { iconImage: 'railroad' }),
    createProperty(6, 'Izmir', 100, 'lightblue', 0x87CEEB, withFlagStyle('turkey')),
    createSpecialTile(7, 'Happy Birthday!', 'chest'),
    createProperty(8, 'Ankara', 100, 'lightblue', 0x87CEEB, withFlagStyle('turkey')),
    createProperty(9, 'Istanbul', 120, 'lightblue', 0x87CEEB, withFlagStyle('turkey')),
    createSpecialTile(10, 'Just Visiting (Jail)', 'corner', 0, 0, 0xcccccc),
    createProperty(11, 'Vancouver', 140, 'pink', 0xDA70D6, withFlagStyle('canada')),
    createUtility(12, 'Solar Company', { iconText: '☀️', utilityKind: 'solar' }),
    createProperty(13, 'Montreal', 140, 'pink', 0xDA70D6, withFlagStyle('canada')),
    createProperty(14, 'Toronto', 160, 'pink', 0xDA70D6, withFlagStyle('canada')),
    createRailroad(15, 'Canada Railroad', { iconImage: 'railroad' }),
    createProperty(16, 'Brighton', 180, 'orange', 0xFFA500, withFlagStyle('uk')),
    createSpecialTile(17, 'Lucky Wheel', 'chance'),
    createProperty(18, 'Manchester', 180, 'orange', 0xFFA500, withFlagStyle('uk')),
    createProperty(19, 'London', 200, 'orange', 0xFFA500, withFlagStyle('uk')),
    createSpecialTile(20, 'Bailout', 'corner', 0, 0, 0xff4444),
    createProperty(21, 'Rome', 220, 'red', 0xFF0000, withFlagStyle('italy')),
    createSpecialTile(22, 'Happy Birthday!', 'chest'),
    createProperty(23, 'Venice', 220, 'red', 0xFF0000, withFlagStyle('italy')),
    createProperty(24, 'Florence', 240, 'red', 0xFF0000, withFlagStyle('italy')),
    createRailroad(25, 'Italy Railroad', { iconImage: 'railroad' }),
    createProperty(26, 'Suwon', 260, 'yellow', 0xFFFF00, withFlagStyle('south-korea')),
    createProperty(27, 'Busan', 260, 'yellow', 0xFFFF00, withFlagStyle('south-korea')),
    createUtility(28, 'Wind Power', { iconText: '🌬️', utilityKind: 'wind' }),
    createProperty(29, 'Seoul', 280, 'yellow', 0xFFFF00, withFlagStyle('south-korea')),
    createSpecialTile(30, 'Go To Jail', 'corner', 0, 0, 0x4444ff),
    createProperty(31, 'Odessa', 300, 'green', 0x00AA00, withFlagStyle('ukraine')),
    createProperty(32, 'Kharkiv', 300, 'green', 0x00AA00, withFlagStyle('ukraine')),
    createSpecialTile(33, 'Lucky Wheel', 'chance'),
    createProperty(34, 'Kyiv', 320, 'green', 0x00AA00, withFlagStyle('ukraine')),
    createRailroad(35, 'Ukraine Railroad', { iconImage: 'railroad' }),
    createSpecialTile(36, 'Happy Birthday!', 'chest'),
    createProperty(37, 'Geneva', 350, 'darkblue', 0x0000CC, withFlagStyle('switzerland')),
    createSpecialTile(38, 'Luxury Tax', 'tax', 0, 75, 0x2d2d44),
    createProperty(39, 'Zurich', 400, 'darkblue', 0x0000CC, withFlagStyle('switzerland'))
];

const BOARD_MAPS = Object.freeze({
    egypt: Object.freeze({
        id: 'egypt',
        name: 'Egypt',
        description: 'The original Egypt-themed board.',
        tiles: EGYPT_BOARD_DATA
    }),
    countries: Object.freeze({
        id: 'countries',
        name: 'Countries',
        description: 'International cities grouped by country flags.',
        tiles: COUNTRIES_BOARD_DATA
    })
});

const BOARD_IDS = Object.freeze(Object.keys(BOARD_MAPS));

function getBoardMap(boardId = DEFAULT_BOARD_ID) {
    return BOARD_MAPS[boardId] || BOARD_MAPS[DEFAULT_BOARD_ID];
}

function getBoardData(boardId = DEFAULT_BOARD_ID) {
    return getBoardMap(boardId).tiles;
}

const BOARD_DATA = getBoardData(DEFAULT_BOARD_ID);

if (typeof module !== 'undefined' && module.exports) {
    module.exports = BOARD_DATA;
    module.exports.DEFAULT_BOARD_ID = DEFAULT_BOARD_ID;
    module.exports.BOARD_IDS = BOARD_IDS;
    module.exports.BOARD_MAPS = BOARD_MAPS;
    module.exports.getBoardMap = getBoardMap;
    module.exports.getBoardData = getBoardData;
} else {
    window.DEFAULT_BOARD_ID = DEFAULT_BOARD_ID;
    window.BOARD_IDS = BOARD_IDS;
    window.BOARD_MAPS = BOARD_MAPS;
    window.getBoardMap = getBoardMap;
    window.getBoardData = getBoardData;
    window.BOARD_DATA = BOARD_DATA;
}
