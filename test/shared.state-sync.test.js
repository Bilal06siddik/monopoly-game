const test = require('node:test');
const assert = require('node:assert/strict');

const {
    normalizeSerializedGameState
} = require('../shared/stateSync');

test('partial serialized state carries forward board metadata and static property fields', () => {
    const previousState = {
        roomCode: 'ROOM123',
        joinUrl: '/?room=ROOM123',
        boardId: 'countries',
        boardName: 'Countries',
        boardTemplateId: 'capitalista_reference_40',
        boardTheme: 'countries',
        rulePreset: 'capitalista_v2',
        rulesConfig: { requireEvenBuilding: true, loansEnabled: false },
        turnTimerEnabled: true,
        hostPlayerId: 'p1',
        players: [
            { id: 'p1', isActive: true, customAvatarUrl: 'data:image/png;base64,abc' },
            { id: 'p2', isActive: true, customAvatarUrl: null }
        ],
        properties: [
            {
                index: 0,
                name: 'GO',
                type: 'corner',
                price: 0,
                rent: 0,
                rentTiers: null,
                colorGroup: null,
                owner: null,
                houses: 0,
                isMortgaged: false,
                landedCount: 0,
                rentCollected: 0,
                history: []
            }
        ],
        currentPlayerIndex: 0,
        currentPlayerId: 'p1',
        historyEvents: [{ text: 'Older entry' }],
        stateSequence: 10
    };

    const incomingState = {
        players: [
            { id: 'p1', isActive: true, customAvatarUrl: null },
            { id: 'p2', isActive: true, customAvatarUrl: null }
        ],
        properties: [
            {
                index: 0,
                owner: null,
                houses: 0,
                isMortgaged: false,
                landedCount: 1,
                rentCollected: 0,
                history: null
            }
        ],
        currentPlayerIndex: 0,
        currentPlayerId: 'p1',
        stateSequence: 11
    };

    const normalized = normalizeSerializedGameState(incomingState, previousState);

    assert.equal(normalized.boardId, 'countries');
    assert.equal(normalized.boardName, 'Countries');
    assert.equal(normalized.boardTheme, 'countries');
    assert.equal(normalized.roomCode, 'ROOM123');
    assert.equal(normalized.hostPlayerId, 'p1');
    assert.equal(normalized.players[0].customAvatarUrl, 'data:image/png;base64,abc');
    assert.equal(normalized.properties[0].name, 'GO');
    assert.equal(normalized.properties[0].type, 'corner');
    assert.equal(normalized.properties[0].landedCount, 1);
    assert.deepEqual(normalized.historyEvents, [{ text: 'Older entry' }]);
});

test('explicit null fields in serialized state clear previous carried metadata', () => {
    const previousState = {
        players: [{ id: 'p1', isActive: true }],
        properties: [{ index: 0, name: 'GO', owner: null, houses: 0, isMortgaged: false, landedCount: 0, rentCollected: 0, history: [] }],
        currentPlayerIndex: 0,
        currentPlayerId: 'p1',
        hostPlayerId: 'p1',
        stateSequence: 10
    };

    const incomingState = {
        players: [{ id: 'p1', isActive: true }],
        properties: [{ index: 0, owner: null, houses: 0, isMortgaged: false, landedCount: 0, rentCollected: 0, history: null }],
        currentPlayerIndex: 0,
        currentPlayerId: 'p1',
        hostPlayerId: null,
        stateSequence: 11
    };

    const normalized = normalizeSerializedGameState(incomingState, previousState);

    assert.equal(normalized.hostPlayerId, null);
});
