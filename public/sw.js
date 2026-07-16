/**
 * Minimal service worker: enough for installability and snappy repeat opens,
 * deliberately NOT offline-first.
 *
 * Scope: ONLY the public map-tile host gets stale-while-revalidate. The app's
 * own APIs are never intercepted - /api/map/places responses are per-user
 * (caching them by URL leaked one account's catalog view to another on a
 * shared device) and auth-sensitive routes must always hit the network.
 */
const VERSION = "om-sw-v2";
const MAP_CACHE = `${VERSION}-map`;

const MAP_HOSTS = ["tiles.openfreemap.org"];

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("om-sw-") && !k.startsWith(VERSION))
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || !MAP_HOSTS.includes(url.hostname)) {
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(MAP_CACHE);
      const cached = await cache.match(event.request);
      const network = fetch(event.request)
        .then((res) => {
          if (res.ok) cache.put(event.request, res.clone());
          return res;
        })
        // respondWith must never resolve to undefined - that turns a cache
        // miss on a flaky network into a broken response instead of a
        // normal network error the page can handle.
        .catch(() => cached ?? Response.error());
      return cached ?? network;
    })(),
  );
});
