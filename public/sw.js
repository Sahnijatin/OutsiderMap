/**
 * Minimal service worker: enough for installability and snappy repeat opens,
 * deliberately NOT offline-first. Strategy:
 *  - map style/glyph/tile hosts: stale-while-revalidate (cheap repeat pans)
 *  - /api/map/places: stale-while-revalidate (map paints instantly, then
 *    refreshes)
 *  - everything else: network only (auth-sensitive pages stay fresh)
 */
const VERSION = "om-sw-v1";
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

function isMapAsset(url) {
  if (MAP_HOSTS.includes(url.hostname)) return true;
  return url.origin === self.location.origin &&
    url.pathname.startsWith("/api/map/places");
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || !isMapAsset(url)) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(MAP_CACHE);
      const cached = await cache.match(event.request);
      const network = fetch(event.request)
        .then((res) => {
          if (res.ok) cache.put(event.request, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached ?? network;
    })(),
  );
});
