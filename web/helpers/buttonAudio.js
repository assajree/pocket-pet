const BUTTON_TONE_CONFIG = {
  left: { frequency: 622, durationMs: 48, detune: -8 },
  right: { frequency: 698, durationMs: 52, detune: 4 },
  cancel: { frequency: 554, durationMs: 64, detune: -18 },
  ok: { frequency: 740, durationMs: 58, detune: 10 }
};

const MASTER_GAIN = 0.035;
const OSCILLATOR_TYPE = "square";
const EVOLUTION_MASTER_GAIN = 0.028;
const EVOLUTION_NOTE_GAP_SECONDS = 0.02;
const EVOLUTION_STAGE_PATTERN = [
  { frequency: 523.25, durationMs: 80, detune: -2, gain: 0.75 },
  { frequency: 659.25, durationMs: 85, detune: 1, gain: 0.95 },
  { frequency: 783.99, durationMs: 110, detune: 3, gain: 1.1 }
];
const HATCH_STAGE_PATTERN = [
  { frequency: 392, durationMs: 70, detune: -5, gain: 0.7 },
  { frequency: 523.25, durationMs: 80, detune: -1, gain: 0.9 },
  { frequency: 659.25, durationMs: 120, detune: 4, gain: 1.05 }
];
const AudioContextCtor =
  typeof window === "undefined" ? null : window.AudioContext || window.webkitAudioContext;

const getButtonToneConfig = (button) => BUTTON_TONE_CONFIG[button] || BUTTON_TONE_CONFIG.ok;
let audioContext = null;
let supported = typeof AudioContextCtor === "function";
let lastButtonTriggerAt = 0;

const ensureContext = () => {
  if (!supported) {
    return null;
  }

  if (!audioContext) {
    try {
      audioContext = new AudioContextCtor();
    } catch (error) {
      supported = false;
      console.warn("Button audio is unavailable.", error);
      return null;
    }
  }

  return audioContext;
};

const unlockContext = () => {
  const context = ensureContext();
  if (!context) {
    return Promise.resolve(false);
  }

  if (context.state !== "suspended") {
    return Promise.resolve(true);
  }

  return context.resume().then(
    () => true,
    () => false
  );
};

const playTone = (context, config, startTime, masterGain = MASTER_GAIN) => {
  const oscillator = context.createOscillator();
  const gainNode = context.createGain();
  const filterNode = context.createBiquadFilter();
  const endTime = startTime + config.durationMs / 1000;

  oscillator.type = OSCILLATOR_TYPE;
  oscillator.frequency.setValueAtTime(config.frequency, startTime);
  oscillator.detune.setValueAtTime(config.detune || 0, startTime);

  filterNode.type = "lowpass";
  filterNode.frequency.setValueAtTime(2200, startTime);
  filterNode.Q.setValueAtTime(0.6, startTime);

  gainNode.gain.setValueAtTime(0.0001, startTime);
  gainNode.gain.exponentialRampToValueAtTime(masterGain * (config.gain || 1), startTime + 0.004);
  gainNode.gain.exponentialRampToValueAtTime(0.001, endTime);

  oscillator.connect(filterNode);
  filterNode.connect(gainNode);
  gainNode.connect(context.destination);

  oscillator.start(startTime);
  oscillator.stop(endTime + 0.01);
};

export const createButtonAudio = () => {
  const unlock = () => {
    return unlockContext();
  };

  const playButtonPress = (button) => {
    const context = ensureContext();
    if (!context) {
      return;
    }

    if (context.state === "suspended") {
      unlock().then((didUnlock) => {
        if (didUnlock) {
          playButtonPress(button);
        }
      });
      return;
    }

    const now = context.currentTime;
    const elapsedMs = (now - lastButtonTriggerAt) * 1000;
    if (elapsedMs > 0 && elapsedMs < 12) {
      return;
    }
    lastButtonTriggerAt = now;

    const tone = getButtonToneConfig(button);
    playTone(context, tone, now);
  };

  const playEvolutionCue = (previousStage) => {
    const context = ensureContext();
    if (!context) {
      return;
    }

    if (context.state === "suspended") {
      unlock().then((didUnlock) => {
        if (didUnlock) {
          playEvolutionCue(previousStage);
        }
      });
      return;
    }

    const sequence = previousStage === "egg" ? HATCH_STAGE_PATTERN : EVOLUTION_STAGE_PATTERN;
    let nextStartTime = context.currentTime;
    sequence.forEach((tone) => {
      playTone(context, tone, nextStartTime, EVOLUTION_MASTER_GAIN);
      nextStartTime += tone.durationMs / 1000 + EVOLUTION_NOTE_GAP_SECONDS;
    });
  };

  return {
    unlock,
    playButtonPress,
    playEvolutionCue
  };
};
