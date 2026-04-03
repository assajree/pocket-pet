const requestJson = async (path, options = {}) => {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  let data = {};
  try {
    data = await response.json();
  } catch (_error) {
    data = {};
  }

  if (!response.ok || data.ok === false) {
    const error = new Error(data.message || `Request failed with ${response.status}`);
    error.status = response.status;
    error.payload = data;
    throw error;
  }

  return data;
};

export const hostLinkSession = (mode) =>
  requestJson("/api/link/host", {
    method: "POST",
    body: JSON.stringify({ mode })
  });

export const joinLinkSession = (code, expectedMode) =>
  requestJson("/api/link/join", {
    method: "POST",
    body: JSON.stringify({ code, expectedMode })
  });

export const uploadLinkSnapshot = (code, role, snapshot) =>
  requestJson("/api/link/snapshot", {
    method: "POST",
    body: JSON.stringify({ code, role, snapshot })
  });

export const fetchLinkSessionState = (code, role) =>
  requestJson(`/api/link/session?code=${encodeURIComponent(code)}&role=${encodeURIComponent(role)}`);

export const completeLinkSession = (code, role) =>
  requestJson("/api/link/complete", {
    method: "POST",
    body: JSON.stringify({ code, role })
  });

export const closeLinkSession = (code) =>
  requestJson("/api/link/close", {
    method: "POST",
    body: JSON.stringify({ code })
  });
