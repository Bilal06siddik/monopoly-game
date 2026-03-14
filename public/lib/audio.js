// ═══════════════════════════════════════════════════════════
//  AUDIO — Lightweight UI and dice SFX via Web Audio
// ═══════════════════════════════════════════════════════════

const GameAudio = (() => {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    const unlockEvents = ['pointerdown', 'keydown', 'touchstart'];
    let audioContext = null;
    let noiseBuffer = null;
    let unlockListenersAttached = false;

    function getContext() {
        if (!AudioContextCtor) return null;
        if (!audioContext) {
            audioContext = new AudioContextCtor();
        }
        return audioContext;
    }

    function attachUnlockListeners() {
        if (unlockListenersAttached || !AudioContextCtor) return;
        unlockListenersAttached = true;
        unlockEvents.forEach(eventName => {
            window.addEventListener(eventName, unlockAudioFromGesture, { passive: true });
        });
    }

    function detachUnlockListeners() {
        if (!unlockListenersAttached) return;
        unlockListenersAttached = false;
        unlockEvents.forEach(eventName => {
            window.removeEventListener(eventName, unlockAudioFromGesture);
        });
    }

    async function unlockAudioFromGesture() {
        const ctx = await prime();
        if (ctx?.state === 'running') {
            detachUnlockListeners();
        }
    }

    function createNoiseBuffer(ctx) {
        const durationSeconds = 0.8;
        const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * durationSeconds), ctx.sampleRate);
        const channel = buffer.getChannelData(0);
        for (let i = 0; i < channel.length; i += 1) {
            channel[i] = (Math.random() * 2 - 1) * 0.9;
        }
        return buffer;
    }

    async function prime() {
        const ctx = getContext();
        if (!ctx) return null;

        if (ctx.state === 'suspended') {
            try {
                await ctx.resume();
            } catch (error) {
                return ctx;
            }
        }

        if (!noiseBuffer) {
            noiseBuffer = createNoiseBuffer(ctx);
        }

        if (ctx.state === 'running') {
            detachUnlockListeners();
        }

        return ctx;
    }

    function scheduleTone(ctx, options) {
        const {
            startTime,
            frequency,
            glideTo = null,
            type = 'sine',
            duration = 0.2,
            gain = 0.07,
            attack = 0.01,
            release = 0.18,
            destination = ctx.destination
        } = options;

        const oscillator = ctx.createOscillator();
        const amp = ctx.createGain();

        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, startTime);
        if (glideTo) {
            oscillator.frequency.exponentialRampToValueAtTime(Math.max(glideTo, 1), startTime + duration);
        }

        amp.gain.setValueAtTime(0.0001, startTime);
        amp.gain.linearRampToValueAtTime(gain, startTime + attack);
        amp.gain.exponentialRampToValueAtTime(0.0001, startTime + duration + release);

        oscillator.connect(amp);
        amp.connect(destination);

        oscillator.start(startTime);
        oscillator.stop(startTime + duration + release + 0.05);
    }

    function scheduleNoiseBurst(ctx, options) {
        const {
            startTime,
            duration = 0.1,
            gain = 0.05,
            fromFrequency = 2200,
            toFrequency = 600,
            q = 1.2,
            destination = ctx.destination
        } = options;

        const source = ctx.createBufferSource();
        const filter = ctx.createBiquadFilter();
        const amp = ctx.createGain();

        source.buffer = noiseBuffer || createNoiseBuffer(ctx);
        filter.type = 'bandpass';
        filter.Q.value = q;
        filter.frequency.setValueAtTime(fromFrequency, startTime);
        filter.frequency.exponentialRampToValueAtTime(Math.max(toFrequency, 120), startTime + duration);

        amp.gain.setValueAtTime(0.0001, startTime);
        amp.gain.linearRampToValueAtTime(gain, startTime + 0.012);
        amp.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

        source.connect(filter);
        filter.connect(amp);
        amp.connect(destination);

        source.start(startTime);
        source.stop(startTime + duration + 0.03);
    }

    function playDiceRoll({ isDoubles = false } = {}) {
        prime().then(ctx => {
            if (!ctx || ctx.state !== 'running') return;

            const now = ctx.currentTime + 0.02;
            const master = ctx.createGain();
            master.gain.value = isDoubles ? 0.95 : 0.82;
            master.connect(ctx.destination);

            [0, 0.055, 0.11, 0.165].forEach((offset, index) => {
                scheduleNoiseBurst(ctx, {
                    startTime: now + offset,
                    duration: 0.085,
                    gain: 0.048 - (index * 0.004),
                    fromFrequency: 2300 - (index * 180),
                    toFrequency: 780 - (index * 90),
                    q: 1.4,
                    destination: master
                });
            });

            scheduleTone(ctx, {
                startTime: now + 0.025,
                frequency: 180,
                glideTo: 118,
                type: 'triangle',
                duration: 0.12,
                gain: 0.032,
                release: 0.12,
                destination: master
            });

            scheduleTone(ctx, {
                startTime: now + 0.18,
                frequency: 122,
                glideTo: 84,
                type: 'triangle',
                duration: 0.18,
                gain: 0.026,
                release: 0.16,
                destination: master
            });

            if (isDoubles) {
                scheduleTone(ctx, {
                    startTime: now + 0.28,
                    frequency: 784,
                    glideTo: 988,
                    type: 'square',
                    duration: 0.09,
                    gain: 0.018,
                    release: 0.1,
                    destination: master
                });
            }
        });
    }

    function playTurnAlert() {
        prime().then(ctx => {
            if (!ctx || ctx.state !== 'running') return;

            const now = ctx.currentTime + 0.01;
            const master = ctx.createGain();
            master.gain.value = 0.72;
            master.connect(ctx.destination);

            [
                { time: 0, freq: 523.25, gain: 0.05 },
                { time: 0.12, freq: 659.25, gain: 0.048 },
                { time: 0.24, freq: 783.99, gain: 0.045 }
            ].forEach(note => {
                scheduleTone(ctx, {
                    startTime: now + note.time,
                    frequency: note.freq,
                    glideTo: note.freq * 1.05,
                    type: 'triangle',
                    duration: 0.11,
                    gain: note.gain,
                    attack: 0.008,
                    release: 0.16,
                    destination: master
                });
            });

            scheduleTone(ctx, {
                startTime: now + 0.34,
                frequency: 1046.5,
                type: 'sine',
                duration: 0.2,
                gain: 0.026,
                attack: 0.02,
                release: 0.2,
                destination: master
            });
        });
    }

    function init() {
        if (!AudioContextCtor) return;
        attachUnlockListeners();
        getContext();
    }

    return {
        init,
        prime,
        playDiceRoll,
        playTurnAlert
    };
})();
