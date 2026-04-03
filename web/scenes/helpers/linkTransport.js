const getAndroidBridge = () => {
  if (typeof window === "undefined") {
    return null;
  }

  if (window.PocketPetAndroidLink) {
    return window.PocketPetAndroidLink;
  }

  return window.Capacitor?.Plugins?.PocketPetAndroidLink || null;
};

const parseBridgePayload = (payload) => {
  if (typeof payload === "string") {
    return JSON.parse(payload);
  }

  return payload && typeof payload === "object" ? payload : {};
};

const callAndroidBridge = async (method, payload = {}) => {
  const bridge = getAndroidBridge();
  if (!bridge || typeof bridge[method] !== "function") {
    throw new Error("Link is only available in the Android app.");
  }

  const response = await bridge[method](payload);
  const data = parseBridgePayload(response);
  if (data.ok === false) {
    const error = new Error(data.message || "Android link request failed.");
    error.payload = data;
    throw error;
  }

  return data;
};

export const hostLinkSession = (mode, options = {}) => callAndroidBridge("createSession", { mode, ...options });

export const joinLinkSession = (code, expectedMode) =>
  callAndroidBridge("discoverOrJoin", { code, expectedMode });

export const uploadLinkSnapshot = (code, role, snapshot) =>
  callAndroidBridge("sendSnapshot", { code, role, snapshot });

export const sendLinkGameState = (code, role, state) =>
  callAndroidBridge("sendGameState", { code, role, state });

export const sendLinkGameResult = (code, role, result) =>
  callAndroidBridge("sendGameResult", { code, role, result });

export const fetchLinkSessionState = (code, role) =>
  callAndroidBridge("pollOrSubscribeSession", { code, role });

export const completeLinkSession = (code, role) =>
  callAndroidBridge("completeSession", { code, role });

export const closeLinkSession = (code) =>
  callAndroidBridge("closeSession", { code });
