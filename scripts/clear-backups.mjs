import Database from "better-sqlite3";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const { values } = parseArgs({ options: {
  file: { type: "string" },
  apply: { type: "boolean", default: false },
  "server-stopped": { type: "boolean", default: false },
} });
const root = fileURLToPath(new URL("..", import.meta.url));
const dataFile = resolve(process.env.DATA_FILE || resolve(root, "data/database.json"));
const file = resolve(values.file || process.env.SQLITE_FILE || resolve(dirname(dataFile), "database.sqlite"));
if (values.apply && !values["server-stopped"])
  throw new Error("Dừng mọi tiến trình ứng dụng dùng database trước, rồi thêm --server-stopped.");

const db = new Database(file, { fileMustExist: true, readonly: !values.apply, timeout: 1000 });
try {
  const counts = () => db.prepare(
    "SELECT store, COUNT(*) AS count FROM records WHERE store IN ('internal_snapshots', 'backup_records') GROUP BY store",
  ).all();
  if (!values.apply) {
    console.log(JSON.stringify({ mode: "preview", file, records: counts() }, null, 2));
  } else {
    const result = db.transaction(() => {
      const records = counts();
      const removed = db.prepare("DELETE FROM records WHERE store IN ('internal_snapshots', 'backup_records')").run().changes;
      return { records, removed };
    }).exclusive();
    console.log(JSON.stringify({ mode: "deleted", file, ...result }, null, 2));
  }
} finally {
  db.close();
}
