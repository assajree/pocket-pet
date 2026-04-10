export const DEFAULT_PET_ID = "classic";

const FALLBACK_STAGE = "child";
const VARIANT_ORDER = ["idle", "attack", "sick", "angry", "dead"];

const createClassicStage = (displaySize, variants = VARIANT_ORDER, options = {}) => ({
  displaySize,
  variants,
  assetStage: options.assetStage || null
});

const PET_CATALOG = {
  [DEFAULT_PET_ID]: {
    stages: {
      egg: createClassicStage(132, ["idle"]),
      baby: createClassicStage(148, VARIANT_ORDER, { assetStage: "child" }),
      child: createClassicStage(148),
      teen: createClassicStage(160, VARIANT_ORDER, { assetStage: "child" }),
      adult: createClassicStage(170, VARIANT_ORDER, { assetStage: "child" })
    }
  },
  specie1: {
    stages: {
      teen: createClassicStage(160, ["idle"])
    }
  },
  specie2: {
    stages: {
      teen: createClassicStage(160, ["idle"])
    }
  }
};

const pendingBundleLoads = new Map();

const getPetConfig = (petId) => PET_CATALOG[petId] || PET_CATALOG[DEFAULT_PET_ID];

const normalizeStageName = (stage) => String(stage || "").trim().toLowerCase();

const getStageCatalog = (petId, stage) => {
  const petConfig = getPetConfig(petId);
  return petConfig.stages[stage]
    || petConfig.stages[FALLBACK_STAGE]
    || PET_CATALOG[DEFAULT_PET_ID].stages[FALLBACK_STAGE];
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
  return !!petConfig.stages?.[stage]?.variants?.includes(variant);
};

const buildAssetUrl = (petId, stage, variant) => `./assets/pet/${petId}/${stage}/${variant}.svg`;

const buildTextureKey = (petId, stage, variant) => `pet:${petId}:${stage}:${variant}`;

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
      const key = `${candidate.petId}:${candidate.stage}:${candidate.variant}`;
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

export const getPetTextureKey = ({ petId, stage, variant = "idle" }) =>
  getTextureDescriptor(resolvePetId(petId), normalizeAssetStage(petId, stage), variant).key;

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
