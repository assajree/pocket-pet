const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || "0.0.0.0";
const ROOT = path.join(__dirname, "web");
const BUILD_META_PATH = path.join(ROOT, "build-meta.js");
const SESSION_TTL_MS = 5 * 60 * 1000;
const CODE_SYMBOLS = ["<", ">", "O"];
const sessions = new Map();

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json; charset=utf-8"
};

const VALID_MODES = new Set(["combat", "dating", "game"]);
const VALID_ROLES = new Set(["host", "join"]);

const sendJson = (response, statusCode, payload) => {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
};

const readJsonBody = (request) => new Promise((resolve, reject) => {
  const chunks = [];
  request.on("data", (chunk) => chunks.push(chunk));
  request.on("end", () => {
    try {
      const raw = Buffer.concat(chunks).toString("utf8");
      resolve(raw ? JSON.parse(raw) : {});
    } catch (error) {
      reject(error);
    }
  });
  request.on("error", reject);
});

const generateCode = () => Array.from(
  { length: 6 },
  () => CODE_SYMBOLS[crypto.randomInt(0, CODE_SYMBOLS.length)]
).join("");

const cleanupExpiredSessions = () => {
  const now = Date.now();
  for (const [code, session] of sessions.entries()) {
    if ((now - session.updatedAt) > SESSION_TTL_MS) {
      sessions.delete(code);
    }
  }
};

const createSession = (mode, options = {}) => {
  let code = generateCode();
  while (sessions.has(code)) {
    code = generateCode();
  }

  const session = {
    code,
    mode,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    hostSnapshot: null,
    joinSnapshot: null,
    joinConnected: false,
    completedRoles: new Set(),
    closed: false,
    gameKey: options.gameKey || "",
    bet: Number.isFinite(options.bet) ? Number(options.bet) : 0,
    hostGameState: null,
    joinGameState: null,
    hostGameResult: null,
    joinGameResult: null
  };
  sessions.set(code, session);
  return session;
};

const getSession = (code) => {
  cleanupExpiredSessions();
  return sessions.get(String(code || "").trim().toUpperCase()) || null;
};

const touchSession = (session) => {
  session.updatedAt = Date.now();
};

const closeSession = (session) => {
  session.closed = true;
  sessions.delete(session.code);
};

const getValidMode = (value) => {
  const mode = String(value || "").trim().toLowerCase();
  return VALID_MODES.has(mode) ? mode : "";
};

const getValidRole = (value) => {
  const role = String(value || "").trim().toLowerCase();
  return VALID_ROLES.has(role) ? role : "";
};

const getSessionBaseResponse = (session, role) => ({
  ok: true,
  code: session.code,
  mode: session.mode,
  role,
  joinConnected: session.joinConnected
});

const getSessionPollResponse = (session, role) => {
  const remoteRole = role === "host" ? "join" : "host";
  const response = {
    ok: true,
    code: session.code,
    mode: session.mode,
    joinConnected: session.joinConnected
  };

  if (session.mode === "game") {
    response.gameKey = session.gameKey;
    response.bet = session.bet;
    response.remoteGameState = remoteRole === "host" ? session.hostGameState : session.joinGameState;
    response.remoteGameResult = remoteRole === "host" ? session.hostGameResult : session.joinGameResult;
    return response;
  }

  response.localSnapshotReceived = role === "host" ? !!session.hostSnapshot : !!session.joinSnapshot;
  response.remoteSnapshot = role === "host" ? session.joinSnapshot : session.hostSnapshot;
  return response;
};

const buildMetaResponse = () => {
  const buildInfo = getLatestBuildInfo(ROOT);
  const content = [
    "self.__POCKET_PET_BUILD__ = Object.freeze({",
    `  id: ${JSON.stringify(buildInfo.id)},`,
    `  version: ${JSON.stringify(buildInfo.id)},`,
    `  generatedAt: ${JSON.stringify(buildInfo.generatedAt)}`,
    "});",
    ""
  ].join("\n");

  return {
    content,
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "no-store"
    }
  };
};

