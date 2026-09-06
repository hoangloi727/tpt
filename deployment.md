# Deployment Guide / Hướng dẫn triển khai

This guide covers server installation and mobile installation for the Trợ lý Tổng phụ trách Đội application.

## 1. Requirements

- Node.js 20 or newer
- A modern browser such as Chrome, Edge, Safari, or Firefox
- For production mobile installation and secure cookies: an HTTPS domain or localhost
- A writable directory for SQLite data

## 2. Install the server

### 2.1 Get the application

Copy the project directory to the server. Do not copy the local `data/`, `node_modules/`, `.agents/`, `.codex/`, or `reverse-engineering/` directories.

Install dependencies:

```sh
npm ci
```

### 2.2 Configure runtime paths

All environment variables are optional. Defaults are suitable for a local test installation.

| Variable | Default | Description |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Listen address. Use `127.0.0.1` behind a local reverse proxy. |
| `PORT` | `3000` | Listen port. |
| `DATA_FILE` | `data/database.json` | Legacy JSON business-data import source. Used only when initializing an empty SQLite database. |
| `AUTH_FILE` | `users.json` beside `DATA_FILE` | Legacy JSON account import source. Used independently of `DATA_FILE`. |
| `SQLITE_FILE` | `database.sqlite` beside `DATA_FILE` | Active SQLite database. |

Examples:

```sh
# Local test
npm start

# Production-style process-managed run
HOST=127.0.0.1 PORT=3000 SQLITE_FILE=/var/lib/tpt/database.sqlite npm start
```

### 2.3 First run and root account

1. Open the server URL, for example `http://127.0.0.1:3000`.
2. Do **not** open `frontend/index.html` directly; that bypasses the authenticated API.
3. On first run, create the protected root account in the browser.
4. Store the root password in your password manager. There is no source-defined password and no password-reset bypass.

Sessions are in memory and are cleared when the server restarts. Users must sign in again after a restart.

## 3. Production deployment

### 3.1 Recommended topology

Run the Node server only on `127.0.0.1`. Put an HTTPS reverse proxy such as Nginx or Caddy in front and forward `/` to the Node server. The same origin serves both static files and `/api/*`, so do not split them across domains.

Example Nginx location:

```nginx
location / {
  proxy_pass http://127.0.0.1:3000;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

The app uses `X-Forwarded-Proto` only to mark the session cookie `Secure` when HTTPS is detected.

### 3.2 Process supervision

Use systemd, PM2, Docker, or another process manager. Example systemd service:

```ini
[Service]
WorkingDirectory=/opt/tpt
ExecStart=/usr/bin/node backend/server.js
Environment=HOST=127.0.0.1
Environment=PORT=3000
Environment=SQLITE_FILE=/var/lib/tpt/database.sqlite
Restart=always
User=tpt
```

For legacy JSON imports, also set `DATA_FILE` and `AUTH_FILE`. Keep those files as rollback sources; the server does not delete them automatically.

### 3.3 Data and backups

- Back up the active SQLite file regularly.
- Stop the server for a fully consistent SQLite file copy, or use SQLite-consistent tooling.
- Do not expose `data/`, `SQLITE_FILE`, `DATA_FILE`, or `AUTH_FILE` through a public web server.
- Keep backups outside the application directory when possible.
- The application's internal snapshots and export files supplement, but do not replace, server backups.

### 3.4 Security checklist

- Use HTTPS in production.
- Keep the Node listener private behind a reverse proxy or firewall.
- Restrict server login access to authorized school staff.
- Do not commit SQLite databases, legacy JSON imports, environment files, or backups.
- Review server logs and keep Node.js updated.

## 4. Server updates

1. Notify users and ensure they have signed out or stopped writes.
2. Back up the active SQLite database.
3. Stop the old process.
4. Replace the application source.
5. Run:

```sh
npm ci
npm run check
```

6. Start the application with the same `SQLITE_FILE`, `DATA_FILE`, and `AUTH_FILE` values.
7. Open the site and confirm login, navigation, and one read-only action before releasing users.

Schema migration runs automatically during startup. Do not remove old rollback/import files.

## 5. Install on mobile

The application is a Progressive Web App (PWA). No separate app store package is required.

### Android / Chrome

1. Open the HTTPS application URL.
2. Sign in once so the application loads.
3. Open the browser menu.
4. Tap **Install app** or **Add to Home screen**.
5. Confirm the installation.

### iOS / Safari

1. Open the HTTPS application URL.
2. Sign in once so the application loads.
3. Tap the Share button.
4. Tap **Add to Home Screen**.
5. Confirm the name and tap **Add**.

After installation, launch the app from its home-screen icon. The PWA runs in standalone mode.

## 6. Mobile offline and update behavior

- The PWA caches the application shell for offline loading.
- Authenticated CRUD data requires the server and a network connection; the app is not an offline data synchronization product.
- The service worker uses a versioned shell cache (`tpt-shell-v23`).
  When new frontend files are deployed, increase the cache version in `frontend/sw.js` and update any changed file paths in its `SHELL` list.
- Users receive an update banner when a new version has downloaded. They can update after closing unsaved drafts.
- If an installed app seems stale, close it fully, reopen it, or clear the browser's site data and reinstall.

## 7. Troubleshooting

| Symptom | Likely cause / action |
| --- | --- |
| Browser opens only the login shell offline | PWA shell loaded, but server data requires connectivity. Reconnect. |
| Users signed out after server restart | Expected behavior; sessions are in memory. |
| Cookie not marked `Secure` | Ensure the reverse proxy sends `X-Forwarded-Proto: https`, or access the site directly over HTTPS. |
| Empty first-run data | Empty SQLite database. Set `DATA_FILE`/`AUTH_FILE` only when starting from a legacy JSON backup. |
| PWA does not install | Use HTTPS or localhost, install after the page loads, and check the browser's site permissions. |
| Updates not appearing | Increase `frontend/sw.js` cache version and redeploy; ask users to close the installed app. |
