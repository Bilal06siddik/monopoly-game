// ═══════════════════════════════════════════════════════════
//  DICE — 3D animated dice with pip textures
// ═══════════════════════════════════════════════════════════

const GameDice = (() => {
    let die1Mesh, die2Mesh;
    let isRolling = false;
    let rollAnimation = null;
    const DICE_SIZE = 0.7;
    const BASE_Y = DICE_SIZE / 2 + 0.15;
    const ROLL_RADIUS = DICE_SIZE * 0.36;
    const THROW_START_Y = BASE_Y + 3.1;
    const THROW_START_Z = 0;
    const THROW_MIN_RADIUS = 3.7;
    const THROW_MAX_RADIUS = 5.2;
    const tempQuaternion = new THREE.Quaternion();
    const tempWobbleQuaternion = new THREE.Quaternion();
    const tempAxis = new THREE.Vector3();
    const tempPosition = new THREE.Vector3();
    const tempMotion = new THREE.Vector3();
    const DICE_TIMING_SCALE = 0.78;

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

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function lerp(start, end, amount) {
        return start + ((end - start) * amount);
    }

    function easeOutCubic(value) {
        return 1 - Math.pow(1 - value, 3);
    }

    function easeInOutCubic(value) {
        if (value < 0.5) return 4 * value * value * value;
        return 1 - (Math.pow(-2 * value + 2, 3) / 2);
    }

    function createTargetQuaternion(value) {
        return new THREE.Quaternion().setFromEuler(
            new THREE.Euler(FACE_ROTATIONS[value].x, 0, FACE_ROTATIONS[value].z, 'XYZ')
        );
    }

    function createLaunchQuaternion(directionX, directionZ) {
        const yaw = Math.atan2(directionX, directionZ);
        return new THREE.Quaternion().setFromEuler(
            new THREE.Euler(-0.34, yaw, directionX * 0.12, 'XYZ')
        );
    }

    function setQuadraticBezierPoint(out, start, control, end, t) {
        const inverse = 1 - t;
        out.set(
            (inverse * inverse * start.x) + (2 * inverse * t * control.x) + (t * t * end.x),
            (inverse * inverse * start.y) + (2 * inverse * t * control.y) + (t * t * end.y),
            (inverse * inverse * start.z) + (2 * inverse * t * control.z) + (t * t * end.z)
        );
        return out;
    }

    function applyAngularVelocity(mesh, angularVelocity, deltaSeconds, damping = 0.988) {
        const angle = angularVelocity.length() * deltaSeconds;
        if (angle <= 0.00001) return;

        tempAxis.copy(angularVelocity).normalize();
        tempQuaternion.setFromAxisAngle(tempAxis, angle);
        mesh.quaternion.premultiply(tempQuaternion);
        angularVelocity.multiplyScalar(Math.pow(damping, deltaSeconds * 60));
    }

    function applyRollingRotation(mesh, motionDelta, extraAngle = 0) {
        tempMotion.copy(motionDelta);
        tempMotion.y = 0;

        const distance = tempMotion.length();
        if (distance <= 0.00001) return;

        tempAxis.set(tempMotion.z, 0, -tempMotion.x).normalize();
        tempQuaternion.setFromAxisAngle(tempAxis, (distance / ROLL_RADIUS) + extraAngle);
        mesh.quaternion.premultiply(tempQuaternion);
    }

    function createRollState(mesh, value, laneDirection) {
        const startPosition = new THREE.Vector3(0, THROW_START_Y, THROW_START_Z);
        const windupDuration = (110 + (Math.random() * 35)) * DICE_TIMING_SCALE;
        const airDuration = (700 + (Math.random() * 90)) * DICE_TIMING_SCALE;
        const groundDuration = (880 + (Math.random() * 120)) * DICE_TIMING_SCALE;
        const settleDuration = (300 + (Math.random() * 60)) * DICE_TIMING_SCALE;
        const throwAngle = Math.random() * Math.PI * 2;
        const throwRadius = THROW_MIN_RADIUS + (Math.random() * (THROW_MAX_RADIUS - THROW_MIN_RADIUS));
        const directionX = Math.sin(throwAngle);
        const directionZ = Math.cos(throwAngle);
        const separationX = laneDirection * 0.34;
        const separationZ = laneDirection * 0.1;
        const finalPosition = new THREE.Vector3(
            (directionX * throwRadius) + separationX,
            BASE_Y,
            (directionZ * throwRadius) + separationZ
        );

        const windupPosition = new THREE.Vector3(
            startPosition.x - (directionX * 0.3) + (laneDirection * 0.12),
            THROW_START_Y + 0.24,
            startPosition.z - (directionZ * 0.3)
        );
        const impactPosition = new THREE.Vector3(
            finalPosition.x - (directionX * 0.7),
            BASE_Y,
            finalPosition.z - (directionZ * 1.45)
        );
        const apexPosition = new THREE.Vector3(
            lerp(windupPosition.x, impactPosition.x, 0.5),
            THROW_START_Y + 0.72 + (Math.random() * 0.28),
            lerp(windupPosition.z, impactPosition.z, 0.5) + (directionZ * 0.18)
        );
        const angularVelocity = new THREE.Vector3(
            (16 + (Math.random() * 4)) * (Math.random() > 0.5 ? 1 : -1),
            (12 + (Math.random() * 5)) * (Math.random() > 0.5 ? 1 : -1),
            (14 + (Math.random() * 4)) * (Math.random() > 0.5 ? 1 : -1)
        );
        const targetQuaternion = createTargetQuaternion(value);
        const tipAxis = new THREE.Vector3(
            (finalPosition.z - impactPosition.z) || 0.5,
            0,
            -(finalPosition.x - impactPosition.x) || laneDirection
        ).normalize();
        return {
            mesh,
            startPosition,
            windupPosition,
            apexPosition,
            impactPosition,
            finalPosition,
            launchQuaternion: createLaunchQuaternion(directionX, directionZ),
            laneDirection,
            windupDuration,
            airDuration,
            groundDuration,
            settleDuration,
            totalDuration: windupDuration + airDuration + groundDuration + settleDuration,
            angularVelocity,
            targetQuaternion,
            tipAxis,
            groundBounceHeight: 0.12 + (Math.random() * 0.05),
            targetBlendStartQuaternion: null,
            settleStartQuaternion: null,
            settleStartPosition: null,
            lastGroundPosition: impactPosition.clone(),
            hasLanded: false
        };
    }

    function animateDie(state, elapsed, deltaSeconds) {
        const { mesh } = state;
        const dieElapsed = Math.min(elapsed, state.totalDuration);
        const throwStart = state.windupDuration;
        const groundStart = state.windupDuration + state.airDuration;
        const settleStart = groundStart + state.groundDuration;

        if (dieElapsed < state.windupDuration) {
            const windupProgress = clamp(dieElapsed / state.windupDuration, 0, 1);
            const windupEase = easeOutCubic(windupProgress);
            mesh.position.x = lerp(state.startPosition.x, state.windupPosition.x, windupEase);
            mesh.position.y = lerp(state.startPosition.y, state.windupPosition.y, windupEase);
            mesh.position.z = lerp(state.startPosition.z, state.windupPosition.z, windupEase);

            tempQuaternion.setFromEuler(new THREE.Euler(
                -0.12 * windupEase,
                state.laneDirection * 0.1 * windupEase,
                state.laneDirection * 0.08 * windupEase,
                'XYZ'
            ));
            mesh.quaternion.copy(state.launchQuaternion).premultiply(tempQuaternion);
            mesh.scale.set(1, 1, 1);
            return;
        }

        if (dieElapsed < groundStart) {
            const airProgress = clamp((dieElapsed - throwStart) / state.airDuration, 0, 1);
            setQuadraticBezierPoint(
                tempPosition,
                state.windupPosition,
                state.apexPosition,
                state.impactPosition,
                airProgress
            );
            mesh.position.copy(tempPosition);
            applyAngularVelocity(mesh, state.angularVelocity, deltaSeconds, 0.989);
            mesh.scale.set(1, 1, 1);
            return;
        }

        if (dieElapsed < settleStart) {
            const groundProgress = clamp((dieElapsed - groundStart) / state.groundDuration, 0, 1);
            const easedProgress = easeOutCubic(groundProgress);
            const groundX = lerp(state.impactPosition.x, state.finalPosition.x, easedProgress);
            const groundZ = lerp(state.impactPosition.z, state.finalPosition.z, easedProgress);
            const hop = Math.abs(Math.sin(groundProgress * Math.PI * 1.9))
                * state.groundBounceHeight
                * Math.pow(1 - groundProgress, 1.95);

            tempPosition.set(groundX, BASE_Y + hop, groundZ);

            if (!state.hasLanded) {
                state.hasLanded = true;
                state.lastGroundPosition.copy(state.impactPosition);
            }

            tempMotion.copy(tempPosition).sub(state.lastGroundPosition);
            applyRollingRotation(mesh, tempMotion);
            applyAngularVelocity(mesh, state.angularVelocity, deltaSeconds * 0.22, 0.95);

            if (groundProgress >= 0.58) {
                if (!state.targetBlendStartQuaternion) {
                    state.targetBlendStartQuaternion = mesh.quaternion.clone();
                }

                const faceProgress = easeOutCubic((groundProgress - 0.58) / 0.42);
                THREE.Quaternion.slerp(
                    state.targetBlendStartQuaternion,
                    state.targetQuaternion,
                    tempQuaternion,
                    faceProgress
                );
                const rock = Math.sin(faceProgress * Math.PI * 2.6) * 0.05 * Math.pow(1 - faceProgress, 1.6);
                tempWobbleQuaternion.setFromAxisAngle(state.tipAxis, rock);
                mesh.quaternion.copy(tempQuaternion).premultiply(tempWobbleQuaternion);
            } else {
                state.targetBlendStartQuaternion = null;
            }

            mesh.position.copy(tempPosition);
            state.lastGroundPosition.copy(tempPosition);
            mesh.scale.set(1, 1, 1);
            return;
        }

        if (!state.settleStartQuaternion) {
            state.settleStartQuaternion = mesh.quaternion.clone();
            state.settleStartPosition = mesh.position.clone();
        }

        const settleProgress = clamp(
            (dieElapsed - settleStart) / state.settleDuration,
            0,
            1
        );
        const slideEase = easeOutCubic(settleProgress);
        const positionRock = Math.sin(settleProgress * Math.PI * 3) * 0.012 * (1 - settleProgress);

        mesh.position.x = lerp(state.settleStartPosition.x, state.finalPosition.x, slideEase);
        mesh.position.z = lerp(state.settleStartPosition.z, state.finalPosition.z, slideEase);
        mesh.position.y = Math.max(BASE_Y, BASE_Y + positionRock);
        THREE.Quaternion.slerp(
            state.settleStartQuaternion,
            state.targetQuaternion,
            tempQuaternion,
            easeInOutCubic(settleProgress)
        );
        const rock = Math.sin(settleProgress * Math.PI * 3.4) * 0.035 * Math.pow(1 - settleProgress, 1.7);
        tempWobbleQuaternion.setFromAxisAngle(state.tipAxis, rock);
        mesh.quaternion.copy(tempQuaternion).premultiply(tempWobbleQuaternion);

        mesh.scale.set(1, 1, 1);
    }

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
        mesh.position.set(0, THROW_START_Y, THROW_START_Z);
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

        const startTime = performance.now();
        let previousTime = startTime;
        const rollStates = [
            createRollState(die1Mesh, value1, -1),
            createRollState(die2Mesh, value2, 1)
        ];
        const duration = Math.max(...rollStates.map(state => state.totalDuration));

        rollStates.forEach(state => {
            state.mesh.position.copy(state.startPosition);
            state.mesh.quaternion.copy(state.launchQuaternion);
            state.mesh.scale.set(1, 1, 1);
        });

        if (rollAnimation) cancelAnimationFrame(rollAnimation);

        function animateRoll() {
            const now = performance.now();
            const elapsed = now - startTime;
            const deltaSeconds = Math.min((now - previousTime) / 1000, 0.05);
            previousTime = now;
            const progress = Math.min(elapsed / duration, 1);
            rollStates.forEach(state => animateDie(state, elapsed, deltaSeconds));

            if (progress < 1) {
                rollAnimation = requestAnimationFrame(animateRoll);
            } else {
                rollStates.forEach(state => {
                    state.mesh.quaternion.copy(state.targetQuaternion);
                    state.mesh.position.copy(state.finalPosition);
                    state.mesh.scale.set(1, 1, 1);
                });
                rollAnimation = null;
                isRolling = false;
                if (onComplete) onComplete();
            }
        }

        rollAnimation = requestAnimationFrame(animateRoll);
    }

    function getIsRolling() { return isRolling; }

    return { init, roll, getIsRolling };
})();
