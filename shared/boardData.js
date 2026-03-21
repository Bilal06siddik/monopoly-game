// ═══════════════════════════════════════════════════════════
//  BOARD DATA — Shared board catalog for every playable map
// ═══════════════════════════════════════════════════════════

const DEFAULT_BOARD_ID = 'egypt';
const CAPITALISTA_BOARD_TEMPLATE_ID = 'capitalista_reference_40';
const DEFAULT_RULE_PRESET = 'capitalista_v2';

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

function createTemplateProperty(index, templateSlotId, price, rentTiers, colorGroup, color) {
    return Object.freeze({
        index,
        templateSlotId,
        slotType: 'property',
        type: 'property',
        price,
        rent: rentTiers[0] || 0,
        rentTiers: Object.freeze([...rentTiers]),
        colorGroup,
        color
    });
}

function createTemplateRailroad(index, templateSlotId, color = 0x1a1a2e) {
    return Object.freeze({
        index,
        templateSlotId,
        slotType: 'railroad',
        type: 'railroad',
        price: 200,
        rent: 25,
        colorGroup: 'railroad',
        color
    });
}

function createTemplateUtility(index, templateSlotId, color = 0x2d2d44) {
    return Object.freeze({
        index,
        templateSlotId,
        slotType: 'utility',
        type: 'utility',
        price: 150,
        rent: 0,
        colorGroup: 'utility',
        color
    });
}

function createTemplateSpecialTile(index, templateSlotId, type, price = 0, rent = 0, color = 0x2d2d44) {
    return Object.freeze({
        index,
        templateSlotId,
        slotType: type,
        type,
        price,
        rent,
        colorGroup: null,
        color
    });
}

