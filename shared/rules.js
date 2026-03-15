// ═══════════════════════════════════════════════════════════
//  RULE HELPERS — Shared Monopoly rule utilities
// ═══════════════════════════════════════════════════════════

(function (root, factory) {
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory();
    } else {
        root.MonopolyRules = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const HOUSE_MULTIPLIERS = [1, 5, 15, 45, 80, 125];

    function getStreetGroupProperties(properties, colorGroup) {
        return (properties || []).filter(property => property.type === 'property' && property.colorGroup === colorGroup);
    }

    function getOwnedPropertyCount(properties, ownerId, type) {
        return (properties || []).filter(property => property.type === type && property.owner === ownerId).length;
    }

    function playerOwnsFullColorGroup(properties, playerId, colorGroup) {
        const group = getStreetGroupProperties(properties, colorGroup);
        return group.length > 0 && group.every(property => property.owner === playerId);
    }

    function colorGroupHasBuildings(properties, colorGroup) {
        return getStreetGroupProperties(properties, colorGroup).some(property => property.houses > 0);
    }

    function colorGroupHasMortgaged(properties, colorGroup) {
        return getStreetGroupProperties(properties, colorGroup).some(property => property.isMortgaged);
    }

    function getColorGroupHouseCounts(properties, colorGroup) {
        return getStreetGroupProperties(properties, colorGroup).map(property => property.houses || 0);
    }

    function getGroupHouseExtremes(properties, colorGroup) {
        const counts = getColorGroupHouseCounts(properties, colorGroup);
        if (!counts.length) {
            return { min: 0, max: 0 };
        }
        return {
            min: Math.min(...counts),
            max: Math.max(...counts)
        };
    }

    function isGroupAssetLocked(properties, tile) {
        return tile?.type === 'property' && Boolean(tile.colorGroup) && colorGroupHasBuildings(properties, tile.colorGroup);
    }

    function getGroupAssetLockMessage(tile, action) {
        return `Sell all buildings in the ${tile.colorGroup} set before ${action}`;
    }

    function canManageAssets(gameState, playerId) {
        if (!gameState || !playerId) return false;
        if (gameState.pauseState) return false;
        if (!['waiting', 'buying', 'done'].includes(gameState.turnPhase)) return false;
        return gameState.currentPlayerId === playerId;
    }

    function validateUpgrade(properties, playerId, tileIndex) {
        const tile = properties?.[tileIndex];
        if (!tile || tile.type !== 'property') {
            return { ok: false, code: 'invalid-property', message: 'Choose a street property to upgrade.' };
        }
        if (tile.owner !== playerId) {
            return { ok: false, code: 'not-owner', message: 'You must own that property to upgrade it.' };
        }
        if (tile.isMortgaged) {
            return { ok: false, code: 'mortgaged-property', message: 'Unmortgage this property before building on it.' };
        }
        if (!playerOwnsFullColorGroup(properties, playerId, tile.colorGroup)) {
            return { ok: false, code: 'missing-color-set', message: 'Own the full color group before upgrading.' };
        }
        if (colorGroupHasMortgaged(properties, tile.colorGroup)) {
            return { ok: false, code: 'group-mortgaged', message: 'Unmortgage every property in this color group before building.' };
        }
        if ((tile.houses || 0) >= 5) {
            return { ok: false, code: 'max-buildings', message: 'That property already has a hotel.' };
        }

        return { ok: true, tile };
    }

    function validateDowngrade(properties, playerId, tileIndex) {
        const tile = properties?.[tileIndex];
        if (!tile || tile.type !== 'property') {
            return { ok: false, code: 'invalid-property', message: 'Choose a street property to downgrade.' };
        }
        if (tile.owner !== playerId) {
            return { ok: false, code: 'not-owner', message: 'You must own that property to downgrade it.' };
        }
        if ((tile.houses || 0) <= 0) {
            return { ok: false, code: 'no-buildings', message: 'That property has no buildings to sell.' };
        }

        return { ok: true, tile };
    }

    function calculateRent(properties, property, diceTotal, context = {}) {
        if (!property || !property.owner || property.isMortgaged) return 0;

        if (property.type === 'railroad') {
            const count = getOwnedPropertyCount(properties, property.owner, 'railroad');
            let rent = 25 * Math.pow(2, Math.max(count - 1, 0));
            if (context.doubleRailroadRent) {
                rent *= 2;
            }
            return rent;
        }

        if (property.type === 'utility') {
            if (typeof context.utilityDiceTotal === 'number') {
                return context.utilityDiceTotal * 10;
            }
            const count = getOwnedPropertyCount(properties, property.owner, 'utility');
            return count === 1 ? diceTotal * 4 : diceTotal * 10;
        }

        if (property.type === 'property') {
            const rentTiers = Array.isArray(property.rentTiers) ? property.rentTiers : null;
            if ((property.houses || 0) > 0) {
                if (rentTiers?.[property.houses] != null) {
                    return rentTiers[property.houses];
                }
                return property.rent * (HOUSE_MULTIPLIERS[property.houses] || 1);
            }
            if (playerOwnsFullColorGroup(properties, property.owner, property.colorGroup)) {
                return (rentTiers?.[0] ?? property.rent) * 2;
            }
        }

        return property.rent;
    }

    function calculateTaxAmount(tile, player) {
        if (!tile || tile.type !== 'tax') return 0;

        const playerMoney = Number.isFinite(player?.money) ? player.money : 0;
        if (typeof tile.name === 'string' && tile.name.toLowerCase().includes('income tax')) {
            return Math.max(0, Math.floor(playerMoney * 0.1));
        }

        return Math.max(0, Number(tile.rent) || 0);
    }

    function findNearestTileIndex(properties, startIndex, type) {
        if (!Array.isArray(properties) || !properties.length) return null;
        for (let step = 1; step <= properties.length; step++) {
            const index = (startIndex + step) % properties.length;
            if (properties[index]?.type === type) {
                return index;
            }
        }
        return null;
    }

    return {
        HOUSE_MULTIPLIERS,
        getStreetGroupProperties,
        getOwnedPropertyCount,
        playerOwnsFullColorGroup,
        colorGroupHasBuildings,
        colorGroupHasMortgaged,
        getColorGroupHouseCounts,
        getGroupHouseExtremes,
        isGroupAssetLocked,
        getGroupAssetLockMessage,
        canManageAssets,
        validateUpgrade,
        validateDowngrade,
        calculateRent,
        calculateTaxAmount,
        findNearestTileIndex
    };
});
