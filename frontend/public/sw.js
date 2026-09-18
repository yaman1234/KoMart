// Minimal service worker required for Chrome PWA installability.
// No caching — all requests pass through to the network.
self.addEventListener('fetch', () => {});
