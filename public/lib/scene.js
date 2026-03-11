// ═══════════════════════════════════════════════════════════
//  SCENE — Three.js scene, camera, renderer, lights
// ═══════════════════════════════════════════════════════════

const GameScene = (() => {
    let scene, camera, renderer, controls;

    function init() {
        const canvas = document.getElementById('game-canvas');

        // ── Scene ───────────────────────────────────────────
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0a0a14);
        scene.fog = new THREE.FogExp2(0x0a0a14, 0.012);

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
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.2;

        // ── Camera (isometric-like perspective) ─────────────
        camera = new THREE.PerspectiveCamera(
            35,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        // Position camera at an isometric-style angle
        camera.position.set(22, 28, 22);
        camera.lookAt(0, 0, 0);

        // ── Orbit Controls (limited) ────────────────────────
        controls = new THREE.OrbitControls(camera, canvas);
        controls.target.set(0, 0, 0);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.maxPolarAngle = Math.PI / 2.5;   // prevent going under
        controls.minPolarAngle = Math.PI / 8;     // prevent going too top-down
        controls.minDistance = 15;
        controls.maxDistance = 50;
        controls.enablePan = false;
        controls.update();

        // ── Lights ──────────────────────────────────────────
        // Ambient
        const ambientLight = new THREE.AmbientLight(0x8888cc, 0.5);
        scene.add(ambientLight);

        // Main directional light (sun-like)
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
        dirLight.position.set(15, 25, 10);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        dirLight.shadow.camera.near = 0.5;
        dirLight.shadow.camera.far = 80;
        dirLight.shadow.camera.left = -20;
        dirLight.shadow.camera.right = 20;
        dirLight.shadow.camera.top = 20;
        dirLight.shadow.camera.bottom = -20;
        scene.add(dirLight);

        // Accent light (purple tint from the other side)
        const accentLight = new THREE.DirectionalLight(0x6c5ce7, 0.35);
        accentLight.position.set(-10, 15, -10);
        scene.add(accentLight);

        // Soft point light in center
        const centerLight = new THREE.PointLight(0xffeaa7, 0.4, 30);
        centerLight.position.set(0, 6, 0);
        scene.add(centerLight);

        // ── Ground plane (dark infinite ground) ─────────────
        const groundGeo = new THREE.PlaneGeometry(200, 200);
        const groundMat = new THREE.MeshStandardMaterial({
            color: 0x080810,
            roughness: 0.9,
            metalness: 0.1
        });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -0.1;
        ground.receiveShadow = true;
        scene.add(ground);

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
            controls.update();
            if (callback) callback();
            renderer.render(scene, camera);
        }
        loop();
    }

    function getScene() { return scene; }
    function getCamera() { return camera; }
    function getRenderer() { return renderer; }

    return { init, animate, getScene, getCamera, getRenderer };
})();
