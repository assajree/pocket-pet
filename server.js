const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || "0.0.0.0";
const ROOT = __dirname;
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

const createSession = (mode) => {
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
    closed: false
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

const handleApi = async (request, response, url) => {
  if (request.method === "POST" && url.pathname === "/api/link/host") {
    const body = await readJsonBody(request);
    const mode = body.mode === "dating" ? "dating" : body.mode === "combat" ? "combat" : null;
    if (!mode) {
      sendJson(response, 400, { ok: false, message: "Invalid mode." });
      return true;
    }

    const session = createSession(mode);
    sendJson(response, 200, {
      ok: true,
      code: session.code,
      mode: session.mode,
      role: "host"
    });
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/link/join") {
    const body = await readJsonBody(request);
    const code = String(body.code || "").trim().toUpperCase();
    const expectedMode = body.expectedMode === "dating" ? "dating" : body.expectedMode === "combat" ? "combat" : null;
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
      ok: true,
      code: session.code,
      mode: session.mode,
      role: "join"
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

    if (body.role !== "host" && body.role !== "join") {
      sendJson(response, 400, { ok: false, message: "Invalid role." });
      return true;
    }

    if (!body.snapshot || typeof body.snapshot !== "object") {
      sendJson(response, 400, { ok: false, message: "Snapshot is required." });
      return true;
    }

    if (body.role === "host") {
      session.hostSnapshot = body.snapshot;
    } else {
      session.joinSnapshot = body.snapshot;
    }
    touchSession(session);
    sendJson(response, 200, { ok: true });
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/link/session") {
    const session = getSession(url.searchParams.get("code"));
    const role = url.searchParams.get("role");

    if (!session || session.closed) {
      sendJson(response, 404, { ok: false, message: "Session not found." });
      return true;
    }

    if (role !== "host" && role !== "join") {
      sendJson(response, 400, { ok: false, message: "Invalid role." });
      return true;
    }

    touchSession(session);
    sendJson(response, 200, {
      ok: true,
      code: session.code,
      mode: session.mode,
      joinConnected: session.joinConnected,
      localSnapshotReceived: role === "host" ? !!session.hostSnapshot : !!session.joinSnapshot,
      remoteSnapshot: role === "host" ? session.joinSnapshot : session.hostSnapshot
    });
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/link/complete") {
    const body = await readJsonBody(request);
    const session = getSession(body.code);
    if (!session || session.closed) {
      sendJson(response, 404, { ok: false, message: "Session not found." });
      return true;
    }

    if (body.role !== "host" && body.role !== "join") {
      sendJson(response, 400, { ok: false, message: "Invalid role." });
      return true;
    }

    session.completedRoles.add(body.role);
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
  const requestPath = url.pathname === "/" ? "/index.html" : url.pathname;
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
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-store" : "public, max-age=0"
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
