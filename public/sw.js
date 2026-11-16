/* Composer service worker: offline app shell + runtime cache for instrument samples. */
const VERSION = 'composer-v3'
const SHELL = `${VERSION}-shell`
const SAMPLES = `${VERSION}-samples`
const SAMPLE_HOSTS = ['gleitz.github.io', 'smpldsnds.github.io', 'danigb.github.io']

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL)
      const base = new URL('./', self.registration.scope)
      let files = ['./', 'index.html', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png']
      try {
        const res = await fetch(new URL('precache-manifest.json', base), { cache: 'no-store' })
        if (res.ok) files = files.concat(await res.json())
      } catch {
        /* offline install: shell only */
      }
      await cache.addAll(files.map((f) => new URL(f, base).toString()))
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (!key.startsWith(VERSION)) await caches.delete(key)
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  // Samples: cache-first, filled as they are used, so instruments keep working offline.
  if (SAMPLE_HOSTS.includes(url.hostname)) {
    event.respondWith(
      caches.open(SAMPLES).then(async (cache) => {
        const hit = await cache.match(req, { ignoreVary: true })
        if (hit) return hit
        const res = await fetch(req)
        if (res.ok || res.type === 'opaque') cache.put(req, res.clone())
        return res
      }),
    )
    return
  }
  if (url.origin !== self.location.origin) return
  // Navigations: network first, fall back to the cached shell.
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(async () => (await caches.match(new URL('index.html', self.registration.scope).toString())) ?? Response.error()))
    return
  }
  // Static assets: cache first, then network (and cache it).
  event.respondWith(
    caches.match(req, { ignoreVary: true }).then(
      (hit) =>
        hit ??
        fetch(req).then((res) => {
          if (res.ok) caches.open(SHELL).then((c) => c.put(req, res.clone()))
          return res
        }),
    ),
  )
})
