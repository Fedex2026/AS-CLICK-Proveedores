const CACHE_NAME = "as-click-proveedores-v2";

 

const APP_FILES = [

  "./",

  "./index.html",

  "./login.html",

  "./registro.html",

  "./styles.css",

  "./app.js",

  "./login.js",

  "./registro.js",

  "./firebase-config.js",

  "./manifest.json"

];

 

self.addEventListener("install", (event) => {

  self.skipWaiting();

 

  event.waitUntil(

    caches.open(CACHE_NAME).then((cache) => {

      return cache.addAll(APP_FILES);

    })

  );

});

 

self.addEventListener("activate", (event) => {

  event.waitUntil(

    caches.keys().then((cacheNames) => {

      return Promise.all(

        cacheNames

          .filter((cacheName) => cacheName !== CACHE_NAME)

          .map((cacheName) => caches.delete(cacheName))

      );

    })

  );

 

  self.clients.claim();

});

 

self.addEventListener("fetch", (event) => {

  if (event.request.method !== "GET") return;

 

  const url = new URL(event.request.url);

 

  // Firebase, Firestore y APIs externas deben ir directo a la red.

  // No se guardan en Cache Storage.

  if (url.origin !== self.location.origin) {

    return;

  }

 

  event.respondWith(

    fetch(event.request)

      .then((networkResponse) => {

        if (networkResponse && networkResponse.ok) {

          const responseCopy = networkResponse.clone();

 

          event.waitUntil(

            caches.open(CACHE_NAME).then((cache) => {

              return cache.put(event.request, responseCopy);

            })

          );

        }

 

        return networkResponse;

      })

      .catch(async () => {

        const cachedResponse = await caches.match(event.request);

 

        if (cachedResponse) {

          return cachedResponse;

        }

 

        return Response.error();

      })

  );

});
