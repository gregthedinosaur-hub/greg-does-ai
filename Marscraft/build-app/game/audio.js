// The sub-bass drone (design 11): 40 + 42Hz plus a 110Hz harmonic (laptop speakers can't reproduce 40Hz)
// -> lowpass -> gain. It swells on each heartbeat and cuts out in the pre-wave silence.
// Pitch rises 0.1Hz per Bloom point (design 11).
// ponytail: no Foundry weapon clicks yet
let context;
let gain;
let muted = false;
const drones = [];
// Runs on the Launch click, because browsers only unlock audio on a user gesture.
export function startAudio() {
    if (context) {
        void context.resume();
        return;
    }
    try {
        context = new AudioContext();
        gain = context.createGain();
        gain.gain.value = 0;
        const lowpass = context.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.value = 180;
        lowpass.connect(gain).connect(context.destination);
        for (const [frequency, level] of [[40, 1], [42, 1], [110, 0.3]]) {
            const oscillator = context.createOscillator();
            const oscillatorGain = context.createGain();
            oscillator.frequency.value = frequency;
            oscillatorGain.gain.value = level;
            oscillator.connect(oscillatorGain).connect(lowpass);
            oscillator.start();
            if (frequency < 100)
                drones.push(oscillator);
        }
    }
    catch {
        context = undefined; // no WebAudio: the seismograph still carries the silence
    }
}
export function setMuted(value) {
    muted = value;
}
export function isMuted() {
    return muted;
}
// Called every frame with sim time, so pausing freezes the beat.
export function updateAudio({ silent, heartbeatMs, timeMs, bloom }) {
    if (!context || !gain)
        return;
    drones.forEach((oscillator, i) => oscillator.frequency.setTargetAtTime(40 + 2 * i + 0.1 * bloom, context.currentTime, 0.5));
    const phase = (timeMs % heartbeatMs) / heartbeatMs;
    const beat = phase < 0.15 ? 1 - phase / 0.15 : 0;
    const level = silent || muted ? 0 : 0.18 + 0.12 * beat;
    gain.gain.setTargetAtTime(level, context.currentTime, silent ? 0.25 : 0.05);
}
