export const DEFAULT_PET_ID = "classic";

const SHARED_VARIANTS = {
  attack: "pet-attack.svg",
  sick: "pet-sick.svg",
  angry: "pet-angy.svg",
  dead: "pet-dead.svg"
};

const PET_CATALOG = {
  [DEFAULT_PET_ID]: {
    stages: {
      Egg: {
        displaySize: 132,
        variants: {
          idle: "pet-egg.svg"
        }
      },
      Baby: {
        displaySize: 148,
        variants: {
          idle: "pet-baby.svg"
        }
      },
      Child: {
        displaySize: 148,
        variants: {
          idle: "pet-child.svg"
        }
      },
      Teen: {
        displaySize: 160,
        variants: {
          idle: "pet-teen.svg"
        }
      },
      Adult: {
        displaySize: 170,
        variants: {
          idle: "pet-adult.svg"
        }
      }
    }
  }
};

const pendingBundleLoads = new Map();

const getPetConfig = (petId) => PET_CATALOG[petId] || PET_CATALOG[DEFAULT_PET_ID];

const getStageCatalog = (petId, stage) => {
  const petConfig = getPetConfig(petId);
  return petConfig.stages[stage] || petConfig.stages.Child || PET_CATALOG[DEFAULT_PET_ID].stages.Child;
};

const getVariantFilename = (petId, stage, variant) => {
  const stageCatalog = getStageCatalog(petId, stage);
  return stageCatalog.variants[variant] || SHARED_VARIANTS[variant] || stageCatalog.variants.idle;
};

const getSharedTextureKey = (variant) => `pet:shared:${variant}`;

const getStageTextureKey = (petId, stage) => `pet:${petId}:${stage}:idle`;

const getTextureDescriptor = (petId, stage, variant) => {
  const filename = getVariantFilename(petId, stage, variant);
  const isShared = SHARED_VARIANTS[variant] === filename;

  return {
    key: isShared ? getSharedTextureKey(variant) : getStageTextureKey(petId, stage),
    url: `./assets/${filename}`
  };
};

const normalizeAssetStage = (petId, stage) => {
  const resolvedPetId = resolvePetId(petId);
  const petConfig = getPetConfig(resolvedPetId);
  if (petConfig.stages[stage]) {
    return stage;
  }

  return "Child";
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
  const variants = ["idle", "attack", "sick", "angry", "dead"];
  const textures = variants.map((variant) => getTextureDescriptor(resolvedPetId, resolvedStage, variant));

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
  const missingAssets = bundle.textures.filter((asset) => !scene.textures.exists(asset.key));

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
