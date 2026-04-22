export const DEFAULT_PET_ID = "classic";
export const PET_RPG_STAT_KEYS = ["str", "agi", "vit", "dex", "luck"];

const FALLBACK_STAGE = "child";
const VARIANT_ORDER = ["idle", "attack", "sick", "angry", "dead"];
const PET_ELEMENT_ORDER = ["neutral", "water", "earth", "fire", "wind", "poison", "holy", "shadow", "ghost", "undead"];
const PET_ELEMENT_LABELS = Object.fromEntries(
  PET_ELEMENT_ORDER.map((element) => [element, element.charAt(0).toUpperCase() + element.slice(1)])
);
const DEFAULT_PET_ELEMENT = "neutral";

const createClassicStage = (displaySize, variants = VARIANT_ORDER, options = {}) => ({
  displaySize,
  variants,
  assetStage: options.assetStage || null
});

const createBaseStats = (stats = {}) =>
  Object.fromEntries(
    PET_RPG_STAT_KEYS.map((stat) => [stat, Number.isFinite(stats?.[stat]) ? stats[stat] : 0])
  );

export const PET_CATALOG = {
  egg: {
    specieName: "Egg",
    defenseElement: "neutral",
    attackElement: "neutral",
    battleBulletVariant: "idle",
    baseStats: createBaseStats(),
    ...createClassicStage(132, ["idle"])
  },
  [DEFAULT_PET_ID]: {
    specieName: "Classic",
    defenseElement: "neutral",
    attackElement: "neutral",
    battleBulletVariant: "attack",
    baseStats: createBaseStats({
      str: 5,
      agi: 5,
      vit: 5,
      dex: 5,
      luck: 5
    }),
    ...createClassicStage(160, VARIANT_ORDER)
  },
  specie1: {
    specieName: "Octopus",
    defenseElement: "water",
    attackElement: "water",
    battleBulletVariant: "attack",
    baseStats: createBaseStats({
      str: 6,
      agi: 5,
      vit: 5,
      dex: 7,
      luck: 6
    }),
    ...createClassicStage(160, ["idle"])
  },
  specie2: {
    specieName: "Robot",
    defenseElement: "shadow",
    attackElement: "shadow",
    battleBulletVariant: "attack",
    baseStats: createBaseStats({
      str: 7,
      agi: 6,
      vit: 7,
      dex: 5,
      luck: 5
    }),
    ...createClassicStage(160, ["idle"])
  }
};

const pendingBundleLoads = new Map();

const getPetConfig = (petId) => PET_CATALOG[petId] || PET_CATALOG[DEFAULT_PET_ID];

const normalizeStageName = (stage) => String(stage || "").trim().toLowerCase();
const isValidPetElement = (element) => PET_ELEMENT_ORDER.includes(element);
const normalizePetElement = (element) => (isValidPetElement(element) ? element : DEFAULT_PET_ELEMENT);

const getStageCatalog = (petId, stage) => {
  const petConfig = getPetConfig(petId);
  if (petConfig.stages) {
    return petConfig.stages[stage]
      || petConfig.stages[FALLBACK_STAGE]
      || PET_CATALOG[DEFAULT_PET_ID].stages[FALLBACK_STAGE];
  }
  return petConfig;
};

const getResolvedAssetStage = (petId, stage) => {
  const stageConfig = getStageCatalog(petId, stage);
  const configuredAssetStage = normalizeStageName(stageConfig.assetStage);

  if (configuredAssetStage) {
    return configuredAssetStage;
  }

  const normalizedStage = normalizeStageName(stage);
  return normalizedStage || FALLBACK_STAGE;
};

const hasVariant = (petId, stage, variant) => {
  const petConfig = getPetConfig(petId);
  if (petConfig.stages) {
    return !!petConfig.stages?.[stage]?.variants?.includes(variant);
  }
  return !!petConfig.variants?.includes(variant);
};

