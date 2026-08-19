importScripts(
  "https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js"
);

importScripts(
  "https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging-compat.js"
);

firebase.initializeApp({
  apiKey: "AIzaSyDeuQxzRhfVB9rXKD1pnOrNMXbrZnDj4UU",
  authDomain: "as-clicl-mexico.firebaseapp.com",
  databaseURL: "https://as-clicl-mexico-default-rtdb.firebaseio.com",
  projectId: "as-clicl-mexico",
  storageBucket: "as-clicl-mexico.firebasestorage.app",
  messagingSenderId: "908429271001",
  appId: "1:908429271001:web:40149a91fb2eef3ab4c3c8"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log(
    "[firebase-messaging-sw.js] Notificación recibida:",
    payload
  );

  const title =
    payload.notification?.title ||
    "AS CLICK - Nuevo servicio";

  const options = {
    body:
      payload.notification?.body ||
      "Tienes un nuevo servicio disponible.",
    icon: "./icon-192.png",
    badge: "./icon-192.png",
    data: payload.data || {}
  };

  self.registration.showNotification(title, options);
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({
      type: "window",
      includeUncontrolled: true
    }).then((clientList) => {

      for (const client of clientList) {
        if ("focus" in client) {
          return client.focus();
        }
      }

      if (clients.openWindow) {
        return clients.openWindow("./");
      }
    })
  );
});
