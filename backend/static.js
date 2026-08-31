import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

export const createStaticHandler = (root) =>
  async function handleStatic(request, response, url) {
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405);
      response.end();
      return;
    }
    const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
    const filePath = resolve(root, `.${decodeURIComponent(pathname)}`);
    if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }
    try {
      const details = await stat(filePath);
      if (!details.isFile()) throw new Error("Not a file");
      response.writeHead(200, {
        "Content-Type": CONTENT_TYPES[extname(filePath)] || "application/octet-stream",
        "Content-Length": details.size,
        "Cache-Control": pathname === "/index.html" ? "no-cache" : "public, max-age=300",
      });
      if (request.method === "HEAD") response.end();
      else createReadStream(filePath).pipe(response);
    } catch (_) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
    }
  };
