const test = require('node:test');
const assert = require('node:assert/strict');

const BOARD_DATA = require('../../shared/boardData');
const { GameState } = require('../../shared/gameState');
const { normalizeSerializedGameState } = require('../../shared/stateSync');

function createRng(seed) {
    let state = seed >>> 0;
    return function next() {
        state = (1664525 * state + 1013904223) >>> 0;
        return state / 0x100000000;
    };
}

function randomInt(rng, min, max) {
    const value = rng();
    return Math.floor(value * (max - min + 1)) + min;
}

test('random movement sequences keep positions bounded and GO payouts consistent', () => {
    const boardSize = BOARD_DATA.length;

    for (let seed = 1; seed <= 20; seed++) {
        const rng = createRng(seed);
        const game = new GameState(BOARD_DATA);
        const players = [
            game.addPlayer(`p${seed}-1`, 'Bilo', '#111111'),
            game.addPlayer(`p${seed}-2`, 'Os', '#222222'),
            game.addPlayer(`p${seed}-3`, 'Ziko', '#333333')
        ];

        for (let stepIndex = 0; stepIndex < 250; stepIndex++) {
            const player = players[randomInt(rng, 0, players.length - 1)];
            const steps = randomInt(rng, -20, 20);
            const moneyBefore = player.money;
            const result = game.movePlayer(player.id, steps);

            const rawPosition = result.oldPosition + steps;
            let normalized = rawPosition % boardSize;
            if (normalized < 0) normalized += boardSize;

            const passedGoByWrap = steps > 0 && rawPosition >= boardSize;
            const landedOnGoForward = normalized === 0 && steps > 0;
            const expectedPassedGo = passedGoByWrap || landedOnGoForward;

            const passBonus = passedGoByWrap && normalized !== 0 ? 200 : 0;
            const landBonus = landedOnGoForward ? 200 : 0;
            const expectedBonus = passBonus + landBonus;

            assert.equal(result.newPosition, normalized);
            assert.equal(result.passedGo, expectedPassedGo);
            assert.equal(player.money, moneyBefore + expectedBonus);
            assert.ok(result.newPosition >= 0 && result.newPosition < boardSize);
        }
    }
});

test('state normalization always points to a real player under random snapshots', () => {
    for (let seed = 1; seed <= 50; seed++) {
        const rng = createRng(seed * 17);

        for (let index = 0; index < 80; index++) {
            const playerCount = randomInt(rng, 2, 6);
            const players = [];
            for (let playerIndex = 0; playerIndex < playerCount; playerIndex++) {
                players.push({
                    id: `p-${seed}-${index}-${playerIndex}`,
                    isActive: randomInt(rng, 0, 1) === 1
                });
            }

            const idChoice = randomInt(rng, -1, playerCount);
            const selectedId = idChoice >= 0 && idChoice < playerCount
                ? players[idChoice].id
                : 'missing-id';

            const snapshot = {
                players,
                currentPlayerIndex: randomInt(rng, -3, playerCount + 3),
                currentPlayerId: selectedId,
                stateSequence: randomInt(rng, 1, 10000)
            };

            const normalized = normalizeSerializedGameState(snapshot);
            assert.ok(normalized.currentPlayerIndex >= 0 && normalized.currentPlayerIndex < players.length);
            assert.equal(players[normalized.currentPlayerIndex].id, normalized.currentPlayerId);
        }
    }
});
