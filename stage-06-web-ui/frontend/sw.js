/**
 * VibeCoding Web Manager - Service Worker
 *
 * Strategy:
 *   - Static files (CSS, JS, HTML): Cache-first, fall back to network
 *   - API requests (/api/*):        Network-first, fall back to cache
 *   - WebSocket:                     Pass through (no caching)
 */

const CACHE_NAME = "vibecoding-v1";

const STATIC_ASSETS = [
    "/",
    "/index.html",
    "/css/style.css",
    "/js/app.js",
    "/js/websocket.js",
    "/manifest.json",
];

// ---------------------------------------------------------------------------
// Install: pre-cache static assets
// ---------------------------------------------------------------------------
self.addEventListener("install", (event) => {
    event.waitUntil(
        caches
            .open(CACHE_NAME)
            .then((cache) => cache.addAll(STATIC_ASSETS))
            .then(() => self.skipWaiting())
    );
});

// ---------------------------------------------------------------------------
// Activate: clean up old caches
// ---------------------------------------------------------------------------
self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) =>
                Promise.all(
                    keys
                        .filter((key) => key !== CACHE_NAME)
                        .map((key) => caches.delete(key))
                )
            )
            .then(() => self.clients.claim())
    );
});

// ---------------------------------------------------------------------------
// Fetch handler
// ---------------------------------------------------------------------------
self.addEventListener("fetch", (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip WebSocket and non-GET requests
    if (request.method !== "GET") return;
    if (url.protocol === "ws:" || url.protocol === "wss:") return;

    // API requests: network-first
    if (url.pathname.startsWith("/api/")) {
        event.respondWith(networkFirst(request));
        return;
    }

    // Static assets: cache-first
    event.respondWith(cacheFirst(request));
});

// ---------------------------------------------------------------------------
// Strategies
// ---------------------------------------------------------------------------

/**
 * Network-first: try network, fall back to cache.
 */
async function networkFirst(request) {
    try {
        const response = await fetch(request);
        // Cache successful GET responses
        if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone());
        }
        return response;
    } catch (err) {
        const cached = await caches.match(request);
        if (cached) return cached;
        return new Response(JSON.stringify({ error: "Offline" }), {
            status: 503,
            headers: { "Content-Type": "application/json" },
        });
    }
}

/**
 * Cache-first: try cache, fall back to network and update cache.
 */
async function cacheFirst(request) {
    const cached = await caches.match(request);
    if (cached) return cached;

    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone());
        }
        return response;
    } catch (err) {
        // Return a basic offline page for navigation requests
        if (request.mode === "navigate") {
            const offlineCached = await caches.match("/");
            if (offlineCached) return offlineCached;
        }
        return new Response("Offline", { status: 503 });
    }
}
