(function (root, factory) {
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory();
    } else {
        root.MonopolyBoardLayout = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const CAPITALISTA_BOARD_LAYOUT_ID = 'capitalista_reference';
    const SIDE_TILE_COUNT = 9;

    const CAPITALISTA_BOARD_GEOMETRY = Object.freeze({
        id: CAPITALISTA_BOARD_LAYOUT_ID,
        normalTileWidth: 1.5,
        normalTileDepth: 3,
        normalTileHeight: 0.22,
        cornerTileSize: 3,
        sideTileCount: SIDE_TILE_COUNT
    });

    function getBoardEdgeLength(geometry = CAPITALISTA_BOARD_GEOMETRY) {
        return (geometry.cornerTileSize * 2) + (geometry.normalTileWidth * geometry.sideTileCount);
    }

    function calculateCenteredTilePosition(index, geometry = CAPITALISTA_BOARD_GEOMETRY) {
        const edgeLength = getBoardEdgeLength(geometry);
        const half = edgeLength / 2;
        const corner = geometry.cornerTileSize;
        const tileWidth = geometry.normalTileWidth;

        if (index === 0) {
            return { x: half - (corner / 2), y: 0, z: half - (corner / 2) };
        }
        if (index <= 9) {
            return {
                x: half - corner - ((index - 1) * tileWidth) - (tileWidth / 2),
                y: 0,
                z: half - (corner / 2)
            };
        }
        if (index === 10) {
            return { x: -half + (corner / 2), y: 0, z: half - (corner / 2) };
        }
        if (index <= 19) {
            const localIndex = index - 11;
            return {
                x: -half + (corner / 2),
                y: 0,
                z: half - corner - (localIndex * tileWidth) - (tileWidth / 2)
            };
        }
        if (index === 20) {
            return { x: -half + (corner / 2), y: 0, z: -half + (corner / 2) };
        }
        if (index <= 29) {
            const localIndex = index - 21;
            return {
                x: -half + corner + (localIndex * tileWidth) + (tileWidth / 2),
                y: 0,
                z: -half + (corner / 2)
            };
        }
        if (index === 30) {
            return { x: half - (corner / 2), y: 0, z: -half + (corner / 2) };
        }

        const localIndex = index - 31;
        return {
            x: half - (corner / 2),
            y: 0,
            z: -half + corner + (localIndex * tileWidth) + (tileWidth / 2)
        };
    }

    return {
        CAPITALISTA_BOARD_LAYOUT_ID,
        CAPITALISTA_BOARD_GEOMETRY,
        getBoardEdgeLength,
        calculateCenteredTilePosition
    };
});
