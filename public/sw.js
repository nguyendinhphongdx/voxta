const CACHE_NAME = 'voxta-shell-v1';
const SHELL_ASSETS = [
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

// Network-first cho MỌI request — voxta gần như luôn cần mạng thật (gọi LLM/TTS/API nội bộ), cache
// chỉ để app-shell (icon/manifest) sẵn có ngay và PWA được coi là "installable". KHÔNG cố cache
// response API (dễ trả dữ liệu/settings cũ sai) — chỉ fallback về cache khi mất mạng hẳn.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
