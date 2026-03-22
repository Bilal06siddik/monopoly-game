// ═══════════════════════════════════════════════════════════
//  BOARD — 3D Monopoly board with brighter tile materials,
//          compact house/hotel models, and mortgage support
// ═══════════════════════════════════════════════════════════

const GameBoard = (() => {
    const BOARD_LAYOUT = window.MonopolyBoardLayout || {};
    const BOARD_GEOMETRY = BOARD_LAYOUT.CAPITALISTA_BOARD_GEOMETRY || {
        normalTileWidth: 1.5,
        normalTileDepth: 3,
        normalTileHeight: 0.22,
        cornerTileSize: 3,
        sideTileCount: 9
    };
    const TILE_W = BOARD_GEOMETRY.normalTileWidth;
    const TILE_D = BOARD_GEOMETRY.normalTileDepth;
    const TILE_H = BOARD_GEOMETRY.normalTileHeight;
    const CORNER_SIZE = BOARD_GEOMETRY.cornerTileSize;
    const SIDE_TILE_COUNT = BOARD_GEOMETRY.sideTileCount || 9;
    const GAP = 0;
    const TILE_TEXTURE_WIDTH = 150;
    const TILE_TEXTURE_HEIGHT = Math.round(TILE_TEXTURE_WIDTH * (TILE_D / TILE_W));

    const tilePositions = {};
    const tileMeshes = {};
    const houseMeshes = {};
    const houseRenderTokens = {};
    const tileRenderState = {};
    const cornerTileState = {
        bailoutAmount: 0
    };
    const upgradeModelConfigs = [
        { path: '/models/small_buildingB.glb', footprint: 0.82, height: 0.72 },
        { path: '/models/small_buildingA.glb', footprint: 0.88, height: 0.88 },
        { path: '/models/large_buildingD.glb', footprint: 0.94, height: 1.18 },
        { path: '/models/skyscraperE.glb', footprint: 1.08, height: 1.64 },
        { path: '/models/skyscraperB.glb', footprint: 1.14, height: 1.92 }
    ];
    const upgradeModelCache = new Map();
    const upgradeModelPromises = new Map();
    const flagImageCache = new Map();
    const flagImageSubscribers = new Map();
    const transportTileIndices = [5, 15, 25, 35];
    const metroLogoImg = new Image();
    metroLogoImg.src = '/images/metro-logo.png';
    const railroadLogoImg = new Image();
    railroadLogoImg.src = '/images/railroad-icon.svg';
    const refreshTransportTileTextures = () => {
        if (typeof GameBoard !== 'undefined' && transportTileIndices.every(idx => tileMeshes[idx])) {
            transportTileIndices.forEach(idx => refreshTileTexture(idx));
        }
    };
    metroLogoImg.onload = refreshTransportTileTextures;
    railroadLogoImg.onload = refreshTransportTileTextures;
    let gltfLoader = null;
    let boardGroup = null;
    let edgeLen;
    let half;
    let startOffset;
    let maxTextureAnisotropy = 1;
    let currentTextProfile = 'isometric';
    let currentThirdPersonSide = null;
    let hoveredTileIndex = null;
    let focusedTileIndex = null;
    let onTileHoverCallback = null;
    let sceneRef = null;
    let rendererStateRef = null;
    let currentBoardId = window.DEFAULT_BOARD_ID || 'egypt';
    let builtBoardId = null;
    let boardData = Array.isArray(window.BOARD_DATA) ? window.BOARD_DATA : [];
    const interactionHighlightsEnabled = false;
    const BOARD_MAPS = window.BOARD_MAPS || {};
    const BOARD_PALETTE = window.MonopolyBoardPalette || {};
    const TILE_COLOR_HEX = BOARD_PALETTE.TILE_COLOR_HEX || {
        brown: '#9a6a49',
        lightblue: '#59c4ee',
        pink: '#db75b4',
        orange: '#f19a42',
        red: '#e66461',
        yellow: '#e3c44f',
        green: '#4eb073',
        darkblue: '#4b6bd8',
        railroad: '#6b7b8f',
        utility: '#7b889d',
        chance: '#5a92ef',
        chest: '#f18b67',
        tax: '#7e8ba0',
        corner: '#dfe7f5'
    };
    const BOARD_THEME_PALETTES = BOARD_PALETTE.BOARD_THEME_PALETTES || {
        default: {
            boardBase: '#101929',
            boardTrim: '#274564',
            boardTrimEmissive: '#12263c',
            centerBase: '#152336',
            centerFelt: '#1c314a',
            centerFeltEmissive: '#0f1d30',
            tileFaceTop: '#24364f',
            tileFaceBottom: '#132032',
            tileSheen: 'rgba(130, 168, 245, 0.09)',
            tileBorder: '#798db4',
            tileInnerBorder: 'rgba(255, 255, 255, 0.18)',
            tileFooterTop: '#22354e',
            tileFooterBottom: '#121d2f',
            tileSide: '#2e4464',
            tileSideEmissive: '#0a1321',
            cornerFaceTop: '#213651',
            cornerFaceBottom: '#142031',
            cornerBorder: '#7e92b8',
            mortgageTop: '#4a5363',
            mortgageBottom: '#282f3a',
            mortgageBorder: '#8c98ae',
            textPrimary: '#f5f8ff',
            textSecondary: '#dce7ff',
            textAccent: '#ffe08e',
            outerRing: '#6daeff',
            innerRing: '#ffca73',
            logoOpacity: 0.84
        }
    };

    const SIDE_TILE_INDEXES = {
        south: [1, 2, 3, 4, 5, 6, 7, 8, 9],
        west: [11, 12, 13, 14, 15, 16, 17, 18, 19],
        north: [21, 22, 23, 24, 25, 26, 27, 28, 29],
        east: [31, 32, 33, 34, 35, 36, 37, 38, 39]
    };

    function resolveBoardConfig(boardId = currentBoardId) {
        return BOARD_MAPS[boardId] || BOARD_MAPS[window.DEFAULT_BOARD_ID] || {
            id: boardId,
            name: boardId,
            tiles: Array.isArray(window.BOARD_DATA) ? window.BOARD_DATA : []
        };
    }

    function setActiveBoard(boardId = currentBoardId) {
        const board = resolveBoardConfig(boardId);
        currentBoardId = board.id || window.DEFAULT_BOARD_ID || 'egypt';
        boardData = Array.isArray(board.tiles) ? board.tiles : [];
        window.BOARD_DATA = boardData;
        window.CURRENT_BOARD_ID = currentBoardId;
        return board;
    }

    function hexToNumber(hex, fallback = 0x7ea8ff) {
        if (typeof BOARD_PALETTE.hexToNumber === 'function') {
            return BOARD_PALETTE.hexToNumber(hex, fallback);
        }

        const value = typeof hex === 'string' ? hex.replace('#', '') : '';
        return /^[0-9a-f]{6}$/i.test(value)
            ? Number.parseInt(value, 16)
            : fallback;
    }

    function getBoardSurfacePalette(boardId = currentBoardId) {
        const board = resolveBoardConfig(boardId);
        const themeId = board.theme || board.id || 'default';
        return BOARD_THEME_PALETTES[themeId] || BOARD_THEME_PALETTES.default;
    }

    const TEXT_ROTATION_BY_PROFILE = {
        isometric: {
            south: 180,
            west: 180,
            north: 180,
            east: 0,
            corners: {
                0: 180,
                10: 180,
                20: 180,
                30: 180
            }
        },
        'top-down': {
            south: 180,
            west: 180,
            north: 0,
            east: 0,
            corners: {
                0: 180,
                10: 180,
                20: 180,
                30: 0
            }
        },
        'third-person': {
            south: 0,
            west: 180,
            north: 180,
            east: 0,
            corners: {
                0: 180,
                10: 180,
                20: 180,
                30: 0
            }
        }
    };

    function resetBoardCollections() {
        Object.keys(tilePositions).forEach(key => delete tilePositions[key]);
        Object.keys(tileMeshes).forEach(key => delete tileMeshes[key]);
        Object.keys(houseMeshes).forEach(key => delete houseMeshes[key]);
        Object.keys(houseRenderTokens).forEach(key => delete houseRenderTokens[key]);
        Object.keys(tileRenderState).forEach(key => delete tileRenderState[key]);
        occupiedTiles.clear();
        hoveredTileIndex = null;
        focusedTileIndex = null;
    }

    function disposeBoard() {
        if (!boardGroup) return;
        const parentScene = sceneRef;
        if (parentScene) {
            parentScene.remove(boardGroup);
        }
        disposeObject(boardGroup);
        boardGroup = null;
        resetBoardCollections();
    }

    function build(scene, rendererRef = null) {
        sceneRef = scene;
        rendererStateRef = rendererRef || rendererStateRef;
        const activeBoard = setActiveBoard(currentBoardId);
        const shouldReuseRenderState = builtBoardId === null || builtBoardId === activeBoard.id;
        const surfacePalette = getBoardSurfacePalette(activeBoard.id);
        disposeBoard();

        boardGroup = new THREE.Group();
        boardGroup.position.y = 0.05;
        maxTextureAnisotropy = rendererStateRef?.capabilities?.getMaxAnisotropy?.() || 1;

        edgeLen = (typeof BOARD_LAYOUT.getBoardEdgeLength === 'function')
            ? BOARD_LAYOUT.getBoardEdgeLength(BOARD_GEOMETRY)
            : (CORNER_SIZE * 2) + (SIDE_TILE_COUNT * TILE_W);
        half = edgeLen / 2;
        startOffset = CORNER_SIZE + GAP;

        const boardBase = new THREE.Mesh(
            new THREE.BoxGeometry(edgeLen + 1, 0.36, edgeLen + 1),
            new THREE.MeshStandardMaterial({
                color: hexToNumber(surfacePalette.boardBase, 0x09111f),
                roughness: 0.96,
                metalness: 0.02
            })
        );
        boardBase.position.y = -0.34;
        boardBase.castShadow = true;
        boardBase.receiveShadow = true;
        boardGroup.add(boardBase);

        const boardTrim = new THREE.Mesh(
            new THREE.BoxGeometry(edgeLen + 0.42, 0.08, edgeLen + 0.42),
            new THREE.MeshStandardMaterial({
                color: hexToNumber(surfacePalette.boardTrim, 0x1d2b4b),
                emissive: hexToNumber(surfacePalette.boardTrimEmissive, 0x0b1220),
                emissiveIntensity: 0.26,
                roughness: 0.86,
                metalness: 0.06
            })
        );
        boardTrim.position.y = -0.18;
        boardGroup.add(boardTrim);

        boardData.forEach((tile, index) => {
            const isCorner = tile.type === 'corner';
            const previousRenderState = shouldReuseRenderState ? tileRenderState[index] : null;
            tileRenderState[index] = previousRenderState
                ? {
                    ownerColor: previousRenderState.ownerColor ?? null,
                    propertyState: previousRenderState.propertyState
                        ? { ...previousRenderState.propertyState }
                        : null,
                    isMortgaged: Boolean(previousRenderState.isMortgaged)
                }
                : {
                    ownerColor: null,
                    propertyState: null,
                    isMortgaged: false
                };
            const geometry = isCorner
                ? new THREE.BoxGeometry(CORNER_SIZE, TILE_H, CORNER_SIZE)
                : new THREE.BoxGeometry(TILE_W, TILE_H, TILE_D);
            const materials = isCorner
                ? createCornerMaterials(tile, index, getCornerState(index))
                : createTileMaterials(
                    tile,
                    index,
                    tileRenderState[index].ownerColor,
                    tileRenderState[index].propertyState
                );
            const mesh = new THREE.Mesh(geometry, materials);

            const position = calculateTilePosition(index);
            mesh.position.copy(position);
            tilePositions[index] = { x: position.x, y: 0, z: position.z };

            if (index >= 11 && index <= 19) mesh.rotation.y = Math.PI / 2;
            else if (index >= 31 && index <= 39) mesh.rotation.y = -Math.PI / 2;

            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.userData = {
                baseY: mesh.position.y,
                tileIndex: index,
                tileName: tile.name,
                tileType: tile.type,
                tileColor: tile.colorGroup || tile.type,
                tileAccent: `#${(tile.color || 0x7ea8ff).toString(16).padStart(6, '0')}`,
                outwardVector: getTileOutwardVector(index)
            };

            boardGroup.add(mesh);
            tileMeshes[index] = mesh;
            applyTileInteractionState(index);
        });

        const innerSize = edgeLen - (2 * TILE_D);
        const centerBase = new THREE.Mesh(
            new THREE.BoxGeometry(innerSize, 0.14, innerSize),
            new THREE.MeshStandardMaterial({
                color: hexToNumber(surfacePalette.centerBase, 0x0b1120),
                roughness: 1,
                metalness: 0.02
            })
        );
        centerBase.position.y = -0.05;
        centerBase.receiveShadow = true;
        boardGroup.add(centerBase);

        const centerFelt = new THREE.Mesh(
            new THREE.PlaneGeometry(innerSize - 0.6, innerSize - 0.6),
            new THREE.MeshStandardMaterial({
                color: hexToNumber(surfacePalette.centerFelt, 0x101b31),
                emissive: hexToNumber(surfacePalette.centerFeltEmissive, 0x08101c),
                emissiveIntensity: 0.22,
                roughness: 1,
                metalness: 0
            })
        );
        centerFelt.rotation.x = -Math.PI / 2;
        centerFelt.position.y = 0.03;
        centerFelt.receiveShadow = true;
        boardGroup.add(centerFelt);

        [
            { inner: 2.5, outer: 2.82, color: hexToNumber(surfacePalette.outerRing, 0x4f8fff), opacity: 0.045 },
            { inner: 1.4, outer: 1.62, color: hexToNumber(surfacePalette.innerRing, 0xffca73), opacity: 0.035 }
        ].forEach(({ inner, outer, color, opacity }) => {
            const ring = new THREE.Mesh(
                new THREE.RingGeometry(inner, outer, 64),
                new THREE.MeshBasicMaterial({
                    color,
                    side: THREE.DoubleSide,
                    transparent: true,
                    opacity
                })
            );
            ring.rotation.x = -Math.PI / 2;
            ring.position.y = 0.04;
            boardGroup.add(ring);
        });

        // --- ADD CENTER LOGO ---
        const logoLoader = new THREE.TextureLoader();
        logoLoader.load('/images/bank-el-haz-logo.png', (texture) => {
            texture.anisotropy = maxTextureAnisotropy;
            texture.encoding = THREE.sRGBEncoding;
            
            const logoSize = innerSize * 1.2;
            const logoPlane = new THREE.Mesh(
                new THREE.PlaneGeometry(logoSize, logoSize),
                new THREE.MeshBasicMaterial({
                    map: texture,
                    transparent: true,
                    opacity: surfacePalette.logoOpacity ?? 0.9
                })
            );
            logoPlane.rotation.x = -Math.PI / 2;
            logoPlane.rotation.z = Math.PI; // Flip logo 180°
            logoPlane.position.y = 0.045; // Slightly above the rings
            boardGroup.add(logoPlane);
        });
        // -----------------------

        scene.add(boardGroup);
        builtBoardId = activeBoard.id;
        return boardGroup;
    }

    function getTileSide(index) {
        if (SIDE_TILE_INDEXES.south.includes(index)) return 'south';
        if (SIDE_TILE_INDEXES.west.includes(index)) return 'west';
        if (SIDE_TILE_INDEXES.north.includes(index)) return 'north';
        if (SIDE_TILE_INDEXES.east.includes(index)) return 'east';
        return null;
    }

    function getTileRotationDegrees(tileIndex, profile = currentTextProfile, options = {}) {
        const resolvedProfile = profile === 'top-down'
            ? 'top-down'
            : profile === 'third-person'
                ? 'third-person'
                : 'isometric';
        const side = getTileSide(tileIndex);

        if (!side) {
            return TEXT_ROTATION_BY_PROFILE[resolvedProfile].corners[tileIndex] || 0;
        }

        return TEXT_ROTATION_BY_PROFILE[resolvedProfile][side] || 0;
    }

    function drawOrientedTexture(ctx, canvas, rotationDegrees, draw) {
        ctx.save();
        if (rotationDegrees) {
            ctx.translate(canvas.width / 2, canvas.height / 2);
            ctx.rotate(THREE.MathUtils.degToRad(rotationDegrees));
            ctx.translate(-canvas.width / 2, -canvas.height / 2);
        }
        draw();
        ctx.restore();
    }

    function getProfileTextScale() {
        return currentTextProfile === 'top-down' ? 1.4 : 1.22;
    }

    function getOwnedTileDisplayValue(tile, propertyState = null) {
        if (!propertyState) {
            return {
                label: tile.rent > 0 ? `$${tile.rent}` : tile.price > 0 ? `$${tile.price}` : ''
            };
        }

        if (propertyState.displayRentLabel) {
            return { label: propertyState.displayRentLabel };
        }

        if (Number.isFinite(propertyState.displayRent)) {
            return { label: `$${propertyState.displayRent}` };
        }

        return {
            label: tile.rent > 0 ? `$${tile.rent}` : tile.price > 0 ? `$${tile.price}` : ''
        };
    }

    function getTileAccentColor(tile) {
        if (Number.isFinite(tile?.color)) {
            return `#${tile.color.toString(16).padStart(6, '0')}`;
        }
        return TILE_COLOR_HEX[tile?.colorGroup] || TILE_COLOR_HEX[tile?.type] || TILE_COLOR_HEX.corner || '#bac4d6';
    }

    function registerFlagImageUsage(imagePath, tileIndex) {
        if (!imagePath || !Number.isInteger(tileIndex)) return;
        if (!flagImageSubscribers.has(imagePath)) {
            flagImageSubscribers.set(imagePath, new Set());
        }
        flagImageSubscribers.get(imagePath).add(tileIndex);
    }

    function getFlagImageEntry(imagePath, tileIndex) {
        if (!imagePath) return null;

        registerFlagImageUsage(imagePath, tileIndex);

        if (flagImageCache.has(imagePath)) {
            return flagImageCache.get(imagePath);
        }

        const image = new Image();
        const entry = { image, status: 'loading' };

        image.onload = () => {
            entry.status = 'loaded';
            const subscriberIndexes = flagImageSubscribers.get(imagePath);
            if (!subscriberIndexes) return;
            subscriberIndexes.forEach(index => {
                if (tileMeshes[index]) {
                    refreshTileTexture(index);
                }
            });
        };

        image.onerror = () => {
            entry.status = 'error';
        };

        image.src = imagePath;
        flagImageCache.set(imagePath, entry);
        return entry;
    }

    function drawContainedImage(ctx, image, x, y, width, height, padding = 0) {
        const safeWidth = Math.max(0, width - (padding * 2));
        const safeHeight = Math.max(0, height - (padding * 2));
        if (!safeWidth || !safeHeight || !image?.naturalWidth || !image?.naturalHeight) return;

        const scale = Math.min(safeWidth / image.naturalWidth, safeHeight / image.naturalHeight);
        const drawWidth = image.naturalWidth * scale;
        const drawHeight = image.naturalHeight * scale;
        const drawX = x + padding + ((safeWidth - drawWidth) / 2);
        const drawY = y + padding + ((safeHeight - drawHeight) / 2);

        ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
    }

    function isCountriesFlagTile(tile) {
        return currentBoardId === 'countries' && tile?.bandStyle === 'flag-image' && Boolean(tile.flagImage);
    }

    function usesEgyptColorShowcase(tile) {
        return currentBoardId === 'egypt' && tile?.type === 'property';
    }

    function getTileSectionMetrics(canvas) {
        const buildZoneHeight = Math.round(canvas.height * 0.26);
        const showcaseZoneHeight = Math.round(canvas.height * 0.28);
        const footerHeight = Math.round(canvas.height * 0.18);
        const contentHeight = canvas.height - footerHeight;
        const nameZoneTop = buildZoneHeight + showcaseZoneHeight;
        const nameZoneHeight = Math.max(0, contentHeight - nameZoneTop);

        return {
            buildZoneHeight,
            showcaseZoneHeight,
            nameZoneTop,
            nameZoneHeight,
            showcaseZoneTop: buildZoneHeight,
            footerHeight,
            contentHeight
        };
    }

    function drawTileSectionSeparators(ctx, canvas, metrics) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
        ctx.fillRect(18, metrics.showcaseZoneTop, canvas.width - 36, 4);
        ctx.fillRect(18, metrics.nameZoneTop, canvas.width - 36, 4);
    }

    function drawBuildingZone(ctx, tile, canvas, metrics, buildingCount, ownerColor, isMortgaged) {
        if (tile?.type !== 'property') return;
        if (!buildingCount || isMortgaged) return;
    }

    function drawEgyptColorShowcase(ctx, tile, canvas, metrics) {
        const colorHex = getTileAccentColor(tile);
        const cardX = canvas.width * 0.17;
        const cardY = metrics.showcaseZoneTop + (metrics.showcaseZoneHeight * 0.15);
        const cardWidth = canvas.width * 0.66;
        const cardHeight = metrics.showcaseZoneHeight * 0.7;
        const gradient = ctx.createLinearGradient(cardX, cardY, cardX + cardWidth, cardY);
        gradient.addColorStop(0, shadeColor(colorHex, 20));
        gradient.addColorStop(1, shadeColor(colorHex, -12));

        ctx.fillStyle = gradient;
        ctx.beginPath();
        addRoundedRectPath(ctx, cardX, cardY, cardWidth, cardHeight, 26);
        ctx.fill();

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.26)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        addRoundedRectPath(ctx, cardX + 2, cardY + 2, cardWidth - 4, cardHeight - 4, 24);
        ctx.stroke();
    }

    function drawDefaultTileBand(ctx, tile, canvas, bandHeight) {
        const colorHex = getTileAccentColor(tile);
        const bandGradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
        bandGradient.addColorStop(0, shadeColor(colorHex, 12));
        bandGradient.addColorStop(1, shadeColor(colorHex, -8));
        ctx.fillStyle = bandGradient;
        ctx.fillRect(0, 0, canvas.width, bandHeight);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
        ctx.fillRect(0, 0, canvas.width, 10);

        ctx.fillStyle = 'rgba(6, 10, 18, 0.34)';
        ctx.fillRect(0, bandHeight - 10, canvas.width, 10);
    }

    function drawCenteredFlagCard(ctx, tile, canvas, metrics = getTileSectionMetrics(canvas)) {
        const flagImageEntry = getFlagImageEntry(tile.flagImage, tile.index);
        const cardX = canvas.width * 0.17;
        const cardY = metrics.showcaseZoneTop + (metrics.showcaseZoneHeight * 0.15);
        const cardWidth = canvas.width * 0.66;
        const cardHeight = metrics.showcaseZoneHeight * 0.7;

        ctx.fillStyle = 'rgba(8, 14, 24, 0.36)';
        ctx.beginPath();
        addRoundedRectPath(ctx, cardX, cardY, cardWidth, cardHeight, 24);
        ctx.fill();

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        addRoundedRectPath(ctx, cardX + 2, cardY + 2, cardWidth - 4, cardHeight - 4, 22);
        ctx.stroke();

        if (flagImageEntry?.status === 'loaded') {
            drawContainedImage(
                ctx,
                flagImageEntry.image,
                cardX,
                cardY,
                cardWidth,
                cardHeight,
                Math.round(cardHeight * 0.08)
            );
        }
    }

    function drawTileBand(ctx, tile, canvas, bandHeight) {
        const surfacePalette = getBoardSurfacePalette();
        if (tile?.bandStyle === 'flag-image' && tile.flagImage && !isCountriesFlagTile(tile)) {
            const flagImageEntry = getFlagImageEntry(tile.flagImage, tile.index);

            const fallbackGradient = ctx.createLinearGradient(0, 0, canvas.width, bandHeight);
            fallbackGradient.addColorStop(0, surfacePalette.tileFaceTop);
            fallbackGradient.addColorStop(1, surfacePalette.tileFaceBottom);
            ctx.fillStyle = fallbackGradient;
            ctx.fillRect(0, 0, canvas.width, bandHeight);

            if (flagImageEntry?.status === 'loaded') {
                drawContainedImage(ctx, flagImageEntry.image, 0, 0, canvas.width, bandHeight, Math.round(bandHeight * 0.03));
            }

            ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
            ctx.fillRect(0, 0, canvas.width, 8);

            ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
            ctx.lineWidth = 3;
            ctx.strokeRect(6, 6, canvas.width - 12, bandHeight - 12);

            ctx.fillStyle = 'rgba(6, 10, 18, 0.18)';
            ctx.fillRect(0, bandHeight * 0.66, canvas.width, bandHeight * 0.34);
            return;
        }

        drawDefaultTileBand(ctx, tile, canvas, bandHeight);
    }

    function createTileTexture(tile, tileIndex, width, height, ownerColor = null, propertyState = null) {
        const canvas = document.createElement('canvas');
        const scale = 5;
        canvas.width = width * scale;
        canvas.height = height * scale;

        const ctx = canvas.getContext('2d');
        const rotationDegrees = getTileRotationDegrees(tileIndex, currentTextProfile, { activeSide: currentThirdPersonSide });
        const textScale = getProfileTextScale();
        const surfacePalette = getBoardSurfacePalette();
        const isCenteredCountriesFlagTile = isCountriesFlagTile(tile);

        drawOrientedTexture(ctx, canvas, rotationDegrees, () => {
            const metrics = getTileSectionMetrics(canvas);
            const footerHeight = metrics.footerHeight;
            const bandHeight = Math.round(canvas.height * (isCenteredCountriesFlagTile ? 0.13 : tile?.bandStyle === 'flag-image' ? 0.23 : 0.18));
            const isPurchasable = ['property', 'railroad', 'utility'].includes(tile.type);
            const isStreetTile = tile?.type === 'property';
            const buildingCount = propertyState?.houses || 0;

            const tileGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
            tileGradient.addColorStop(0, surfacePalette.tileFaceTop);
            tileGradient.addColorStop(1, surfacePalette.tileFaceBottom);
            ctx.fillStyle = tileGradient;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.fillStyle = surfacePalette.tileSheen || 'rgba(114, 145, 216, 0.08)';
            ctx.fillRect(0, canvas.height * 0.52, canvas.width, canvas.height * 0.18);

            ctx.strokeStyle = surfacePalette.tileBorder;
            ctx.lineWidth = 8;
            ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);

            ctx.strokeStyle = surfacePalette.tileInnerBorder || 'rgba(255, 255, 255, 0.12)';
            ctx.lineWidth = 2;
            ctx.strokeRect(14, 14, canvas.width - 28, canvas.height - 28);

            if (isPurchasable && tile?.type !== 'property' && !isCenteredCountriesFlagTile && !usesEgyptColorShowcase(tile)) {
                drawTileBand(ctx, tile, canvas, bandHeight);
            }

            if (!isStreetTile) {
                drawTileSectionSeparators(ctx, canvas, metrics);
            }

            if (usesEgyptColorShowcase(tile)) {
                drawEgyptColorShowcase(ctx, tile, canvas, metrics);
            }

            if (!isStreetTile && ownerColor) {
                ctx.fillStyle = ownerColor;
                ctx.globalAlpha = 0.88;
                ctx.fillRect(0, canvas.height - footerHeight, canvas.width, footerHeight);
                ctx.globalAlpha = 1;
            } else if (!isStreetTile) {
                const footerGradient = ctx.createLinearGradient(0, canvas.height - footerHeight, 0, canvas.height);
                footerGradient.addColorStop(0, surfacePalette.tileFooterTop);
                footerGradient.addColorStop(1, surfacePalette.tileFooterBottom);
                ctx.fillStyle = footerGradient;
                ctx.fillRect(0, canvas.height - footerHeight, canvas.width, footerHeight);
            }

            if (isCenteredCountriesFlagTile) {
                drawCenteredFlagCard(ctx, tile, canvas, metrics);
            }

            drawBuildingZone(ctx, tile, canvas, metrics, buildingCount, ownerColor, propertyState?.isMortgaged);

            const iconText = getTileIconText(tile);
            const imageIcon = tile.iconImage === 'metro'
                ? metroLogoImg
                : tile.iconImage === 'railroad'
                    ? railroadLogoImg
                    : null;
            const canDrawImageIcon = Boolean(imageIcon?.complete && imageIcon.naturalWidth > 0);
            if (canDrawImageIcon || iconText) {
                if (canDrawImageIcon) {
                    const logoSize = canvas.width * (tile.iconImage === 'railroad' ? 0.42 : 0.36);
                    ctx.drawImage(
                        imageIcon,
                        (canvas.width - logoSize) / 2,
                        canvas.height * 0.12,
                        logoSize,
                        logoSize
                    );
                } else {
                    ctx.fillStyle = 'rgba(179, 202, 255, 0.12)';
                    ctx.beginPath();
                    addRoundedRectPath(
                        ctx,
                        canvas.width * 0.18,
                        canvas.height * 0.24,
                        canvas.width * 0.64,
                        canvas.height * 0.14,
                        28
                    );
                    ctx.fill();

                    ctx.fillStyle = surfacePalette.textSecondary;
                    ctx.font = `700 ${Math.floor(canvas.width * 0.12 * textScale)}px 'Segoe UI', Arial, sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(iconText, canvas.width / 2, canvas.height * 0.31);
                }
            }

            const isFlagTile = tile?.bandStyle === 'flag-image';

            ctx.fillStyle = surfacePalette.textPrimary;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const baseFontSize = Math.floor(canvas.width * (isFlagTile ? 0.158 : 0.138) * textScale);
            const maxNameWidth = canvas.width * (isFlagTile ? 0.92 : 0.86);
            const fittedFontSize = fitWrappedTextSize(
                ctx,
                tile.name.toUpperCase(),
                maxNameWidth,
                baseFontSize,
                Math.floor(baseFontSize * (isFlagTile ? 0.52 : 0.62))
            );
            ctx.font = `800 ${fittedFontSize}px 'Segoe UI', Arial, sans-serif`;
            ctx.strokeStyle = 'rgba(5, 8, 16, 0.8)';
            ctx.lineWidth = Math.max(5, Math.floor(canvas.width * 0.01));
            ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
            ctx.shadowBlur = 10;

            const nameLines = wrapText(ctx, tile.name.toUpperCase(), maxNameWidth);
            const lineHeight = fittedFontSize * (isFlagTile ? 1 : 1.06);
            const startY = tile.type === 'railroad'
                ? metrics.nameZoneTop + (metrics.nameZoneHeight * 0.24)
                : (canDrawImageIcon || iconText)
                    ? metrics.nameZoneTop + (metrics.nameZoneHeight * 0.12)
                    : isCenteredCountriesFlagTile
                        ? metrics.nameZoneTop + (metrics.nameZoneHeight * 0.34)
                    : usesEgyptColorShowcase(tile)
                        ? metrics.nameZoneTop + (metrics.nameZoneHeight * 0.34)
                    : isFlagTile
                        ? metrics.nameZoneTop + (metrics.nameZoneHeight * 0.2)
                        : metrics.nameZoneTop + (metrics.nameZoneHeight * 0.16);
            nameLines.slice(0, 3).forEach((line, lineIndex) => {
                ctx.strokeText(line, canvas.width / 2, startY + (lineIndex * lineHeight));
                ctx.fillText(line, canvas.width / 2, startY + (lineIndex * lineHeight));
            });

            if (tile.price > 0) {
                const priceSize = Math.floor(canvas.width * 0.16 * textScale);
                ctx.font = `800 ${priceSize}px 'Segoe UI', Arial, sans-serif`;
                const displayLabel = ownerColor
                    ? getOwnedTileDisplayValue(tile, propertyState).label
                    : `$${tile.price}`;
                if (isStreetTile) {
                    const chipWidth = canvas.width * 0.84;
                    const chipHeight = footerHeight * 0.62;
                    const chipX = (canvas.width - chipWidth) / 2;
                    const chipY = canvas.height - chipHeight - (footerHeight * 0.16);
                    const chipGradient = ctx.createLinearGradient(chipX, chipY, chipX + chipWidth, chipY);
                    const chipBase = ownerColor || surfacePalette.tileFooterTop;
                    chipGradient.addColorStop(0, ownerColor ? shadeColor(chipBase, 10) : surfacePalette.tileFooterTop);
                    chipGradient.addColorStop(1, ownerColor ? shadeColor(chipBase, -12) : surfacePalette.tileFooterBottom);

                    ctx.fillStyle = chipGradient;
                    ctx.beginPath();
                    addRoundedRectPath(ctx, chipX, chipY, chipWidth, chipHeight, 26);
                    ctx.fill();

                    ctx.strokeStyle = ownerColor ? hexToRgba('#ffffff', 0.34) : 'rgba(255, 255, 255, 0.14)';
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    addRoundedRectPath(ctx, chipX + 2, chipY + 2, chipWidth - 4, chipHeight - 4, 24);
                    ctx.stroke();

                    ctx.fillStyle = ownerColor ? '#ffffff' : surfacePalette.textAccent;
                    ctx.strokeText(displayLabel, canvas.width / 2, chipY + (chipHeight * 0.52));
                    ctx.fillText(displayLabel, canvas.width / 2, chipY + (chipHeight * 0.52));
                } else {
                    ctx.fillStyle = ownerColor ? '#ffffff' : surfacePalette.textAccent;
                    ctx.strokeText(displayLabel, canvas.width / 2, canvas.height - (footerHeight * 0.5));
                    ctx.fillText(displayLabel, canvas.width / 2, canvas.height - (footerHeight * 0.5));
                }
            }
        });

        return finalizeTexture(new THREE.CanvasTexture(canvas));
    }

    function createCornerTexture(tile, tileIndex, cornerState = null) {
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 1024;
        const ctx = canvas.getContext('2d');
        const bailoutAmount = Number.isFinite(cornerState?.bailoutAmount) ? cornerState.bailoutAmount : 0;
        const tileName = tile.name.toLowerCase();
        const isBailoutTile = tileName.includes('bailout');
        const isJailTile = tileName.includes('visit');
        const rotationDegrees = getTileRotationDegrees(tileIndex, currentTextProfile, { activeSide: currentThirdPersonSide });
        const textScale = currentTextProfile === 'top-down' ? 1.18 : 1.05;
        const surfacePalette = getBoardSurfacePalette();

        drawOrientedTexture(ctx, canvas, rotationDegrees, () => {
            const cornerColor = `#${tile.color.toString(16).padStart(6, '0')}`;
            const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
            gradient.addColorStop(0, surfacePalette.cornerFaceTop);
            gradient.addColorStop(1, surfacePalette.cornerFaceBottom);
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.fillStyle = `${cornerColor}33`;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.strokeStyle = surfacePalette.cornerBorder;
            ctx.lineWidth = 18;
            ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);

            ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
            ctx.lineWidth = 4;
            ctx.strokeRect(30, 30, canvas.width - 60, canvas.height - 60);

            ctx.fillStyle = cornerColor;
            ctx.globalAlpha = 0.88;
            ctx.beginPath();
            addRoundedRectPath(
                ctx,
                canvas.width * 0.18,
                canvas.height * 0.12,
                canvas.width * 0.64,
                canvas.height * 0.18,
                40
            );
            ctx.fill();
            ctx.globalAlpha = 1;

            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = `800 ${Math.floor(canvas.width * 0.1 * textScale)}px 'Segoe UI', Arial, sans-serif`;
            ctx.fillText(getCornerBadge(tile), canvas.width / 2, canvas.height * 0.21);

            ctx.fillStyle = surfacePalette.textPrimary;
            ctx.font = `800 ${Math.floor(canvas.width * 0.102 * textScale)}px 'Segoe UI', Arial, sans-serif`;
            ctx.strokeStyle = 'rgba(5, 8, 16, 0.8)';
            ctx.lineWidth = 10;
            ctx.shadowColor = 'rgba(0, 0, 0, 0.42)';
            ctx.shadowBlur = 14;
            const cornerLabel = isJailTile ? 'JAIL' : tile.name.toUpperCase();
            const lines = wrapText(ctx, cornerLabel, canvas.width * 0.72);
            const lineHeight = canvas.width * 0.11;
            const startY = canvas.height * 0.56;
            lines.slice(0, 3).forEach((line, lineIndex) => {
                ctx.strokeText(line, canvas.width / 2, startY + (lineIndex * lineHeight));
                ctx.fillText(line, canvas.width / 2, startY + (lineIndex * lineHeight));
            });

            if (isJailTile) {
                const frameX = canvas.width * 0.19;
                const frameY = canvas.height * 0.33;
                const frameW = canvas.width * 0.62;
                const frameH = canvas.height * 0.2;
                const barCount = 5;

                ctx.fillStyle = 'rgba(6, 10, 18, 0.52)';
                ctx.beginPath();
                addRoundedRectPath(ctx, frameX, frameY, frameW, frameH, 28);
                ctx.fill();

                ctx.strokeStyle = 'rgba(198, 214, 255, 0.55)';
                ctx.lineWidth = 8;
                ctx.beginPath();
                addRoundedRectPath(ctx, frameX, frameY, frameW, frameH, 28);
                ctx.stroke();

                ctx.strokeStyle = 'rgba(220, 230, 255, 0.92)';
                ctx.lineCap = 'round';
                ctx.lineWidth = 16;
                for (let index = 1; index <= barCount; index++) {
                    const x = frameX + ((frameW / (barCount + 1)) * index);
                    ctx.beginPath();
                    ctx.moveTo(x, frameY + 18);
                    ctx.lineTo(x, frameY + frameH - 18);
                    ctx.stroke();
                }

                ctx.strokeStyle = 'rgba(170, 188, 228, 0.9)';
                ctx.lineWidth = 14;
                ctx.beginPath();
                ctx.moveTo(frameX + 28, frameY + (frameH * 0.52));
                ctx.lineTo(frameX + frameW - 28, frameY + (frameH * 0.52));
                ctx.stroke();
            }

            if (isBailoutTile) {
                const amountLabel = `$${bailoutAmount}`;
                ctx.fillStyle = 'rgba(8, 13, 24, 0.72)';
                ctx.beginPath();
                addRoundedRectPath(
                    ctx,
                    canvas.width * 0.18,
                    canvas.height * 0.76,
                    canvas.width * 0.64,
                    canvas.height * 0.12,
                    28
                );
                ctx.fill();

                ctx.fillStyle = surfacePalette.textAccent;
                ctx.font = `700 ${Math.floor(canvas.width * 0.055 * textScale)}px 'Segoe UI', Arial, sans-serif`;
                ctx.fillText('FUND', canvas.width / 2, canvas.height * 0.80);

                ctx.fillStyle = '#ffffff';
                ctx.font = `800 ${Math.floor(canvas.width * 0.09 * textScale)}px 'Segoe UI', Arial, sans-serif`;
                ctx.strokeText(amountLabel, canvas.width / 2, canvas.height * 0.86);
                ctx.fillText(amountLabel, canvas.width / 2, canvas.height * 0.86);
            }

            // Show GO money amounts
            const isGoTile = tile.name.toLowerCase() === 'go';
            if (isGoTile) {
                ctx.fillStyle = 'rgba(8, 13, 24, 0.72)';
                ctx.beginPath();
                addRoundedRectPath(
                    ctx,
                    canvas.width * 0.08,
                    canvas.height * 0.74,
                    canvas.width * 0.84,
                    canvas.height * 0.16,
                    28
                );
                ctx.fill();

                ctx.fillStyle = surfacePalette.textAccent;
                ctx.font = `700 ${Math.floor(canvas.width * 0.048 * textScale)}px 'Segoe UI', Arial, sans-serif`;
                ctx.fillText('LAND $400 · PASS $200', canvas.width / 2, canvas.height * 0.82);
            }
        });

        return finalizeTexture(new THREE.CanvasTexture(canvas));
    }

    function createTileMaterials(tile, tileIndex, ownerColor = null, propertyState = null) {
        const surfacePalette = getBoardSurfacePalette();
        const topTexture = createTileTexture(tile, tileIndex, TILE_TEXTURE_WIDTH, TILE_TEXTURE_HEIGHT, ownerColor, propertyState);
        const topMaterial = new THREE.MeshStandardMaterial({
            map: topTexture,
            roughness: 0.92,
            metalness: 0.02,
            emissive: 0x050812,
            emissiveIntensity: 0.08
        });
        const sideMaterial = new THREE.MeshStandardMaterial({
            color: hexToNumber(surfacePalette.tileSide, 0x273651),
            roughness: 0.94,
            metalness: 0.03,
            emissive: hexToNumber(surfacePalette.tileSideEmissive, 0x09111e),
            emissiveIntensity: 0.08
        });
        return [sideMaterial, sideMaterial, topMaterial, sideMaterial, sideMaterial, sideMaterial];
    }

    function createCornerMaterials(tile, tileIndex, cornerState = null) {
        const surfacePalette = getBoardSurfacePalette();
        const topTexture = createCornerTexture(tile, tileIndex, cornerState);
        const topMaterial = new THREE.MeshStandardMaterial({
            map: topTexture,
            roughness: 0.9,
            metalness: 0.02,
            emissive: 0x050812,
            emissiveIntensity: 0.08
        });
        const sideMaterial = new THREE.MeshStandardMaterial({
            color: hexToNumber(surfacePalette.tileSide, 0x22314b),
            roughness: 0.94,
            metalness: 0.03,
            emissive: hexToNumber(surfacePalette.tileSideEmissive, 0x09111e),
            emissiveIntensity: 0.08
        });
        return [sideMaterial, sideMaterial, topMaterial, sideMaterial, sideMaterial, sideMaterial];
    }

    function finalizeTexture(texture) {
        texture.anisotropy = maxTextureAnisotropy;
        texture.generateMipmaps = true;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.encoding = THREE.sRGBEncoding;
        texture.needsUpdate = true;
        return texture;
    }

    function wrapText(ctx, text, maxWidth) {
        const words = text.split(' ');
        const lines = [];
        let currentLine = '';

        words.forEach(word => {
            const testLine = currentLine ? `${currentLine} ${word}` : word;
            if (ctx.measureText(testLine).width > maxWidth && currentLine) {
                lines.push(currentLine);
                currentLine = word;
            } else {
                currentLine = testLine;
            }
        });

        if (currentLine) lines.push(currentLine);
        return lines;
    }

    function fitWrappedTextSize(ctx, text, maxWidth, initialSize, minSize) {
        let size = initialSize;
        while (size >= minSize) {
            ctx.font = `800 ${size}px 'Segoe UI', Arial, sans-serif`;
            const lines = wrapText(ctx, text, maxWidth);
            const widestLine = lines.reduce((max, line) => Math.max(max, ctx.measureText(line).width), 0);
            if (lines.length <= 3 && widestLine <= maxWidth) {
                return size;
            }
            size -= 2;
        }
        return minSize;
    }

    function shadeColor(hex, percent) {
        const value = hex.replace('#', '');
        const num = Number.parseInt(value, 16);
        const amount = Math.round(2.55 * percent);
        const r = Math.max(0, Math.min(255, (num >> 16) + amount));
        const g = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + amount));
        const b = Math.max(0, Math.min(255, (num & 0xff) + amount));
        return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
    }

    function hexToRgba(hex, alpha = 1) {
        if (typeof hex !== 'string') return `rgba(126, 168, 255, ${alpha})`;
        const value = hex.replace('#', '');
        if (!/^[0-9a-f]{6}$/i.test(value)) return `rgba(126, 168, 255, ${alpha})`;
        const num = Number.parseInt(value, 16);
        const r = (num >> 16) & 0xff;
        const g = (num >> 8) & 0xff;
        const b = num & 0xff;
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    function addRoundedRectPath(ctx, x, y, width, height, radius) {
        const safeRadius = Math.min(radius, width / 2, height / 2);
        ctx.moveTo(x + safeRadius, y);
        ctx.lineTo(x + width - safeRadius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
        ctx.lineTo(x + width, y + height - safeRadius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
        ctx.lineTo(x + safeRadius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
        ctx.lineTo(x, y + safeRadius);
        ctx.quadraticCurveTo(x, y, x + safeRadius, y);
        ctx.closePath();
    }

    function getTileIconText(tile) {
        if (tile?.iconText) return tile.iconText;
        const name = typeof tile.name === 'string' ? tile.name.toLowerCase() : '';
        if (name.includes('lucky wheel')) return '🎰';
        if (name.includes('happy birthday')) return '🎂';
        if (name.includes('income tax')) return '10%';
        // Only show type badges for property tiles, not for non-city tiles
        return '';
    }

    function getCornerBadge(tile) {
        const name = tile.name.toLowerCase();
        if (name.includes('bailout')) return 'BAILOUT';
        if (name.includes('go to') || name.includes('police')) return 'GO TO';
        if (name.includes('parking')) return 'FREE';
        if (name.includes('jail') || name.includes('visit')) return 'JAIL';
        if (name.includes('go')) return 'GO';
        return 'BOARD';
    }

    function getCornerState(tileIndex) {
        const tile = boardData[tileIndex];
        if (!tile || tile.type !== 'corner') return null;
        if (tile.name.toLowerCase().includes('bailout')) {
            return { bailoutAmount: cornerTileState.bailoutAmount };
        }
        return null;
    }

    function rememberTileRenderState(tileIndex, ownerColor = undefined, propertyState = undefined) {
        const previousState = tileRenderState[tileIndex] || {
            ownerColor: null,
            propertyState: null,
            isMortgaged: false
        };

        const nextPropertyState = propertyState === undefined
            ? previousState.propertyState
                ? { ...previousState.propertyState }
                : null
            : propertyState
                ? { ...propertyState }
                : null;

        tileRenderState[tileIndex] = {
            ownerColor: ownerColor === undefined ? (previousState.ownerColor ?? null) : ownerColor,
            propertyState: nextPropertyState,
            isMortgaged: propertyState === undefined
                ? Boolean(nextPropertyState?.isMortgaged ?? previousState.isMortgaged)
                : Boolean(nextPropertyState?.isMortgaged)
        };
    }

    function getTileRenderSnapshot(tileIndex) {
        if (!tileRenderState[tileIndex]) {
            tileRenderState[tileIndex] = {
                ownerColor: null,
                propertyState: null,
                isMortgaged: false
            };
        }
        return tileRenderState[tileIndex];
    }

    function createMortgagedMaterials(tile, tileIndex) {
        const surfacePalette = getBoardSurfacePalette();
        const topTexture = createMortgagedTexture(tile, tileIndex);
        const topMaterial = new THREE.MeshStandardMaterial({
            map: topTexture,
            roughness: 0.94,
            metalness: 0.02,
            emissive: 0x050812,
            emissiveIntensity: 0.08
        });
        const sideMaterial = new THREE.MeshStandardMaterial({
            color: hexToNumber(surfacePalette.mortgageTop, 0x4f5a71),
            roughness: 0.96,
            metalness: 0.02,
            emissive: hexToNumber(surfacePalette.tileSideEmissive, 0x09111e),
            emissiveIntensity: 0.08
        });
        return [sideMaterial, sideMaterial, topMaterial, sideMaterial, sideMaterial, sideMaterial];
    }

    function createMaterialSetForTile(tileIndex) {
        const tile = boardData[tileIndex];
        if (!tile) return null;
        if (tile.type === 'corner') {
            return createCornerMaterials(tile, tileIndex, getCornerState(tileIndex));
        }

        const renderState = getTileRenderSnapshot(tileIndex);
        if (renderState.isMortgaged) {
            return createMortgagedMaterials(tile, tileIndex);
        }

        return createTileMaterials(tile, tileIndex, renderState.ownerColor, renderState.propertyState);
    }

    function refreshTileTexture(tileIndex) {
        const materialSet = createMaterialSetForTile(tileIndex);
        if (materialSet) {
            replaceTileMaterial(tileIndex, materialSet);
        }
    }

    function refreshTileTextures(tileIndexes) {
        tileIndexes.forEach(refreshTileTexture);
    }

    let raycaster = null;
    const mouse = new THREE.Vector2();
    let onTileClickCallback = null;

    function readTileIndexFromPointer(event, camera, renderer) {
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(Object.values(tileMeshes));
        if (!intersects.length) return null;

        const hit = intersects[0].object;
        return typeof hit?.userData?.tileIndex === 'number' ? hit.userData.tileIndex : null;
    }

    function initRaycaster(camera, renderer) {
        raycaster = new THREE.Raycaster();

        renderer.domElement.addEventListener('pointermove', event => {
            const tileIndex = readTileIndexFromPointer(event, camera, renderer);
            if (tileIndex === hoveredTileIndex) return;
            setHoveredTile(tileIndex);
            if (onTileHoverCallback) {
                onTileHoverCallback(tileIndex);
            }
        });

        renderer.domElement.addEventListener('pointerleave', () => {
            if (hoveredTileIndex === null) return;
            setHoveredTile(null);
            if (onTileHoverCallback) {
                onTileHoverCallback(null);
            }
        });

        renderer.domElement.addEventListener('click', event => {
            const tileIndex = readTileIndexFromPointer(event, camera, renderer);
            if (typeof tileIndex === 'number' && onTileClickCallback) {
                onTileClickCallback(tileIndex);
            }
        });
    }

    function onTileClick(callback) {
        onTileClickCallback = callback;
    }

    function onTileHover(callback) {
        onTileHoverCallback = callback;
    }

    function createHouseUnit() {
        const group = new THREE.Group();

        const baseMaterial = new THREE.MeshStandardMaterial({
            color: 0xe7eef7,
            roughness: 0.74,
            metalness: 0.07
        });
        const wallMaterial = new THREE.MeshStandardMaterial({
            color: 0x3fa96a,
            roughness: 0.46,
            metalness: 0.14
        });
        const roofMaterial = new THREE.MeshStandardMaterial({
            color: 0x234935,
            roughness: 0.4,
            metalness: 0.1
        });
        const accentMaterial = new THREE.MeshStandardMaterial({
            color: 0xfff5e5,
            roughness: 0.72,
            metalness: 0.04
        });

        const foundation = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.24), baseMaterial);
        foundation.position.y = 0.03;
        foundation.castShadow = true;
        foundation.receiveShadow = true;
        group.add(foundation);

        const body = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.2, 0.18), wallMaterial);
        body.position.y = 0.19;
        body.castShadow = true;
        body.receiveShadow = true;
        group.add(body);

        const roof = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.15, 4), roofMaterial);
        roof.position.y = 0.36;
        roof.rotation.y = Math.PI / 4;
        roof.castShadow = true;
        roof.receiveShadow = true;
        group.add(roof);

        const door = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.01), accentMaterial);
        door.position.set(0, 0.14, 0.096);
        group.add(door);

        const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.11, 0.038), accentMaterial);
        chimney.position.set(0.06, 0.34, -0.03);
        chimney.castShadow = true;
        chimney.receiveShadow = true;
        group.add(chimney);

        return group;
    }

    function createHotelUnit() {
        const group = new THREE.Group();

        const baseMaterial = new THREE.MeshStandardMaterial({
            color: 0xe5e9ef,
            roughness: 0.74,
            metalness: 0.05
        });
        const bodyMaterial = new THREE.MeshStandardMaterial({
            color: 0xc4534d,
            roughness: 0.46,
            metalness: 0.14
        });
        const roofMaterial = new THREE.MeshStandardMaterial({
            color: 0x4e2322,
            roughness: 0.5,
            metalness: 0.08
        });
        const accentMaterial = new THREE.MeshStandardMaterial({
            color: 0xfff2d9,
            roughness: 0.7,
            metalness: 0.04
        });

        const foundation = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.07, 0.3), baseMaterial);
        foundation.position.y = 0.035;
        foundation.castShadow = true;
        foundation.receiveShadow = true;
        group.add(foundation);

        const body = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.24, 0.24), bodyMaterial);
        body.position.y = 0.23;
        body.castShadow = true;
        body.receiveShadow = true;
        group.add(body);

        const roof = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.08, 0.28), roofMaterial);
        roof.position.y = 0.39;
        roof.castShadow = true;
        roof.receiveShadow = true;
        group.add(roof);

        const sign = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 0.02), accentMaterial);
        sign.position.set(0, 0.25, 0.13);
        group.add(sign);

        return group;
    }

    function applyOwnershipTintToModel(object3D, ownerColor) {
        if (!object3D || !ownerColor) return object3D;
        if (object3D.userData?.ownershipTintApplied) return object3D;
        const tintColor = new THREE.Color(ownerColor);

        object3D.traverse(child => {
            if (!child?.isMesh || !child.material) return;

            const applyTint = (material, blend = 0.28) => {
                if (!material) return material;
                const nextMaterial = material.clone();

                if (nextMaterial.color?.isColor) {
                    nextMaterial.color.lerp(tintColor, blend);
                }
                if (nextMaterial.emissive?.isColor) {
                    nextMaterial.emissive.lerp(tintColor, 0.06);
                    nextMaterial.emissiveIntensity = Math.max(nextMaterial.emissiveIntensity || 0, 0.06);
                }

                nextMaterial.needsUpdate = true;
                return nextMaterial;
            };

            if (Array.isArray(child.material)) {
                child.material = child.material.map((material, index) => applyTint(material, 0.24 + (index * 0.015)));
            } else {
                child.material = applyTint(child.material);
            }
        });

        object3D.userData = {
            ...object3D.userData,
            ownershipTintApplied: true
        };

        return object3D;
    }

    function getGltfLoader() {
        if (gltfLoader) return gltfLoader;
        if (typeof THREE.GLTFLoader !== 'function') return null;
        gltfLoader = new THREE.GLTFLoader();
        return gltfLoader;
    }

    function loadUpgradeTemplate(level) {
        const config = upgradeModelConfigs[level];
        if (!config) {
            return Promise.reject(new Error(`Unknown upgrade level: ${level}`));
        }
        if (upgradeModelCache.has(level)) {
            return Promise.resolve(upgradeModelCache.get(level));
        }
        if (upgradeModelPromises.has(level)) {
            return upgradeModelPromises.get(level);
        }

        const loader = getGltfLoader();
        if (!loader) {
            return Promise.reject(new Error('THREE.GLTFLoader is unavailable.'));
        }

        const promise = new Promise((resolve, reject) => {
            loader.load(
                config.path,
                gltf => {
                    const template = gltf.scene || gltf.scenes?.[0];
                    if (!template) {
                        reject(new Error(`No scene found in ${config.path}`));
                        return;
                    }
                    upgradeModelCache.set(level, template);
                    resolve(template);
                },
                undefined,
                reject
            );
        }).finally(() => {
            upgradeModelPromises.delete(level);
        });

        upgradeModelPromises.set(level, promise);
        return promise;
    }

    function fitUpgradeModel(instance, config) {
        const initialBounds = new THREE.Box3().setFromObject(instance);
        const initialSize = initialBounds.getSize(new THREE.Vector3());
        const footprint = Math.max(initialSize.x, initialSize.z, 0.001);
        const height = Math.max(initialSize.y, 0.001);
        const scale = Math.min(config.footprint / footprint, config.height / height);
        instance.scale.setScalar(scale);

        const bounds = new THREE.Box3().setFromObject(instance);
        const center = bounds.getCenter(new THREE.Vector3());
        const min = bounds.min.clone();
        instance.position.x -= center.x;
        instance.position.z -= center.z;
        instance.position.y -= min.y;
    }

    async function createUpgradeUnit(level) {
        const config = upgradeModelConfigs[level];
        const template = await loadUpgradeTemplate(level);
        const instance = template.clone(true);
        instance.traverse(child => {
            if (!child?.isMesh) return;
            child.castShadow = true;
            child.receiveShadow = true;
            child.userData = {
                ...child.userData,
                sharedAsset: true
            };
        });
        instance.userData = {
            ...instance.userData,
            sharedAsset: true
        };
        fitUpgradeModel(instance, config);
        return instance;
    }

    async function addHouse(tileIndex, houseCount, scene) {
        removeHouses(tileIndex, scene);

        const position = tilePositions[tileIndex];
        if (!position || houseCount <= 0) return;
        const renderState = getTileRenderSnapshot(tileIndex);
        const ownerColor = renderState?.ownerColor || null;

        const renderToken = Symbol(`house-${tileIndex}-${houseCount}`);
        houseRenderTokens[tileIndex] = renderToken;
        const cluster = new THREE.Group();
        const { rotationY, offsetX, offsetZ } = getBuildingOrientation(tileIndex);
        cluster.position.set(
            position.x + offsetX,
            (TILE_H / 2) + 0.018,
            position.z + offsetZ
        );
        cluster.rotation.y = rotationY;

        try {
            const upgradeLevel = Math.max(0, Math.min(houseCount, upgradeModelConfigs.length) - 1);
            const upgradeUnit = await createUpgradeUnit(upgradeLevel);
            if (houseRenderTokens[tileIndex] !== renderToken) return;
            applyOwnershipTintToModel(upgradeUnit, ownerColor);
            cluster.add(upgradeUnit);
        } catch (error) {
            console.warn(`Failed to load upgrade model for tile ${tileIndex}. Falling back to legacy buildings.`, error);
            if (houseRenderTokens[tileIndex] !== renderToken) return;
            if (houseCount >= 5) {
                const hotel = createHotelUnit();
                applyOwnershipTintToModel(hotel, ownerColor);
                cluster.add(hotel);
            } else {
                const spacing = 0.29;
                const start = -((houseCount - 1) * spacing) / 2;
                for (let index = 0; index < houseCount; index++) {
                    const house = createHouseUnit();
                    house.position.x = start + (index * spacing);
                    applyOwnershipTintToModel(house, ownerColor);
                    cluster.add(house);
                }
            }
        }

        const parent = boardGroup || scene;
        parent.add(cluster);
        houseMeshes[tileIndex] = [cluster];
        updateBuildingTransparency(tileIndex);
    }

    function removeHouses(tileIndex, scene) {
        houseRenderTokens[tileIndex] = null;
        if (!houseMeshes[tileIndex]) return;
        const parent = boardGroup || scene;
        houseMeshes[tileIndex].forEach(mesh => {
            parent.remove(mesh);
            disposeObject(mesh);
        });
        houseMeshes[tileIndex] = [];
    }

    function getBuildingOrientation(index) {
        const tile = boardData[index];
        const topEdgeOffset = tile?.type === 'property' ? 1.04 : 0;
        const outward = topEdgeOffset > 0 ? getTileOutwardVector(index) : { x: 0, z: 0 };

        if (index >= 1 && index <= 9) {
            return { inward: { x: 0, z: -1 }, rotationY: 0, offsetX: outward.x * topEdgeOffset, offsetZ: outward.z * topEdgeOffset };
        }
        if (index >= 11 && index <= 19) {
            return { inward: { x: 1, z: 0 }, rotationY: Math.PI / 2, offsetX: outward.x * topEdgeOffset, offsetZ: outward.z * topEdgeOffset };
        }
        if (index >= 21 && index <= 29) {
            return { inward: { x: 0, z: 1 }, rotationY: 0, offsetX: outward.x * topEdgeOffset, offsetZ: outward.z * topEdgeOffset };
        }
        if (index >= 31 && index <= 39) {
            return { inward: { x: -1, z: 0 }, rotationY: Math.PI / 2, offsetX: outward.x * topEdgeOffset, offsetZ: outward.z * topEdgeOffset };
        }
        return { inward: { x: 0, z: 0 }, rotationY: 0, offsetX: 0, offsetZ: 0 };
    }

    function getTileOutwardVector(index) {
        let vector;
        if (index === 0) vector = { x: 1, z: 1 };
        else if (index === 10) vector = { x: -1, z: 1 };
        else if (index === 20) vector = { x: -1, z: -1 };
        else if (index === 30) vector = { x: 1, z: -1 };
        else if (index >= 1 && index <= 9) vector = { x: 0, z: 1 };
        else if (index >= 11 && index <= 19) vector = { x: -1, z: 0 };
        else if (index >= 21 && index <= 29) vector = { x: 0, z: -1 };
        else if (index >= 31 && index <= 39) vector = { x: 1, z: 0 };
        else vector = { x: 0, z: 0 };

        const length = Math.hypot(vector.x, vector.z) || 1;
        return { x: vector.x / length, z: vector.z / length };
    }

    function applyTileInteractionState(tileIndex) {
        const mesh = tileMeshes[tileIndex];
        if (!mesh) return;

        const isHovered = interactionHighlightsEnabled && tileIndex === hoveredTileIndex;
        const isFocused = interactionHighlightsEnabled && tileIndex === focusedTileIndex;
        const lift = isFocused ? 0.05 : isHovered ? 0.028 : 0;
        const accent = new THREE.Color(mesh.userData.tileAccent || '#7ea8ff');
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        const defaultTopEmissive = new THREE.Color(0x050812);
        const defaultSideEmissive = new THREE.Color(0x09111e);

        mesh.position.y = (mesh.userData.baseY || 0) + lift;

        materials.forEach((material, materialIndex) => {
            if (!material?.emissive) return;

            if (materialIndex === 2) {
                material.emissive.copy(isFocused ? accent : isHovered ? accent.clone().lerp(new THREE.Color('#ffffff'), 0.25) : defaultTopEmissive);
                material.emissiveIntensity = isFocused ? 0.32 : isHovered ? 0.2 : 0.08;
            } else {
                material.emissive.copy(isFocused ? accent.clone().multiplyScalar(0.35) : isHovered ? accent.clone().multiplyScalar(0.18) : defaultSideEmissive);
                material.emissiveIntensity = isFocused ? 0.18 : isHovered ? 0.12 : 0.08;
            }
        });
    }

    function refreshTileInteractionStates() {
        Object.keys(tileMeshes).forEach(index => applyTileInteractionState(Number(index)));
    }

    function updateTileOwner(tileIndex, ownerColor, propertyState = null) {
        rememberTileRenderState(tileIndex, ownerColor, propertyState);
        refreshTileTexture(tileIndex);
    }

    function updateBailoutAmount(amount) {
        const safeAmount = Number.isFinite(amount) ? Math.max(0, Math.round(amount)) : 0;
        if (cornerTileState.bailoutAmount === safeAmount) return;
        cornerTileState.bailoutAmount = safeAmount;

        const bailoutTileIndex = boardData.findIndex(tile =>
            tile.type === 'corner' && tile.name.toLowerCase().includes('bailout')
        );
        if (bailoutTileIndex >= 0) {
            refreshTileTexture(bailoutTileIndex);
        }
    }

    function setMortgaged(tileIndex, isMortgaged) {
        const tile = boardData[tileIndex];
        if (!tile) return;

        const previousState = getTileRenderSnapshot(tileIndex);
        const nextPropertyState = previousState.propertyState
            ? { ...previousState.propertyState, isMortgaged: Boolean(isMortgaged) }
            : { isMortgaged: Boolean(isMortgaged) };

        tileRenderState[tileIndex] = {
            ...previousState,
            propertyState: nextPropertyState,
            isMortgaged: Boolean(isMortgaged)
        };

        refreshTileTexture(tileIndex);
    }

    function createMortgagedTexture(tile, tileIndex) {
        const canvas = document.createElement('canvas');
        canvas.width = 600;
        canvas.height = 820;
        const ctx = canvas.getContext('2d');
        const rotationDegrees = getTileRotationDegrees(tileIndex, currentTextProfile, { activeSide: currentThirdPersonSide });
        const surfacePalette = getBoardSurfacePalette();

        drawOrientedTexture(ctx, canvas, rotationDegrees, () => {
            const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
            gradient.addColorStop(0, surfacePalette.mortgageTop);
            gradient.addColorStop(1, surfacePalette.mortgageBottom);
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.strokeStyle = surfacePalette.mortgageBorder;
            ctx.lineWidth = 10;
            ctx.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);

            ctx.fillStyle = 'rgba(155, 170, 194, 0.12)';
            ctx.fillRect(0, 0, canvas.width, canvas.height * 0.22);

            ctx.fillStyle = surfacePalette.textPrimary;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = `700 ${Math.floor(canvas.width * 0.09 * getProfileTextScale())}px 'Segoe UI', Arial, sans-serif`;
            wrapText(ctx, tile.name.toUpperCase(), canvas.width * 0.72).slice(0, 3).forEach((line, lineIndex) => {
                ctx.fillText(line, canvas.width / 2, canvas.height * 0.42 + (lineIndex * canvas.width * 0.1));
            });

            ctx.save();
            ctx.translate(canvas.width / 2, canvas.height * 0.72);
            ctx.rotate(-0.22);
            ctx.strokeStyle = 'rgba(156, 37, 37, 0.7)';
            ctx.lineWidth = 12;
            ctx.strokeRect(-canvas.width * 0.28, -42, canvas.width * 0.56, 84);
            ctx.fillStyle = 'rgba(156, 37, 37, 0.72)';
            ctx.font = `800 ${Math.floor(canvas.width * 0.1 * getProfileTextScale())}px 'Segoe UI', Arial, sans-serif`;
            ctx.fillText('MORTGAGED', 0, 6);
            ctx.restore();
        });

        return finalizeTexture(new THREE.CanvasTexture(canvas));
    }

    function setTextProfile(profile, options = {}) {
        const nextProfile = profile === 'top-down'
            ? 'top-down'
            : profile === 'third-person'
                ? 'third-person'
                : 'isometric';
        const nextThirdPersonSide = nextProfile === 'third-person' ? options.activeSide || 'south' : null;

        if (nextProfile === currentTextProfile && nextThirdPersonSide === currentThirdPersonSide) {
            return;
        }

        if (nextProfile === 'third-person' && currentTextProfile === 'third-person') {
            const impactedTiles = new Set([
                ...(SIDE_TILE_INDEXES[currentThirdPersonSide] || []),
                ...(SIDE_TILE_INDEXES[nextThirdPersonSide] || [])
            ]);
            currentTextProfile = nextProfile;
            currentThirdPersonSide = nextThirdPersonSide;
            refreshTileTextures(Array.from(impactedTiles));
            return;
        }

        currentTextProfile = nextProfile;
        currentThirdPersonSide = nextThirdPersonSide;
        refreshTileTextures(boardData.map(tile => tile.index));
    }

    function replaceTileMaterial(tileIndex, materialSet) {
        const mesh = tileMeshes[tileIndex];
        if (!mesh) return;
        disposeMaterialSet(mesh.material);
        mesh.material = materialSet;
        applyTileInteractionState(tileIndex);
    }

    function disposeMaterialSet(materialSet) {
        if (Array.isArray(materialSet)) {
            materialSet.forEach(disposeMaterial);
            return;
        }
        disposeMaterial(materialSet);
    }

    function disposeMaterial(material) {
        if (!material) return;
        if (material.map) material.map.dispose();
        material.dispose?.();
    }

    function disposeObject(object) {
        object.traverse(child => {
            if (child.userData?.sharedAsset) return;
            child.geometry?.dispose?.();
            disposeMaterialSet(child.material);
        });
    }

    function calculateTilePosition(index) {
        const centeredPosition = typeof BOARD_LAYOUT.calculateCenteredTilePosition === 'function'
            ? BOARD_LAYOUT.calculateCenteredTilePosition(index, BOARD_GEOMETRY)
            : null;

        if (centeredPosition) {
            return new THREE.Vector3(centeredPosition.x, centeredPosition.y || 0, centeredPosition.z);
        }

        const position = new THREE.Vector3(0, 0, 0);
        if (index === 0) {
            position.set(half - (CORNER_SIZE / 2), 0, half - (CORNER_SIZE / 2));
        } else if (index <= 9) {
            const x = half - startOffset - ((index - 1) * (TILE_W + GAP)) - (TILE_W / 2);
            position.set(x, 0, half - (CORNER_SIZE / 2));
        } else if (index === 10) {
            position.set(-half + (CORNER_SIZE / 2), 0, half - (CORNER_SIZE / 2));
        } else if (index <= 19) {
            const localIndex = index - 11;
            const z = half - startOffset - (localIndex * (TILE_W + GAP)) - (TILE_W / 2);
            position.set(-half + (CORNER_SIZE / 2), 0, z);
        } else if (index === 20) {
            position.set(-half + (CORNER_SIZE / 2), 0, -half + (CORNER_SIZE / 2));
        } else if (index <= 29) {
            const localIndex = index - 21;
            const x = -half + startOffset + (localIndex * (TILE_W + GAP)) + (TILE_W / 2);
            position.set(x, 0, -half + (CORNER_SIZE / 2));
        } else if (index === 30) {
            position.set(half - (CORNER_SIZE / 2), 0, -half + (CORNER_SIZE / 2));
        } else {
            const localIndex = index - 31;
            const z = -half + startOffset + (localIndex * (TILE_W + GAP)) + (TILE_W / 2);
            position.set(half - (CORNER_SIZE / 2), 0, z);
        }
        return position;
    }

    function getTileWorldPosition(index) {
        if (tilePositions[index]) return { ...tilePositions[index] };
        const position = calculateTilePosition(index);
        return { x: position.x, y: 0, z: position.z };
    }

    function getTileData() {
        return boardData;
    }

    function setBoardMap(boardId, scene = sceneRef, rendererRef = rendererStateRef) {
        const resolvedBoard = setActiveBoard(boardId);
        if (!scene) {
            return resolvedBoard;
        }
        build(scene, rendererRef);
        return resolvedBoard;
    }

    function getCurrentBoardId() {
        return currentBoardId;
    }

    function getMesh(index) {
        return tileMeshes[index];
    }

    function setHoveredTile(tileIndex) {
        hoveredTileIndex = typeof tileIndex === 'number' ? tileIndex : null;
        refreshTileInteractionStates();
    }

    function setFocusedTile(tileIndex) {
        focusedTileIndex = typeof tileIndex === 'number' ? tileIndex : null;
        refreshTileInteractionStates();
    }

    // -- #17: Building transparency when player stands on tile --
    const occupiedTiles = new Set();

    function setTileOccupied(tileIndex, isOccupied) {
        if (isOccupied) {
            occupiedTiles.add(tileIndex);
        } else {
            occupiedTiles.delete(tileIndex);
        }
        updateBuildingTransparency(tileIndex);
    }

    function updateBuildingTransparency(tileIndex) {
        const meshes = houseMeshes[tileIndex];
        if (!meshes || meshes.length === 0) return;
        meshes.forEach(cluster => {
            cluster.traverse(child => {
                if (!child?.isMesh) return;
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(mat => {
                            mat.transparent = false;
                            mat.opacity = 1;
                            mat.needsUpdate = true;
                        });
                    } else {
                        child.material.transparent = false;
                        child.material.opacity = 1;
                        child.material.needsUpdate = true;
                    }
                }
            });
        });
    }

    return {
        build,
        setBoardMap,
        getCurrentBoardId,
        getTileData,
        getTileWorldPosition,
        getMesh,
        initRaycaster,
        onTileClick,
        onTileHover,
        addHouse,
        removeHouses,
        setMortgaged,
        updateTileOwner,
        updateBailoutAmount,
        setTextProfile,
        setHoveredTile,
        setFocusedTile,
        setTileOccupied
    };
})();
