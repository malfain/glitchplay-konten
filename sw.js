// GlitchPlay HQ service worker: app shell works offline, data is always fetched fresh, videos stream from the network.
const SHELL = "gphq-shell-v2";
const SHELL_FILES = ["./", "index.html", "manifest.webmanifest", "assets/icons/icon-192.png", "assets/icons/icon-512.png",
  "scene/hq.js", "scene/agents.js", "scene/furniture.js"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== SHELL).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  if (/\.(mp4|jpg)$/.test(url.pathname)) return; // videos & posters: straight to network (range requests)
  if (url.pathname.includes("/data/")) return; // content changes daily: never cache
  // app shell: network first so updates show up, cache as offline fallback
  e.respondWith(
    // no-cache: always ask GitHub Pages for the newest file (its HTTP cache would otherwise hide updates ~10 min)
    fetch(e.request.url, { cache: "no-cache", credentials: "same-origin" }).then((r) => {
      if (r.ok) { const copy = r.clone(); caches.open(SHELL).then((c) => c.put(e.request, copy)); }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((m) => m || caches.match("index.html")))
  );
});
