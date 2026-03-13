// ═══════════════════════════════════════════════════════════
//  SCENE — Three.js scene, camera, renderer, lights
// ═══════════════════════════════════════════════════════════

const GameScene = (() => {
    let scene, camera, renderer, controls;
    let followTarget = null;
    let viewMode = 'board';
    let shouldResetBoardView = false;

    const boardCameraPosition = new THREE.Vector3(20, 26, 20);
    const boardLookTarget = new THREE.Vector3(0, 0.8, 0);
    const currentLookTarget = new THREE.Vector3();
    const desiredCameraPosition = new THREE.Vector3();
    const desiredLookTarget = new THREE.Vector3();
    const outwardVector = new THREE.Vector3();

    function init() {
        const canvas = document.getElementById('game-canvas');

        // ── Scene ───────────────────────────────────────────
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x070c16);
        scene.fog = new THREE.Fog(0x070c16, 26, 78);

        // ── Renderer ────────────────────────────────────────
        renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: true,
            alpha: false
        });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.outputEncoding = THREE.sRGBEncoding;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 0.98;

        // ── Camera (isometric-like perspective) ─────────────
        camera = new THREE.PerspectiveCamera(
            32,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        camera.position.copy(boardCameraPosition);
        camera.lookAt(boardLookTarget);

        // ── Orbit Controls (limited) ────────────────────────
        controls = new THREE.OrbitControls(camera, canvas);
        controls.target.copy(boardLookTarget);
        controls.enableDamping = true;
        controls.dampingFactor = 0.06;
        controls.rotateSpeed = 0.75;
        controls.maxPolarAngle = Math.PI / 2.45;
        controls.minPolarAngle = Math.PI / 5;
        controls.minDistance = 16;
        controls.maxDistance = 44;
        controls.enablePan = false;
        controls.update();

        // ── Lights ──────────────────────────────────────────
        const hemisphereLight = new THREE.HemisphereLight(0x7b8fb5, 0x0b1220, 0.72);
        scene.add(hemisphereLight);

        const ambientLight = new THREE.AmbientLight(0xb9c7ef, 0.2);
        scene.add(ambientLight);

        const keyLight = new THREE.DirectionalLight(0xe9f0ff, 1.1);
        keyLight.position.set(18, 30, 16);
        keyLight.castShadow = true;
        keyLight.shadow.mapSize.width = 2048;
        keyLight.shadow.mapSize.height = 2048;
        keyLight.shadow.camera.near = 0.5;
        keyLight.shadow.camera.far = 90;
        keyLight.shadow.camera.left = -22;
        keyLight.shadow.camera.right = 22;
        keyLight.shadow.camera.top = 22;
        keyLight.shadow.camera.bottom = -22;
        scene.add(keyLight);

        const fillLight = new THREE.DirectionalLight(0x5ca8ff, 0.48);
        fillLight.position.set(-16, 18, -14);
        scene.add(fillLight);

        const rimLight = new THREE.DirectionalLight(0x9f7bff, 0.28);
        rimLight.position.set(10, 12, -18);
        scene.add(rimLight);

        const centerLight = new THREE.PointLight(0x4fc3ff, 0.48, 32);
        centerLight.position.set(0, 7, 0);
        scene.add(centerLight);

        // ── Ground plane (dark infinite ground) ─────────────
        const groundGeo = new THREE.PlaneGeometry(200, 200);
        const groundMat = new THREE.MeshStandardMaterial({
            color: 0x060b14,
            roughness: 0.96,
            metalness: 0.05
        });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -0.18;
        ground.receiveShadow = true;
        scene.add(ground);

        const glow = new THREE.Mesh(
            new THREE.CircleGeometry(18, 64),
            new THREE.MeshBasicMaterial({
                color: 0x2b6bff,
                transparent: true,
                opacity: 0.06
            })
        );
        glow.rotation.x = -Math.PI / 2;
        glow.position.y = -0.07;
        scene.add(glow);

        // ── Resize Handler ──────────────────────────────────
        window.addEventListener('resize', onResize);

        return { scene, camera, renderer, controls };
    }

    function onResize() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }

    function animate(callback) {
        function loop() {
            requestAnimationFrame(loop);
            if (callback) callback();
            updateCameraMode();
            controls.update();
            renderer.render(scene, camera);
        }
        loop();
    }

    function updateCameraMode() {
        if (!camera || !controls) return;

        if (viewMode === 'third-person' && followTarget) {
            followTarget.getWorldPosition(desiredLookTarget);

            outwardVector.set(desiredLookTarget.x, 0, desiredLookTarget.z);
            if (outwardVector.lengthSq() < 0.001) {
                outwardVector.set(0.8, 0, 1);
            }
            outwardVector.normalize();

            desiredCameraPosition.copy(desiredLookTarget).addScaledVector(outwardVector, 4.8);
            desiredCameraPosition.y += 3.35;

            currentLookTarget.copy(desiredLookTarget);
            currentLookTarget.y += 0.85;

            camera.position.lerp(desiredCameraPosition, 0.12);
            controls.target.lerp(currentLookTarget, 0.18);
            controls.enabled = false;
            camera.lookAt(currentLookTarget);
            return;
        }

        controls.enabled = true;

        if (!shouldResetBoardView) return;

        camera.position.lerp(boardCameraPosition, 0.1);
        controls.target.lerp(boardLookTarget, 0.12);

        if (
            camera.position.distanceToSquared(boardCameraPosition) < 0.05 &&
            controls.target.distanceToSquared(boardLookTarget) < 0.05
        ) {
            camera.position.copy(boardCameraPosition);
            controls.target.copy(boardLookTarget);
            shouldResetBoardView = false;
        }
    }

    function setFollowTarget(target) {
        followTarget = target || null;
        if (!followTarget && viewMode === 'third-person') {
            setViewMode('board');
        }
    }

    function setViewMode(mode) {
        if (mode === viewMode) return true;
        if (mode === 'third-person' && !followTarget) return false;

        viewMode = mode === 'third-person' ? 'third-person' : 'board';
        shouldResetBoardView = viewMode === 'board';
        return true;
    }

    function getViewMode() {
        return viewMode;
    }

    function getScene() { return scene; }
    function getCamera() { return camera; }
    function getRenderer() { return renderer; }

    return {
        init,
        animate,
        setFollowTarget,
        setViewMode,
        getViewMode,
        getScene,
        getCamera,
        getRenderer
    };
})();
