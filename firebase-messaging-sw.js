/* =========================================================

   AS CLICK PROVEEDORES - FIREBASE MESSAGING SERVICE WORKER

   Recibe notificaciones push cuando la PWA está en segundo

   plano, minimizada o cerrada.

   ========================================================= */

importScripts('https://www.gstatic.com/firebasejs/12.17.0/firebase-app-compat.js');

importScripts('https://www.gstatic.com/firebasejs/12.17.0/firebase-messaging-compat.js');

firebase.initializeApp({

  apiKey: 'AIzaSyDeuQxzRhfVB9rXKD1pnOrNMXbrZnDj4UU',

  authDomain: 'as-clicl-mexico.firebaseapp.com',

  databaseURL: 'https://as-clicl-mexico-default-rtdb.firebaseio.com',

  projectId: 'as-clicl-mexico',

  storageBucket: 'as-clicl-mexico.firebasestorage.app',

  messagingSenderId: '908429271001',

  appId: '1:908429271001:web:40149a91fb2eef3ab4c3c8'

});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(payload => {

  console.log('[AS CLICK SW] Notificación recibida en segundo plano:', payload);

  const notification = payload.notification || {};

  const data = payload.data || {};

  const title =

    notification.title ||

    data.title ||

    'AS CLICK - Nuevo servicio';

  const body =

    notification.body ||

    data.body ||

    'Tienes un nuevo servicio disponible.';

  const icon =

    notification.icon ||

    data.icon ||

    './icon-192.png';

  const badge =

    notification.badge ||

    data.badge ||

    './icon-192.png';

  const notificationOptions = {

    body,

    icon,

    badge,

    vibrate: [300, 150, 300, 150, 500],

    requireInteraction: true,

    tag: data.solicitudId

      ? `as-click-${data.solicitudId}`

      : `as-click-${Date.now()}`,

    renotify: true,

    data: {

      ...data,

      url: data.url || self.registration.scope

    }

  };

  return self.registration.showNotification(title, notificationOptions);

});

self.addEventListener('notificationclick', event => {

  event.notification.close();

  const targetUrl =

    event.notification?.data?.url ||

    self.registration.scope;

  event.waitUntil(

    clients.matchAll({

      type: 'window',

      includeUncontrolled: true

    }).then(windowClients => {

      for (const client of windowClients) {

        if ('focus' in client) {

          client.postMessage({

            type: 'AS_CLICK_NOTIFICATION_CLICK',

            data: event.notification?.data || {}

          });

          return client.focus();

        }

      }

      if (clients.openWindow) {

        return clients.openWindow(targetUrl);

      }

      return undefined;

    })

  );

});

self.addEventListener('install', event => {

  self.skipWaiting();

});

self.addEventListener('activate', event => {

  event.waitUntil(self.clients.claim());

});
