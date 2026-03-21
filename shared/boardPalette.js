const TILE_COLOR_HEX = Object.freeze({
    brown: '#9a6a49',
    lightblue: '#59c4ee',
    pink: '#db75b4',
    orange: '#f19a42',
    red: '#e66461',
    yellow: '#e3c44f',
    green: '#4eb073',
    darkblue: '#4b6bd8',
    railroad: '#6b7b8f',
    utility: '#7b889d',
    chance: '#5a92ef',
    chest: '#f18b67',
    tax: '#7e8ba0',
    go: '#eef4ff',
    jail: '#c9d2e2',
    bailout: '#ff6f61',
    goToJail: '#6c82ff',
    corner: '#dfe7f5'
});

function normalizeHex(hex, fallback = '#7ea8ff') {
    const value = typeof hex === 'string' ? hex.trim() : '';
    if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();
    if (/^[0-9a-f]{6}$/i.test(value)) return `#${value.toLowerCase()}`;
    return fallback.toLowerCase();
}

function hexToNumber(hex, fallback = 0x7ea8ff) {
    const normalized = normalizeHex(hex, null);
    if (!normalized) return fallback;
    return Number.parseInt(normalized.slice(1), 16);
}

function parseHexColor(hex, fallback = '#7ea8ff') {
    const normalized = normalizeHex(hex, fallback);
    return {
        r: Number.parseInt(normalized.slice(1, 3), 16),
        g: Number.parseInt(normalized.slice(3, 5), 16),
        b: Number.parseInt(normalized.slice(5, 7), 16)
    };
}

function rgbToHsl({ r, g, b }) {
    const red = r / 255;
    const green = g / 255;
    const blue = b / 255;
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const delta = max - min;
    let hue = 0;

    if (delta !== 0) {
        if (max === red) {
            hue = ((green - blue) / delta) % 6;
        } else if (max === green) {
            hue = ((blue - red) / delta) + 2;
        } else {
            hue = ((red - green) / delta) + 4;
        }
    }

    hue = Math.round(hue * 60);
    if (hue < 0) hue += 360;

    const lightness = (max + min) / 2;
    const saturation = delta === 0
        ? 0
        : delta / (1 - Math.abs((2 * lightness) - 1));

    return {
        h: hue,
        s: saturation,
        l: lightness
    };
}

function hexToHsl(hex, fallback = '#7ea8ff') {
    return rgbToHsl(parseHexColor(hex, fallback));
}

