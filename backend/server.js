import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createApiHandler } from "./api.js";
import { SessionManager } from "./auth.js";
import { JsonRepository } from "./repository.js";
import { createStaticHandler } from "./static.js";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "..");
const frontendRoot = resolve(projectRoot, "frontend");
const dataFile = resolve(process.env.DATA_FILE || resolve(projectRoot, "data", "database.json"));
const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 3000);
const password = process.env.APP_PASSWORD || "TaUyen2025";

const repository = await new JsonRepository(dataFile, 9).open();
const sessions = new SessionManager(password);
const handleApi = createApiHandler({ repository, sessions });
const handleStatic = createStaticHandler(frontendRoot);

const server = createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || `${host}:${port}`}`);
  if (url.pathname.startsWith("/api/")) handleApi(request, response, url);
  else handleStatic(request, response, url);
});

server.listen(port, host, () => {
  console.log(`TPT server listening at http://${host}:${port}`);
  if (!process.env.APP_PASSWORD) {
    console.warn("APP_PASSWORD is not set; using the legacy development password.");
  }
});
