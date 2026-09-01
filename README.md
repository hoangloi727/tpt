# Trợ lý Tổng phụ trách Đội

School administration UI with a dependency-free Node.js persistence server.

## Run

Requirements: Node.js 20 or newer.

```sh
npm start
```

Open `http://127.0.0.1:3000`. On the first run, the browser requires creation of the protected root account. Passwords are stored only as `scrypt` hashes.

The server writes business data and accounts to `data/database.sqlite`. On the first SQLite startup, existing `data/database.json` and `data/users.json` files are imported transactionally and verified. Legacy JSON files remain unchanged as rollback copies.

Optional environment variables:

- `HOST`: bind address; defaults to `127.0.0.1`.
- `PORT`: HTTP port; defaults to `3000`.
- `DATA_FILE`: legacy business JSON import source; defaults to `data/database.json`.
- `AUTH_FILE`: legacy account JSON import source; defaults to `users.json` beside `DATA_FILE`.
- `SQLITE_FILE`: active SQLite database path; defaults to `database.sqlite` beside `DATA_FILE`.

## Structure

- `frontend/index.html`: static application shell.
- `frontend/styles/`: application styles.
- `frontend/scripts/`: application logic and HTTP data adapter.
- `frontend/app-config.js`: deployment-specific public browser configuration.
- `backend/`: HTTP API, session authentication, record repository, and static-file server.
- `data/`: runtime data, excluded from Git.

The backend owns primary CRUD persistence, revision checks, audit records, and operation journals. The browser supports local file exports, imports, internal restore points, and scheduled directory backups; it has no remote synchronization provider.

Login requires a school selection. Every session and business-data API request is scoped to that school. Root/superadmin accounts have unrestricted access within the selected school. School admins can manage ordinary user accounts only in their own school. New ordinary users default to dashboard-only access.

Class competition points are entered for Monday through Friday within each school week. Weekly rankings apply the configured base score once, then add all daily criterion adjustments. The weekly sheet remains the approval and locking boundary.

## Verification

```sh
npm run check
```
