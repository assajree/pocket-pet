const WEB_LINK_UNAVAILABLE_MESSAGE = "Web link server unavailable. Start the game with node server.js to use LINK on web.";

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

const buildRequestError = (message, payload = {}, status = 0) => {
  const error = new Error(message);
  error.payload = payload;
  error.status = status;
  return error;
};

const requestJson = async (requestPath, options = {}) => {
  let response;
  try {
    response = await fetch(requestPath, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });
  } catch (_error) {
    throw buildRequestError(WEB_LINK_UNAVAILABLE_MESSAGE);
  }

  let data = {};
  try {
    data = await response.json();
  } catch (_error) {
    data = {};
  }

  if (!response.ok || data.ok === false) {
    if (response.status === 404 && !data.message) {
      throw buildRequestError(WEB_LINK_UNAVAILABLE_MESSAGE, data, response.status);
    }

    throw buildRequestError(data.message || `Request failed with ${response.status}`, data, response.status);
  }

  return data;
};

const callAndroidBridge = async (method, payload = {}) => {
  const bridge = getAndroidBridge();
  if (!bridge || typeof bridge[method] !== "function") {
    throw buildRequestError("Link is unavailable on this device.");
  }

  const response = await bridge[method](payload);
  const data = parseBridgePayload(response);
  if (data.ok === false) {
    throw buildRequestError(data.message || "Android link request failed.", data);
  }

  return data;
};

const usingAndroidBridge = () => !!getAndroidBridge();

const callTransport = (httpPath, bridgeMethod, payload = {}, method = "POST") => {
  if (usingAndroidBridge()) {
    return callAndroidBridge(bridgeMethod, payload);
  }

  if (method === "GET") {
    return requestJson(httpPath);
  }

  return requestJson(httpPath, {
    method,
    body: JSON.stringify(payload)
  });
};

export const hostLinkSession = (mode, options = {}) =>
  callTransport("/api/link/host", "createSession", { mode, ...options });

export const joinLinkSession = (code, expectedMode) =>
  callTransport("/api/link/join", "discoverOrJoin", { code, expectedMode });

export const uploadLinkSnapshot = (code, role, snapshot) =>
  callTransport("/api/link/snapshot", "sendSnapshot", { code, role, snapshot });

export const sendLinkGameState = (code, role, state) =>
  callTransport("/api/link/game-state", "sendGameState", { code, role, state });

export const sendLinkGameResult = (code, role, result) =>
  callTransport("/api/link/game-result", "sendGameResult", { code, role, result });

export const fetchLinkSessionState = (code, role) =>
  callTransport(
    `/api/link/session?code=${encodeURIComponent(code)}&role=${encodeURIComponent(role)}`,
    "pollOrSubscribeSession",
    { code, role },
    "GET"
  );

export const completeLinkSession = (code, role) =>
  callTransport("/api/link/complete", "completeSession", { code, role });

export const closeLinkSession = (code) =>
  callTransport("/api/link/close", "closeSession", { code });