const buildAssetUrl = (petId, stage, variant) => {
  const petConfig = getPetConfig(petId);
  if (petConfig.stages) {
    return `./assets/pet/${petId}/${stage}/${variant}.svg`;
  }
  return `./assets/pet/${petId}/${variant}.svg`;
};

const buildTextureKey = (petId, stage, variant) => {
  const petConfig = getPetConfig(petId);
  if (petConfig.stages) {
    return `pet:${petId}:${stage}:${variant}`;
  }
  return `pet:${petId}:${variant}`;
};

const getTextureCandidateDescriptors = (petId, stage, variant) => {
  const resolvedPetId = PET_CATALOG[petId] ? petId : DEFAULT_PET_ID;
  const resolvedStage = normalizeStageName(stage);
  const resolvedVariant = VARIANT_ORDER.includes(variant) ? variant : "idle";
  const candidates = [
    { petId: resolvedPetId, stage: resolvedStage, variant: resolvedVariant },
    { petId: resolvedPetId, stage: resolvedStage, variant: "idle" },
    { petId: DEFAULT_PET_ID, stage: resolvedStage, variant: resolvedVariant },
    { petId: DEFAULT_PET_ID, stage: resolvedStage, variant: "idle" },
    { petId: DEFAULT_PET_ID, stage: FALLBACK_STAGE, variant: resolvedVariant },
    { petId: DEFAULT_PET_ID, stage: FALLBACK_STAGE, variant: "idle" }
  ];
  const seen = new Set();

  return candidates
    .filter((candidate) => {
      const key = buildTextureKey(candidate.petId, candidate.stage, candidate.variant);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return hasVariant(candidate.petId, candidate.stage, candidate.variant);
    })
    .map((candidate) => ({
      ...candidate,
      key: buildTextureKey(candidate.petId, candidate.stage, candidate.variant),
      url: buildAssetUrl(candidate.petId, candidate.stage, candidate.variant)
    }));
};

const getTextureDescriptor = (petId, stage, variant) => {
  const descriptors = getTextureCandidateDescriptors(petId, stage, variant);
  return descriptors[0] || {
    petId: DEFAULT_PET_ID,
    stage: FALLBACK_STAGE,
    variant: "idle",
    key: buildTextureKey(DEFAULT_PET_ID, FALLBACK_STAGE, "idle"),
    url: buildAssetUrl(DEFAULT_PET_ID, FALLBACK_STAGE, "idle")
  };
};

const normalizeAssetStage = (petId, stage) => {
  const resolvedPetId = resolvePetId(petId);
  const normalizedStage = normalizeStageName(stage);
  const petConfig = getPetConfig(resolvedPetId);

  if (!petConfig.stages) {
    return normalizedStage || FALLBACK_STAGE;
  }

  if (petConfig.stages[normalizedStage]) {
    return getResolvedAssetStage(resolvedPetId, normalizedStage);
  }

  return FALLBACK_STAGE;
};

const loadAssets = (scene, assets) => new Promise((resolve, reject) => {
  if (!assets.length) {
    resolve();
    return;
  }

  const failedKeys = [];
  const handleFileError = (file) => {
    failedKeys.push(file?.key || "unknown");
  };
  const cleanup = () => {
    scene.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, handleFileError);
    scene.load.off(Phaser.Loader.Events.COMPLETE, handleComplete);
  };
  const handleComplete = () => {
    cleanup();
    if (failedKeys.length) {
      reject(new Error(`Failed to load pet assets: ${failedKeys.join(", ")}`));
      return;
    }
    resolve();
  };

  scene.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, handleFileError);
  scene.load.once(Phaser.Loader.Events.COMPLETE, handleComplete);
  assets.forEach((asset) => {
    scene.load.image(asset.key, asset.url);
  });
  scene.load.start();
});

export const resolvePetId = (petId) => (PET_CATALOG[petId] ? petId : DEFAULT_PET_ID);

export const getPetDisplaySize = (petId, stage) => getStageCatalog(resolvePetId(petId), normalizeAssetStage(petId, stage)).displaySize;

