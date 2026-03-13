const test = require('node:test');
const assert = require('node:assert/strict');

const BOARD_DATA = require('../shared/boardData');
const { GameState } = require('../shared/gameState');
const Rules = require('../shared/rules');
const TradeUtils = require('../shared/tradeUtils');
const CardUtils = require('../shared/cardUtils');
const SummaryUtils = require('../shared/summary');

function createGame() {
    const game = new GameState(BOARD_DATA);
    const p1 = game.addPlayer('p1', 'Bilo', '#6c5ce7', 'session-1');
    const p2 = game.addPlayer('p2', 'Os', '#e17055', 'session-2');
    const p3 = game.addPlayer('p3', 'Ziko', '#00b894', 'session-3');
    game.isGameStarted = true;
    game.matchStartedAt = 1_000;
    game.matchEndedAt = 61_000;
    game.turnCount = 14;
    return { game, p1, p2, p3 };
}

test('undeveloped full color sets charge double rent', () => {
    const { game, p1 } = createGame();
    game.properties[1].owner = p1.id;
    game.properties[3].owner = p1.id;

    const rent = Rules.calculateRent(game.properties, game.properties[1], 7);
    assert.equal(rent, game.properties[1].rent * 2);
});

test('houses override monopoly double-rent handling', () => {
    const { game, p1 } = createGame();
    game.properties[1].owner = p1.id;
    game.properties[3].owner = p1.id;
    game.properties[1].houses = 1;

    const rent = Rules.calculateRent(game.properties, game.properties[1], 7);
    assert.equal(rent, game.properties[1].rent * 5);
});

test('mortgaged properties collect no rent', () => {
    const { game, p1 } = createGame();
    game.properties[1].owner = p1.id;
    game.properties[3].owner = p1.id;
    game.properties[1].isMortgaged = true;

    assert.equal(Rules.calculateRent(game.properties, game.properties[1], 9), 0);
});

test('building is blocked when any sibling in the set is mortgaged', () => {
    const { game, p1 } = createGame();
    [6, 8, 9].forEach(index => {
        game.properties[index].owner = p1.id;
    });
    game.properties[8].isMortgaged = true;

    const validation = Rules.validateUpgrade(game.properties, p1.id, 6);
    assert.equal(validation.ok, false);
    assert.equal(validation.code, 'group-mortgaged');
});

test('building and selling validations allow uneven actions', () => {
    const { game, p1 } = createGame();
    [6, 8, 9].forEach(index => {
        game.properties[index].owner = p1.id;
    });

    game.properties[6].houses = 1;
    let validation = Rules.validateUpgrade(game.properties, p1.id, 6);
    assert.equal(validation.ok, true);

    game.properties[8].houses = 1;
    game.properties[9].houses = 1;
    validation = Rules.validateUpgrade(game.properties, p1.id, 6);
    assert.equal(validation.ok, true);

    game.properties[6].houses = 2;
    validation = Rules.validateDowngrade(game.properties, p1.id, 8);
    assert.equal(validation.ok, true);
});

test('trade validation rejects empty and stale offers', () => {
    const { game, p1, p2 } = createGame();
    game.properties[5].owner = p1.id;

    let validation = TradeUtils.validateTradeOffer(game, {
        fromId: p1.id,
        toId: p2.id,
        offerProperties: [],
        offerCash: 0,
        requestProperties: [],
        requestCash: 0
    });
    assert.equal(validation.ok, false);
    assert.equal(validation.code, 'empty-trade');

    validation = TradeUtils.validateTradeOffer(game, {
        fromId: p1.id,
        toId: p2.id,
        offerProperties: [15],
        offerCash: 0,
        requestProperties: [],
        requestCash: 0
    });
    assert.equal(validation.ok, false);
    assert.equal(validation.code, 'stale-ownership');
});

test('trade validation enforces cash availability', () => {
    const { game, p1, p2 } = createGame();
    p1.money = 10;
    p2.money = 20;

    const validation = TradeUtils.validateTradeOffer(game, {
        fromId: p1.id,
        toId: p2.id,
        offerProperties: [],
        offerCash: 50,
        requestProperties: [],
        requestCash: 0
    });
    assert.equal(validation.ok, false);
    assert.equal(validation.code, 'insufficient-offer-cash');
});

test('trade validation rejects bot participants', () => {
    const { game, p1, p2 } = createGame();
    p2.isBot = true;

    const validation = TradeUtils.validateTradeOffer(game, {
        fromId: p1.id,
        toId: p2.id,
        offerProperties: [],
        offerCash: 25,
        requestProperties: [],
        requestCash: 0
    });

    assert.equal(validation.ok, false);
    assert.equal(validation.code, 'bot-trade');
});

test('nearest railroad card movement sets double-rent evaluation', () => {
    const { game, p1 } = createGame();
    p1.position = 7;

    const result = CardUtils.resolveActionCard(game, p1, {
        type: 'moveNearest',
        targetType: 'railroad'
    });

    assert.equal(result.moveResult.newPosition, 15);
    assert.equal(result.shouldEvaluateTile, true);
    assert.equal(result.evaluationContext.doubleRailroadRent, true);
});

test('nearest utility card movement captures the rolled utility dice total', () => {
    const { game, p1 } = createGame();
    p1.position = 22;

    const result = CardUtils.resolveActionCard(game, p1, {
        type: 'moveNearest',
        targetType: 'utility'
    }, {
        drawDice: () => ({ die1: 3, die2: 4, total: 7 })
    });

    assert.equal(result.moveResult.newPosition, 28);
    assert.equal(result.evaluationContext.utilityDiceTotal, 7);
});

test('collect-from-each-player cards transfer money from every active player', () => {
    const { game, p1, p2, p3 } = createGame();

    const result = CardUtils.resolveActionCard(game, p1, {
        type: 'collectFromEach',
        amount: 25
    });

    assert.equal(result.amountDelta, 50);
    assert.equal(p1.money, 1550);
    assert.equal(p2.money, 1475);
    assert.equal(p3.money, 1475);
});

test('summary generation ranks the winner first and exposes top properties', () => {
    const { game, p1, p2 } = createGame();
    game.eliminationOrder = [p2.id];
    game.properties[1].owner = p1.id;
    game.properties[1].landedCount = 6;
    game.properties[1].rentCollected = 120;
    p1.stats.cardsDrawn = 3;

    const summary = SummaryUtils.generateGameSummary(game, p1.id);

    assert.equal(summary.placements[0].playerId, p1.id);
    assert.equal(summary.placements[0].isWinner, true);
    assert.equal(summary.turnCount, 14);
    assert.equal(summary.durationMs, 60_000);
    assert.equal(summary.topVisitedProperties[0].name, game.properties[1].name);
    assert.equal(summary.topRentProperties[0].rentCollected, 120);
});
