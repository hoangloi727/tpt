# Trợ lý Tổng phụ trách Đội Tạ Uyên

School administration UI with a dependency-free Node.js persistence server.

## Run

Requirements: Node.js 20 or newer.

```sh
npm start
```

Open `http://127.0.0.1:3000`. On the first run, the browser requires creation of the protected root account. Passwords are stored only as `scrypt` hashes.

The server writes business data to `data/database.json` and accounts to `data/users.json` by default.

Optional environment variables:

- `HOST`: bind address; defaults to `127.0.0.1`.
- `PORT`: HTTP port; defaults to `3000`.
- `DATA_FILE`: durable JSON database path; defaults to `data/database.json`.
- `AUTH_FILE`: account database path; defaults to `users.json` beside `DATA_FILE`.

## Structure

- `frontend/index.html`: static application shell.
- `frontend/styles/`: application styles.
- `frontend/scripts/`: application logic and HTTP data adapter.
- `frontend/app-config.js`: deployment-specific public browser configuration.
- `backend/`: HTTP API, session authentication, record repository, and static-file server.
- `data/`: runtime data, excluded from Git.

The backend owns primary CRUD persistence, revision checks, audit records, operation journals, and sync-outbox generation. Google Drive synchronization remains in the browser because Google Identity authorization is initiated by a user gesture.

Root and superadmin accounts have unrestricted access. New ordinary users default to dashboard-only access; superadmins manage accounts, roles, password resets, disabled status, and future permission keys from the User Management page.

Class competition points are entered for Monday through Friday within each school week. Weekly rankings apply the configured base score once, then add all daily criterion adjustments. The weekly sheet remains the approval and locking boundary.

## Verification

```sh
npm run check
```
