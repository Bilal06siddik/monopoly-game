const test = require('node:test');
const assert = require('node:assert/strict');

const BOARD_DATA = require('../shared/boardData');
const { GameState } = require('../shared/gameState');
const Rules = require('../shared/rules');
const TradeUtils = require('../shared/tradeUtils');
const CardUtils = require('../shared/cardUtils');
const SummaryUtils = require('../shared/summary');
const {
    normalizeSerializedGameState,
    isStaleSerializedGameState
} = require('../shared/stateSync');

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

test('custom rent tiers are used for upgraded properties', () => {
    const { game, p1 } = createGame();
    [31, 32, 34].forEach(index => {
        game.properties[index].owner = p1.id;
    });
    game.properties[34].houses = 3;

    const rent = Rules.calculateRent(game.properties, game.properties[34], 8);
    assert.equal(rent, 1000);
});

test('mortgaged properties collect no rent', () => {
    const { game, p1 } = createGame();
    game.properties[1].owner = p1.id;
    game.properties[3].owner = p1.id;
    game.properties[1].isMortgaged = true;

    assert.equal(Rules.calculateRent(game.properties, game.properties[1], 9), 0);
});

test('owning all railroads charges 400 rent', () => {
    const { game, p1 } = createGame();
    [5, 15, 25, 35].forEach(index => {
        game.properties[index].owner = p1.id;
    });

    assert.equal(Rules.calculateRent(game.properties, game.properties[5], 7), 400);
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

test('building can be uneven while selling still enforces parity', () => {
    const { game, p1 } = createGame();
    [6, 8, 9].forEach(index => {
        game.properties[index].owner = p1.id;
    });

    game.properties[6].houses = 1;
    let validation = Rules.validateUpgrade(game.properties, p1.id, 6, game.rulesConfig);
    assert.equal(validation.ok, true);

    validation = Rules.validateUpgrade(game.properties, p1.id, 8, game.rulesConfig);
    assert.equal(validation.ok, true);

    game.properties[8].houses = 1;
    game.properties[9].houses = 1;
    validation = Rules.validateUpgrade(game.properties, p1.id, 6, game.rulesConfig);
    assert.equal(validation.ok, true);

    game.properties[6].houses = 2;
    validation = Rules.validateDowngrade(game.properties, p1.id, 8, game.rulesConfig);
    assert.equal(validation.ok, false);
    assert.equal(validation.code, 'uneven-selling');

    validation = Rules.validateDowngrade(game.properties, p1.id, 6, game.rulesConfig);
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

test('trade validation allows zero-cash trades while a participant is in debt', () => {
    const { game, p1, p2 } = createGame();
    p1.money = -25;
    p2.money = -10;
    game.properties[5].owner = p1.id;

    const validation = TradeUtils.validateTradeOffer(game, {
        fromId: p1.id,
        toId: p2.id,
        offerProperties: [5],
        offerCash: 0,
        requestProperties: [],
        requestCash: 0
    });

    assert.equal(validation.ok, true);
    assert.deepEqual(validation.value.offerProperties, [5]);
    assert.equal(validation.value.offerCash, 0);
    assert.equal(validation.value.requestCash, 0);
});

test('trade validation allows bot participants when the offer is otherwise valid', () => {
    const { game, p1, p2 } = createGame();
    p2.isBot = true;

    game.properties[5].owner = p1.id;

    const validation = TradeUtils.validateTradeOffer(game, {
        fromId: p1.id,
        toId: p2.id,
        offerProperties: [5],
        offerCash: 25,
        requestProperties: [],
        requestCash: 0
    });

    assert.equal(validation.ok, true);
    assert.equal(validation.value.toId, p2.id);
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

test('income tax charges 10 percent of the player cash', () => {
    const { game, p1 } = createGame();
    p1.money = 1375;

    const taxAmount = Rules.calculateTaxAmount(game.properties[4], p1);
    assert.equal(taxAmount, 137);
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
    p1.name = 'Custom Hero';
    game.eliminationOrder = [p2.id];
    game.properties[1].owner = p1.id;
    game.properties[1].landedCount = 6;
    game.properties[1].rentCollected = 120;
    p1.stats.cardsDrawn = 3;

    const summary = SummaryUtils.generateGameSummary(game, p1.id);

    assert.equal(summary.placements[0].playerId, p1.id);
    assert.equal(summary.placements[0].isWinner, true);
    assert.equal(summary.placements[0].name, 'Custom Hero');
    assert.equal(summary.turnCount, 14);
    assert.equal(summary.durationMs, 60_000);
    assert.equal(summary.topVisitedProperties[0].name, game.properties[1].name);
    assert.equal(summary.topRentProperties[0].rentCollected, 120);
});

test('players expose their selected token in serialized state', () => {
    const game = new GameState(BOARD_DATA);
    const player = game.addPlayer('p1', 'Bilo', '#6c5ce7', 'session-1', { tokenId: 'top-hat' });

    const payload = player.toJSON();
    assert.equal(payload.tokenId, 'top-hat');
    assert.equal(game.getState().players[0].tokenId, 'top-hat');
});

test('players serialize custom display metadata', () => {
    const game = new GameState(BOARD_DATA);
    const player = game.addPlayer('p1', 'custom', '#00bcd4', 'session-1', {
        name: 'Ahmed',
        tokenId: 'sports-car',
        customColor: '#00bcd4',
        customAvatarUrl: 'data:image/png;base64,abc'
    });

    const payload = player.toJSON();
    assert.equal(payload.name, 'Ahmed');
    assert.equal(payload.customColor, '#00bcd4');
    assert.equal(payload.customAvatarUrl, 'data:image/png;base64,abc');
    assert.equal(game.getState().players[0].name, 'Ahmed');
});


test('players serialize bankruptcy recovery state', () => {
  const game = new GameState(BOARD_DATA);
  const player = game.addPlayer('p1', 'Bilo', '#6c5ce7', 'session-1');
  player.bankruptcyDeadline = 123456789;
  player.pendingPostDebtPhase = 'done';

  const payload = player.toJSON();
  assert.equal(payload.bankruptcyDeadline, 123456789);
  assert.equal(payload.pendingPostDebtPhase, 'done');
  assert.equal(game.getState().players[0].bankruptcyDeadline, 123456789);
  assert.equal(game.getState().players[0].pendingPostDebtPhase, 'done');
});

test('state exposes when a doubles bonus roll is pending', () => {
    const { game } = createGame();
    game.doublesCount = 1;

    assert.equal(game.hasPendingExtraRoll(), true);
    assert.equal(game.getState().hasPendingExtraRoll, true);

    game.doublesCount = 3;
    assert.equal(game.hasPendingExtraRoll(), false);
    assert.equal(game.getState().hasPendingExtraRoll, false);
});

test('active players keep the turn after doubles', () => {
    const { game, p1 } = createGame();
    game.currentPlayerIndex = 0;
    game.doublesCount = 1;

    const nextPlayer = game.nextTurn();

    assert.equal(nextPlayer.id, p1.id);
    assert.equal(game.currentPlayerIndex, 0);
});

test('inactive players remain out of turn rotation', () => {
    const { game, p1, p2, p3 } = createGame();
    p2.isActive = false;
    game.currentPlayerIndex = 0;
    game.doublesCount = 0;

    const nextPlayer = game.nextTurn();

    assert.equal(nextPlayer.id, p3.id);
    assert.equal(game.currentPlayerIndex, 2);
    assert.equal(p1.isActive, true);
});

test('inactive players do not keep a doubles bonus turn', () => {
    const { game, p1, p2 } = createGame();
    p1.isActive = false;
    game.currentPlayerIndex = 0;
    game.doublesCount = 1;

    const nextPlayer = game.nextTurn();

    assert.equal(nextPlayer.id, p2.id);
    assert.equal(game.currentPlayerIndex, 1);
    assert.equal(game.doublesCount, 0);
});

test('board catalog exposes both Egypt and Countries maps', () => {
    assert.equal(BOARD_DATA.DEFAULT_BOARD_ID, 'egypt');
    assert.ok(BOARD_DATA.BOARD_MAPS.egypt);
    assert.ok(BOARD_DATA.BOARD_MAPS.countries);
    assert.equal(BOARD_DATA.BOARD_MAPS.egypt.name, 'Egypt');
    assert.equal(BOARD_DATA.BOARD_MAPS.countries.name, 'Countries');
    assert.equal(BOARD_DATA.BOARD_MAPS.egypt.templateId, 'capitalista_reference_40');
    assert.equal(BOARD_DATA.BOARD_MAPS.countries.templateId, 'capitalista_reference_40');
    assert.equal(BOARD_DATA.BOARD_MAPS.egypt.rulesPreset, 'capitalista_v2');
    assert.equal(BOARD_DATA.BOARD_MAPS.egypt.tiles.length, 40);
    assert.equal(BOARD_DATA.BOARD_MAPS.countries.tiles.length, 40);
    assert.equal(BOARD_DATA.BOARD_MAPS.countries.tiles[1].name, 'Delhi');
    assert.equal(BOARD_DATA.BOARD_MAPS.countries.tiles[5].name, 'India Railroad');
});

test('board maps are themed overlays on the same canonical template', () => {
    const egyptTiles = BOARD_DATA.BOARD_MAPS.egypt.tiles;
    const countriesTiles = BOARD_DATA.BOARD_MAPS.countries.tiles;

    egyptTiles.forEach((tile, index) => {
        const countriesTile = countriesTiles[index];
        assert.equal(tile.templateSlotId, countriesTile.templateSlotId);
        assert.equal(tile.type, countriesTile.type);
        assert.equal(tile.price, countriesTile.price);
        assert.equal(tile.rent, countriesTile.rent);
        assert.deepEqual(tile.rentTiers, countriesTile.rentTiers);
        assert.equal(tile.colorGroup, countriesTile.colorGroup);
    });

    assert.equal(BOARD_DATA.BOARD_TEMPLATES.capitalista_reference_40.tiles[5].templateSlotId, 'transport-1');
    assert.notEqual(egyptTiles[1].name, countriesTiles[1].name);
    assert.equal(egyptTiles[1].name, 'Boulaq');
    assert.equal(countriesTiles[1].name, 'Delhi');
});

test('serialized game state includes Capitalista rule preset metadata', () => {
    const { game } = createGame();
    const state = game.getState();

    assert.equal(state.rulePreset, 'capitalista_v2');
    assert.equal(state.rulesConfig.requireEvenBuilding, false);
    assert.equal(state.rulesConfig.requireEvenSelling, true);
    assert.equal(state.rulesConfig.loansEnabled, false);
    assert.equal(state.rulesConfig.ownedPropertyOvertakeEnabled, false);
});

test('serialized state keeps current player id and index aligned', () => {
    const normalized = normalizeSerializedGameState({
        players: [
            { id: 'p1', isActive: true },
            { id: 'p2', isActive: true }
        ],
        currentPlayerIndex: 0,
        currentPlayerId: 'p2',
        stateSequence: 5
    });

    assert.equal(normalized.currentPlayerId, 'p2');
    assert.equal(normalized.currentPlayerIndex, 1);
});

test('older serialized snapshots are treated as stale', () => {
    assert.equal(
        isStaleSerializedGameState({ stateSequence: 3 }, { stateSequence: 4 }),
        true
    );
    assert.equal(
        isStaleSerializedGameState({ stateSequence: 5 }, { stateSequence: 4 }),
        false
    );
});
