// ═══════════════════════════════════════════════════════════
//  BOARD — 3D Monopoly board with textured tiles, raycaster,
//          house/skyscraper meshes, and mortgage support
// ═══════════════════════════════════════════════════════════

const GameBoard = (() => {

    // ── Board Dimensions ─────────────────────────────────
    const TILE_W = 1.4;
    const TILE_D = 2.0;
    const TILE_H = 0.2;
    const CORNER_SIZE = 2.0;
    const GAP = 0.06;

    const tilePositions = {};
    const tileMeshes = {};     // index → mesh
    const houseMeshes = {};    // index → [mesh, mesh, ...]
    let boardGroup = null;
    let edgeLen, half, startOffset;

    // Color map for render
    const COLOR_MAP = {
        'brown': '#8B4513', 'lightblue': '#87CEEB', 'pink': '#DA70D6',
        'orange': '#FFA500', 'red': '#FF0000', 'yellow': '#FFFF00',
        'green': '#00AA00', 'darkblue': '#0000CC', 'railroad': '#555',
        'utility': '#888'
    };

    function build(scene) {
        boardGroup = new THREE.Group();

        edgeLen = CORNER_SIZE + 9 * (TILE_W + GAP) + CORNER_SIZE;
        half = edgeLen / 2;
        startOffset = CORNER_SIZE + GAP;

        BOARD_DATA.forEach((tile, i) => {
            const isCorner = tile.type === 'corner';
            let mesh;

            if (isCorner) {
                const geo = new THREE.BoxGeometry(CORNER_SIZE, TILE_H, CORNER_SIZE);
                const mat = createCornerMaterial(tile, CORNER_SIZE);
                mesh = new THREE.Mesh(geo, mat);
            } else {
                const geo = new THREE.BoxGeometry(TILE_W, TILE_H, TILE_D);
                const mats = createTileMaterials(tile, i);
                mesh = new THREE.Mesh(geo, mats);
            }

            const pos = calculateTilePosition(i);
            mesh.position.copy(pos);
            tilePositions[i] = { x: pos.x, y: 0, z: pos.z };

            // Rotate for side columns
            if (i >= 11 && i <= 19) mesh.rotation.y = Math.PI / 2;
            else if (i >= 31 && i <= 39) mesh.rotation.y = -Math.PI / 2;

            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.userData = { tileIndex: i, tileName: tile.name, tileType: tile.type, tileColor: tile.color };

            boardGroup.add(mesh);
            tileMeshes[i] = mesh;
        });

        // Center surface
        const innerSize = edgeLen - 2 * TILE_D - 0.4;
        const centerGeo = new THREE.BoxGeometry(innerSize, TILE_H * 0.5, innerSize);
        const centerMat = new THREE.MeshStandardMaterial({ color: 0x111122, roughness: 0.8, metalness: 0.2 });
        const center = new THREE.Mesh(centerGeo, centerMat);
        center.position.y = -TILE_H * 0.25;
        center.receiveShadow = true;
        boardGroup.add(center);

        // Decorative rings
        [{ r1: 2.5, r2: 3.0, o: 0.15 }, { r1: 1.5, r2: 1.7, o: 0.1 }].forEach(({ r1, r2, o }) => {
            const ringMat = new THREE.MeshBasicMaterial({ color: 0x6c5ce7, side: THREE.DoubleSide, transparent: true, opacity: o });
            const ring = new THREE.Mesh(new THREE.RingGeometry(r1, r2, 64), ringMat);
            ring.rotation.x = -Math.PI / 2;
            ring.position.y = 0.12;
            boardGroup.add(ring);
        });

        scene.add(boardGroup);
        return boardGroup;
    }

    // ── Canvas Texture for Tiles ────────────────────────────
    function createTileTexture(tile, width, height, rotation, ownerColor = null) {
        const canvas = document.createElement('canvas');
        const scale = 4; // higher = crisper text
        canvas.width = width * scale;
        canvas.height = height * scale;
        const ctx = canvas.getContext('2d');

        // Background
        ctx.fillStyle = '#12122a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Thin border
        ctx.strokeStyle = 'rgba(108, 92, 231, 0.3)';
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);

        const colorHex = COLOR_MAP[tile.colorGroup] || COLOR_MAP[tile.type] || null;

        // Color band at top
        if (colorHex && (tile.type === 'property' || tile.type === 'railroad' || tile.type === 'utility')) {
            const bandH = canvas.height * 0.22;
            ctx.fillStyle = colorHex;
            ctx.fillRect(0, 0, canvas.width, bandH);

            // Subtle glow line
            const grad = ctx.createLinearGradient(0, bandH - 4, 0, bandH + 4);
            grad.addColorStop(0, colorHex);
            grad.addColorStop(1, 'transparent');
            ctx.fillStyle = grad;
            ctx.fillRect(0, bandH, canvas.width, 8);
        }

        // Property name - wrap text
        ctx.fillStyle = '#e8e8f0';
        ctx.textAlign = 'center';
        const nameSize = Math.floor(canvas.width * 0.13);
        ctx.font = `bold ${nameSize}px 'Segoe UI', Arial, sans-serif`;

        const name = tile.name;
        const maxWidth = canvas.width * 0.85;
        const lines = wrapText(ctx, name, maxWidth);
        const lineHeight = nameSize * 1.2;
        const startY = canvas.height * 0.42;

        lines.forEach((line, idx) => {
            ctx.fillText(line, canvas.width / 2, startY + idx * lineHeight);
        });

    // Special icons for non-property tiles
        if (tile.type === 'chance') {
            ctx.font = `${Math.floor(canvas.width * 0.25)}px serif`;
            ctx.fillText('❓', canvas.width / 2, canvas.height * 0.45);
        } else if (tile.type === 'chest') {
            ctx.font = `${Math.floor(canvas.width * 0.25)}px serif`;
            ctx.fillText('💰', canvas.width / 2, canvas.height * 0.45);
        } else if (tile.type === 'tax') {
            ctx.font = `${Math.floor(canvas.width * 0.2)}px serif`;
            ctx.fillText('💸', canvas.width / 2, canvas.height * 0.45);
        }

    // Owner color section at the bottom (overrides price area)
        if (ownerColor) {
            const ownerBandH = canvas.height * 0.28;
            const ownerY = canvas.height - ownerBandH;
            ctx.fillStyle = ownerColor;
            ctx.globalAlpha = 0.75;
            ctx.fillRect(0, ownerY, canvas.width, ownerBandH);
            ctx.globalAlpha = 1;
            // Price text on top of color band, white
            if (tile.price > 0) {
                const priceSize = Math.floor(canvas.width * 0.12);
                ctx.font = `700 ${priceSize}px 'Segoe UI', Arial, sans-serif`;
                ctx.fillStyle = '#ffffff';
                ctx.fillText(`$${tile.price}`, canvas.width / 2, canvas.height * 0.88);
            }
        } else if (tile.price > 0) {
            const priceSize = Math.floor(canvas.width * 0.12);
            ctx.font = `700 ${priceSize}px 'Segoe UI', Arial, sans-serif`;
            ctx.fillStyle = '#fdcb6e';
            ctx.fillText(`$${tile.price}`, canvas.width / 2, canvas.height * 0.88);
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
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

    function createTileMaterials(tile, index) {
        // Top face gets the texture, other 5 faces get dark material
        const topTexture = createTileTexture(tile, 140, 200, 0);
        const topMat = new THREE.MeshStandardMaterial({
            map: topTexture,
            roughness: 0.5,
            metalness: 0.1
        });
        const sideMat = new THREE.MeshStandardMaterial({
            color: 0x0a0a1a,
            roughness: 0.7,
            metalness: 0.1
        });
        // BoxGeometry face order: +X, -X, +Y (top), -Y (bottom), +Z, -Z
        return [sideMat, sideMat, topMat, sideMat, sideMat, sideMat];
    }

    function createCornerMaterial(tile, size) {
        const canvas = document.createElement('canvas');
        const s = 4;
        canvas.width = size * s * 50;
        canvas.height = size * s * 50;
        const ctx = canvas.getContext('2d');

        // Background with subtle color
        const c = '#' + tile.color.toString(16).padStart(6, '0');
        ctx.fillStyle = '#12122a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Subtle tint
        ctx.fillStyle = c;
        ctx.globalAlpha = 0.15;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.globalAlpha = 1;

        // Corner name
        ctx.fillStyle = '#e8e8f0';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `bold ${Math.floor(canvas.width * 0.12)}px 'Segoe UI', Arial, sans-serif`;
        ctx.fillText(tile.name.toUpperCase(), canvas.width / 2, canvas.height / 2);

        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;

        return new THREE.MeshStandardMaterial({
            map: texture,
            roughness: 0.5,
            metalness: 0.15
        });
    }

    // ── Raycaster for Click Detection ───────────────────────
    let raycaster = null;
    let mouse = new THREE.Vector2();
    let onTileClickCallback = null;

    function initRaycaster(camera, renderer) {
        raycaster = new THREE.Raycaster();

        renderer.domElement.addEventListener('click', (event) => {
            const rect = renderer.domElement.getBoundingClientRect();
            mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

            raycaster.setFromCamera(mouse, camera);
            const meshList = Object.values(tileMeshes);
            const intersects = raycaster.intersectObjects(meshList);

            if (intersects.length > 0) {
                const hit = intersects[0].object;
                const tileIndex = hit.userData.tileIndex;
                if (tileIndex !== undefined && onTileClickCallback) {
                    onTileClickCallback(tileIndex);
                }
            }
        });
    }

    function onTileClick(callback) {
        onTileClickCallback = callback;
    }

    // ── House / Skyscraper Meshes ───────────────────────────
    function addHouse(tileIndex, houseCount, scene) {
        removeHouses(tileIndex, scene);

        const pos = tilePositions[tileIndex];
        if (!pos) return;
        const tile = BOARD_DATA[tileIndex];
        houseMeshes[tileIndex] = [];

        if (houseCount >= 5) {
            // Compound skyscraper (hotel) — gidd.io style light blue tower
            const group = new THREE.Group();

            // Main tall base
            const baseMat = new THREE.MeshStandardMaterial({
                color: 0x7EC8E3,       // light blue
                emissive: 0x1a4a5a,
                emissiveIntensity: 0.25,
                roughness: 0.3,
                metalness: 0.6
            });
            const capMat = new THREE.MeshStandardMaterial({
                color: 0x3a6a7a,       // darker blue-grey cap
                emissive: 0x0a2030,
                emissiveIntensity: 0.2,
                roughness: 0.4,
                metalness: 0.5
            });
            const edgeMat = new THREE.MeshStandardMaterial({
                color: 0x222833, roughness: 0.5, metalness: 0.3
            });

            const base = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.4, 0.45), baseMat);
            base.position.y = 0;
            base.castShadow = true;

            const cap = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.32, 0.38), capMat);
            cap.position.y = 0.86;
            cap.castShadow = true;

            // Dark border edges (thin strips on sides of base)
            const edgeGeo = new THREE.BoxGeometry(0.46, 1.42, 0.02);
            const edgeFront = new THREE.Mesh(edgeGeo, edgeMat);
            edgeFront.position.set(0, 0, 0.225);
            const edgeBack = new THREE.Mesh(edgeGeo, edgeMat);
            edgeBack.position.set(0, 0, -0.225);

            group.add(base, cap, edgeFront, edgeBack);
            group.position.set(pos.x, 0.8, pos.z);
            group.castShadow = true;
            scene.add(group);
            houseMeshes[tileIndex].push(group);
        } else {
            // Small houses
            const houseGeo = new THREE.BoxGeometry(0.22, 0.3, 0.22);
            const houseMat = new THREE.MeshStandardMaterial({
                color: 0x55efc4,
                emissive: 0x00b894,
                emissiveIntensity: 0.2,
                roughness: 0.4,
                metalness: 0.3
            });

            for (let h = 0; h < houseCount; h++) {
                const house = new THREE.Mesh(houseGeo, houseMat);
                // Spread houses along tile edge
                const offset = (h - (houseCount - 1) / 2) * 0.3;
                house.position.set(pos.x + offset, 0.25, pos.z);
                house.castShadow = true;
                scene.add(house);
                houseMeshes[tileIndex].push(house);
            }
        }
    }

    function removeHouses(tileIndex, scene) {
        if (houseMeshes[tileIndex]) {
            houseMeshes[tileIndex].forEach(m => scene.remove(m));
            houseMeshes[tileIndex] = [];
        }
    }

    // ── Mortgage Visual ─────────────────────────────────────
    function setMortgaged(tileIndex, isMortgaged) {
        const mesh = tileMeshes[tileIndex];
        if (!mesh) return;

        const tile = BOARD_DATA[tileIndex];
        if (isMortgaged) {
            // Darken the tile - create grayscale texture
            const topTexture = createMortgagedTexture(tile, 140, 200);
            const topMat = new THREE.MeshStandardMaterial({
                map: topTexture, roughness: 0.7, metalness: 0.05
            });
            const sideMat = new THREE.MeshStandardMaterial({ color: 0x050510, roughness: 0.8 });
            mesh.material = [sideMat, sideMat, topMat, sideMat, sideMat, sideMat];
        } else {
            // Restore normal texture
            mesh.material = createTileMaterials(tile, tileIndex);
        }
    }

    // ── Update Tile Owner Color ─────────────────────────────
    function updateTileOwner(tileIndex, ownerColor) {
        const mesh = tileMeshes[tileIndex];
        if (!mesh) return;
        const tile = BOARD_DATA[tileIndex];
        const topTexture = createTileTexture(tile, 140, 200, 0, ownerColor);
        const topMat = new THREE.MeshStandardMaterial({
            map: topTexture, roughness: 0.5, metalness: 0.1
        });
        const sideMat = new THREE.MeshStandardMaterial({
            color: 0x0a0a1a, roughness: 0.7, metalness: 0.1
        });
        mesh.material = [sideMat, sideMat, topMat, sideMat, sideMat, sideMat];
    }

    function createMortgagedTexture(tile, w, h) {
        const canvas = document.createElement('canvas');
        const s = 4;
        canvas.width = w * s;
        canvas.height = h * s;
        const ctx = canvas.getContext('2d');

        // Dark background
        ctx.fillStyle = '#0a0a12';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Dim border
        ctx.strokeStyle = 'rgba(80, 40, 40, 0.4)';
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);

        // Faded name
        ctx.fillStyle = 'rgba(180, 100, 100, 0.4)';
        ctx.textAlign = 'center';
        ctx.font = `bold ${Math.floor(canvas.width * 0.12)}px 'Segoe UI', Arial, sans-serif`;
        const lines = wrapText(ctx, tile.name, canvas.width * 0.85);
        lines.forEach((line, idx) => {
            ctx.fillText(line, canvas.width / 2, canvas.height * 0.35 + idx * canvas.width * 0.14);
        });

        // "MORTGAGED" stamp
        ctx.fillStyle = 'rgba(255, 60, 60, 0.6)';
        ctx.font = `bold ${Math.floor(canvas.width * 0.11)}px 'Segoe UI', Arial, sans-serif`;
        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height * 0.7);
        ctx.rotate(-0.2);
        ctx.fillText('MORTGAGED', 0, 0);
        ctx.restore();

        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        return texture;
    }

    // ── Position Calculation ────────────────────────────────
    function calculateTilePosition(index) {
        const pos = new THREE.Vector3(0, 0, 0);
        if (index === 0) pos.set(half - CORNER_SIZE / 2, 0, half - CORNER_SIZE / 2);
        else if (index <= 9) {
            const x = half - startOffset - (index - 1) * (TILE_W + GAP) - TILE_W / 2;
            pos.set(x, 0, half - CORNER_SIZE / 2);
        } else if (index === 10) pos.set(-half + CORNER_SIZE / 2, 0, half - CORNER_SIZE / 2);
        else if (index <= 19) {
            const localIdx = index - 11;
            const z = half - startOffset - localIdx * (TILE_W + GAP) - TILE_W / 2;
            pos.set(-half + CORNER_SIZE / 2, 0, z);
        } else if (index === 20) pos.set(-half + CORNER_SIZE / 2, 0, -half + CORNER_SIZE / 2);
        else if (index <= 29) {
            const localIdx = index - 21;
            const x = -half + startOffset + localIdx * (TILE_W + GAP) + TILE_W / 2;
            pos.set(x, 0, -half + CORNER_SIZE / 2);
        } else if (index === 30) pos.set(half - CORNER_SIZE / 2, 0, -half + CORNER_SIZE / 2);
        else {
            const localIdx = index - 31;
            const z = -half + startOffset + localIdx * (TILE_W + GAP) + TILE_W / 2;
            pos.set(half - CORNER_SIZE / 2, 0, z);
        }
        return pos;
    }

    function getTileWorldPosition(index) {
        if (tilePositions[index]) return { ...tilePositions[index] };
        const pos = calculateTilePosition(index);
        return { x: pos.x, y: 0, z: pos.z };
    }

    function getTileData() { return BOARD_DATA; }
    function getMesh(index) { return tileMeshes[index]; }

    return {
        build, getTileData, getTileWorldPosition, getMesh,
        initRaycaster, onTileClick,
        addHouse, removeHouses, setMortgaged, updateTileOwner
    };
})();
