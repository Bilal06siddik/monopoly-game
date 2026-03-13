// ═══════════════════════════════════════════════════════════
//  DICE — 3D animated dice with pip textures
// ═══════════════════════════════════════════════════════════

const GameDice = (() => {
    let die1Mesh, die2Mesh;
    let isRolling = false;
    let rollAnimation = null;
    const DICE_SIZE = 0.7;
    const BASE_Y = DICE_SIZE / 2 + 0.15;

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
        mesh.position.set(offsetX, BASE_Y, 0);
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

        const duration = 1500;
        const settleDuration = 420;
        const spinDuration = duration - settleDuration;
        const startTime = performance.now();
        let previousTime = startTime;
        let settleStart1 = null;
        let settleStart2 = null;

        const spinState1 = {
            velocityX: (18 + Math.random() * 5) * (Math.random() > 0.5 ? 1 : -1),
            velocityY: (11 + Math.random() * 4) * (Math.random() > 0.5 ? 1 : -1),
            velocityZ: (15 + Math.random() * 5) * (Math.random() > 0.5 ? 1 : -1)
        };
        const spinState2 = {
            velocityX: (17 + Math.random() * 5) * (Math.random() > 0.5 ? 1 : -1),
            velocityY: (12 + Math.random() * 4) * (Math.random() > 0.5 ? 1 : -1),
            velocityZ: (16 + Math.random() * 5) * (Math.random() > 0.5 ? 1 : -1)
        };

        const targetQuat1 = new THREE.Quaternion().setFromEuler(
            new THREE.Euler(FACE_ROTATIONS[value1].x, 0, FACE_ROTATIONS[value1].z, 'XYZ')
        );
        const targetQuat2 = new THREE.Quaternion().setFromEuler(
            new THREE.Euler(FACE_ROTATIONS[value2].x, 0, FACE_ROTATIONS[value2].z, 'XYZ')
        );

        if (rollAnimation) cancelAnimationFrame(rollAnimation);

        function animateRoll() {
            const now = performance.now();
            const elapsed = now - startTime;
            const deltaSeconds = Math.min((now - previousTime) / 1000, 0.05);
            previousTime = now;
            const progress = Math.min(elapsed / duration, 1);

            if (elapsed < spinDuration) {
                const spinProgress = elapsed / spinDuration;
                const damping = 0.992 - (spinProgress * 0.02);

                spinState1.velocityX *= damping;
                spinState1.velocityY *= damping;
                spinState1.velocityZ *= damping;
                spinState2.velocityX *= damping;
                spinState2.velocityY *= damping;
                spinState2.velocityZ *= damping;

                die1Mesh.rotation.x += spinState1.velocityX * deltaSeconds;
                die1Mesh.rotation.y += spinState1.velocityY * deltaSeconds;
                die1Mesh.rotation.z += spinState1.velocityZ * deltaSeconds;
                die2Mesh.rotation.x += spinState2.velocityX * deltaSeconds;
                die2Mesh.rotation.y += spinState2.velocityY * deltaSeconds;
                die2Mesh.rotation.z += spinState2.velocityZ * deltaSeconds;
            } else {
                if (!settleStart1) {
                    settleStart1 = die1Mesh.quaternion.clone();
                    settleStart2 = die2Mesh.quaternion.clone();
                }

                const settleProgress = Math.min((elapsed - spinDuration) / settleDuration, 1);
                const ease = 1 - Math.pow(1 - settleProgress, 3);

                THREE.Quaternion.slerp(settleStart1, targetQuat1, die1Mesh.quaternion, ease);
                THREE.Quaternion.slerp(settleStart2, targetQuat2, die2Mesh.quaternion, ease);
            }

            const bounce = Math.sin(progress * Math.PI) * (1.1 - (progress * 0.75));
            die1Mesh.position.y = BASE_Y + Math.max(0, bounce);
            die2Mesh.position.y = BASE_Y + Math.max(0, bounce * 0.86);

            if (progress < 1) {
                rollAnimation = requestAnimationFrame(animateRoll);
            } else {
                die1Mesh.quaternion.copy(targetQuat1);
                die2Mesh.quaternion.copy(targetQuat2);
                die1Mesh.position.y = BASE_Y;
                die2Mesh.position.y = BASE_Y;
                isRolling = false;
                if (onComplete) onComplete();
            }
        }

        rollAnimation = requestAnimationFrame(animateRoll);
    }

    function getIsRolling() { return isRolling; }

    return { init, roll, getIsRolling };
})();
