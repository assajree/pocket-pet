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

/** Reference tempo for NOTE_DURATION_MS (quarter note = one beat). */
export const NOTE_REFERENCE_BPM = 120;

/**
 * Note lengths in quarter-note beats (4/4). Quarter = 1 beat.
 * Dotted = 1.5× the base note value.
 */
export const NOTE_BEATS = Object.freeze({
  whole: 4,
  half: 2,
  quarter: 1,
  eighth: 1 / 2,
  sixteenth: 1 / 4,
  thirtySecond: 1 / 8,
  dottedWhole: 6,
  dottedHalf: 3,
  dottedQuarter: 3 / 2,
  dottedEighth: 3 / 4,
  dottedSixteenth: 3 / 8
});

const _quarterNoteMsAtRef = 60000 / NOTE_REFERENCE_BPM;

/** Note lengths in ms at NOTE_REFERENCE_BPM (for playSynthSequence `duration`). */
export const NOTE_DURATION_MS = Object.freeze({
  whole: _quarterNoteMsAtRef * NOTE_BEATS.whole,
  half: _quarterNoteMsAtRef * NOTE_BEATS.half,
  quarter: _quarterNoteMsAtRef * NOTE_BEATS.quarter,
  eighth: _quarterNoteMsAtRef * NOTE_BEATS.eighth,
  sixteenth: _quarterNoteMsAtRef * NOTE_BEATS.sixteenth,
  thirtySecond: _quarterNoteMsAtRef * NOTE_BEATS.thirtySecond,
  dottedWhole: _quarterNoteMsAtRef * NOTE_BEATS.dottedWhole,
  dottedHalf: _quarterNoteMsAtRef * NOTE_BEATS.dottedHalf,
  dottedQuarter: _quarterNoteMsAtRef * NOTE_BEATS.dottedQuarter,
  dottedEighth: _quarterNoteMsAtRef * NOTE_BEATS.dottedEighth,
  dottedSixteenth: _quarterNoteMsAtRef * NOTE_BEATS.dottedSixteenth
});

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

const NOTE_LETTER_TO_PC = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

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
      console.warn("Game synth audio is unavailable.", error);
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
  return oscillator;
};

const clampOctave = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return 3;
  }
  return Math.min(5, Math.max(1, Math.round(n)));
};

const parseNoteToMidi = (noteStr, octave) => {
  const raw = String(noteStr ?? "").trim().toLowerCase();
  if (!raw || raw === "-") {
    return null;
  }

  const letter = raw[0];
  const accidentals = raw.slice(1);
  const basePc = NOTE_LETTER_TO_PC[letter];
  if (basePc === undefined) {
    return null;
  }

  if (!/^[#b]*$/.test(accidentals)) {
    return null;
  }

  let delta = 0;
  for (const ch of accidentals) {
    delta += ch === "#" ? 1 : -1;
  }

  const pitchClass = ((basePc + delta) % 12 + 12) % 12;
  const o = clampOctave(octave);
  return 12 * (o + 1) + pitchClass;
};

const midiToFrequency = (midi) => 440 * 2 ** ((midi - 69) / 12);

/** See ../../documents/gameSynth.md for `playSynthSequence` and `NOTE_DURATION_MS`. */
export const createGameSynth = () => {
  /** @type {Map<string, OscillatorNode[]>} */
  const sequenceOscillatorsByKey = new Map();

  const stopSynthSequence = (key = "default") => {
    const context = ensureContext();
    const now = context ? context.currentTime : 0;
    if (key == null) {
      for (const oscillators of sequenceOscillatorsByKey.values()) {
        for (const oscillator of oscillators) {
          try {
            oscillator.stop(now);
          } catch {
            // already stopped
          }
        }
      }
      sequenceOscillatorsByKey.clear();
      return;
    }

    const keyStr = String(key);
    const oscillators = sequenceOscillatorsByKey.get(keyStr);
    if (!oscillators) {
      return;
    }
    for (const oscillator of oscillators) {
      try {
        oscillator.stop(now);
      } catch {
        // already stopped
      }
    }
    sequenceOscillatorsByKey.delete(keyStr);
  };

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

  const playSynthSequence = (notes, key = "default") => {
    if (!Array.isArray(notes) || notes.length === 0) {
      return;
    }

    const context = ensureContext();
    if (!context) {
      return;
    }

    if (context.state === "suspended") {
      unlock().then((didUnlock) => {
        if (didUnlock) {
          playSynthSequence(notes, key);
        }
      });
      return;
    }

    stopSynthSequence(key);
    const keyStr = String(key);
    const sequenceOscillators = [];
    sequenceOscillatorsByKey.set(keyStr, sequenceOscillators);

    let t = context.currentTime;
    for (const entry of notes) {
      const durationMs = entry.duration ?? NOTE_DURATION_MS.quarter;
      const stepSec = durationMs / 1000;
      const midi = parseNoteToMidi(entry.note, entry.octave);
      if (midi != null) {
        const frequency = midiToFrequency(midi);
        const oscillator = playTone(context, { frequency, durationMs, detune: 0 }, t);
        sequenceOscillators.push(oscillator);
      }
      t += stepSec;
    }
  };

  return {
    unlock,
    playButtonPress,
    playEvolutionCue,
    playSynthSequence,
    stopSynthSequence
  };
};
