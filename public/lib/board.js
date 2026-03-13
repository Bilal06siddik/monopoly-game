// ═══════════════════════════════════════════════════════════
//  BOARD — 3D Monopoly board with brighter tile materials,
//          compact house/hotel models, and mortgage support
// ═══════════════════════════════════════════════════════════

const GameBoard = (() => {
    const TILE_W = 1.5;
    const TILE_D = 2.05;
    const TILE_H = 0.22;
    const CORNER_SIZE = 2.1;
    const GAP = 0.06;
    const BUILDING_INSET = 0.4;

    const tilePositions = {};
    const tileMeshes = {};
    const houseMeshes = {};
    let boardGroup = null;
    let edgeLen;
    let half;
    let startOffset;
    let maxTextureAnisotropy = 1;

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
                roughness: 0.88,
                metalness: 0.08
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
                emissiveIntensity: 0.42,
                roughness: 0.54,
                metalness: 0.34
            })
        );
        boardTrim.position.y = -0.18;
        boardGroup.add(boardTrim);

        BOARD_DATA.forEach((tile, index) => {
            const isCorner = tile.type === 'corner';
            const geometry = isCorner
                ? new THREE.BoxGeometry(CORNER_SIZE, TILE_H, CORNER_SIZE)
                : new THREE.BoxGeometry(TILE_W, TILE_H, TILE_D);
            const materials = isCorner
                ? createCornerMaterials(tile)
                : createTileMaterials(tile, null);
            const mesh = new THREE.Mesh(geometry, materials);

            const position = calculateTilePosition(index);
            mesh.position.copy(position);
            tilePositions[index] = { x: position.x, y: 0, z: position.z };

            if (index >= 11 && index <= 19) mesh.rotation.y = Math.PI / 2;
            else if (index >= 31 && index <= 39) mesh.rotation.y = -Math.PI / 2;

            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.userData = {
                tileIndex: index,
                tileName: tile.name,
                tileType: tile.type,
                tileColor: tile.colorGroup || tile.type
            };

            boardGroup.add(mesh);
            tileMeshes[index] = mesh;
        });

        const innerSize = edgeLen - (2 * TILE_D) - 0.35;
        const centerBase = new THREE.Mesh(
            new THREE.BoxGeometry(innerSize, 0.14, innerSize),
            new THREE.MeshStandardMaterial({
                color: 0x0d1629,
                roughness: 0.84,
                metalness: 0.08
            })
        );
        centerBase.position.y = -0.05;
        centerBase.receiveShadow = true;
        boardGroup.add(centerBase);

        const centerFelt = new THREE.Mesh(
            new THREE.PlaneGeometry(innerSize - 0.6, innerSize - 0.6),
            new THREE.MeshStandardMaterial({
                color: 0x111f3a,
                emissive: 0x081222,
                emissiveIntensity: 0.42,
                roughness: 0.94,
                metalness: 0.03
            })
        );
        centerFelt.rotation.x = -Math.PI / 2;
        centerFelt.position.y = 0.03;
        centerFelt.receiveShadow = true;
        boardGroup.add(centerFelt);

        [
            { inner: 2.5, outer: 2.82, color: 0x4f8fff, opacity: 0.1 },
            { inner: 1.4, outer: 1.62, color: 0xb38cff, opacity: 0.09 }
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

    function createTileTexture(tile, width, height, ownerColor = null) {
        const canvas = document.createElement('canvas');
        const scale = 4;
        canvas.width = width * scale;
        canvas.height = height * scale;

        const ctx = canvas.getContext('2d');
        const footerHeight = Math.round(canvas.height * 0.22);
        const bandHeight = Math.round(canvas.height * 0.22);
        const colorHex = COLOR_MAP[tile.colorGroup] || COLOR_MAP[tile.type] || '#bac4d6';
        const isPurchasable = ['property', 'railroad', 'utility'].includes(tile.type);

        const tileGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        tileGradient.addColorStop(0, '#1b2438');
        tileGradient.addColorStop(1, '#0f1626');
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
        } else {
            const footerGradient = ctx.createLinearGradient(0, canvas.height - footerHeight, 0, canvas.height);
            footerGradient.addColorStop(0, '#182235');
            footerGradient.addColorStop(1, '#0b1220');
            ctx.fillStyle = footerGradient;
            ctx.fillRect(0, canvas.height - footerHeight, canvas.width, footerHeight);
        }

        const iconText = getTileIconText(tile);
        if (iconText) {
            ctx.fillStyle = 'rgba(179, 202, 255, 0.12)';
            ctx.beginPath();
            addRoundedRectPath(
                ctx,
                canvas.width * 0.18,
                canvas.height * 0.27,
                canvas.width * 0.64,
                canvas.height * 0.16,
                28
            );
            ctx.fill();

            ctx.fillStyle = '#d9e6ff';
            ctx.font = `700 ${Math.floor(canvas.width * 0.13)}px 'Segoe UI', Arial, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(iconText, canvas.width / 2, canvas.height * 0.35);
        }

        ctx.fillStyle = '#f4f7ff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const fontSize = Math.floor(canvas.width * 0.112);
        ctx.font = `700 ${fontSize}px 'Segoe UI', Arial, sans-serif`;

        const nameLines = wrapText(ctx, tile.name.toUpperCase(), canvas.width * 0.78);
        const lineHeight = fontSize * 1.14;
        const startY = iconText ? canvas.height * 0.5 : canvas.height * 0.43;
        nameLines.slice(0, 3).forEach((line, lineIndex) => {
            ctx.fillText(line, canvas.width / 2, startY + (lineIndex * lineHeight));
        });

        if (tile.price > 0) {
            const priceSize = Math.floor(canvas.width * 0.128);
            ctx.font = `800 ${priceSize}px 'Segoe UI', Arial, sans-serif`;
            ctx.fillStyle = ownerColor ? '#ffffff' : '#ffd87f';
            ctx.fillText(`$${tile.price}`, canvas.width / 2, canvas.height - (footerHeight * 0.5));
        }

        return finalizeTexture(new THREE.CanvasTexture(canvas));
    }

    function createCornerTexture(tile) {
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 1024;
        const ctx = canvas.getContext('2d');

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
        ctx.font = `800 ${Math.floor(canvas.width * 0.1)}px 'Segoe UI', Arial, sans-serif`;
        ctx.fillText(getCornerBadge(tile), canvas.width / 2, canvas.height * 0.21);

        ctx.fillStyle = '#f4f7ff';
        ctx.font = `800 ${Math.floor(canvas.width * 0.095)}px 'Segoe UI', Arial, sans-serif`;
        const lines = wrapText(ctx, tile.name.toUpperCase(), canvas.width * 0.72);
        const lineHeight = canvas.width * 0.11;
        const startY = canvas.height * 0.56;
        lines.slice(0, 3).forEach((line, lineIndex) => {
            ctx.fillText(line, canvas.width / 2, startY + (lineIndex * lineHeight));
        });

        return finalizeTexture(new THREE.CanvasTexture(canvas));
    }

    function createTileMaterials(tile, ownerColor = null) {
        const topTexture = createTileTexture(tile, 150, 205, ownerColor);
        const topMaterial = new THREE.MeshStandardMaterial({
            map: topTexture,
            roughness: 0.5,
            metalness: 0.08
        });
        const sideMaterial = new THREE.MeshStandardMaterial({
            color: 0x273651,
            roughness: 0.72,
            metalness: 0.14
        });
        return [sideMaterial, sideMaterial, topMaterial, sideMaterial, sideMaterial, sideMaterial];
    }

    function createCornerMaterials(tile) {
        const topTexture = createCornerTexture(tile);
        const topMaterial = new THREE.MeshStandardMaterial({
            map: topTexture,
            roughness: 0.48,
            metalness: 0.1
        });
        const sideMaterial = new THREE.MeshStandardMaterial({
            color: 0x22314b,
            roughness: 0.72,
            metalness: 0.14
        });
        return [sideMaterial, sideMaterial, topMaterial, sideMaterial, sideMaterial, sideMaterial];
    }

    function finalizeTexture(texture) {
        texture.anisotropy = maxTextureAnisotropy;
        texture.generateMipmaps = false;
        texture.minFilter = THREE.LinearFilter;
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

    let raycaster = null;
    const mouse = new THREE.Vector2();
    let onTileClickCallback = null;

    function initRaycaster(camera, renderer) {
        raycaster = new THREE.Raycaster();

        renderer.domElement.addEventListener('click', event => {
            const rect = renderer.domElement.getBoundingClientRect();
            mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

            raycaster.setFromCamera(mouse, camera);
            const intersects = raycaster.intersectObjects(Object.values(tileMeshes));

            if (!intersects.length) return;
            const hit = intersects[0].object;
            const tileIndex = hit.userData.tileIndex;
            if (tileIndex !== undefined && onTileClickCallback) {
                onTileClickCallback(tileIndex);
            }
        });
    }

    function onTileClick(callback) {
        onTileClickCallback = callback;
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

    function updateTileOwner(tileIndex, ownerColor) {
        replaceTileMaterial(tileIndex, createTileMaterials(BOARD_DATA[tileIndex], ownerColor));
    }

    function setMortgaged(tileIndex, isMortgaged) {
        const tile = BOARD_DATA[tileIndex];
        if (!tile) return;

        if (isMortgaged) {
            const topTexture = createMortgagedTexture(tile);
            const topMaterial = new THREE.MeshStandardMaterial({
                map: topTexture,
                roughness: 0.68,
                metalness: 0.04
            });
            const sideMaterial = new THREE.MeshStandardMaterial({
                color: 0x4f5a71,
                roughness: 0.82,
                metalness: 0.06
            });
            replaceTileMaterial(tileIndex, [sideMaterial, sideMaterial, topMaterial, sideMaterial, sideMaterial, sideMaterial]);
            return;
        }

        replaceTileMaterial(tileIndex, createTileMaterials(tile, null));
    }

    function createMortgagedTexture(tile) {
        const canvas = document.createElement('canvas');
        canvas.width = 600;
        canvas.height = 820;
        const ctx = canvas.getContext('2d');

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
        ctx.font = `700 ${Math.floor(canvas.width * 0.09)}px 'Segoe UI', Arial, sans-serif`;
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
        ctx.font = `800 ${Math.floor(canvas.width * 0.1)}px 'Segoe UI', Arial, sans-serif`;
        ctx.fillText('MORTGAGED', 0, 6);
        ctx.restore();

        return finalizeTexture(new THREE.CanvasTexture(canvas));
    }

    function replaceTileMaterial(tileIndex, materialSet) {
        const mesh = tileMeshes[tileIndex];
        if (!mesh) return;
        disposeMaterialSet(mesh.material);
        mesh.material = materialSet;
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

    return {
        build,
        getTileData,
        getTileWorldPosition,
        getMesh,
        initRaycaster,
        onTileClick,
        addHouse,
        removeHouses,
        setMortgaged,
        updateTileOwner
    };
})();
