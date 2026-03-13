// ═══════════════════════════════════════════════════════════
//  BOARD — 3D Monopoly board with brighter tile materials,
//          compact house/hotel models, and mortgage support
// ═══════════════════════════════════════════════════════════

const GameBoard = (() => {
    const TILE_W = 1.5;
    const TILE_D = 1.92;
    const TILE_H = 0.22;
    const CORNER_SIZE = 2.1;
    const GAP = 0.06;
    const BUILDING_INSET = 0.4;

    const tilePositions = {};
    const tileMeshes = {};
    const houseMeshes = {};
    const tileRenderState = {};
    const cornerTileState = {
        bailoutAmount: 0
    };
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
    const interactionHighlightsEnabled = false;

    const COLOR_MAP = {
        brown: '#8c5a3c',
        lightblue: '#8ccbf3',
        pink: '#d984c4',
        orange: '#e7a24f',
        red: '#d55f57',
        yellow: '#e8ce63',
        green: '#56ab71',
        darkblue: '#4964d7',
        railroad: '#6b7285',
        utility: '#8f97a7'
    };

    const SIDE_TILE_INDEXES = {
        south: [1, 2, 3, 4, 5, 6, 7, 8, 9],
        west: [11, 12, 13, 14, 15, 16, 17, 18, 19],
        north: [21, 22, 23, 24, 25, 26, 27, 28, 29],
        east: [31, 32, 33, 34, 35, 36, 37, 38, 39]
    };

    const TEXT_ROTATION_BY_PROFILE = {
        isometric: {
            south: 180,
            west: 180,
            north: 180,
            east: 0,
            corners: {
                0: 0,
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
                0: 0,
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
                0: 0,
                10: 180,
                20: 180,
                30: 0
            }
        }
    };

    function build(scene, rendererRef = null) {
        boardGroup = new THREE.Group();
        boardGroup.position.y = 0.05;
        maxTextureAnisotropy = rendererRef?.capabilities?.getMaxAnisotropy?.() || 1;

        edgeLen = CORNER_SIZE + 9 * (TILE_W + GAP) + CORNER_SIZE;
        half = edgeLen / 2;
        startOffset = CORNER_SIZE + GAP;

        const boardBase = new THREE.Mesh(
            new THREE.BoxGeometry(edgeLen + 1, 0.36, edgeLen + 1),
            new THREE.MeshStandardMaterial({
                color: 0x09111f,
                roughness: 0.98,
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
                color: 0x1d2b4b,
                emissive: 0x0b1220,
                emissiveIntensity: 0.26,
                roughness: 0.9,
                metalness: 0.06
            })
        );
        boardTrim.position.y = -0.18;
        boardGroup.add(boardTrim);

        BOARD_DATA.forEach((tile, index) => {
            const isCorner = tile.type === 'corner';
            tileRenderState[index] = {
                ownerColor: null,
                propertyState: null,
                isMortgaged: false
            };
            const geometry = isCorner
                ? new THREE.BoxGeometry(CORNER_SIZE, TILE_H, CORNER_SIZE)
                : new THREE.BoxGeometry(TILE_W, TILE_H, TILE_D);
            const materials = isCorner
                ? createCornerMaterials(tile, index, getCornerState(index))
                : createTileMaterials(tile, index, null);
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
                tileAccent: COLOR_MAP[tile.colorGroup] || COLOR_MAP[tile.type] || '#7ea8ff',
                outwardVector: getTileOutwardVector(index)
            };

            boardGroup.add(mesh);
            tileMeshes[index] = mesh;
            applyTileInteractionState(index);
        });

        const innerSize = edgeLen - (2 * TILE_D) - 0.35;
        const centerBase = new THREE.Mesh(
            new THREE.BoxGeometry(innerSize, 0.14, innerSize),
            new THREE.MeshStandardMaterial({
                color: 0x0b1120,
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
                color: 0x101b31,
                emissive: 0x08101c,
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
            { inner: 2.5, outer: 2.82, color: 0x4f8fff, opacity: 0.045 },
            { inner: 1.4, outer: 1.62, color: 0xb38cff, opacity: 0.035 }
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

        scene.add(boardGroup);
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
        return currentTextProfile === 'top-down' ? 1.28 : 1.12;
    }

    function createTileTexture(tile, tileIndex, width, height, ownerColor = null, propertyState = null) {
        const canvas = document.createElement('canvas');
        const scale = 5;
        canvas.width = width * scale;
        canvas.height = height * scale;

        const ctx = canvas.getContext('2d');
        const rotationDegrees = getTileRotationDegrees(tileIndex, currentTextProfile, { activeSide: currentThirdPersonSide });
        const textScale = getProfileTextScale();

        drawOrientedTexture(ctx, canvas, rotationDegrees, () => {
            const footerHeight = Math.round(canvas.height * 0.18);
            const bandHeight = Math.round(canvas.height * 0.18);
            const colorHex = COLOR_MAP[tile.colorGroup] || COLOR_MAP[tile.type] || '#bac4d6';
            const isPurchasable = ['property', 'railroad', 'utility'].includes(tile.type);
            const buildingCount = propertyState?.houses || 0;

            const tileGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
            tileGradient.addColorStop(0, '#141d30');
            tileGradient.addColorStop(1, '#0b1120');
            ctx.fillStyle = tileGradient;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.fillStyle = 'rgba(114, 145, 216, 0.08)';
            ctx.fillRect(0, canvas.height * 0.52, canvas.width, canvas.height * 0.18);

            ctx.strokeStyle = '#6576a6';
            ctx.lineWidth = 8;
            ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);

            ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
            ctx.lineWidth = 2;
            ctx.strokeRect(14, 14, canvas.width - 28, canvas.height - 28);

            if (isPurchasable) {
                const bandGradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
                bandGradient.addColorStop(0, shadeColor(colorHex, 18));
                bandGradient.addColorStop(1, shadeColor(colorHex, -14));
                ctx.fillStyle = bandGradient;
                ctx.fillRect(0, 0, canvas.width, bandHeight);

                ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
                ctx.fillRect(0, 0, canvas.width, 10);

                ctx.fillStyle = 'rgba(6, 10, 18, 0.34)';
                ctx.fillRect(0, bandHeight - 10, canvas.width, 10);
            }

            if (ownerColor) {
                ctx.fillStyle = ownerColor;
                ctx.globalAlpha = 0.88;
                ctx.fillRect(0, canvas.height - footerHeight, canvas.width, footerHeight);
                ctx.globalAlpha = 1;

                ctx.save();
                ctx.fillStyle = ownerColor;
                ctx.beginPath();
                ctx.moveTo(canvas.width - 112, 0);
                ctx.lineTo(canvas.width, 0);
                ctx.lineTo(canvas.width, 112);
                ctx.closePath();
                ctx.fill();
                ctx.restore();
            } else {
                const footerGradient = ctx.createLinearGradient(0, canvas.height - footerHeight, 0, canvas.height);
                footerGradient.addColorStop(0, '#182235');
                footerGradient.addColorStop(1, '#0b1220');
                ctx.fillStyle = footerGradient;
                ctx.fillRect(0, canvas.height - footerHeight, canvas.width, footerHeight);
            }

            if (buildingCount > 0 && tile.type === 'property' && !propertyState?.isMortgaged) {
                ctx.fillStyle = 'rgba(6, 10, 18, 0.78)';
                ctx.beginPath();
                addRoundedRectPath(
                    ctx,
                    canvas.width * 0.62,
                    canvas.height * 0.26,
                    canvas.width * 0.22,
                    canvas.height * 0.12,
                    18
                );
                ctx.fill();

                ctx.fillStyle = buildingCount >= 5 ? '#ffcf7a' : '#c6ffd7';
                ctx.font = `800 ${Math.floor(canvas.width * 0.072 * textScale)}px 'Segoe UI', Arial, sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(buildingCount >= 5 ? 'HOTEL' : `${buildingCount}H`, canvas.width * 0.73, canvas.height * 0.32);
            }

            const iconText = getTileIconText(tile);
            if (iconText) {
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

                ctx.fillStyle = '#d9e6ff';
                ctx.font = `700 ${Math.floor(canvas.width * 0.12 * textScale)}px 'Segoe UI', Arial, sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(iconText, canvas.width / 2, canvas.height * 0.31);
            }

            ctx.fillStyle = '#f4f7ff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const fontSize = Math.floor(canvas.width * 0.128 * textScale);
            ctx.font = `700 ${fontSize}px 'Segoe UI', Arial, sans-serif`;
            ctx.strokeStyle = 'rgba(5, 8, 16, 0.8)';
            ctx.lineWidth = Math.max(5, Math.floor(canvas.width * 0.01));
            ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
            ctx.shadowBlur = 10;

            const nameLines = wrapText(ctx, tile.name.toUpperCase(), canvas.width * 0.84);
            const lineHeight = fontSize * 1.06;
            const startY = iconText ? canvas.height * 0.45 : canvas.height * 0.39;
            nameLines.slice(0, 3).forEach((line, lineIndex) => {
                ctx.strokeText(line, canvas.width / 2, startY + (lineIndex * lineHeight));
                ctx.fillText(line, canvas.width / 2, startY + (lineIndex * lineHeight));
            });

            if (tile.price > 0) {
                const priceSize = Math.floor(canvas.width * 0.145 * textScale);
                ctx.font = `800 ${priceSize}px 'Segoe UI', Arial, sans-serif`;
                ctx.fillStyle = ownerColor ? '#ffffff' : '#ffd87f';
                ctx.strokeText(`$${tile.price}`, canvas.width / 2, canvas.height - (footerHeight * 0.5));
                ctx.fillText(`$${tile.price}`, canvas.width / 2, canvas.height - (footerHeight * 0.5));
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
        const isBailoutTile = tile.name.toLowerCase().includes('bailout');
        const rotationDegrees = getTileRotationDegrees(tileIndex, currentTextProfile, { activeSide: currentThirdPersonSide });
        const textScale = currentTextProfile === 'top-down' ? 1.18 : 1.05;

        drawOrientedTexture(ctx, canvas, rotationDegrees, () => {
            const cornerColor = `#${tile.color.toString(16).padStart(6, '0')}`;
            const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
            gradient.addColorStop(0, '#162138');
            gradient.addColorStop(1, '#0b1220');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.fillStyle = `${cornerColor}33`;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.strokeStyle = '#6678a8';
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

            ctx.fillStyle = '#f4f7ff';
            ctx.font = `800 ${Math.floor(canvas.width * 0.102 * textScale)}px 'Segoe UI', Arial, sans-serif`;
            ctx.strokeStyle = 'rgba(5, 8, 16, 0.8)';
            ctx.lineWidth = 10;
            ctx.shadowColor = 'rgba(0, 0, 0, 0.42)';
            ctx.shadowBlur = 14;
            const lines = wrapText(ctx, tile.name.toUpperCase(), canvas.width * 0.72);
            const lineHeight = canvas.width * 0.11;
            const startY = canvas.height * 0.56;
            lines.slice(0, 3).forEach((line, lineIndex) => {
                ctx.strokeText(line, canvas.width / 2, startY + (lineIndex * lineHeight));
                ctx.fillText(line, canvas.width / 2, startY + (lineIndex * lineHeight));
            });

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

                ctx.fillStyle = '#ffd87f';
                ctx.font = `700 ${Math.floor(canvas.width * 0.055 * textScale)}px 'Segoe UI', Arial, sans-serif`;
                ctx.fillText('FUND', canvas.width / 2, canvas.height * 0.80);

                ctx.fillStyle = '#ffffff';
                ctx.font = `800 ${Math.floor(canvas.width * 0.09 * textScale)}px 'Segoe UI', Arial, sans-serif`;
                ctx.strokeText(amountLabel, canvas.width / 2, canvas.height * 0.86);
                ctx.fillText(amountLabel, canvas.width / 2, canvas.height * 0.86);
            }
        });

        return finalizeTexture(new THREE.CanvasTexture(canvas));
    }

    function createTileMaterials(tile, tileIndex, ownerColor = null, propertyState = null) {
        const topTexture = createTileTexture(tile, tileIndex, 150, 192, ownerColor, propertyState);
        const topMaterial = new THREE.MeshStandardMaterial({
            map: topTexture,
            roughness: 0.92,
            metalness: 0.02,
            emissive: 0x050812,
            emissiveIntensity: 0.08
        });
        const sideMaterial = new THREE.MeshStandardMaterial({
            color: 0x273651,
            roughness: 0.94,
            metalness: 0.03,
            emissive: 0x09111e,
            emissiveIntensity: 0.08
        });
        return [sideMaterial, sideMaterial, topMaterial, sideMaterial, sideMaterial, sideMaterial];
    }

    function createCornerMaterials(tile, tileIndex, cornerState = null) {
        const topTexture = createCornerTexture(tile, tileIndex, cornerState);
        const topMaterial = new THREE.MeshStandardMaterial({
            map: topTexture,
            roughness: 0.9,
            metalness: 0.02,
            emissive: 0x050812,
            emissiveIntensity: 0.08
        });
        const sideMaterial = new THREE.MeshStandardMaterial({
            color: 0x22314b,
            roughness: 0.94,
            metalness: 0.03,
            emissive: 0x09111e,
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

    function shadeColor(hex, percent) {
        const value = hex.replace('#', '');
        const num = Number.parseInt(value, 16);
        const amount = Math.round(2.55 * percent);
        const r = Math.max(0, Math.min(255, (num >> 16) + amount));
        const g = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + amount));
        const b = Math.max(0, Math.min(255, (num & 0xff) + amount));
        return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
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
        const name = typeof tile.name === 'string' ? tile.name.toLowerCase() : '';
        if (name.includes('lucky wheel')) return 'WHEEL';
        if (name.includes('happy birthday')) return 'BDAY';
        if (name.includes('income tax')) return '10%';
        if (tile.type === 'chance') return 'CHANCE';
        if (tile.type === 'chest') return 'CHEST';
        if (tile.type === 'tax') return 'TAX';
        if (tile.type === 'railroad') return 'RR';
        if (tile.type === 'utility') return 'UTILITY';
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
        const tile = BOARD_DATA[tileIndex];
        if (!tile || tile.type !== 'corner') return null;
        if (tile.name.toLowerCase().includes('bailout')) {
            return { bailoutAmount: cornerTileState.bailoutAmount };
        }
        return null;
    }

    function rememberTileRenderState(tileIndex, ownerColor = null, propertyState = null) {
        const previousState = tileRenderState[tileIndex] || {
            ownerColor: null,
            propertyState: null,
            isMortgaged: false
        };

        const nextPropertyState = propertyState
            ? { ...propertyState }
            : previousState.propertyState
                ? { ...previousState.propertyState }
                : null;

        tileRenderState[tileIndex] = {
            ownerColor: ownerColor ?? previousState.ownerColor ?? null,
            propertyState: nextPropertyState,
            isMortgaged: Boolean(nextPropertyState?.isMortgaged ?? previousState.isMortgaged)
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
        const topTexture = createMortgagedTexture(tile, tileIndex);
        const topMaterial = new THREE.MeshStandardMaterial({
            map: topTexture,
            roughness: 0.94,
            metalness: 0.02,
            emissive: 0x050812,
            emissiveIntensity: 0.08
        });
        const sideMaterial = new THREE.MeshStandardMaterial({
            color: 0x4f5a71,
            roughness: 0.96,
            metalness: 0.02,
            emissive: 0x09111e,
            emissiveIntensity: 0.08
        });
        return [sideMaterial, sideMaterial, topMaterial, sideMaterial, sideMaterial, sideMaterial];
    }

    function createMaterialSetForTile(tileIndex) {
        const tile = BOARD_DATA[tileIndex];
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

    function addHouse(tileIndex, houseCount, scene) {
        removeHouses(tileIndex, scene);

        const position = tilePositions[tileIndex];
        if (!position || houseCount <= 0) return;

        const cluster = new THREE.Group();
        const { inward, rotationY } = getBuildingOrientation(tileIndex);
        cluster.position.set(
            position.x + (inward.x * BUILDING_INSET),
            (TILE_H / 2) + 0.04,
            position.z + (inward.z * BUILDING_INSET)
        );
        cluster.rotation.y = rotationY;

        if (houseCount >= 5) {
            cluster.add(createHotelUnit());
        } else {
            const spacing = 0.29;
            const start = -((houseCount - 1) * spacing) / 2;
            for (let index = 0; index < houseCount; index++) {
                const house = createHouseUnit();
                house.position.x = start + (index * spacing);
                cluster.add(house);
            }
        }

        const parent = boardGroup || scene;
        parent.add(cluster);
        houseMeshes[tileIndex] = [cluster];
    }

    function removeHouses(tileIndex, scene) {
        if (!houseMeshes[tileIndex]) return;
        const parent = boardGroup || scene;
        houseMeshes[tileIndex].forEach(mesh => {
            parent.remove(mesh);
            disposeObject(mesh);
        });
        houseMeshes[tileIndex] = [];
    }

    function getBuildingOrientation(index) {
        if (index >= 1 && index <= 9) {
            return { inward: { x: 0, z: -1 }, rotationY: 0 };
        }
        if (index >= 11 && index <= 19) {
            return { inward: { x: 1, z: 0 }, rotationY: Math.PI / 2 };
        }
        if (index >= 21 && index <= 29) {
            return { inward: { x: 0, z: 1 }, rotationY: 0 };
        }
        if (index >= 31 && index <= 39) {
            return { inward: { x: -1, z: 0 }, rotationY: Math.PI / 2 };
        }
        return { inward: { x: 0, z: 0 }, rotationY: 0 };
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

        const bailoutTileIndex = BOARD_DATA.findIndex(tile =>
            tile.type === 'corner' && tile.name.toLowerCase().includes('bailout')
        );
        if (bailoutTileIndex >= 0) {
            refreshTileTexture(bailoutTileIndex);
        }
    }

    function setMortgaged(tileIndex, isMortgaged) {
        const tile = BOARD_DATA[tileIndex];
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

        drawOrientedTexture(ctx, canvas, rotationDegrees, () => {
            const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
            gradient.addColorStop(0, '#303746');
            gradient.addColorStop(1, '#181c25');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.strokeStyle = '#7a889f';
            ctx.lineWidth = 10;
            ctx.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);

            ctx.fillStyle = 'rgba(155, 170, 194, 0.12)';
            ctx.fillRect(0, 0, canvas.width, canvas.height * 0.22);

            ctx.fillStyle = '#e9eefb';
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
        refreshTileTextures(BOARD_DATA.map(tile => tile.index));
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
            child.geometry?.dispose?.();
            disposeMaterialSet(child.material);
        });
    }

    function calculateTilePosition(index) {
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
        return BOARD_DATA;
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

    return {
        build,
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
        setFocusedTile
    };
})();
