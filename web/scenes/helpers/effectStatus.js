const hasNumber = (value) => typeof value === "number" && Number.isFinite(value);

const isScoreRangeConfig = (effectConfig) =>
  effectConfig &&
  typeof effectConfig === "object" &&
  hasNumber(effectConfig.min) &&
  hasNumber(effectConfig.max) &&
  hasNumber(effectConfig.minScore) &&
  hasNumber(effectConfig.maxScore);

const resolveScoreRangeValue = (effectConfig, context = {}) => {
  const score = hasNumber(context.score) ? context.score : 0;
  const { min, max, minScore, maxScore } = effectConfig;

  if (score < minScore) {
    return min;
  }

  if (score >= maxScore) {
    return max;
  }

  if (minScore === maxScore) {
    return min;
  }

  const progress = (score - minScore) / (maxScore - minScore);
  return Math.round(min + (max - min) * progress);
};

export const resolveEffectValue = (effectConfig, context = {}) => {
  if (typeof effectConfig === "function") {
    return effectConfig(context);
  }

  if (typeof effectConfig === "number") {
    return effectConfig;
  }

  if (effectConfig && typeof effectConfig === "object") {
    if (isScoreRangeConfig(effectConfig)) {
      return resolveScoreRangeValue(effectConfig, context);
    }

    if (typeof effectConfig.value === "function") {
      return effectConfig.value(context);
    }

    if (typeof effectConfig.value === "number") {
      return effectConfig.value;
    }
  }

  return 0;
};

export const resolveEffectStatus = (effectStatus, context = {}) => {
  if (!effectStatus || typeof effectStatus !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(effectStatus)
      .map(([stat, effectConfig]) => [stat, resolveEffectValue(effectConfig, context)])
      .filter(([, value]) => typeof value === "number" && Number.isFinite(value) && value !== 0)
  );
};