export const getPetDefenseElement = (petId) =>
  normalizePetElement(getPetConfig(resolvePetId(petId)).defenseElement);

export const getPetDefaultAttackElement = (petId) => {
  const petConfig = getPetConfig(resolvePetId(petId));
  return normalizePetElement(petConfig.attackElement || petConfig.defenseElement);
};

export const getPetBaseStats = (petId) => {
  const petConfig = getPetConfig(resolvePetId(petId));
  return createBaseStats(petConfig.baseStats);
};

const getAttackElementExpiry = (state) =>
  typeof state?.attackElementExpiresAt === "number" && Number.isFinite(state.attackElementExpiresAt)
    ? state.attackElementExpiresAt
    : 0;

export const getPetAttackElement = (state, now = Date.now()) => {
  const defaultAttackElement = getPetDefaultAttackElement(state?.petId);
  const activeElement = isValidPetElement(state?.attackElement) ? state.attackElement : "";
  const expiresAt = getAttackElementExpiry(state);

  if (!activeElement || !expiresAt || expiresAt <= now) {
    return defaultAttackElement;
  }

  return activeElement;
};

export const getPetAttackElementRemainingSeconds = (state, now = Date.now()) => {
  const expiresAt = getAttackElementExpiry(state);
  if (!expiresAt || expiresAt <= now || !isValidPetElement(state?.attackElement)) {
    return 0;
  }

  return Math.max(0, Math.ceil((expiresAt - now) / 1000));
};

export const getPetCombatElements = (state, now = Date.now()) => ({
  attackElement: getPetAttackElement(state, now),
  defenseElement: getPetDefenseElement(state?.petId),
  defaultAttackElement: getPetDefaultAttackElement(state?.petId),
  attackElementRemainingSeconds: getPetAttackElementRemainingSeconds(state, now)
});

export const getPetElement = (petId) => getPetDefenseElement(petId);

export const formatPetElementLabel = (element) => PET_ELEMENT_LABELS[element] || PET_ELEMENT_LABELS.neutral;

export const PET_ELEMENTS = PET_ELEMENT_ORDER;

export const getPetTextureKey = ({ petId, stage, variant = "idle" }) =>
  getTextureDescriptor(resolvePetId(petId), normalizeAssetStage(petId, stage), variant).key;

export const getPetBattleBulletTextureKey = ({ petId, stage }) => {
  const resolvedPetId = resolvePetId(petId);
  const petConfig = getPetConfig(resolvedPetId);
  const variant = petConfig.battleBulletVariant || "attack";
  return getPetTextureKey({ petId: resolvedPetId, stage, variant });
};

export const getPetStageAssetBundle = (petId, stage) => {
  const resolvedPetId = resolvePetId(petId);
  const resolvedStage = normalizeAssetStage(resolvedPetId, stage);
  const textures = VARIANT_ORDER.map((variant) => getTextureDescriptor(resolvedPetId, resolvedStage, variant));

  return {
    petId: resolvedPetId,
    stage: resolvedStage,
    displaySize: getPetDisplaySize(resolvedPetId, resolvedStage),
    textures
  };
};

export const ensurePetStageAssetsLoaded = (scene, petId, stage) => {
  const bundle = getPetStageAssetBundle(petId, stage);
  const bundleKey = `${bundle.petId}:${bundle.stage}`;
  const missingAssets = bundle.textures
    .filter((asset) => !scene.textures.exists(asset.key))
    .filter((asset, index, assets) => assets.findIndex((entry) => entry.key === asset.key) === index);

  if (!missingAssets.length) {
    return Promise.resolve(bundle);
  }

  if (pendingBundleLoads.has(bundleKey)) {
    return pendingBundleLoads.get(bundleKey);
  }

  const pendingLoad = loadAssets(scene, missingAssets)
    .then(() => bundle)
    .finally(() => {
      pendingBundleLoads.delete(bundleKey);
    });

  pendingBundleLoads.set(bundleKey, pendingLoad);
  return pendingLoad;
};
