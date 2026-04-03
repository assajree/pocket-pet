const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || "0.0.0.0";
const ROOT = path.join(__dirname, "web");
const BUILD_META_PATH = path.join(ROOT, "build-meta.js");

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

const buildMetaResponse = () => {
  const buildId = getLatestBuildId(ROOT);
  const generatedAt = new Date().toISOString();
  const content = [
    "self.__POCKET_PET_BUILD__ = Object.freeze({",
    `  id: ${JSON.stringify(buildId)},`,
    `  version: ${JSON.stringify(buildId)},`,
    `  generatedAt: ${JSON.stringify(generatedAt)}`,
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
    serveStatic(request, response, url);
  } catch (error) {
    console.error(error);
    response.writeHead(500, {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store"
    });
    response.end("Server error.");
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Pocket Pet server running at http://${HOST}:${PORT}`);
});

function getLatestBuildId(rootDir) {
  let latestMtime = 0;
  walkFiles(rootDir, (filePath) => {
    if (filePath === BUILD_META_PATH) {
      return;
    }

    latestMtime = Math.max(latestMtime, fs.statSync(filePath).mtimeMs);
  });

  const buildDate = new Date(latestMtime || Date.now());
  return buildDate.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
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
