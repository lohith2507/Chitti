// Bump this version whenever caching behavior changes to evict old caches.
const CACHE_NAME = "chitti-v2";
const PRECACHE = ["/manifest.json"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Never cache API calls.
  if (url.pathname.startsWith("/api/")) return;

  // Network-first for navigations / HTML documents. This is critical: index.html
  // references hash-named JS bundles, so a stale cached HTML would point at an
  // asset that no longer exists and break the app. Always prefer the live HTML.
  const accept = request.headers.get("accept") || "";
  const isHTML = request.mode === "navigate" || accept.includes("text/html");

  if (isHTML) {
    e.respondWith(
      fetch(request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return res;
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || caches.match("/"))
        )
    );
    return;
  }

  // Cache-first for hashed static assets (they are immutable per build).
  e.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return res;
      });
    })
  );
});