function createOverlayEntry(name, extras = {}) {
    return Object.freeze({
        name,
        ...extras
    });
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

const CAPITALISTA_BOARD_TEMPLATE = Object.freeze([
    createTemplateSpecialTile(0, 'go', 'corner', 0, 0, 0xffffff),
    createTemplateProperty(1, 'brown-1', 60, [2, 10, 20, 30, 160, 250], 'brown', 0x8B4513),
    createTemplateSpecialTile(2, 'chance-1', 'chance'),
    createTemplateProperty(3, 'brown-2', 60, [4, 20, 60, 180, 320, 450], 'brown', 0x8B4513),
    createTemplateSpecialTile(4, 'income-tax', 'tax', 0, 10, 0x2d2d44),
    createTemplateRailroad(5, 'transport-1'),
    createTemplateProperty(6, 'lightblue-1', 100, [6, 30, 90, 270, 400, 550], 'lightblue', 0x87CEEB),
    createTemplateSpecialTile(7, 'chest-1', 'chest'),
    createTemplateProperty(8, 'lightblue-2', 100, [6, 30, 90, 270, 400, 550], 'lightblue', 0x87CEEB),
    createTemplateProperty(9, 'lightblue-3', 120, [8, 40, 100, 300, 450, 600], 'lightblue', 0x87CEEB),
    createTemplateSpecialTile(10, 'jail', 'corner', 0, 0, 0xcccccc),
    createTemplateProperty(11, 'pink-1', 140, [10, 50, 150, 450, 625, 750], 'pink', 0xDA70D6),
    createTemplateUtility(12, 'utility-1'),
    createTemplateProperty(13, 'pink-2', 140, [10, 50, 150, 450, 625, 750], 'pink', 0xDA70D6),
    createTemplateProperty(14, 'pink-3', 160, [12, 60, 180, 500, 700, 900], 'pink', 0xDA70D6),
    createTemplateRailroad(15, 'transport-2'),
    createTemplateProperty(16, 'orange-1', 180, [14, 70, 200, 550, 750, 950], 'orange', 0xFFA500),
    createTemplateSpecialTile(17, 'chance-2', 'chance'),
    createTemplateProperty(18, 'orange-2', 180, [14, 70, 200, 550, 750, 950], 'orange', 0xFFA500),
    createTemplateProperty(19, 'orange-3', 200, [12, 60, 180, 500, 700, 900], 'orange', 0xFFA500),
    createTemplateSpecialTile(20, 'bailout', 'corner', 0, 0, 0xff4444),
    createTemplateProperty(21, 'red-1', 220, [18, 90, 250, 700, 875, 1050], 'red', 0xFF0000),
    createTemplateSpecialTile(22, 'chest-2', 'chest'),
    createTemplateProperty(23, 'red-2', 220, [18, 90, 250, 700, 875, 1050], 'red', 0xFF0000),
    createTemplateProperty(24, 'red-3', 240, [20, 100, 300, 750, 925, 1100], 'red', 0xFF0000),
    createTemplateRailroad(25, 'transport-3'),
    createTemplateProperty(26, 'yellow-1', 260, [22, 110, 330, 800, 975, 1150], 'yellow', 0xFFFF00),
    createTemplateProperty(27, 'yellow-2', 260, [22, 110, 330, 800, 975, 1150], 'yellow', 0xFFFF00),
    createTemplateUtility(28, 'utility-2'),
    createTemplateProperty(29, 'yellow-3', 280, [24, 120, 360, 850, 1025, 1200], 'yellow', 0xFFFF00),
    createTemplateSpecialTile(30, 'go-to-jail', 'corner', 0, 0, 0x4444ff),
    createTemplateProperty(31, 'green-1', 300, [26, 130, 390, 900, 1100, 1275], 'green', 0x00AA00),
    createTemplateProperty(32, 'green-2', 300, [26, 130, 390, 900, 1100, 1275], 'green', 0x00AA00),
    createTemplateSpecialTile(33, 'chance-3', 'chance'),
    createTemplateProperty(34, 'green-3', 320, [28, 150, 450, 1000, 1200, 1400], 'green', 0x00AA00),
    createTemplateRailroad(35, 'transport-4'),
    createTemplateSpecialTile(36, 'chest-3', 'chest'),
    createTemplateProperty(37, 'darkblue-1', 350, [35, 175, 500, 1100, 1300, 1500], 'darkblue', 0x0000CC),
    createTemplateSpecialTile(38, 'luxury-tax', 'tax', 0, 75, 0x2d2d44),
    createTemplateProperty(39, 'darkblue-2', 400, [50, 200, 600, 1400, 1700, 2000], 'darkblue', 0x0000CC)
]);

const EGYPT_BOARD_OVERLAY = Object.freeze([
    createOverlayEntry('GO'),
    createOverlayEntry('Boulaq'),
    createOverlayEntry('Lucky Wheel'),
    createOverlayEntry('Imbaba'),
    createOverlayEntry('Income Tax'),
    createOverlayEntry('Metro Line 1', { iconImage: 'metro' }),
    createOverlayEntry('Faisal'),
    createOverlayEntry('Happy Birthday!'),
    createOverlayEntry('Giza'),
    createOverlayEntry('Cairo University'),
    createOverlayEntry('Just Visiting (Jail)'),
    createOverlayEntry('Tagamo3'),
    createOverlayEntry('Dabaa Station', { iconText: '☀️', utilityKind: 'solar' }),
    createOverlayEntry('Rehab'),
    createOverlayEntry('Cairo Festival City'),
    createOverlayEntry('Metro Line 2', { iconImage: 'metro' }),
    createOverlayEntry('Dokki'),
    createOverlayEntry('Lucky Wheel'),
    createOverlayEntry('Mohandessin'),
    createOverlayEntry('Zamalek'),
    createOverlayEntry('Bailout'),
    createOverlayEntry('Heliopolis'),
    createOverlayEntry('Happy Birthday!'),
    createOverlayEntry('Nasr City'),
    createOverlayEntry('Maadi'),
    createOverlayEntry('Metro Line 3', { iconImage: 'metro' }),
    createOverlayEntry('Ain Sokhna'),
    createOverlayEntry('Sahel'),
    createOverlayEntry('Zaafarana Wind Power', { iconText: '🌬️', utilityKind: 'wind' }),
    createOverlayEntry('Alexandria'),
    createOverlayEntry('Go To Jail'),
    createOverlayEntry('6th October'),
    createOverlayEntry('Sheikh Zayed'),
    createOverlayEntry('Lucky Wheel'),
    createOverlayEntry('Smart Village'),
    createOverlayEntry('Monorail Line', { iconText: '🚝' }),
    createOverlayEntry('Happy Birthday!'),
    createOverlayEntry('Madinaty'),
    createOverlayEntry('Luxury Tax'),
    createOverlayEntry('New Capital')
]);

const COUNTRIES_BOARD_OVERLAY = Object.freeze([
    createOverlayEntry('GO'),
    createOverlayEntry('Delhi', withFlagStyle('india')),
    createOverlayEntry('Lucky Wheel'),
    createOverlayEntry('Mumbai', withFlagStyle('india')),
    createOverlayEntry('Income Tax'),
    createOverlayEntry('India Railroad', { iconImage: 'railroad' }),
    createOverlayEntry('Izmir', withFlagStyle('turkey')),
    createOverlayEntry('Happy Birthday!'),
    createOverlayEntry('Ankara', withFlagStyle('turkey')),
    createOverlayEntry('Istanbul', withFlagStyle('turkey')),
    createOverlayEntry('Just Visiting (Jail)'),
    createOverlayEntry('Vancouver', withFlagStyle('canada')),
    createOverlayEntry('Solar Company', { iconText: '☀️', utilityKind: 'solar' }),
    createOverlayEntry('Montreal', withFlagStyle('canada')),
    createOverlayEntry('Toronto', withFlagStyle('canada')),
    createOverlayEntry('Canada Railroad', { iconImage: 'railroad' }),
    createOverlayEntry('Brighton', withFlagStyle('uk')),
    createOverlayEntry('Lucky Wheel'),
    createOverlayEntry('Manchester', withFlagStyle('uk')),
    createOverlayEntry('London', withFlagStyle('uk')),
    createOverlayEntry('Bailout'),
    createOverlayEntry('Rome', withFlagStyle('italy')),
    createOverlayEntry('Happy Birthday!'),
    createOverlayEntry('Venice', withFlagStyle('italy')),
    createOverlayEntry('Florence', withFlagStyle('italy')),
    createOverlayEntry('Italy Railroad', { iconImage: 'railroad' }),
    createOverlayEntry('Suwon', withFlagStyle('south-korea')),
    createOverlayEntry('Busan', withFlagStyle('south-korea')),
    createOverlayEntry('Wind Power', { iconText: '💨', utilityKind: 'wind' }),
    createOverlayEntry('Seoul', withFlagStyle('south-korea')),
    createOverlayEntry('Go To Jail'),
    createOverlayEntry('Odessa', withFlagStyle('ukraine')),
    createOverlayEntry('Kharkiv', withFlagStyle('ukraine')),
    createOverlayEntry('Lucky Wheel'),
    createOverlayEntry('Kyiv', withFlagStyle('ukraine')),
    createOverlayEntry('Ukraine Railroad', { iconImage: 'railroad' }),
    createOverlayEntry('Happy Birthday!'),
    createOverlayEntry('Geneva', withFlagStyle('switzerland')),
    createOverlayEntry('Luxury Tax'),
    createOverlayEntry('Zurich', withFlagStyle('switzerland'))
]);

function buildBoardTiles(overlayEntries = []) {
    return Object.freeze(CAPITALISTA_BOARD_TEMPLATE.map((templateTile, index) => {
        const overlay = overlayEntries[index] || {};
        return Object.freeze({
            ...templateTile,
            ...overlay,
            index: templateTile.index,
            price: templateTile.price,
            rent: templateTile.rent,
            rentTiers: templateTile.rentTiers ? Object.freeze([...templateTile.rentTiers]) : null,
            colorGroup: templateTile.colorGroup,
            color: templateTile.color
        });
    }));
}

const EGYPT_BOARD_DATA = buildBoardTiles(EGYPT_BOARD_OVERLAY);
const COUNTRIES_BOARD_DATA = buildBoardTiles(COUNTRIES_BOARD_OVERLAY);

const BOARD_TEMPLATES = Object.freeze({
    [CAPITALISTA_BOARD_TEMPLATE_ID]: Object.freeze({
        id: CAPITALISTA_BOARD_TEMPLATE_ID,
        name: 'Capitalista Reference 40',
        description: 'Canonical 40-slot Capitalista-aligned board structure.',
        rulesPreset: DEFAULT_RULE_PRESET,
        tiles: CAPITALISTA_BOARD_TEMPLATE
    })
});

const BOARD_MAPS = Object.freeze({
    egypt: Object.freeze({
        id: 'egypt',
        name: 'Egypt',
        description: 'The original Egypt-themed board.',
        templateId: CAPITALISTA_BOARD_TEMPLATE_ID,
        theme: 'egypt',
        rulesPreset: DEFAULT_RULE_PRESET,
        tiles: EGYPT_BOARD_DATA
    }),
    countries: Object.freeze({
        id: 'countries',
        name: 'Countries',
        description: 'International cities grouped by country flags.',
        templateId: CAPITALISTA_BOARD_TEMPLATE_ID,
        theme: 'countries',
        rulesPreset: DEFAULT_RULE_PRESET,
        tiles: COUNTRIES_BOARD_DATA
    })
});

const BOARD_IDS = Object.freeze(Object.keys(BOARD_MAPS));

function getBoardTemplate(templateId = CAPITALISTA_BOARD_TEMPLATE_ID) {
    return BOARD_TEMPLATES[templateId] || BOARD_TEMPLATES[CAPITALISTA_BOARD_TEMPLATE_ID];
}

function getBoardMap(boardId = DEFAULT_BOARD_ID) {
    return BOARD_MAPS[boardId] || BOARD_MAPS[DEFAULT_BOARD_ID];
}

function getBoardData(boardId = DEFAULT_BOARD_ID) {
    return getBoardMap(boardId).tiles;
}

const BOARD_DATA = [...getBoardData(DEFAULT_BOARD_ID)];

if (typeof module !== 'undefined' && module.exports) {
    module.exports = BOARD_DATA;
    module.exports.DEFAULT_BOARD_ID = DEFAULT_BOARD_ID;
    module.exports.DEFAULT_RULE_PRESET = DEFAULT_RULE_PRESET;
    module.exports.CAPITALISTA_BOARD_TEMPLATE_ID = CAPITALISTA_BOARD_TEMPLATE_ID;
    module.exports.BOARD_IDS = BOARD_IDS;
    module.exports.BOARD_MAPS = BOARD_MAPS;
    module.exports.BOARD_TEMPLATES = BOARD_TEMPLATES;
    module.exports.getBoardTemplate = getBoardTemplate;
    module.exports.getBoardMap = getBoardMap;
    module.exports.getBoardData = getBoardData;
} else {
    window.DEFAULT_BOARD_ID = DEFAULT_BOARD_ID;
    window.CAPITALISTA_BOARD_TEMPLATE_ID = CAPITALISTA_BOARD_TEMPLATE_ID;
    window.BOARD_IDS = BOARD_IDS;
    window.BOARD_MAPS = BOARD_MAPS;
    window.BOARD_TEMPLATES = BOARD_TEMPLATES;
    window.getBoardTemplate = getBoardTemplate;
    window.getBoardMap = getBoardMap;
    window.getBoardData = getBoardData;
    window.BOARD_DATA = BOARD_DATA;
}
