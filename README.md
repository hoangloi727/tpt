# Trợ lý Tổng phụ trách Đội Tạ Uyên

School administration UI with a dependency-free Node.js persistence server.

## Run

Requirements: Node.js 20 or newer.

```sh
APP_PASSWORD='replace-this-password' npm start
```

Open `http://127.0.0.1:3000`. The server writes application data to `data/database.json` by default.

Optional environment variables:

- `APP_PASSWORD`: application unlock password.
- `HOST`: bind address; defaults to `127.0.0.1`.
- `PORT`: HTTP port; defaults to `3000`.
- `DATA_FILE`: durable JSON database path; defaults to `data/database.json`.

## Structure

- `frontend/index.html`: static application shell.
- `frontend/styles/`: application styles.
- `frontend/scripts/`: application logic and HTTP data adapter.
- `frontend/app-config.js`: deployment-specific public browser configuration.
- `backend/`: HTTP API, session authentication, record repository, and static-file server.
- `data/`: runtime data, excluded from Git.

The backend owns primary CRUD persistence, revision checks, audit records, operation journals, and sync-outbox generation. Google Drive synchronization remains in the browser because Google Identity authorization is initiated by a user gesture.

## Verification

```sh
npm run check
```