const handleApi = async (request, response, url) => {
  if (request.method === "POST" && url.pathname === "/api/link/host") {
    const body = await readJsonBody(request);
    const mode = getValidMode(body.mode);
    if (!mode) {
      sendJson(response, 400, { ok: false, message: "Invalid mode." });
      return true;
    }

    const bet = Number(body.bet || 0);
    if (mode === "game" && !String(body.gameKey || "").trim()) {
      sendJson(response, 400, { ok: false, message: "Game key is required." });
      return true;
    }

    if (!Number.isFinite(bet) || bet < 0) {
      sendJson(response, 400, { ok: false, message: "Invalid bet." });
      return true;
    }

    const session = createSession(mode, {
      gameKey: String(body.gameKey || "").trim(),
      bet
    });
    sendJson(response, 200, {
      ...getSessionBaseResponse(session, "host"),
      ...(mode === "game" ? { gameKey: session.gameKey, bet: session.bet } : {})
    });
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/link/join") {
    const body = await readJsonBody(request);
    const code = String(body.code || "").trim().toUpperCase();
    const expectedMode = getValidMode(body.expectedMode);
    const session = getSession(code);

    if (!session || session.closed) {
      sendJson(response, 404, { ok: false, message: "Session not found." });
      return true;
    }

    if (!expectedMode) {
      sendJson(response, 400, { ok: false, message: "Expected mode is required." });
      return true;
    }

    if (session.mode !== expectedMode) {
      sendJson(response, 409, { ok: false, message: `Mode mismatch: host is ${session.mode}.`, hostMode: session.mode });
      return true;
    }

    session.joinConnected = true;
    touchSession(session);
    sendJson(response, 200, {
      ...getSessionBaseResponse(session, "join"),
      ...(session.mode === "game" ? { gameKey: session.gameKey, bet: session.bet } : {})
    });
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/link/snapshot") {
    const body = await readJsonBody(request);
    const session = getSession(body.code);
    if (!session || session.closed) {
      sendJson(response, 404, { ok: false, message: "Session not found." });
      return true;
    }

    if (session.mode === "game") {
      sendJson(response, 409, { ok: false, message: "Snapshot exchange is not used for game links." });
      return true;
    }

    const role = getValidRole(body.role);
    if (!role) {
      sendJson(response, 400, { ok: false, message: "Invalid role." });
      return true;
    }

    if (!body.snapshot || typeof body.snapshot !== "object") {
      sendJson(response, 400, { ok: false, message: "Snapshot is required." });
      return true;
    }

    if (role === "host") {
      session.hostSnapshot = body.snapshot;
    } else {
      session.joinSnapshot = body.snapshot;
    }
    touchSession(session);
    sendJson(response, 200, { ok: true });
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/link/game-state") {
    const body = await readJsonBody(request);
    const session = getSession(body.code);
    if (!session || session.closed) {
      sendJson(response, 404, { ok: false, message: "Session not found." });
      return true;
    }

    if (session.mode !== "game") {
      sendJson(response, 409, { ok: false, message: "Game state is only available for game links." });
      return true;
    }

    const role = getValidRole(body.role);
    if (!role) {
      sendJson(response, 400, { ok: false, message: "Invalid role." });
      return true;
    }

    if (!body.state || typeof body.state !== "object") {
      sendJson(response, 400, { ok: false, message: "Game state is required." });
      return true;
    }

    if (role === "host") {
      session.hostGameState = body.state;
    } else {
      session.joinGameState = body.state;
    }
    touchSession(session);
    sendJson(response, 200, { ok: true });
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/link/game-result") {
    const body = await readJsonBody(request);
    const session = getSession(body.code);
    if (!session || session.closed) {
      sendJson(response, 404, { ok: false, message: "Session not found." });
      return true;
    }

    if (session.mode !== "game") {
      sendJson(response, 409, { ok: false, message: "Game result is only available for game links." });
      return true;
    }

    const role = getValidRole(body.role);
    if (!role) {
      sendJson(response, 400, { ok: false, message: "Invalid role." });
      return true;
    }

    if (!body.result || typeof body.result !== "object") {
      sendJson(response, 400, { ok: false, message: "Game result is required." });
      return true;
    }

    if (role === "host") {
      session.hostGameResult = body.result;
    } else {
      session.joinGameResult = body.result;
    }
    touchSession(session);
    sendJson(response, 200, { ok: true });
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/link/session") {
    const session = getSession(url.searchParams.get("code"));
    const role = getValidRole(url.searchParams.get("role"));

    if (!session || session.closed) {
      sendJson(response, 404, { ok: false, message: "Session not found." });
      return true;
    }

    if (!role) {
      sendJson(response, 400, { ok: false, message: "Invalid role." });
      return true;
    }

    touchSession(session);
    sendJson(response, 200, getSessionPollResponse(session, role));
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/link/complete") {
    const body = await readJsonBody(request);
    const session = getSession(body.code);
    if (!session || session.closed) {
      sendJson(response, 404, { ok: false, message: "Session not found." });
      return true;
    }

    const role = getValidRole(body.role);
    if (!role) {
      sendJson(response, 400, { ok: false, message: "Invalid role." });
      return true;
    }

    session.completedRoles.add(role);
    touchSession(session);
    if (session.completedRoles.has("host") && session.completedRoles.has("join")) {
      closeSession(session);
    }

    sendJson(response, 200, { ok: true });
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/link/close") {
    const body = await readJsonBody(request);
    const session = getSession(body.code);
    if (session) {
      closeSession(session);
    }
    sendJson(response, 200, { ok: true });
    return true;
  }

  return false;
};

const serveStatic = (request, response, url) => {
  if (url.pathname === "/build-meta.js") {
    const dynamicBuildMeta = buildMetaResponse();
    response.writeHead(200, dynamicBuildMeta.headers);
    response.end(dynamicBuildMeta.content);
    return;
  }

  const requestPath = url.pathname === "/"
    ? "/index.html"
    : (url.pathname === "/favicon.ico" ? "/icons/icon-192.png" : url.pathname);
  const resolvedPath = path.resolve(ROOT, `.${requestPath}`);

  if (!resolvedPath.startsWith(ROOT)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.stat(resolvedPath, (statError, stats) => {
    if (statError || !stats.isFile()) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    const ext = path.extname(resolvedPath).toLowerCase();
    const cacheControl = requestPath === "/index.html" || requestPath === "/service-worker.js"
      ? "no-store"
      : "public, max-age=0";
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Cache-Control": cacheControl
    });
    fs.createReadStream(resolvedPath).pipe(response);
  });
};

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) {
      const handled = await handleApi(request, response, url);
      if (!handled) {
        sendJson(response, 404, { ok: false, message: "API route not found." });
      }
      return;
    }

    serveStatic(request, response, url);
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { ok: false, message: "Server error." });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Pocket Pet server running at http://${HOST}:${PORT}`);
});

function getLatestBuildInfo(rootDir) {
  let latestMtime = 0;
  walkFiles(rootDir, (filePath) => {
    if (filePath === BUILD_META_PATH) {
      return;
    }

    latestMtime = Math.max(latestMtime, fs.statSync(filePath).mtimeMs);
  });

  const buildDate = new Date(latestMtime || Date.now());
  return {
    id: buildDate.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z"),
    generatedAt: buildDate.toISOString()
  };
}

function walkFiles(dirPath, onFile) {
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const nextPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      walkFiles(nextPath, onFile);
      continue;
    }

    onFile(nextPath);
  }
}
