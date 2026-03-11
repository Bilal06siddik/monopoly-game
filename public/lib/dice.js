// ═══════════════════════════════════════════════════════════
//  DICE — 3D animated dice with pip textures
// ═══════════════════════════════════════════════════════════

const GameDice = (() => {
    let die1Mesh, die2Mesh;
    let isRolling = false;
    let rollAnimation = null;
    const DICE_SIZE = 0.7;

    // ── Create pip textures for each face (1-6) ───────────
    function createFaceTexture(pips) {
        const size = 128;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        // Face background
        ctx.fillStyle = '#f8f8f0';
        ctx.fillRect(0, 0, size, size);

        // Rounded border
        ctx.strokeStyle = '#ccc';
        ctx.lineWidth = 3;
        ctx.strokeRect(4, 4, size - 8, size - 8);

        // Pip positions for standard dice
        const pipR = 10;
        ctx.fillStyle = '#1a1a2e';

        const positions = {
            1: [[64, 64]],
            2: [[32, 32], [96, 96]],
            3: [[32, 32], [64, 64], [96, 96]],
            4: [[32, 32], [96, 32], [32, 96], [96, 96]],
            5: [[32, 32], [96, 32], [64, 64], [32, 96], [96, 96]],
            6: [[32, 28], [96, 28], [32, 64], [96, 64], [32, 100], [96, 100]]
        };

        (positions[pips] || []).forEach(([x, y]) => {
            ctx.beginPath();
            ctx.arc(x, y, pipR, 0, Math.PI * 2);
            ctx.fill();
        });

        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;
        return texture;
    }

    // ── Rotation targets for each face value ──────────────
    // Maps face value → euler rotation that shows that face on top
    const FACE_ROTATIONS = {
        1: { x: 0, z: 0 },              // 1 on top
        2: { x: -Math.PI / 2, z: 0 },              // 2 on top
        3: { x: 0, z: Math.PI / 2 },     // 3 on top
        4: { x: 0, z: -Math.PI / 2 },    // 4 on top
        5: { x: Math.PI / 2, z: 0 },              // 5 on top
        6: { x: Math.PI, z: 0 }               // 6 on top
    };

    function createDie(offsetX) {
        // Materials: [+x, -x, +y, -y, +z, -z]
        // Standard dice: opposite faces sum to 7
        // +y(top)=1, -y(bottom)=6, +z(front)=2, -z(back)=5, +x(right)=3, -x(left)=4
        const materials = [
            new THREE.MeshStandardMaterial({ map: createFaceTexture(3) }), // +x → 3
            new THREE.MeshStandardMaterial({ map: createFaceTexture(4) }), // -x → 4
            new THREE.MeshStandardMaterial({ map: createFaceTexture(1) }), // +y → 1
            new THREE.MeshStandardMaterial({ map: createFaceTexture(6) }), // -y → 6
            new THREE.MeshStandardMaterial({ map: createFaceTexture(2) }), // +z → 2
            new THREE.MeshStandardMaterial({ map: createFaceTexture(5) }), // -z → 5
        ];

        const geo = new THREE.BoxGeometry(DICE_SIZE, DICE_SIZE, DICE_SIZE);
        const mesh = new THREE.Mesh(geo, materials);
        mesh.position.set(offsetX, DICE_SIZE / 2 + 0.15, 0);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        return mesh;
    }

    function init(scene) {
        die1Mesh = createDie(-0.7);
        die2Mesh = createDie(0.7);
        scene.add(die1Mesh);
        scene.add(die2Mesh);
    }

    // ── Animate Dice Roll ─────────────────────────────────
    function roll(value1, value2, onComplete) {
        if (isRolling) return;
        isRolling = true;

        const duration = 1800;  // ms
        const startTime = performance.now();

        // Random spin amounts (multiple full rotations + target)
        const spins1 = {
            x: (3 + Math.random() * 3) * Math.PI * 2 + FACE_ROTATIONS[value1].x,
            z: (2 + Math.random() * 2) * Math.PI * 2 + FACE_ROTATIONS[value1].z
        };
        const spins2 = {
            x: (3 + Math.random() * 3) * Math.PI * 2 + FACE_ROTATIONS[value2].x,
            z: (2 + Math.random() * 2) * Math.PI * 2 + FACE_ROTATIONS[value2].z
        };

        // Store start rotations
        const start1 = { x: die1Mesh.rotation.x, y: die1Mesh.rotation.y, z: die1Mesh.rotation.z };
        const start2 = { x: die2Mesh.rotation.x, y: die2Mesh.rotation.y, z: die2Mesh.rotation.z };

        // Start positions (bounce up)
        const baseY = DICE_SIZE / 2 + 0.15;

        if (rollAnimation) cancelAnimationFrame(rollAnimation);

        function animateRoll() {
            const now = performance.now();
            const elapsed = now - startTime;
            let t = Math.min(elapsed / duration, 1);

            // Easing: ease-out cubic
            const ease = 1 - Math.pow(1 - t, 3);

            // Bounce height: goes up then back down
            const bounce = Math.sin(t * Math.PI) * 2.5 * (1 - t);

            // Rotate dice
            die1Mesh.rotation.x = start1.x + spins1.x * ease;
            die1Mesh.rotation.z = start1.z + spins1.z * ease;
            die1Mesh.position.y = baseY + bounce;

            die2Mesh.rotation.x = start2.x + spins2.x * ease;
            die2Mesh.rotation.z = start2.z + spins2.z * ease;
            die2Mesh.position.y = baseY + bounce * 0.8;

            // Slight wobble on y rotation
            die1Mesh.rotation.y = Math.sin(t * 8) * 0.3 * (1 - t);
            die2Mesh.rotation.y = Math.cos(t * 8) * 0.3 * (1 - t);

            if (t < 1) {
                rollAnimation = requestAnimationFrame(animateRoll);
            } else {
                // Snap to exact final rotation
                die1Mesh.rotation.set(FACE_ROTATIONS[value1].x, 0, FACE_ROTATIONS[value1].z);
                die2Mesh.rotation.set(FACE_ROTATIONS[value2].x, 0, FACE_ROTATIONS[value2].z);
                die1Mesh.position.y = baseY;
                die2Mesh.position.y = baseY;
                isRolling = false;
                if (onComplete) onComplete();
            }
        }

        rollAnimation = requestAnimationFrame(animateRoll);
    }

    function getIsRolling() { return isRolling; }

    return { init, roll, getIsRolling };
})();
