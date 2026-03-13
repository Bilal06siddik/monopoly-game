// ═══════════════════════════════════════════════════════════
//  TOKENS — 3D player tokens with tile-by-tile movement
// ═══════════════════════════════════════════════════════════

const GameTokens = (() => {
    const tokens = {};  // character → { mesh, targetPos, animating }
    let getTilePos = null; // reference to board's tile position function

    const CHARACTER_EMOJIS = {
        'Bilo': '🎩',
        'Os': '🏎️',
        'Ziko': '🐕',
        'Maro': '⚓'
    };

    const CHARACTER_HEX_COLORS = {
        'Bilo': 0x6c5ce7,
        'Os': 0xe17055,
        'Ziko': 0x00b894,
        'Maro': 0xfdcb6e
    };

    const TOKEN_RADIUS = 0.35;
    const TOKEN_HEIGHT = 0.5;

    function init(scene, tilePositionFn) {
        getTilePos = tilePositionFn;
    }

    // ── Create emoji texture ──────────────────────────────
    function createEmojiTexture(emoji) {
        const size = 128;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        // Transparent background
        ctx.clearRect(0, 0, size, size);

        // Circle background
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2);
        ctx.fill();

        // Emoji
        ctx.font = '64px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(emoji, size / 2, size / 2);

        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;
        return texture;
    }

    // ── Create a token mesh ───────────────────────────────
    function createToken(character, scene) {
        const color = CHARACTER_HEX_COLORS[character] || 0xaaaaaa;
        const emoji = CHARACTER_EMOJIS[character] || '👤';

        // Cylinder body
        const geo = new THREE.CylinderGeometry(TOKEN_RADIUS, TOKEN_RADIUS * 0.85, TOKEN_HEIGHT, 24);

        // Top face gets emoji texture, rest gets solid color
        const topMat = new THREE.MeshStandardMaterial({
            map: createEmojiTexture(emoji),
            roughness: 0.4,
            metalness: 0.2,
            transparent: true
        });
        const sideMat = new THREE.MeshStandardMaterial({
            color: color,
            roughness: 0.3,
            metalness: 0.5,
            emissive: color,
            emissiveIntensity: 0.15
        });
        const bottomMat = new THREE.MeshStandardMaterial({
            color: color,
            roughness: 0.5,
            metalness: 0.3
        });

        // CylinderGeometry has 3 material groups: [side, top, bottom]
        const mesh = new THREE.Mesh(geo, [sideMat, topMat, bottomMat]);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        // Position at GO (tile 0) initially
        const startPos = getTilePos(0);
        mesh.position.set(startPos.x, TOKEN_HEIGHT / 2 + 0.12, startPos.z);

        scene.add(mesh);

        tokens[character] = {
            mesh,
            currentTile: 0,
            animating: false
        };

        return mesh;
    }

    // ── Animate token movement tile-by-tile ───────────────
    function animateMove(character, fromTile, toTile, onComplete) {
        const token = tokens[character];
        if (!token) {
            if (onComplete) onComplete();
            return;
        }

        token.animating = true;

        // Build path of tiles to visit
        const path = [];
        let current = fromTile;
        const totalSteps = ((toTile - fromTile) + 40) % 40;

        for (let i = 1; i <= totalSteps; i++) {
            path.push((fromTile + i) % 40);
        }

        if (path.length === 0) {
            token.animating = false;
            if (onComplete) onComplete();
            return;
        }

        let passedGo = false;
        let stepIndex = 0;
        const stepDuration = 250; // ms per tile hop
        const hopHeight = 0.6;

        function moveToNextTile() {
            if (stepIndex >= path.length) {
                // Movement complete
                token.currentTile = toTile;
                token.animating = false;

                // Check if passed or landed on GO
                if (passedGo || toTile === 0) {
                    Notifications.notifyGo();
                }

                if (onComplete) onComplete();
                return;
            }

            const targetTileIndex = path[stepIndex];
            const targetPos = getTilePos(targetTileIndex);
            const startPos = {
                x: token.mesh.position.x,
                y: token.mesh.position.y,
                z: token.mesh.position.z
            };
            const startTime = performance.now();

            // Detect passing GO
            if (targetTileIndex === 0) {
                passedGo = true;
            }

            function animateStep() {
                const elapsed = performance.now() - startTime;
                let t = Math.min(elapsed / stepDuration, 1);

                // Ease in-out
                const ease = t < 0.5
                    ? 2 * t * t
                    : 1 - Math.pow(-2 * t + 2, 2) / 2;

                // Lerp position
                token.mesh.position.x = startPos.x + (targetPos.x - startPos.x) * ease;
                token.mesh.position.z = startPos.z + (targetPos.z - startPos.z) * ease;

                // Hop up and down
                const baseY = TOKEN_HEIGHT / 2 + 0.12;
                token.mesh.position.y = baseY + Math.sin(t * Math.PI) * hopHeight;

                // Slight rotation during hop
                token.mesh.rotation.y += 0.05;

                if (t < 1) {
                    requestAnimationFrame(animateStep);
                } else {
                    // Snap to tile position
                    token.mesh.position.set(targetPos.x, TOKEN_HEIGHT / 2 + 0.12, targetPos.z);
                    stepIndex++;
                    moveToNextTile();
                }
            }

            requestAnimationFrame(animateStep);
        }

        moveToNextTile();
    }

    // ── Get token offset (so multiple tokens on same tile don't overlap)
    function getTokenOffset(characterIndex, totalOnTile) {
        const offsets = [
            { x: -0.2, z: -0.2 },
            { x: 0.2, z: -0.2 },
            { x: -0.2, z: 0.2 },
            { x: 0.2, z: 0.2 }
        ];
        return offsets[characterIndex % offsets.length] || { x: 0, z: 0 };
    }

    function getToken(character) {
        return tokens[character];
    }

    function setTokenPosition(character, tileIndex) {
        const token = tokens[character];
        if (!token) return;

        const pos = getTilePos(tileIndex);
        if (!pos) return;

        token.currentTile = tileIndex;
        token.animating = false;
        token.mesh.position.set(pos.x, TOKEN_HEIGHT / 2 + 0.12, pos.z);
        token.mesh.rotation.y = 0;
    }

    function getAllTokens() {
        return tokens;
    }

    function removeToken(character, scene) {
        const token = tokens[character];
        if (token && token.mesh) {
            const startY = token.mesh.position.y;
            const duration = 800;
            const startTime = performance.now();

            function animateSink() {
                const t = Math.min((performance.now() - startTime) / duration, 1);
                token.mesh.position.y = startY - t * 2;
                token.mesh.scale.setScalar(1 - t);
                token.mesh.rotation.y += 0.1;

                if (t < 1) {
                    requestAnimationFrame(animateSink);
                } else {
                    scene.remove(token.mesh);
                    delete tokens[character];
                }
            }
            requestAnimationFrame(animateSink);
        }
    }

    return { init, createToken, animateMove, getToken, setTokenPosition, getAllTokens, removeToken };
})();
