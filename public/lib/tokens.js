// ═══════════════════════════════════════════════════════════
//  TOKENS — stylized pawn tokens with readable badges and
//           better spacing when several players share a tile
// ═══════════════════════════════════════════════════════════

const GameTokens = (() => {
    const tokens = {};
    let getTilePos = null;

    const TOKEN_BASE_Y = 0.16;

    function init(scene, tilePositionFn) {
        getTilePos = tilePositionFn;
    }

    function createPawnGeometry() {
        const profile = [
            new THREE.Vector2(0.0, 0.0),
            new THREE.Vector2(0.18, 0.0),
            new THREE.Vector2(0.25, 0.04),
            new THREE.Vector2(0.27, 0.09),
            new THREE.Vector2(0.2, 0.15),
            new THREE.Vector2(0.17, 0.28),
            new THREE.Vector2(0.15, 0.45),
            new THREE.Vector2(0.22, 0.58),
            new THREE.Vector2(0.14, 0.72),
            new THREE.Vector2(0.11, 0.8),
            new THREE.Vector2(0.16, 0.88),
            new THREE.Vector2(0.18, 0.96),
            new THREE.Vector2(0.14, 1.02),
            new THREE.Vector2(0.0, 1.06)
        ];

        const geometry = new THREE.LatheGeometry(profile, 36);
        geometry.computeVertexNormals();
        return geometry;
    }

    function normalizeColor(color) {
        const fallback = new THREE.Color(0x9aa4b2);
        if (!color) return fallback;
        if (color instanceof THREE.Color) return color.clone();

        try {
            return new THREE.Color(color);
        } catch {
            return fallback;
        }
    }

    function createBadgeTexture(character, color) {
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const label = character.slice(0, 2).toUpperCase();
        const resolvedColor = normalizeColor(color);
        const colorHex = `#${resolvedColor.getHexString()}`;

        ctx.clearRect(0, 0, size, size);

        ctx.beginPath();
        ctx.arc(size / 2, size / 2, 68, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(14, 22, 39, 0.94)';
        ctx.fill();

        ctx.lineWidth = 12;
        ctx.strokeStyle = colorHex;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(size / 2, size / 2, 54, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = '800 52px Segoe UI, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, size / 2, size / 2 + 4);

        const texture = new THREE.CanvasTexture(canvas);
        texture.generateMipmaps = false;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.encoding = THREE.sRGBEncoding;
        texture.needsUpdate = true;
        return texture;
    }

    function setTokenColor(character, color) {
        const token = tokens[character];
        if (!token) return;

        const resolvedColor = normalizeColor(color);
        token.color = `#${resolvedColor.getHexString()}`;
        token.body.material.color.copy(resolvedColor);
        token.body.material.emissive.copy(resolvedColor);
        token.ring.material.emissive.copy(resolvedColor);

        if (token.badge.material.map) {
            token.badge.material.map.dispose();
        }
        token.badge.material.map = createBadgeTexture(character, resolvedColor);
        token.badge.material.needsUpdate = true;
    }

    function createToken(character, scene, color = null) {
        const resolvedColor = normalizeColor(color);
        const group = new THREE.Group();

        const pawnMaterial = new THREE.MeshStandardMaterial({
            color: resolvedColor,
            emissive: resolvedColor,
            emissiveIntensity: 0.16,
            roughness: 0.28,
            metalness: 0.52
        });
        const ringMaterial = new THREE.MeshStandardMaterial({
            color: 0xf6f7fb,
            emissive: resolvedColor,
            emissiveIntensity: 0.08,
            roughness: 0.32,
            metalness: 0.68
        });

        const body = new THREE.Mesh(createPawnGeometry(), pawnMaterial);
        body.castShadow = true;
        body.receiveShadow = true;
        group.add(body);

        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.035, 14, 42), ringMaterial);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.06;
        ring.castShadow = true;
        ring.receiveShadow = true;
        group.add(ring);

        const badge = new THREE.Sprite(new THREE.SpriteMaterial({
            map: createBadgeTexture(character, resolvedColor),
            transparent: true,
            depthWrite: false
        }));
        badge.position.set(0, 1.18, 0);
        badge.scale.set(0.52, 0.52, 1);
        group.add(badge);

        const startPos = getTilePos(0);
        group.position.set(startPos.x, TOKEN_BASE_Y, startPos.z);
        scene.add(group);

        tokens[character] = {
            character,
            color: `#${resolvedColor.getHexString()}`,
            group,
            body,
            ring,
            badge,
            currentTile: 0,
            animating: false
        };

        return group;
    }

    function animateMove(character, fromTile, toTile, onComplete) {
        const token = tokens[character];
        if (!token) {
            if (onComplete) onComplete();
            return;
        }

        token.animating = true;

        const path = [];
        const totalSteps = ((toTile - fromTile) + 40) % 40;
        for (let index = 1; index <= totalSteps; index++) {
            path.push((fromTile + index) % 40);
        }

        if (!path.length) {
            token.animating = false;
            if (onComplete) onComplete();
            return;
        }

        let passedGo = false;
        let stepIndex = 0;
        const stepDuration = 220;
        const hopHeight = 0.42;

        function moveToNextTile() {
            if (stepIndex >= path.length) {
                token.currentTile = toTile;
                token.animating = false;
                token.group.rotation.set(0, 0, 0);

                if (passedGo || toTile === 0) {
                    Notifications.notifyGo();
                }

                if (onComplete) onComplete();
                return;
            }

            const targetTileIndex = path[stepIndex];
            const targetPos = getTilePos(targetTileIndex);
            const startPos = {
                x: token.group.position.x,
                y: token.group.position.y,
                z: token.group.position.z
            };
            const startTime = performance.now();

            if (targetTileIndex === 0) {
                passedGo = true;
            }

            function animateStep() {
                const elapsed = performance.now() - startTime;
                const t = Math.min(elapsed / stepDuration, 1);
                const ease = t < 0.5
                    ? 2 * t * t
                    : 1 - (Math.pow(-2 * t + 2, 2) / 2);

                token.group.position.x = startPos.x + ((targetPos.x - startPos.x) * ease);
                token.group.position.z = startPos.z + ((targetPos.z - startPos.z) * ease);
                token.group.position.y = TOKEN_BASE_Y + (Math.sin(t * Math.PI) * hopHeight);

                token.group.rotation.z = Math.sin(t * Math.PI) * 0.08;
                token.group.rotation.x = Math.cos(t * Math.PI * 2) * 0.03;
                token.group.rotation.y += 0.08;

                if (t < 1) {
                    requestAnimationFrame(animateStep);
                    return;
                }

                token.group.position.set(targetPos.x, TOKEN_BASE_Y, targetPos.z);
                token.group.rotation.set(0, 0, 0);
                stepIndex++;
                moveToNextTile();
            }

            requestAnimationFrame(animateStep);
        }

        moveToNextTile();
    }

    function getTokenOffset(characterIndex, totalOnTile) {
        if (totalOnTile <= 1) return { x: 0, z: 0 };

        const radius = totalOnTile === 2
            ? 0.24
            : totalOnTile <= 4
                ? 0.31
                : 0.36;
        const angle = ((Math.PI * 2) / totalOnTile) * characterIndex - (Math.PI / 2);
        return {
            x: Math.cos(angle) * radius,
            z: Math.sin(angle) * radius
        };
    }

    function layoutTokens(players = []) {
        const activePlayers = players.filter(player => player.isActive);
        const groupedByTile = new Map();

        activePlayers.forEach(player => {
            if (!groupedByTile.has(player.position)) {
                groupedByTile.set(player.position, []);
            }
            groupedByTile.get(player.position).push(player);
        });

        groupedByTile.forEach(tilePlayers => {
            tilePlayers
                .sort((left, right) => left.character.localeCompare(right.character))
                .forEach((player, playerIndex) => {
                    const token = tokens[player.character];
                    if (!token || token.animating) return;
                    const offset = getTokenOffset(playerIndex, tilePlayers.length);
                    setTokenPosition(player.character, player.position, offset);
                });
        });
    }

    function getToken(character) {
        return tokens[character];
    }

    function setTokenPosition(character, tileIndex, offset = { x: 0, z: 0 }) {
        const token = tokens[character];
        if (!token) return;

        const pos = getTilePos(tileIndex);
        if (!pos) return;

        token.currentTile = tileIndex;
        token.animating = false;
        token.group.position.set(pos.x + offset.x, TOKEN_BASE_Y, pos.z + offset.z);
        token.group.rotation.set(0, 0, 0);
    }

    function getAllTokens() {
        return tokens;
    }

    function removeToken(character, scene) {
        const token = tokens[character];
        if (!token || !token.group) return;

        const startY = token.group.position.y;
        const duration = 700;
        const startTime = performance.now();

        function animateSink() {
            const t = Math.min((performance.now() - startTime) / duration, 1);
            token.group.position.y = startY - (t * 1.7);
            token.group.scale.setScalar(1 - (t * 0.8));
            token.group.rotation.y += 0.09;

            if (t < 1) {
                requestAnimationFrame(animateSink);
                return;
            }

            scene.remove(token.group);
            delete tokens[character];
        }

        requestAnimationFrame(animateSink);
    }

    return {
        init,
        createToken,
        animateMove,
        layoutTokens,
        getToken,
        setTokenColor,
        setTokenPosition,
        getAllTokens,
        removeToken
    };
})();
