export const resolveEffectValue = (effectConfig, context = {}) => {
  if (typeof effectConfig === "function") {
    return effectConfig(context);
  }

  if (typeof effectConfig === "number") {
    return effectConfig;
  }

  if (effectConfig && typeof effectConfig === "object") {
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
