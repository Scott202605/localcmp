const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function sendJson(res, status, payload, correlationId) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Idempotency-Key, X-Correlation-Id",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
    "X-Correlation-Id": correlationId,
  });
  res.end(JSON.stringify({ request_id: randomUUID(), correlation_id: correlationId, ...payload }));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) reject(new Error("Request body too large"));
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function createRouter() {
  const routes = [];

  function add(method, pattern, handler) {
    const keys = [];
    const regex = new RegExp(`^${pattern.replace(/:[^/]+/g, (match) => {
      keys.push(match.slice(1));
      return "([^/]+)";
    })}$`);
    routes.push({ method, regex, keys, handler });
  }

  async function handle(req, res, context) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const correlationId = req.headers["x-correlation-id"] || randomUUID();

    if (req.method === "OPTIONS") {
      sendJson(res, 204, { data: null, error: null }, correlationId);
      return true;
    }

    for (const route of routes) {
      const match = url.pathname.match(route.regex);
      if (route.method !== req.method || !match) continue;
      const params = Object.fromEntries(route.keys.map((key, index) => [key, decodeURIComponent(match[index + 1])]));
      try {
        const body = ["POST", "PATCH"].includes(req.method) ? await readBody(req) : {};
        const data = await route.handler({ req, url, params, body, correlationId, ...context });
        sendJson(res, 200, { data, error: null }, correlationId);
      } catch (error) {
        sendJson(res, error.statusCode || 500, { data: null, error: { code: error.code || "SERVER_ERROR", message: error.message } }, correlationId);
      }
      return true;
    }

    return false;
  }

  return { add, handle };
}

function serveStatic(req, res, publicDir) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const requested = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(publicDir, requested);

  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; base-uri 'self'; form-action 'self'",
    });
    res.end(content);
  });
}

module.exports = { createRouter, serveStatic };
