// Permite instalar SISO como aplicacion (computadora, tablet o telefono).
// Siempre pide primero la version nueva a internet; la copia guardada solo se usa sin conexion.
// Solo guarda los archivos propios del sistema (codigo, estilos, iconos).
// NUNCA guarda datos de colaboradores: esos se leen de la carpeta empresarial de OneDrive.
const CACHE = 'siso-app-v26';

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.add('./')).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

const SAFE_TYPES = /\.(html|js|css|webmanifest|png|jpe?g|svg|ico)$/i;

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const isPage = request.mode === 'navigate';
  if (!isPage && !SAFE_TYPES.test(url.pathname)) return;
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request, { ignoreSearch: true }))
  );
});
