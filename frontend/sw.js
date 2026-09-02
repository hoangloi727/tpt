const CACHE = "tpt-shell-v22";
const SHELL = [
  "./",
  "./index.html",
  "./app-config.js",
  "./styles/app.css",
  "./logo/logo.png",
  "./scripts/api-data-provider.js",
  "./scripts/app-utils.js",
  "./scripts/app-catalog.js",
  "./scripts/app-schema.js",
  "./scripts/browser-runtime.js",
  "./scripts/score-engine.js",
  "./scripts/backup-codec.js",
  "./scripts/form-drafts.js",
  "./scripts/custom-fields.js",
  "./scripts/pwa-runtime.js",
  "./scripts/report-formatters.js",
  "./scripts/backup-service.js",
  "./scripts/api-reference.js",
  "./scripts/app.js",
  "./manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).pathname.startsWith("/api/")) return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});
