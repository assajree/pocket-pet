const BUTTON_TONE_CONFIG = {
  left: { frequency: 622, durationMs: 48, detune: -8 },
  right: { frequency: 698, durationMs: 52, detune: 4 },
  cancel: { frequency: 554, durationMs: 64, detune: -18 },
  ok: { frequency: 740, durationMs: 58, detune: 10 }
};

const MASTER_GAIN = 0.035;
const OSCILLATOR_TYPE = "square";
const AudioContextCtor =
  typeof window === "undefined" ? null : window.AudioContext || window.webkitAudioContext;

const getButtonToneConfig = (button) => BUTTON_TONE_CONFIG[button] || BUTTON_TONE_CONFIG.ok;

export const createButtonAudio = () => {
  let audioContext = null;
  let supported = typeof AudioContextCtor === "function";
  let lastTriggerAt = 0;

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

  const unlock = () => {
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
    const elapsedMs = (now - lastTriggerAt) * 1000;
    if (elapsedMs > 0 && elapsedMs < 12) {
      return;
    }
    lastTriggerAt = now;

    const tone = getButtonToneConfig(button);
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();
    const filterNode = context.createBiquadFilter();
    const endTime = now + tone.durationMs / 1000;

    oscillator.type = OSCILLATOR_TYPE;
    oscillator.frequency.setValueAtTime(tone.frequency, now);
    oscillator.detune.setValueAtTime(tone.detune, now);

    filterNode.type = "lowpass";
    filterNode.frequency.setValueAtTime(2200, now);
    filterNode.Q.setValueAtTime(0.6, now);

    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.exponentialRampToValueAtTime(MASTER_GAIN, now + 0.004);
    gainNode.gain.exponentialRampToValueAtTime(0.001, endTime);

    oscillator.connect(filterNode);
    filterNode.connect(gainNode);
    gainNode.connect(context.destination);

    oscillator.start(now);
    oscillator.stop(endTime + 0.01);
  };

  return {
    unlock,
    playButtonPress
  };
};
