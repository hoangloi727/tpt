import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
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
    let decodedPath;
    try {
      decodedPath = decodeURIComponent(pathname);
    } catch (_) {
      response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Đường dẫn không hợp lệ");
      return;
    }
    const filePath = resolve(root, `.${decodedPath}`);
    if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) {
      response.writeHead(403);
      response.end("Không được phép truy cập");
      return;
    }
    try {
      const [resolvedRoot, resolvedPath] = await Promise.all([
        realpath(root),
        realpath(filePath),
      ]);
      if (
        resolvedPath !== resolvedRoot &&
        !resolvedPath.startsWith(`${resolvedRoot}${sep}`)
      ) {
        response.writeHead(403);
        response.end("Không được phép truy cập");
        return;
      }
      const details = await stat(resolvedPath);
      if (!details.isFile()) throw new Error("Not a file");
      response.writeHead(200, {
        "Content-Type": CONTENT_TYPES[extname(resolvedPath)] || "application/octet-stream",
        "Content-Length": details.size,
        "Cache-Control": decodedPath === "/index.html" ? "no-cache" : "public, max-age=300",
      });
      if (request.method === "HEAD") response.end();
      else createReadStream(resolvedPath).pipe(response);
    } catch (_) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Không tìm thấy");
    }
  };
