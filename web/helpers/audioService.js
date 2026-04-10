const clampInt = (value, min, max, fallback) => {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  const rounded = Math.round(n);
  return Math.min(max, Math.max(min, rounded));
};

const clamp01 = (value) => Math.min(1, Math.max(0, value));

const buildPhaserPlayConfig = (config) => {
  const out = {};
  if (config.loop != null) out.loop = !!config.loop;
  if (config.rate != null) out.rate = Number(config.rate);
  if (config.detune != null) out.detune = Number(config.detune);
  if (config.seek != null) out.seek = Number(config.seek);
  if (config.delay != null) out.delay = Number(config.delay);
  return out;
};

/**
 * Create an audio helper for a Phaser.Scene.
 *
 * Volumes are expressed as integer 0-100 (inclusive) and normalized to 0-1 for Phaser.
 */
export const createAudioService = (scene, { masterVolume = 70 } = {}) => {
  let master = clampInt(masterVolume, 0, 100, 70);

  const canPlay = (assetKey) => {
    if (!scene?.sound || scene.sound.lock) {
      return false;
    }
    if (!assetKey) {
      return false;
    }
    const key = String(assetKey);
    return !!scene.cache?.audio?.exists?.(key);
  };

  const getMasterVolume = () => master;
  const setMasterVolume = (value) => {
    master = clampInt(value, 0, 100, master);
    return master;
  };

  const stop = (assetKey) => {
    if (!scene?.sound || !assetKey) {
      return;
    }
    const key = String(assetKey);
    scene.sound.stopByKey?.(key);
  };

  const stopAll = () => {
    scene?.sound?.stopAll?.();
  };

  const play = (assetKey, opts = {}) => {
    if (!canPlay(assetKey)) {
      return false;
    }

    const key = String(assetKey);
    const perCall = clampInt(opts.volume, 0, 100, 100);
    const finalVolume = clamp01(master / 100) * clamp01(perCall / 100);

    const stopPrevious = opts.stopPrevious !== false;
    if (stopPrevious) {
      scene.sound.stopByKey?.(key);
    }

    const config = buildPhaserPlayConfig(opts);
    config.volume = finalVolume;

    try {
      return !!scene.sound.play(key, config);
    } catch {
      return false;
    }
  };

  return {
    play,
    stop,
    stopAll,
    getMasterVolume,
    setMasterVolume
  };
};

