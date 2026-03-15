// ═══════════════════════════════════════════════════════════
//  TRADE HELPERS — Shared validation for offer lifecycle
// ═══════════════════════════════════════════════════════════

(function (root, factory) {
    if (typeof module !== 'undefined' && module.exports) {
        const rules = require('./rules');
        module.exports = factory(rules);
    } else {
        root.MonopolyTradeUtils = factory(root.MonopolyRules);
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (rules) {
    function normalizeCash(value) {
        const amount = Number.parseInt(value ?? 0, 10);
        return Number.isNaN(amount) ? 0 : amount;
    }

    function normalizePropertyList(value) {
        const list = Array.isArray(value) ? value : [];
        return [...new Set(list
            .map(item => Number.parseInt(item, 10))
            .filter(item => !Number.isNaN(item))
        )];
    }

    function validateTradeOffer(gameState, tradeInput) {
        if (!gameState) {
            return { ok: false, code: 'missing-game', message: 'Trade validation requires a running game.' };
        }

        const from = gameState.getPlayerById(tradeInput.fromId);
        const to = gameState.getPlayerById(tradeInput.toId);
        if (!from || !to) {
            return { ok: false, code: 'missing-player', message: 'Both trade players must exist.' };
        }
        if (from.id === to.id) {
            return { ok: false, code: 'self-trade', message: 'You cannot trade with yourself.' };
        }
        if (!from.isActive || !to.isActive) {
            return { ok: false, code: 'inactive-player', message: 'Trades require two active players.' };
        }

        const offerCash = normalizeCash(tradeInput.offerCash);
        const requestCash = normalizeCash(tradeInput.requestCash);
        if (offerCash < 0 || requestCash < 0) {
            return { ok: false, code: 'negative-cash', message: 'Trade cash values cannot be negative.' };
        }

        const offerProperties = normalizePropertyList(tradeInput.offerProperties);
        const requestProperties = normalizePropertyList(tradeInput.requestProperties);
        const isEmpty = offerCash === 0 && requestCash === 0 && offerProperties.length === 0 && requestProperties.length === 0;
        if (isEmpty) {
            return { ok: false, code: 'empty-trade', message: 'Add cash or property before sending a trade.' };
        }

        if (offerCash > 0 && from.money < offerCash) {
            return { ok: false, code: 'insufficient-offer-cash', message: 'You do not have enough cash for that offer.' };
        }
        if (requestCash > 0 && to.money < requestCash) {
            return { ok: false, code: 'insufficient-request-cash', message: `${to.character} no longer has enough cash for that request.` };
        }

        const offeredTiles = offerProperties.map(index => gameState.properties[index]).filter(Boolean);
        const requestedTiles = requestProperties.map(index => gameState.properties[index]).filter(Boolean);

        if (offeredTiles.length !== offerProperties.length || requestedTiles.length !== requestProperties.length) {
            return { ok: false, code: 'invalid-property', message: 'Trade offer references an invalid property.' };
        }

        if (offeredTiles.some(tile => tile.owner !== from.id) || requestedTiles.some(tile => tile.owner !== to.id)) {
            return { ok: false, code: 'stale-ownership', message: 'One or more properties in this trade changed owners.' };
        }

        const lockedTile = [...offeredTiles, ...requestedTiles].find(tile => rules.isGroupAssetLocked(gameState.properties, tile));
        if (lockedTile) {
            return {
                ok: false,
                code: 'group-buildings-lock',
                message: rules.getGroupAssetLockMessage(lockedTile, 'trading')
            };
        }

        return {
            ok: true,
            value: {
                id: tradeInput.id || null,
                fromId: from.id,
                fromCharacter: from.character,
                toId: to.id,
                toCharacter: to.character,
                offerProperties,
                offerCash,
                requestProperties,
                requestCash,
                counterToTradeId: tradeInput.counterToTradeId || null
            }
        };
    }

    return {
        normalizeCash,
        normalizePropertyList,
        validateTradeOffer
    };
});
