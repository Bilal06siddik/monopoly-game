function getStateSequence(state) {
    const value = Number.parseInt(state?.stateSequence, 10);
    return Number.isFinite(value) && value > 0 ? value : 0;
}

function normalizeSerializedGameState(state) {
    if (!state || !Array.isArray(state.players) || state.players.length === 0) {
        return state;
    }

    const playerById = state.currentPlayerId
        ? state.players.find(player => player.id === state.currentPlayerId) || null
        : null;
    const playerByIndex = Number.isInteger(state.currentPlayerIndex)
        ? state.players[state.currentPlayerIndex] || null
        : null;
    const normalizedPlayer = playerById
        || playerByIndex
        || state.players.find(player => player.isActive)
        || state.players[0]
        || null;

    if (!normalizedPlayer) {
        return state;
    }

    const normalizedIndex = state.players.findIndex(player => player.id === normalizedPlayer.id);
    if (
        state.currentPlayerId === normalizedPlayer.id
        && state.currentPlayerIndex === normalizedIndex
    ) {
        return state;
    }

    return {
        ...state,
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
