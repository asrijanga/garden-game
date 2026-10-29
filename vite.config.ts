import { defineConfig, type Plugin } from 'vite';

/**
 * Writes the service worker (sw.js) with the exact list of files this build produced, so the
 * whole game (page, worker, every chunk and icon) is cached on the first visit and plays offline.
 */
function serviceWorker(): Plugin {
  return {
    name: 'garden-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = ['./', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', ...Object.keys(bundle).filter((f) => f !== 'index.html')];
      const version = Object.keys(bundle).filter((f) => f.startsWith('assets/')).sort().join('|');
      let hash = 0;
      for (let i = 0; i < version.length; i++) hash = (hash * 31 + version.charCodeAt(i)) | 0;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: swSource(files, `garden-${(hash >>> 0).toString(36)}`) });
    },
  };
}

const swSource = (files: string[], cache: string) => `// Generated at build time (see vite.config.ts).
const CACHE = ${JSON.stringify(cache)};
const FILES = ${JSON.stringify(files)};

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('garden-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // The page itself: the newest when online (so updates arrive), the cached one when not.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./', copy));
          return res;
        })
        .catch(() => caches.match('./', { ignoreVary: true })),
    );
    return;
  }
  // Everything else is named by its content: the cache is always right.
  event.respondWith(caches.match(req, { ignoreSearch: true, ignoreVary: true }).then((hit) => hit || fetch(req)));
});
`;

// Relative base so the build works under the GitHub Pages sub-path (/garden-game/).
export default defineConfig({
  base: './',
  plugins: [serviceWorker()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1000,
  },
});
