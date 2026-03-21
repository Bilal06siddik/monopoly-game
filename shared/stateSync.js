function getStateSequence(state) {
    const value = Number.parseInt(state?.stateSequence, 10);
    return Number.isFinite(value) && value > 0 ? value : 0;
}

const CARRY_FORWARD_FIELDS = Object.freeze([
    'roomCode',
    'joinUrl',
    'boardId',
    'boardName',
    'boardTemplateId',
    'boardTheme',
    'rulePreset',
    'rulesConfig',
    'turnTimerEnabled',
    'hostPlayerId'
]);

function carryForwardStateFields(state, previousState = null) {
    if (!state || !previousState) {
        return state;
    }

    let didChange = false;
    const carriedFields = {};

    CARRY_FORWARD_FIELDS.forEach((field) => {
        if (state[field] !== undefined || previousState[field] === undefined) {
            return;
        }

        carriedFields[field] = previousState[field];
        didChange = true;
    });

    return didChange
        ? {
            ...state,
            ...carriedFields
        }
        : state;
}

function normalizeSerializedGameState(state, previousState = null) {
    if (!state || !Array.isArray(state.players) || state.players.length === 0) {
        return state;
    }

    const mergedState = carryForwardStateFields(state, previousState);
    const previousPlayersById = Array.isArray(previousState?.players)
        ? new Map(previousState.players.map(player => [player.id, player]))
        : null;
    const players = previousPlayersById
        ? mergedState.players.map(player => {
            const previousPlayer = previousPlayersById.get(player.id);
            if (!previousPlayer) return player;

            return {
                ...player,
                customAvatarUrl: player.customAvatarUrl || previousPlayer.customAvatarUrl || null
            };
        })
        : mergedState.players;
    const previousPropertiesByIndex = Array.isArray(previousState?.properties)
        ? new Map(previousState.properties.map(property => [property.index, property]))
        : null;
    const properties = previousPropertiesByIndex && Array.isArray(mergedState.properties)
        ? mergedState.properties.map(property => {
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
        : mergedState.properties;
    const historyEvents = Array.isArray(mergedState.historyEvents)
        ? mergedState.historyEvents
        : (Array.isArray(previousState?.historyEvents) ? previousState.historyEvents : []);

    const playerById = mergedState.currentPlayerId
        ? players.find(player => player.id === mergedState.currentPlayerId) || null
        : null;
    const playerByIndex = Number.isInteger(mergedState.currentPlayerIndex)
        ? players[mergedState.currentPlayerIndex] || null
        : null;
    const normalizedPlayer = playerById
        || playerByIndex
        || players.find(player => player.isActive)
        || players[0]
        || null;

    if (!normalizedPlayer) {
        return mergedState;
    }

    const normalizedIndex = players.findIndex(player => player.id === normalizedPlayer.id);
    if (
        mergedState.players === players
        && mergedState.properties === properties
        && mergedState.historyEvents === historyEvents
        &&
        mergedState.currentPlayerId === normalizedPlayer.id
        && mergedState.currentPlayerIndex === normalizedIndex
    ) {
        return mergedState;
    }

    return {
        ...mergedState,
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
