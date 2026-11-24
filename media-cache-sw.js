/*
 * OGF remote-media cache.
 * Cache only CORS-readable image responses. Never store or replay opaque
 * responses: doing so can trigger Opaque Response Blocking (ORB) in browsers.
 * Hosts without CORS support are redirected to their original URL so the
 * browser's native <img> loading and HTTP cache can handle them.
 */
const CACHE_NAME = 'ogf-remote-media-v3';
const OLD_CACHE_PREFIX = 'ogf-remote-media-';
const CACHE_ENDPOINT = '__ogf_media_cache__';
const MAX_CACHED_IMAGES = 500;

self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter(name => name.startsWith(OLD_CACHE_PREFIX) && name !== CACHE_NAME)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  let requestUrl;
  try {
    requestUrl = new URL(event.request.url);
  } catch (_) {
    return;
  }

  if (requestUrl.origin !== self.location.origin ||
      !requestUrl.pathname.endsWith('/' + CACHE_ENDPOINT)) return;

  // Always resolve respondWith. A Cache API failure, malformed URL, or remote
  // network error must not reject the service-worker fetch event: that creates
  // Firefox's "ServiceWorker intercepted the request and encountered an
  // unexpected error" message and can surface as a failed request for "".
  event.respondWith((async () => {
    let remoteUrl;
    try {
      const target = requestUrl.searchParams.get('url');
      if (!target) return new Response('Missing image URL', { status: 400 });

      remoteUrl = new URL(target);
      if (!['http:', 'https:'].includes(remoteUrl.protocol)) {
        return new Response('Invalid image URL', { status: 400 });
      }

      // Cache Storage is an optimization, never a prerequisite for displaying
      // an image. If it is unavailable, use the original URL directly.
      try {
        const cache = await caches.open(CACHE_NAME);
        const cacheKey = new Request(new URL(
          `${CACHE_ENDPOINT}?url=${encodeURIComponent(remoteUrl.href)}`,
          self.registration.scope
        ));
        const cached = await cache.match(cacheKey);
        if (cached) return cached;

        const response = await fetch(remoteUrl.href, {
          mode: 'cors',
          credentials: 'omit',
          redirect: 'follow',
          referrerPolicy: 'no-referrer'
        });
        const contentType = (response.headers.get('content-type') || '').toLowerCase();
        if (response.ok && response.type !== 'opaque' && contentType.startsWith('image/')) {
          await cache.put(cacheKey, response.clone());
          const keys = await cache.keys();
          if (keys.length > MAX_CACHED_IMAGES) {
            await Promise.all(keys.slice(0, keys.length - MAX_CACHED_IMAGES)
              .map(key => cache.delete(key)));
          }
          return response;
        }
      } catch (_) {
        // CORS, network, quota, or Cache API failures fall through to native
        // image loading. Do not let an optimization break the image itself.
      }

      return Response.redirect(remoteUrl.href, 302);
    } catch (_) {
      // If the target was parsed, return the browser to the original resource.
      if (remoteUrl) return Response.redirect(remoteUrl.href, 302);
      return new Response('Invalid media cache request', { status: 400 });
    }
  })());
});
