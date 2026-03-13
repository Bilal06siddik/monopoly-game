// ═══════════════════════════════════════════════════════════
//  SCENE — Three.js scene, camera, renderer, lights
// ═══════════════════════════════════════════════════════════

const GameScene = (() => {
    let scene, worldRoot, camera, renderer, controls;
    let followTarget = null;
    let viewMode = 'isometric';
    let shouldResetBoardView = false;
    let activeFov = 32;
    let thirdPersonDistance = 4.8;
    const viewModeListeners = new Set();

    const DEFAULT_FOV = 32;
    const TOP_DOWN_FOV = 24;
    const TOP_DOWN_BOARD_HEADING = Math.PI / 2;
    const BOARD_PAN_LIMIT = 6.2;
    const THIRD_PERSON_MIN_DISTANCE = 2.8;
    const THIRD_PERSON_MAX_DISTANCE = 9.5;
    const DEFAULT_BOARD_TARGET = new THREE.Vector3(0, 1.55, 1.2);
    const boardCameraOffset = new THREE.Vector3(-20, 26, -20);
    const defaultBoardDistance = boardCameraOffset.length();
    const boardOffsetDirection = boardCameraOffset.clone().normalize();
    const topDownCameraPosition = new THREE.Vector3(0, 44, 0);
    const topDownLookTarget = new THREE.Vector3(0, 0, 0);
    const currentLookTarget = new THREE.Vector3();
    const desiredCameraPosition = new THREE.Vector3();
    const desiredLookTarget = new THREE.Vector3();
    const smoothedFollowTarget = new THREE.Vector3();
    const desiredBoardTarget = new THREE.Vector3();
    const boardTargetDelta = new THREE.Vector3();
    const outwardVector = new THREE.Vector3();
    const quadrantVector = new THREE.Vector3();
    const boardCenter = new THREE.Vector3(0, 0, 0);
    const boardSpherical = new THREE.Spherical().setFromVector3(boardCameraOffset);

    function init() {
        const canvas = document.getElementById('game-canvas');

        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x070c16);
        scene.fog = new THREE.Fog(0x070c16, 26, 78);

        worldRoot = new THREE.Group();
        scene.add(worldRoot);

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
        renderer.toneMappingExposure = 0.92;

        camera = new THREE.PerspectiveCamera(
            DEFAULT_FOV,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        activeFov = DEFAULT_FOV;
        camera.position.copy(getDesiredBoardCameraPosition(DEFAULT_BOARD_TARGET, defaultBoardDistance));
        camera.lookAt(DEFAULT_BOARD_TARGET);

        controls = new THREE.OrbitControls(camera, canvas);
        controls.target.copy(DEFAULT_BOARD_TARGET);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.enableRotate = false;
        controls.enablePan = true;
        controls.screenSpacePanning = true;
        controls.minPolarAngle = boardSpherical.phi;
        controls.maxPolarAngle = boardSpherical.phi;
        controls.minAzimuthAngle = boardSpherical.theta;
        controls.maxAzimuthAngle = boardSpherical.theta;
        controls.minDistance = 18;
        controls.maxDistance = 46;
        controls.zoomSpeed = 0.9;
        controls.update();

        canvas.addEventListener('wheel', onCanvasWheel, { passive: false });
        canvas.addEventListener('pointerdown', onCanvasPointerDown, true);

        const hemisphereLight = new THREE.HemisphereLight(0x5f769d, 0x09111d, 0.56);
        scene.add(hemisphereLight);

        const ambientLight = new THREE.AmbientLight(0x8ea6d8, 0.16);
        scene.add(ambientLight);

        const keyLight = new THREE.DirectionalLight(0xdbe7ff, 0.94);
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

        const fillLight = new THREE.DirectionalLight(0x4f8fff, 0.34);
        fillLight.position.set(-16, 18, -14);
        scene.add(fillLight);

        const rimLight = new THREE.DirectionalLight(0x628dff, 0.16);
        rimLight.position.set(10, 12, -18);
        scene.add(rimLight);

        const centerLight = new THREE.PointLight(0x3e83ff, 0.26, 28);
        centerLight.position.set(0, 7, 0);
        scene.add(centerLight);

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

        window.addEventListener('resize', onResize);

        return { scene: worldRoot, camera, renderer, controls };
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
            if (controls.enabled) {
                controls.update();
            }
            updateCameraMode();
            renderer.render(scene, camera);
        }
        loop();
    }

    function onCanvasWheel(event) {
        if (viewMode !== 'third-person') return;

        event.preventDefault();
        const zoomDelta = event.deltaY * 0.01;
        thirdPersonDistance = THREE.MathUtils.clamp(
            thirdPersonDistance + zoomDelta,
            THIRD_PERSON_MIN_DISTANCE,
            THIRD_PERSON_MAX_DISTANCE
        );
    }

    function onCanvasPointerDown(event) {
        if (event.button !== 2 || viewMode !== 'third-person') return;

        // Switch early in the capture phase so OrbitControls can treat the same
        // right-click drag as a board pan instead of ignoring it in follow mode.
        setViewMode('isometric');
        if (controls) {
            controls.enabled = true;
        }
    }

    function setCameraFov(nextFov) {
        if (!camera || activeFov === nextFov) return;
        activeFov = nextFov;
        camera.fov = nextFov;
        camera.updateProjectionMatrix();
    }

    function getDesiredBoardCameraPosition(target, distance = controls?.getDistance?.() || defaultBoardDistance) {
        return desiredCameraPosition.copy(boardOffsetDirection).multiplyScalar(distance).add(target);
    }

    function clampBoardTarget() {
        const previousTargetX = controls.target.x;
        const previousTargetZ = controls.target.z;
        const clampedX = THREE.MathUtils.clamp(controls.target.x, -BOARD_PAN_LIMIT, BOARD_PAN_LIMIT);
        const clampedZ = THREE.MathUtils.clamp(controls.target.z, -BOARD_PAN_LIMIT, BOARD_PAN_LIMIT);

        if (clampedX === previousTargetX && clampedZ === previousTargetZ) {
            controls.target.y = DEFAULT_BOARD_TARGET.y;
            return;
        }

        boardTargetDelta.set(clampedX - previousTargetX, 0, clampedZ - previousTargetZ);
        controls.target.set(clampedX, DEFAULT_BOARD_TARGET.y, clampedZ);
        camera.position.add(boardTargetDelta);
    }

    function updateBoardCamera() {
        setCameraFov(DEFAULT_FOV);
        camera.up.set(0, 1, 0);
        if (worldRoot) worldRoot.rotation.y = 0;
        controls.enabled = true;

        if (shouldResetBoardView) {
            desiredBoardTarget.copy(DEFAULT_BOARD_TARGET);
            desiredCameraPosition.copy(getDesiredBoardCameraPosition(DEFAULT_BOARD_TARGET, defaultBoardDistance));

            camera.position.lerp(desiredCameraPosition, 0.12);
            controls.target.lerp(desiredBoardTarget, 0.16);

            if (
                camera.position.distanceToSquared(desiredCameraPosition) < 0.04 &&
                controls.target.distanceToSquared(desiredBoardTarget) < 0.03
            ) {
                camera.position.copy(desiredCameraPosition);
                controls.target.copy(desiredBoardTarget);
                shouldResetBoardView = false;
            }
        }

        clampBoardTarget();
        camera.lookAt(controls.target);
    }

    function updateTopDownCamera() {
        setCameraFov(TOP_DOWN_FOV);
        camera.up.set(0, 0, -1);
        if (worldRoot) worldRoot.rotation.y = TOP_DOWN_BOARD_HEADING;
        camera.position.copy(topDownCameraPosition);
        controls.target.copy(topDownLookTarget);
        controls.enabled = false;
        camera.lookAt(topDownLookTarget);
    }

    function updateThirdPersonCamera() {
        if (!followTarget) {
            setViewMode('isometric');
            return;
        }

        setCameraFov(DEFAULT_FOV);
        camera.up.set(0, 1, 0);
        if (worldRoot) worldRoot.rotation.y = 0;
        followTarget.getWorldPosition(desiredLookTarget);

        const hasSmoothedTarget = smoothedFollowTarget.lengthSq() > 0.0001;
        if (!hasSmoothedTarget) {
            smoothedFollowTarget.copy(desiredLookTarget);
        } else {
            smoothedFollowTarget.x = THREE.MathUtils.lerp(smoothedFollowTarget.x, desiredLookTarget.x, 0.18);
            smoothedFollowTarget.z = THREE.MathUtils.lerp(smoothedFollowTarget.z, desiredLookTarget.z, 0.18);
            smoothedFollowTarget.y = THREE.MathUtils.lerp(smoothedFollowTarget.y, desiredLookTarget.y, 0.05);
        }

        outwardVector.set(smoothedFollowTarget.x, 0, smoothedFollowTarget.z);
        if (outwardVector.lengthSq() < 0.001) {
            outwardVector.set(0.8, 0, 1);
        }
        outwardVector.normalize();

        desiredCameraPosition.copy(smoothedFollowTarget).addScaledVector(outwardVector, thirdPersonDistance);
        desiredCameraPosition.y += Math.max(2.6, thirdPersonDistance * 0.7);

        currentLookTarget.copy(smoothedFollowTarget);
        currentLookTarget.y += 0.85;

        camera.position.lerp(desiredCameraPosition, 0.12);
        controls.target.lerp(currentLookTarget, 0.18);
        controls.enabled = false;
        camera.lookAt(currentLookTarget);
    }

    function updateCameraMode() {
        if (!camera || !controls) return;

        if (viewMode === 'third-person') {
            updateThirdPersonCamera();
            return;
        }

        if (viewMode === 'top-down') {
            updateTopDownCamera();
            return;
        }

        updateBoardCamera();
    }

    function setFollowTarget(target) {
        followTarget = target || null;
        smoothedFollowTarget.set(0, 0, 0);
        if (!followTarget && viewMode === 'third-person') {
            setViewMode('isometric');
        }
    }

    function setViewMode(mode) {
        if (mode === 'third-person' && !followTarget) return false;

        const normalizedMode = mode === 'third-person'
            ? 'third-person'
            : mode === 'top-down'
                ? 'top-down'
                : 'isometric';

        if (normalizedMode === viewMode) return true;

        viewMode = normalizedMode;
        shouldResetBoardView = normalizedMode === 'isometric';
        notifyViewModeChange();
        return true;
    }

    function resetBoardView() {
        shouldResetBoardView = true;
        if (viewMode === 'third-person' || viewMode === 'top-down') {
            viewMode = 'isometric';
            notifyViewModeChange();
        }
    }

    function getViewMode() {
        return viewMode;
    }

    function getBoardViewHeading() {
        return worldRoot?.rotation?.y || 0;
    }

    function notifyViewModeChange() {
        viewModeListeners.forEach(listener => {
            try {
                listener(viewMode);
            } catch (error) {
                console.error('GameScene view mode listener failed', error);
            }
        });
    }

    function onViewModeChange(listener) {
        if (typeof listener !== 'function') {
            return () => {};
        }

        viewModeListeners.add(listener);
        return () => viewModeListeners.delete(listener);
    }

    function getCameraQuadrant() {
        quadrantVector.copy(camera.position).sub(boardCenter);
        quadrantVector.y = 0;

        if (quadrantVector.lengthSq() < 0.0001) {
            return 'south';
        }

        quadrantVector.applyAxisAngle(new THREE.Vector3(0, 1, 0), -(worldRoot?.rotation?.y || 0));

        if (Math.abs(quadrantVector.x) > Math.abs(quadrantVector.z)) {
            return quadrantVector.x >= 0 ? 'east' : 'west';
        }

        return quadrantVector.z >= 0 ? 'south' : 'north';
    }

    function getScene() { return worldRoot; }
    function getCamera() { return camera; }
    function getRenderer() { return renderer; }

    return {
        init,
        animate,
        setFollowTarget,
        setViewMode,
        resetBoardView,
        getViewMode,
        onViewModeChange,
        getBoardViewHeading,
        getCameraQuadrant,
        getScene,
        getCamera,
        getRenderer
    };
})();
