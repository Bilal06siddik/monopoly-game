const test = require('node:test');
const assert = require('node:assert/strict');

const {
    CAPITALISTA_BOARD_GEOMETRY,
    getBoardEdgeLength,
    calculateCenteredTilePosition
} = require('../shared/boardLayout');

test('Capitalista board layout exposes the reference tile dimensions', () => {
    assert.equal(CAPITALISTA_BOARD_GEOMETRY.normalTileWidth, 1.5);
    assert.equal(CAPITALISTA_BOARD_GEOMETRY.normalTileDepth, 3);
    assert.equal(CAPITALISTA_BOARD_GEOMETRY.cornerTileSize, 3);
    assert.equal(getBoardEdgeLength(), 19.5);
});

test('Capitalista board layout keeps all corner and edge positions aligned', () => {
    assert.deepEqual(calculateCenteredTilePosition(0), { x: 8.25, y: 0, z: 8.25 });
    assert.deepEqual(calculateCenteredTilePosition(10), { x: -8.25, y: 0, z: 8.25 });
    assert.deepEqual(calculateCenteredTilePosition(20), { x: -8.25, y: 0, z: -8.25 });
    assert.deepEqual(calculateCenteredTilePosition(30), { x: 8.25, y: 0, z: -8.25 });

    assert.deepEqual(calculateCenteredTilePosition(1), { x: 6, y: 0, z: 8.25 });
    assert.deepEqual(calculateCenteredTilePosition(9), { x: -6, y: 0, z: 8.25 });
    assert.deepEqual(calculateCenteredTilePosition(11), { x: -8.25, y: 0, z: 6 });
    assert.deepEqual(calculateCenteredTilePosition(19), { x: -8.25, y: 0, z: -6 });
    assert.deepEqual(calculateCenteredTilePosition(21), { x: -6, y: 0, z: -8.25 });
    assert.deepEqual(calculateCenteredTilePosition(29), { x: 6, y: 0, z: -8.25 });
    assert.deepEqual(calculateCenteredTilePosition(31), { x: 8.25, y: 0, z: -6 });
    assert.deepEqual(calculateCenteredTilePosition(39), { x: 8.25, y: 0, z: 6 });
});

test('Capitalista board layout yields 40 unique tile positions', () => {
    const keys = new Set();

    for (let index = 0; index < 40; index++) {
        const position = calculateCenteredTilePosition(index);
        keys.add(`${position.x}:${position.z}`);
    }

    assert.equal(keys.size, 40);
});
