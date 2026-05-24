// Service Worker for RouteNote PWA compliance
const CACHE_NAME = 'routenote-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Pass all requests directly through to the network to prevent caching stale builds
  event.respondWith(fetch(event.request));
});
