// Service Worker for RouteNote PWA
const APP_VERSION = '20260526-v17';
const CACHE_NAME = `routenote-${APP_VERSION}`;
const STATIC_CACHE = `routenote-static-${APP_VERSION}`;

// Core assets to cache during install
const PRECACHE_ASSETS = [
  './',
  `./index.html?v=${APP_VERSION}`,
  `./manifest.json?v=${APP_VERSION}`,
  `./favicon.svg?v=${APP_VERSION}`,
  './icon-192-v12.png',
  './icon-512-v12.png',
  './icon-192-maskable-v12.png',
  './icon-512-maskable-v12.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Allow individual asset failures silently during install precache
      return Promise.allSettled(
        PRECACHE_ASSETS.map(asset => cache.add(asset))
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== STATIC_CACHE) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. Bypass caching for non-GET requests and external API endpoints (Supabase, Naver Maps)
  if (event.request.method !== 'GET' || !url.origin.includes(self.location.hostname)) {
    event.respondWith(fetch(event.request));
    return;
  }

  // 2. Cache-First for static hashed assets and images (Vite assets, fonts, icons)
  if (
    url.pathname.includes('/assets/') || 
    url.pathname.endsWith('.png') || 
    url.pathname.endsWith('.svg') || 
    url.pathname.endsWith('.ico') ||
    url.origin.includes('fonts.googleapis.com') || 
    url.origin.includes('fonts.gstatic.com')
  ) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request).then((networkResponse) => {
          if (networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(STATIC_CACHE).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // 3. Network-First for dynamic/root assets (index.html, manifest.json, sw.js)
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});
