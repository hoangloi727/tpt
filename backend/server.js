import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createApiHandler } from "./api.js";
import { SessionManager, UserStore } from "./auth.js";
import { SqliteRepository } from "./repository.js";
import { SqliteDatabase } from "./sqlite-database.js";
import { createStaticHandler } from "./static.js";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "..");
const frontendRoot = resolve(projectRoot, "frontend");
const dataFile = resolve(process.env.DATA_FILE || resolve(projectRoot, "data", "database.json"));
const authFile = resolve(process.env.AUTH_FILE || resolve(dirname(dataFile), "users.json"));
const sqliteFile = resolve(
  process.env.SQLITE_FILE || resolve(dirname(dataFile), "database.sqlite"),
);
const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 3000);

const database = await new SqliteDatabase(sqliteFile).open();
const repository = await new SqliteRepository(database, dataFile, 11).open();
const users = await new UserStore(
  database,
  authFile,
  repository.defaultSchoolId(),
).open();
if (!users.setupRequired() && !repository.listSchools().length)
  await repository.ensureSchool("TRƯỜNG (CHƯA CẤU HÌNH)");
const sessions = new SessionManager();
const handleApi = createApiHandler({ repository, sessions, users });
const handleStatic = createStaticHandler(frontendRoot);

const server = createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || `${host}:${port}`}`);
  if (url.pathname.startsWith("/api/")) handleApi(request, response, url);
  else handleStatic(request, response, url);
});

server.listen(port, host, () => {
  console.log(`TPT server listening at http://${host}:${port}`);
  console.log(`SQLite database: ${sqliteFile}`);
  if (users.setupRequired()) console.warn("Root account setup is required in the browser.");
});
