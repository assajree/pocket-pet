const getAndroidBridge = () => {
  if (typeof window === "undefined") {
    return null;
  }

  if (window.PocketPetAndroidLink) {
    return window.PocketPetAndroidLink;
  }

  return window.Capacitor?.Plugins?.PocketPetAndroidLink || null;
};

export const isAndroidAppRuntime = () => !!getAndroidBridge();

export const getPlatformCapabilities = () => ({
  isAndroidApp: isAndroidAppRuntime(),
  supportsLink: true,
  prefersNativeLink: isAndroidAppRuntime()
});
