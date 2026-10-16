// Keeps a copy of Gym on the device, so the installed phone app opens
// instantly, with or without a connection. Only the published copy has one:
// tools/build.py fills in VERSION and FILES, and the app registers this file
// only when index.html carries that version (in src/ it reads "dev").
//
// Every file comes from this copy. When anything changes, the browser fetches
// the new version whole in the background, it takes over straight away, and
// ui/app.js reloads the page to show it. No data lives here: that is
// localStorage and the online database, which this never touches.

const VERSION = '__VERSION__';
const FILES = __FILES__;
const CACHE = `gym-${VERSION}`;

self.addEventListener('install', (e) => {
  // cache: 'reload' skips the browser's HTTP cache. GitHub Pages lets it keep
  // files for 10 minutes, and a new version must not be built from old ones.
  e.waitUntil(caches.open(CACHE)
    .then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('gym-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  // Sign-in, the database and the Firebase SDK are other sites: left alone.
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // A miss is fetched and kept again. The Mongolian app's offline copy, on
  // this same web address, deletes every other app's copy when it updates
  // (its sw.js, Oct 2026): this way the next visit online refills ours.
  e.respondWith(caches.open(CACHE).then((c) => c.match(req, { ignoreSearch: true, ignoreVary: true }).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok && res.type === 'basic') c.put(req, res.clone()).catch(() => {});
    return res;
  }))));
});