function toLinearChannel(channel) {
    const normalized = channel / 255;
    return normalized <= 0.03928
        ? normalized / 12.92
        : Math.pow((normalized + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex, fallback = '#7ea8ff') {
    const { r, g, b } = parseHexColor(hex, fallback);
    const red = toLinearChannel(r);
    const green = toLinearChannel(g);
    const blue = toLinearChannel(b);
    return (0.2126 * red) + (0.7152 * green) + (0.0722 * blue);
}

function contrastRatio(leftHex, rightHex) {
    const left = relativeLuminance(leftHex);
    const right = relativeLuminance(rightHex);
    const lighter = Math.max(left, right);
    const darker = Math.min(left, right);
    return (lighter + 0.05) / (darker + 0.05);
}

const TILE_COLOR_NUMBERS = Object.freeze(
    Object.fromEntries(
        Object.entries(TILE_COLOR_HEX).map(([key, value]) => [key, hexToNumber(value)])
    )
);

const BOARD_THEME_PALETTES = Object.freeze({
    default: Object.freeze({
        boardBase: '#101929',
        boardTrim: '#274564',
        boardTrimEmissive: '#12263c',
        centerBase: '#152336',
        centerFelt: '#1c314a',
        centerFeltEmissive: '#0f1d30',
        tileFaceTop: '#24364f',
        tileFaceBottom: '#132032',
        tileSheen: 'rgba(130, 168, 245, 0.09)',
        tileBorder: '#798db4',
        tileInnerBorder: 'rgba(255, 255, 255, 0.18)',
        tileFooterTop: '#22354e',
        tileFooterBottom: '#121d2f',
        tileSide: '#2e4464',
        tileSideEmissive: '#0a1321',
        cornerFaceTop: '#213651',
        cornerFaceBottom: '#142031',
        cornerBorder: '#7e92b8',
        mortgageTop: '#4a5363',
        mortgageBottom: '#282f3a',
        mortgageBorder: '#8c98ae',
        textPrimary: '#f5f8ff',
        textSecondary: '#dce7ff',
        textAccent: '#ffe08e',
        outerRing: '#6daeff',
        innerRing: '#ffca73',
        logoOpacity: 0.84
    }),
    egypt: Object.freeze({
        boardBase: '#111a2b',
        boardTrim: '#2c4a67',
        boardTrimEmissive: '#132739',
        centerBase: '#172538',
        centerFelt: '#1d3348',
        centerFeltEmissive: '#102032',
        tileFaceTop: '#253851',
        tileFaceBottom: '#142132',
        tileSheen: 'rgba(140, 178, 245, 0.09)',
        tileBorder: '#7e92ba',
        tileInnerBorder: 'rgba(255, 255, 255, 0.18)',
        tileFooterTop: '#23364f',
        tileFooterBottom: '#131e30',
        tileSide: '#314765',
        tileSideEmissive: '#0b1422',
        cornerFaceTop: '#223851',
        cornerFaceBottom: '#152131',
        cornerBorder: '#8194bb',
        mortgageTop: '#4d5665',
        mortgageBottom: '#2b323d',
        mortgageBorder: '#8f9bb0',
        textPrimary: '#f5f8ff',
        textSecondary: '#dce7ff',
        textAccent: '#ffe08e',
        outerRing: '#72b6ff',
        innerRing: '#f2c370',
        logoOpacity: 0.84
    }),
    countries: Object.freeze({
        boardBase: '#0f1a28',
        boardTrim: '#224866',
        boardTrimEmissive: '#10283c',
        centerBase: '#132536',
        centerFelt: '#17384c',
        centerFeltEmissive: '#0d2332',
        tileFaceTop: '#233851',
        tileFaceBottom: '#132130',
        tileSheen: 'rgba(120, 196, 238, 0.08)',
        tileBorder: '#7b94b6',
        tileInnerBorder: 'rgba(255, 255, 255, 0.18)',
        tileFooterTop: '#21374f',
        tileFooterBottom: '#121f2f',
        tileSide: '#2d4761',
        tileSideEmissive: '#0a1420',
        cornerFaceTop: '#1f3850',
        cornerFaceBottom: '#13202f',
        cornerBorder: '#7f99bb',
        mortgageTop: '#495664',
        mortgageBottom: '#29303a',
        mortgageBorder: '#8d9aad',
        textPrimary: '#f5f8ff',
        textSecondary: '#ddeaff',
        textAccent: '#ffe197',
        outerRing: '#79d0ff',
        innerRing: '#7fe2c7',
        logoOpacity: 0.82
    })
});

function getTileColorHex(colorKey = 'corner') {
    return TILE_COLOR_HEX[colorKey] || TILE_COLOR_HEX.corner;
}

function getTileColorNumber(colorKey = 'corner') {
    return TILE_COLOR_NUMBERS[colorKey] || TILE_COLOR_NUMBERS.corner;
}

function getBoardThemePalette(themeId = 'default') {
    return BOARD_THEME_PALETTES[themeId] || BOARD_THEME_PALETTES.default;
}

const exported = {
    TILE_COLOR_HEX,
    TILE_COLOR_NUMBERS,
    BOARD_THEME_PALETTES,
    normalizeHex,
    hexToNumber,
    parseHexColor,
    rgbToHsl,
    hexToHsl,
    relativeLuminance,
    contrastRatio,
    getTileColorHex,
    getTileColorNumber,
    getBoardThemePalette
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
} else {
    window.MonopolyBoardPalette = exported;
}
