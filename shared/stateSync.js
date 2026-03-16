function getStateSequence(state) {
    const value = Number.parseInt(state?.stateSequence, 10);
    return Number.isFinite(value) && value > 0 ? value : 0;
}

function normalizeSerializedGameState(state, previousState = null) {
    if (!state || !Array.isArray(state.players) || state.players.length === 0) {
        return state;
    }

    const previousPlayersById = Array.isArray(previousState?.players)
        ? new Map(previousState.players.map(player => [player.id, player]))
        : null;
    const players = previousPlayersById
        ? state.players.map(player => {
            const previousPlayer = previousPlayersById.get(player.id);
            if (!previousPlayer) return player;

            return {
                ...player,
                customAvatarUrl: player.customAvatarUrl || previousPlayer.customAvatarUrl || null
            };
        })
        : state.players;
    const previousPropertiesByIndex = Array.isArray(previousState?.properties)
        ? new Map(previousState.properties.map(property => [property.index, property]))
        : null;
    const properties = previousPropertiesByIndex && Array.isArray(state.properties)
        ? state.properties.map(property => {
            const previousProperty = previousPropertiesByIndex.get(property.index);
            if (!previousProperty) return property;

            return {
                ...previousProperty,
                ...property,
                history: Array.isArray(property.history)
                    ? property.history
                    : (Array.isArray(previousProperty.history) ? previousProperty.history : [])
            };
        })
        : state.properties;
    const historyEvents = Array.isArray(state.historyEvents)
        ? state.historyEvents
        : (Array.isArray(previousState?.historyEvents) ? previousState.historyEvents : []);

    const playerById = state.currentPlayerId
        ? players.find(player => player.id === state.currentPlayerId) || null
        : null;
    const playerByIndex = Number.isInteger(state.currentPlayerIndex)
        ? players[state.currentPlayerIndex] || null
        : null;
    const normalizedPlayer = playerById
        || playerByIndex
        || players.find(player => player.isActive)
        || players[0]
        || null;

    if (!normalizedPlayer) {
        return state;
    }

    const normalizedIndex = players.findIndex(player => player.id === normalizedPlayer.id);
    if (
        state.players === players
        && state.properties === properties
        && state.historyEvents === historyEvents
        &&
        state.currentPlayerId === normalizedPlayer.id
        && state.currentPlayerIndex === normalizedIndex
    ) {
        return state;
    }

    return {
        ...state,
        players,
        properties,
        historyEvents,
        currentPlayerId: normalizedPlayer.id,
        currentPlayerIndex: normalizedIndex
    };
}

function isStaleSerializedGameState(incomingState, currentState) {
    const incomingSequence = getStateSequence(incomingState);
    const currentSequence = getStateSequence(currentState);

    return incomingSequence > 0
        && currentSequence > 0
        && incomingSequence < currentSequence;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        getStateSequence,
        normalizeSerializedGameState,
        isStaleSerializedGameState
    };
} else {
    window.MonopolyStateSync = {
        getStateSequence,
        normalizeSerializedGameState,
        isStaleSerializedGameState
    };
}
