const test = require('node:test');
const assert = require('node:assert/strict');

const {
    TILE_COLOR_HEX,
    BOARD_THEME_PALETTES,
    hexToHsl,
    contrastRatio
} = require('../shared/boardPalette');

const PROPERTY_GROUPS = ['brown', 'lightblue', 'pink', 'orange', 'red', 'yellow', 'green', 'darkblue'];

test('property group palette stays saturated enough for clear board grouping', () => {
    PROPERTY_GROUPS.forEach((group) => {
        const { s } = hexToHsl(TILE_COLOR_HEX[group]);
        assert.ok(
            s >= 0.34,
            `${group} should stay vivid enough for quick recognition (received saturation ${s.toFixed(3)})`
        );
    });
});

test('property group accents keep strong contrast against the board tile face', () => {
    const surfaceColor = BOARD_THEME_PALETTES.default.tileFaceBottom;

    PROPERTY_GROUPS.forEach((group) => {
        const ratio = contrastRatio(TILE_COLOR_HEX[group], surfaceColor);
        assert.ok(
            ratio >= 3.3,
            `${group} should stand apart from the tile face (received contrast ${ratio.toFixed(3)})`
        );
    });
});

test('board text colors remain highly readable against the board surface', () => {
    Object.entries(BOARD_THEME_PALETTES).forEach(([themeId, palette]) => {
        const ratio = contrastRatio(palette.textPrimary, palette.tileFaceBottom);
        assert.ok(
            ratio >= 7,
            `${themeId} text should remain easy to read on the board face (received contrast ${ratio.toFixed(3)})`
        );
    });
});
