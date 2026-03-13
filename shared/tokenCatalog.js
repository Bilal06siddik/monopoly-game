const TOKEN_OPTIONS = [
    { id: 'pawn', label: 'Pawn' },
    { id: 'battleship', label: 'Battleship' },
    { id: 'sports-car', label: 'Sports Car' }
];

const DEFAULT_TOKEN_BY_CHARACTER = {
    bilo: 'pawn',
    osss: 'pawn',
    bdlbaky: 'sports-car',
    fawzy: 'battleship',
    hamza: 'pawn',
    missiry: 'pawn'
};

const VALID_TOKEN_IDS = new Set(TOKEN_OPTIONS.map(option => option.id));

function normalizeTokenId(tokenId) {
    const value = typeof tokenId === 'string' ? tokenId.trim().toLowerCase() : '';
    return VALID_TOKEN_IDS.has(value) ? value : null;
}

function getDefaultTokenForCharacter(character) {
    const preferred = normalizeTokenId(DEFAULT_TOKEN_BY_CHARACTER[character]);
    return preferred || TOKEN_OPTIONS[0].id;
}

const TokenCatalog = {
    TOKEN_OPTIONS,
    DEFAULT_TOKEN_BY_CHARACTER,
    normalizeTokenId,
    getDefaultTokenForCharacter
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = TokenCatalog;
} else {
    window.TokenCatalog = TokenCatalog;
}
