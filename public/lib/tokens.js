// ═══════════════════════════════════════════════════════════
//  TOKENS — procedural 3D token variants with badge labels
// ═══════════════════════════════════════════════════════════

const GameTokens = (() => {
    const tokens = {};
    let getTilePos = null;
    let sportsCarTemplate = null;
    let sportsCarLoadPromise = null;
    let sportsCarLoadFailed = false;

    const TOKEN_BASE_Y = 0.16;
    const TOKEN_MODEL_DEPTH = 0.18;
    const SPORTS_CAR_MODEL_URL = './models/hatchbackSports.glb';
    const TOKEN_STEP_DURATION_MS = 160;

    function init(scene, tilePositionFn) {
        getTilePos = tilePositionFn;
        ensureSportsCarTemplate();
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

    function getTokenStyle(tokenId) {
        const normalizedTokenId = typeof tokenId === 'string' ? tokenId : '';
        const availableStyles = window.TokenCatalog?.TOKEN_OPTIONS?.map(option => option.id) || [];
        return availableStyles.includes(normalizedTokenId) ? normalizedTokenId : 'pawn';
    }

    function createBadgeTexture(character, color) {
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const label = (character || '?').slice(0, 2).toUpperCase();
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

    function createMetalMaterial(color, overrides = {}) {
        const resolvedColor = normalizeColor(color);
        return new THREE.MeshStandardMaterial({
            color: resolvedColor,
            emissive: resolvedColor,
            emissiveIntensity: 0.12,
            roughness: 0.28,
            metalness: 0.82,
            ...overrides
        });
    }

    function createAccentMaterial() {
        return new THREE.MeshStandardMaterial({
            color: 0xf6f7fb,
            emissive: 0x9aa4b2,
            emissiveIntensity: 0.05,
            roughness: 0.32,
            metalness: 0.74
        });
    }

    function enableShadows(mesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        return mesh;
    }

    function createBox(width, height, depth, material) {
        return enableShadows(new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material));
    }

    function createCylinder(radiusTop, radiusBottom, height, material, radialSegments = 24) {
        return enableShadows(new THREE.Mesh(
            new THREE.CylinderGeometry(radiusTop, radiusBottom, height, radialSegments),
            material
        ));
    }

    function createSphere(radius, material, widthSegments = 18, heightSegments = 14) {
        return enableShadows(new THREE.Mesh(
            new THREE.SphereGeometry(radius, widthSegments, heightSegments),
            material
        ));
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

    function finalizeTokenModel(root, colorMaterials) {
        const bounds = new THREE.Box3().setFromObject(root);
        const size = new THREE.Vector3();
        bounds.getSize(size);
        root.userData.height = size.y;
        root.userData.colorMaterials = colorMaterials;
        return root;
    }

    function cloneMaterialWithEncoding(material) {
        if (!material) return material;
        const cloned = material.clone();
        if (cloned.map) {
            cloned.map = cloned.map.clone();
            cloned.map.encoding = THREE.sRGBEncoding;
            cloned.map.needsUpdate = true;
        }
        if (cloned.emissiveMap) {
            cloned.emissiveMap = cloned.emissiveMap.clone();
            cloned.emissiveMap.encoding = THREE.sRGBEncoding;
            cloned.emissiveMap.needsUpdate = true;
        }
        return cloned;
    }

    function cloneSceneMaterials(root) {
        root.traverse(node => {
            if (!node.isMesh || !node.material) return;
            if (Array.isArray(node.material)) {
                node.material = node.material.map(cloneMaterialWithEncoding);
            } else {
                node.material = cloneMaterialWithEncoding(node.material);
            }
        });
    }

    function collectTintableMaterials(root) {
        const tintableMaterials = [];
        const seenMaterials = new Set();

        root.traverse(node => {
            if (!node.isMesh || !node.material) return;
            const materials = Array.isArray(node.material) ? node.material : [node.material];
            materials.forEach(material => {
                if (!material || seenMaterials.has(material) || !material.color) return;
                seenMaterials.add(material);

                const hsl = { h: 0, s: 0, l: 0 };
                material.color.getHSL(hsl);
                const looksLikeGlass = /glass|window/i.test(material.name || '');
                const looksLikeWheel = /wheel|tire|tyre|rubber/i.test(material.name || '');
                const isTooDark = hsl.l < 0.12;
                const isNeutralTrim = hsl.s < 0.08 && hsl.l < 0.72;
                if (looksLikeGlass || looksLikeWheel || isTooDark || isNeutralTrim) return;

                tintableMaterials.push(material);
            });
        });

        return tintableMaterials;
    }

    function normalizeImportedModel(root, { targetWidth = 0.92, targetHeight = 0.52, targetDepth = 0.6 } = {}) {
        const bounds = new THREE.Box3().setFromObject(root);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        bounds.getSize(size);
        bounds.getCenter(center);

        root.position.sub(center);
        root.position.y -= bounds.min.y;

        const safeX = Math.max(size.x, 0.0001);
        const safeY = Math.max(size.y, 0.0001);
        const safeZ = Math.max(size.z, 0.0001);
        const scale = Math.min(targetWidth / safeX, targetHeight / safeY, targetDepth / safeZ);
        root.scale.setScalar(scale);

        const normalizedBounds = new THREE.Box3().setFromObject(root);
        root.position.y -= normalizedBounds.min.y;
        return root;
    }

    function buildSportsCarTemplate(sceneRoot) {
        const root = new THREE.Group();
        const imported = sceneRoot.clone(true);
        cloneSceneMaterials(imported);
        const rawSize = new THREE.Box3().setFromObject(imported).getSize(new THREE.Vector3());
        if (rawSize.z > rawSize.x) {
            imported.rotation.y = Math.PI / 2;
        }
        normalizeImportedModel(imported);
        imported.traverse(node => {
            if (node.isMesh) {
                node.castShadow = true;
                node.receiveShadow = true;
                if (node.material) {
                    const materials = Array.isArray(node.material) ? node.material : [node.material];
                    materials.forEach(material => {
                        if ('map' in material && material.map) {
                            material.map.encoding = THREE.sRGBEncoding;
                        }
                    });
                }
            }
        });
        root.add(imported);
        root.rotation.y = -Math.PI / 6;
        root.userData.height = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3()).y;
        root.userData.colorMaterials = collectTintableMaterials(imported);
        return root;
    }

    function ensureSportsCarTemplate() {
        if (sportsCarTemplate || sportsCarLoadPromise || sportsCarLoadFailed || typeof THREE.GLTFLoader !== 'function') {
            return sportsCarLoadPromise;
        }

        const loader = new THREE.GLTFLoader();
        sportsCarLoadPromise = new Promise(resolve => {
            loader.load(
                SPORTS_CAR_MODEL_URL,
                gltf => {
                    sportsCarTemplate = buildSportsCarTemplate(gltf.scene || gltf.scenes?.[0] || new THREE.Group());
                    resolve(sportsCarTemplate);
                },
                undefined,
                error => {
                    sportsCarLoadFailed = true;
                    console.error('Failed to load sports car token model', error);
                    resolve(null);
                }
            );
        });

        return sportsCarLoadPromise;
    }

    function createSportsCarFallback(primaryMaterial, accentMaterial) {
        const root = new THREE.Group();
        const darkMaterial = new THREE.MeshStandardMaterial({
            color: 0x1b2533,
            roughness: 0.64,
            metalness: 0.28
        });
        const colorMaterials = [primaryMaterial];

        const body = createBox(0.58, 0.14, 0.28, primaryMaterial);
        body.position.set(0.02, 0.16, 0);
        root.add(body);

        const cabin = createBox(0.28, 0.12, 0.22, accentMaterial);
        cabin.position.set(0.06, 0.28, 0);
        cabin.rotation.z = -0.08;
        root.add(cabin);

        const nose = createBox(0.16, 0.1, 0.24, primaryMaterial);
        nose.position.set(0.31, 0.13, 0);
        nose.rotation.z = -0.16;
        root.add(nose);

        const wheelPositions = [
            [-0.18, 0.08, -0.13],
            [0.2, 0.08, -0.13],
            [-0.18, 0.08, 0.13],
            [0.2, 0.08, 0.13]
        ];
        wheelPositions.forEach(([x, y, z]) => {
            const wheel = createCylinder(0.08, 0.08, 0.06, darkMaterial, 18);
            wheel.rotation.z = Math.PI / 2;
            wheel.position.set(x, y, z);
            root.add(wheel);
        });

        root.rotation.y = -Math.PI / 6;
        return finalizeTokenModel(root, colorMaterials);
    }

    function attachSportsCarWhenReady(token) {
        if (!token || token.tokenId !== 'sports-car') return;

        ensureSportsCarTemplate()?.then(template => {
            if (!template || !tokens[token.playerId] || tokens[token.playerId].tokenId !== 'sports-car') return;

            const liveToken = tokens[token.playerId];
            if (liveToken.modelRoot && liveToken.modelRoot.userData.isImportedSportsCar) {
                return;
            }

            const importedModel = template.clone(true);
            cloneSceneMaterials(importedModel);
            importedModel.userData.isImportedSportsCar = true;

            if (liveToken.modelRoot) {
                liveToken.group.remove(liveToken.modelRoot);
                disposeObject(liveToken.modelRoot);
            }

            liveToken.modelRoot = importedModel;
            liveToken.group.add(importedModel);
            liveToken.colorMaterials = importedModel.userData.colorMaterials || [];
            const liveColor = normalizeColor(liveToken.color);
            liveToken.colorMaterials.forEach(material => {
                material.color.copy(liveColor);
                material.needsUpdate = true;
            });
            liveToken.badge.position.set(0, (importedModel.userData.height || 1) + 0.32, 0);
            if (liveToken.pointLight) {
                liveToken.pointLight.position.y = (importedModel.userData.height || 1) + 0.1;
            }
        });
    }

    function createBattleshipModel(primaryMaterial, accentMaterial) {
        const root = new THREE.Group();
        const darkMaterial = new THREE.MeshStandardMaterial({
            color: 0x1a2430,
            roughness: 0.58,
            metalness: 0.4
        });
        const colorMaterials = [primaryMaterial];

        const hull = createCylinder(0.13, 0.22, 0.98, primaryMaterial, 8);
        hull.rotation.z = Math.PI / 2;
        hull.position.y = 0.18;
        hull.scale.set(1, 1.05, 0.9);
        root.add(hull);

        const bow = createCylinder(0.02, 0.14, 0.26, primaryMaterial, 10);
        bow.rotation.z = -Math.PI / 2;
        bow.position.set(0.57, 0.19, 0);
        root.add(bow);

        const sternDeck = createBox(0.18, 0.1, 0.22, accentMaterial);
        sternDeck.position.set(-0.34, 0.33, 0);
        root.add(sternDeck);

        const superstructure = createBox(0.28, 0.2, 0.22, accentMaterial);
        superstructure.position.set(-0.02, 0.4, 0);
        root.add(superstructure);

        const bridge = createBox(0.16, 0.14, 0.16, primaryMaterial);
        bridge.position.set(0.02, 0.55, 0);
        root.add(bridge);

        const turretBase = createCylinder(0.08, 0.08, 0.08, accentMaterial, 18);
        turretBase.rotation.x = Math.PI / 2;
        turretBase.position.set(0.17, 0.41, 0);
        root.add(turretBase);

        const turret = createBox(0.14, 0.08, 0.12, primaryMaterial);
        turret.position.set(0.16, 0.45, 0);
        root.add(turret);

        const barrelLeft = createCylinder(0.014, 0.014, 0.26, darkMaterial, 12);
        barrelLeft.rotation.z = Math.PI / 2;
        barrelLeft.position.set(0.29, 0.46, -0.03);
        root.add(barrelLeft);

        const barrelRight = createCylinder(0.014, 0.014, 0.26, darkMaterial, 12);
        barrelRight.rotation.z = Math.PI / 2;
        barrelRight.position.set(0.29, 0.46, 0.03);
        root.add(barrelRight);

        const mast = createCylinder(0.016, 0.02, 0.34, darkMaterial, 10);
        mast.position.set(-0.14, 0.58, 0);
        root.add(mast);

        const radar = createBox(0.18, 0.05, 0.03, accentMaterial);
        radar.position.set(-0.12, 0.69, 0);
        radar.rotation.z = -0.12;
        root.add(radar);

        const waterline = createBox(0.82, 0.03, 0.18, darkMaterial);
        waterline.position.set(0.02, 0.09, 0);
        root.add(waterline);

        root.rotation.y = Math.PI / 8;
        return finalizeTokenModel(root, colorMaterials);
    }

    function createPawnModel(primaryMaterial, accentMaterial) {
        const root = new THREE.Group();
        const colorMaterials = [primaryMaterial];

        const body = enableShadows(new THREE.Mesh(createPawnGeometry(), primaryMaterial));
        body.position.y = 0.01;
        root.add(body);

        const collar = enableShadows(new THREE.Mesh(
            new THREE.TorusGeometry(0.23, 0.035, 14, 42),
            accentMaterial
        ));
        collar.rotation.x = Math.PI / 2;
        collar.position.y = 0.06;
        root.add(collar);

        return finalizeTokenModel(root, colorMaterials);
    }

    function createTokenShape(style) {
        const shape = new THREE.Shape();

        if (style === 'battleship') {
            shape.moveTo(-0.82, 0.08);
            shape.lineTo(0.52, 0.08);
            shape.lineTo(0.82, 0.28);
            shape.lineTo(0.58, 0.44);
            shape.lineTo(0.18, 0.44);
            shape.lineTo(0.18, 0.94);
            shape.lineTo(-0.1, 0.94);
            shape.lineTo(-0.18, 0.62);
            shape.lineTo(-0.44, 0.62);
            shape.lineTo(-0.52, 0.44);
            shape.lineTo(-0.74, 0.36);
            shape.lineTo(-0.82, 0.08);
            return shape;
        }

        shape.moveTo(-0.42, 0);
        shape.quadraticCurveTo(-0.54, 0.02, -0.5, 0.18);
        shape.quadraticCurveTo(-0.42, 0.28, -0.28, 0.32);
        shape.quadraticCurveTo(-0.2, 0.54, -0.24, 0.74);
        shape.quadraticCurveTo(-0.24, 1.08, 0, 1.24);
        shape.quadraticCurveTo(0.24, 1.08, 0.24, 0.74);
        shape.quadraticCurveTo(0.2, 0.54, 0.28, 0.32);
        shape.quadraticCurveTo(0.42, 0.28, 0.5, 0.18);
        shape.quadraticCurveTo(0.54, 0.02, 0.42, 0);
        return shape;
    }

    function createTokenModel(tokenId, color) {
        const style = getTokenStyle(tokenId);
        const primaryMaterial = createMetalMaterial(color);
        const accentMaterial = createAccentMaterial();

        if (style === 'pawn') {
            return createPawnModel(primaryMaterial, accentMaterial);
        }

        if (style === 'battleship') {
            return createBattleshipModel(primaryMaterial, accentMaterial);
        }

        if (style === 'sports-car') {
            const fallback = createSportsCarFallback(primaryMaterial, accentMaterial);
            fallback.userData.isImportedSportsCar = false;
            return fallback;
        }

        const root = new THREE.Group();
        const colorMaterials = [primaryMaterial];

        const shape = createTokenShape(style);
        const geometry = new THREE.ExtrudeGeometry(shape, {
            depth: TOKEN_MODEL_DEPTH,
            bevelEnabled: true,
            bevelThickness: 0.03,
            bevelSize: 0.03,
            bevelSegments: 3,
            steps: 1,
            curveSegments: 28
        });
        geometry.center();

        const mesh = new THREE.Mesh(geometry, primaryMaterial);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.rotation.y = Math.PI / 8;

        const bounds = new THREE.Box3().setFromObject(mesh);
        const size = new THREE.Vector3();
        bounds.getSize(size);
        const desiredHeight = style === 'battleship' ? 0.94 : 1.04;
        const scale = desiredHeight / Math.max(size.y, 0.0001);
        mesh.scale.setScalar(scale);
        mesh.position.y = (size.y * scale) / 2;
        root.add(mesh);

        const halo = new THREE.Mesh(
            new THREE.TorusGeometry(0.24, 0.03, 12, 36),
            accentMaterial
        );
        halo.rotation.x = Math.PI / 2;
        halo.position.y = 0.05;
        halo.castShadow = true;
        halo.receiveShadow = true;
        root.add(halo);

        root.userData.accentMaterial = accentMaterial;
        return finalizeTokenModel(root, colorMaterials);
    }

    function disposeObject(object3d) {
        object3d.traverse(node => {
            if (node.geometry) {
                node.geometry.dispose();
            }
            if (node.material) {
                const materials = Array.isArray(node.material) ? node.material : [node.material];
                materials.forEach(material => material.dispose());
            }
        });
    }

    function applyTokenAppearance(token, { tokenId, character, name, color }) {
        const resolvedColor = normalizeColor(color);
        const resolvedStyle = getTokenStyle(tokenId);
        const shouldRebuildModel = token.tokenId !== resolvedStyle || !token.modelRoot;
        const badgeLabel = name || character;

        token.character = badgeLabel;
        token.tokenId = resolvedStyle;
        token.color = `#${resolvedColor.getHexString()}`;

        if (shouldRebuildModel) {
            if (token.modelRoot) {
                token.group.remove(token.modelRoot);
                disposeObject(token.modelRoot);
            }

            token.modelRoot = createTokenModel(resolvedStyle, resolvedColor);
            token.group.add(token.modelRoot);
            token.colorMaterials = token.modelRoot.userData.colorMaterials || [];

            if (resolvedStyle === 'sports-car') {
                attachSportsCarWhenReady(token);
            }
        }

        token.colorMaterials.forEach(material => {
            material.color.copy(resolvedColor);
            material.emissive.copy(resolvedColor);
        });

        token.ring.material.emissive.copy(resolvedColor);

        if (token.badge.material.map) {
            token.badge.material.map.dispose();
        }
        token.badge.material.map = createBadgeTexture(badgeLabel, resolvedColor);
        token.badge.material.needsUpdate = true;
        token.badge.position.set(0, (token.modelRoot?.userData?.height || 1) + 0.32, 0);
        if (token.pointLight) {
            token.pointLight.color.copy(resolvedColor);
            token.pointLight.position.y = (token.modelRoot?.userData?.height || 1) + 0.1;
        }
    }

    function createToken(player, scene) {
        const group = new THREE.Group();
        const startPos = getTilePos(0);
        group.position.set(startPos.x, TOKEN_BASE_Y, startPos.z);

        const ringMaterial = new THREE.MeshStandardMaterial({
            color: 0xf6f7fb,
            emissive: 0x9aa4b2,
            emissiveIntensity: 0.08,
            roughness: 0.34,
            metalness: 0.7
        });
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.022, 12, 36), ringMaterial);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.02;
        ring.castShadow = true;
        ring.receiveShadow = true;
        group.add(ring);

        const badge = new THREE.Sprite(new THREE.SpriteMaterial({
            map: createBadgeTexture(player.name || player.character, player.color),
            transparent: true,
            depthWrite: false
        }));
        badge.scale.set(0.52, 0.52, 1);
        group.add(badge);

        const pointLight = new THREE.PointLight(0xffffff, 0, 1.5);
        pointLight.position.set(0, 0.5, 0);
        group.add(pointLight);

        scene.add(group);

        tokens[player.id] = {
            playerId: player.id,
            character: player.name || player.character,
            tokenId: null,
            color: null,
            group,
            ring,
            badge,
            pointLight,
            modelRoot: null,
            colorMaterials: [],
            currentTile: 0,
            animating: false
        };

        applyTokenAppearance(tokens[player.id], player);
        return group;
    }

    function syncToken(player, isActiveTurn = false) {
        const token = tokens[player?.id];
        if (!token || !player) return;
        applyTokenAppearance(token, player);
        if (token.pointLight) {
            token.pointLight.intensity = isActiveTurn ? 0.8 : 0;
        }
    }

    function animateMove(playerId, fromTile, toTile, onComplete) {
        const token = tokens[playerId];
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
        const stepDuration = TOKEN_STEP_DURATION_MS;
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

    function getTokenOffset(playerIndex, totalOnTile) {
        if (totalOnTile <= 1) return { x: 0, z: 0 };

        const radius = totalOnTile === 2
            ? 0.24
            : totalOnTile <= 4
                ? 0.31
                : 0.36;
        const angle = ((Math.PI * 2) / totalOnTile) * playerIndex - (Math.PI / 2);
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
                .sort((left, right) => (left.name || left.character || left.id).localeCompare(right.name || right.character || right.id))
                .forEach((player, playerIndex) => {
                    const token = tokens[player.id];
                    if (!token || token.animating) return;
                    const offset = getTokenOffset(playerIndex, tilePlayers.length);
                    setTokenPosition(player.id, player.position, offset);
                });
        });
    }

    function getToken(playerId) {
        return tokens[playerId];
    }

    function setTokenPosition(playerId, tileIndex, offset = { x: 0, z: 0 }) {
        const token = tokens[playerId];
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

    function removeToken(playerId, scene) {
        const token = tokens[playerId];
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

            if (token.badge.material.map) {
                token.badge.material.map.dispose();
            }
            disposeObject(token.group);
            scene.remove(token.group);
            delete tokens[playerId];
        }

        requestAnimationFrame(animateSink);
    }

    return {
        init,
        createToken,
        syncToken,
        animateMove,
        layoutTokens,
        getToken,
        setTokenPosition,
        getAllTokens,
        removeToken
    };
})();
