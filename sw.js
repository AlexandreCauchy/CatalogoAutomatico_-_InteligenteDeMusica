const CACHE_NAME = 'sonichub-v3-cache';
const urlsToCache = [
    '/',
    '/index.html',
    '/css/estilo.css',
    '/js/bd.js',
    '/js/catalogo.js',
    '/js/assistente.js',
    '/js/aplicativo.js',
    '/assets/img/hero.png'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache))
    );
});

self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) return response;
                return fetch(event.request);
            })
    );
});
