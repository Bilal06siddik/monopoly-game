// ═══════════════════════════════════════════════════════════
//  SUMMARY HELPERS — Match summary generation
// ═══════════════════════════════════════════════════════════

(function (root, factory) {
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory();
    } else {
        root.MonopolySummary = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    function getPropertyLiquidationValue(property) {
        if (!property || !property.owner) return 0;
        return Math.floor(property.price * 0.5) + ((property.houses || 0) * Math.floor(property.price * 0.25));
    }

    function getPlayerNetWorth(player, properties) {
        const ownedValue = (properties || [])
            .filter(property => property.owner === player.id)
            .reduce((total, property) => total + getPropertyLiquidationValue(property), 0);
        return player.money + ownedValue;
    }

    function buildPlacements(gameState, winnerId) {
        const winner = gameState.players.find(player => player.id === winnerId);
        const eliminatedIds = [...gameState.eliminationOrder].reverse();
        const eliminatedSet = new Set(eliminatedIds);
        const others = gameState.players
            .filter(player => player.id !== winnerId && !eliminatedSet.has(player.id))
            .sort((left, right) => getPlayerNetWorth(right, gameState.properties) - getPlayerNetWorth(left, gameState.properties));

        const ranked = [
            ...(winner ? [winner] : []),
            ...others,
            ...eliminatedIds
                .map(playerId => gameState.getPlayerById(playerId))
                .filter(Boolean)
        ];

        return ranked.map((player, index) => ({
            placement: index + 1,
            playerId: player.id,
            character: player.character,
            color: player.color,
            isWinner: player.id === winnerId,
            isActive: player.isActive,
            money: player.money,
            netWorth: getPlayerNetWorth(player, gameState.properties),
            propertiesOwned: gameState.properties.filter(property => property.owner === player.id).length,
            pardons: player.pardons,
            stats: { ...player.stats }
        }));
    }

    function generateGameSummary(gameState, winnerId) {
        const startedAt = gameState.matchStartedAt || Date.now();
        const endedAt = gameState.matchEndedAt || Date.now();
        const durationMs = Math.max(0, endedAt - startedAt);
        const topVisitedProperties = [...gameState.properties]
            .filter(property => property.landedCount > 0)
            .sort((left, right) => right.landedCount - left.landedCount)
            .slice(0, 5)
            .map(property => ({
                index: property.index,
                name: property.name,
                landedCount: property.landedCount
            }));
        const topRentProperties = [...gameState.properties]
            .filter(property => property.rentCollected > 0)
            .sort((left, right) => right.rentCollected - left.rentCollected)
            .slice(0, 5)
            .map(property => ({
                index: property.index,
                name: property.name,
                rentCollected: property.rentCollected
            }));

        return {
            winnerId,
            startedAt,
            endedAt,
            durationMs,
            turnCount: gameState.turnCount,
            placements: buildPlacements(gameState, winnerId),
            topVisitedProperties,
            topRentProperties
        };
    }

    return {
        getPropertyLiquidationValue,
        getPlayerNetWorth,
        generateGameSummary
    };
});
