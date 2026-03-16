const test = require('node:test');
const assert = require('node:assert/strict');

const BOARD_DATA = require('../shared/boardData');
const { GameState } = require('../shared/gameState');
const Rules = require('../shared/rules');
const CardUtils = require('../shared/cardUtils');
const TradeUtils = require('../shared/tradeUtils');
const {
    normalizeSerializedGameState,
    isStaleSerializedGameState
} = require('../shared/stateSync');

function createGame() {
    const game = new GameState(BOARD_DATA);
    const p1 = game.addPlayer('p1', 'Bilo', '#6c5ce7', 'session-1');
    const p2 = game.addPlayer('p2', 'Os', '#e17055', 'session-2');
    game.isGameStarted = true;
    return { game, p1, p2 };
}

test('moving backwards wraps around the board without GO payout', () => {
    const { game, p1 } = createGame();
    p1.position = 1;
    p1.money = 1200;

    const result = game.movePlayer(p1.id, -3);

    assert.equal(result.newPosition, 38);
    assert.equal(result.passedGo, false);
    assert.equal(p1.money, 1200);
});

test('movePlayerTo GO collection pays $400 on land and $200 on pass', () => {
    const { game, p1 } = createGame();
    p1.position = 39;
    p1.money = 500;

    const noCollection = game.movePlayerTo(p1.id, 0, {
        collectGoOnPass: false,
        collectGoOnLand: false
    });

    assert.equal(noCollection.newPosition, 0);
    assert.equal(noCollection.passedGo, false);
    assert.equal(p1.money, 500);

    p1.position = 39;
    const landOnGo = game.movePlayerTo(p1.id, 0);

    assert.equal(landOnGo.passedGo, true);
    assert.equal(p1.money, 900);

    p1.position = 39;
    p1.money = 500;

    const passGo = game.movePlayerTo(p1.id, 5);

    assert.equal(passGo.passedGo, true);
    assert.equal(passGo.newPosition, 5);
    assert.equal(p1.money, 700);
});

test('collect and pay cards update cash with signed amount labels', () => {
    const { game, p1 } = createGame();

    let result = CardUtils.resolveActionCard(game, p1, { type: 'collect', amount: 75 });
    assert.equal(result.amountDelta, 75);
    assert.equal(result.amountLabel, '+$75');
    assert.equal(p1.money, 1575);

    result = CardUtils.resolveActionCard(game, p1, { type: 'pay', amount: 40 });
    assert.equal(result.amountDelta, -40);
    assert.equal(result.amountLabel, '-$40');
    assert.equal(p1.money, 1535);
});

test('moveAbsolute sendToJail sets player jail state and skips tile evaluation', () => {
    const { game, p1 } = createGame();
    p1.position = 7;

    const result = CardUtils.resolveActionCard(game, p1, {
        type: 'moveAbsolute',
        targetIndex: 10,
        sendToJail: true
    });

    assert.equal(p1.position, 10);
    assert.equal(p1.inJail, true);
    assert.equal(p1.jailTurns, 0);
    assert.equal(result.sentToJail, true);
    assert.equal(result.shouldEvaluateTile, false);
});

test('pardon cards increment player inventory', () => {
    const { game, p1 } = createGame();
    const result = CardUtils.resolveActionCard(game, p1, { type: 'pardon' });

    assert.equal(p1.pardons, 1);
    assert.equal(result.amountLabel, '+1 Pardon');
});

test('trade validation rejects self-trades and inactive participants', () => {
    const { game, p1, p2 } = createGame();

    let validation = TradeUtils.validateTradeOffer(game, {
        fromId: p1.id,
        toId: p1.id,
        offerProperties: [],
        offerCash: 10,
        requestProperties: [],
        requestCash: 0
    });
    assert.equal(validation.ok, false);
    assert.equal(validation.code, 'self-trade');

    p2.isActive = false;
    validation = TradeUtils.validateTradeOffer(game, {
        fromId: p1.id,
        toId: p2.id,
        offerProperties: [],
        offerCash: 10,
        requestProperties: [],
        requestCash: 0
    });
    assert.equal(validation.ok, false);
    assert.equal(validation.code, 'inactive-player');
});

test('trade validation blocks transfers from groups with buildings', () => {
    const { game, p1, p2 } = createGame();
    game.properties[1].owner = p1.id;
    game.properties[3].owner = p1.id;
    game.properties[3].houses = 1;

    const validation = TradeUtils.validateTradeOffer(game, {
        fromId: p1.id,
        toId: p2.id,
        offerProperties: [1],
        offerCash: 0,
        requestProperties: [],
        requestCash: 0
    });

    assert.equal(validation.ok, false);
    assert.equal(validation.code, 'group-buildings-lock');
});

test('asset management checks deny paused or wrong-phase actions', () => {
    assert.equal(Rules.canManageAssets({
        currentPlayerId: 'p1',
        pauseState: null,
        turnPhase: 'waiting'
    }, 'p1'), true);

    assert.equal(Rules.canManageAssets({
        currentPlayerId: 'p1',
        pauseState: { reason: 'player-disconnected' },
        turnPhase: 'waiting'
    }, 'p1'), false);

    assert.equal(Rules.canManageAssets({
        currentPlayerId: 'p1',
        pauseState: null,
        turnPhase: 'moving'
    }, 'p1'), false);
});

test('state normalization aligns current player id and index', () => {
    const normalized = normalizeSerializedGameState({
        players: [
            { id: 'p1', isActive: false },
            { id: 'p2', isActive: true }
        ],
        currentPlayerId: 'missing-player',
        currentPlayerIndex: 42,
        stateSequence: 9
    });

    assert.equal(normalized.currentPlayerId, 'p2');
    assert.equal(normalized.currentPlayerIndex, 1);
});

test('state normalization preserves known custom avatar URLs when gameplay sync omits them', () => {
    const normalized = normalizeSerializedGameState({
        players: [
            { id: 'p1', isActive: true, customAvatarUrl: null },
            { id: 'p2', isActive: false, customAvatarUrl: null }
        ],
        currentPlayerId: 'p1',
        currentPlayerIndex: 0,
        stateSequence: 10
    }, {
        players: [
            { id: 'p1', customAvatarUrl: 'data:image/webp;base64,abc123' },
            { id: 'p2', customAvatarUrl: null }
        ]
    });

    assert.equal(normalized.players[0].customAvatarUrl, 'data:image/webp;base64,abc123');
});

test('state normalization preserves cached match and property history when lightweight sync omits them', () => {
    const normalized = normalizeSerializedGameState({
        players: [
            { id: 'p1', isActive: true }
        ],
        properties: [
            { index: 0, owner: null, history: null },
            { index: 1, owner: 'p1', history: null }
        ],
        historyEvents: null,
        currentPlayerId: 'p1',
        currentPlayerIndex: 0,
        stateSequence: 11
    }, {
        players: [
            { id: 'p1', customAvatarUrl: null }
        ],
        properties: [
            { index: 0, name: 'Old Kent Road', colorGroup: 'brown', owner: null, history: [{ type: 'buy', character: 'Bilo', color: '#fff', amount: 60 }] },
            { index: 1, name: 'Whitechapel Road', colorGroup: 'brown', owner: null, history: [] }
        ],
        historyEvents: [{ text: 'Bilo bought GO', type: 'buy' }]
    });

    assert.equal(normalized.historyEvents.length, 1);
    assert.equal(normalized.properties[0].history.length, 1);
    assert.equal(normalized.properties[1].history.length, 0);
    assert.equal(normalized.properties[0].name, 'Old Kent Road');
    assert.equal(normalized.properties[0].colorGroup, 'brown');
    assert.equal(normalized.properties[1].owner, 'p1');
});

test('stale state checks ignore snapshots without usable sequence numbers', () => {
    assert.equal(isStaleSerializedGameState({ stateSequence: 2 }, null), false);
    assert.equal(isStaleSerializedGameState({}, { stateSequence: 3 }), false);
    assert.equal(isStaleSerializedGameState({ stateSequence: 3 }, {}), false);
});
