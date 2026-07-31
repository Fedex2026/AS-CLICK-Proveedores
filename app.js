import { auth, db } from "./firebase-config.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
  limit,
  updateDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const s = {
  user: null,
  provider: null,
  available: false,
  current: null,
  timer: null,
  seconds: 0,
  watch: null
};

const $ = id => document.getElementById(id);

onAuthStateChanged(auth, async user => {

  if (!user) {
    location.replace("login.html");
    return;
  }

  s.user = user;

  const snap = await getDoc(
    doc(db, "proveedores", user.uid)
  );

  if (!snap.exists()) {
    await signOut(auth);
    location.replace("login.html");
    return;
  }

  s.provider = snap.data();
  s.available = s.provider.disponible === true;

  $("welcomeTitle").textContent =
    `Hola, ${
      s.provider.nombre ||
      s.provider.nombreCompleto ||
      user.email
    }`;

  renderAvailability();

  /*
    Si el proveedor cerró la página estando disponible,
    vuelve a iniciar el seguimiento al regresar.
  */
  if (s.available) {
    startLocation();
  }

  listenServices();

});

$("availabilityToggle").onclick = toggleAvailability;
$("locationButton").onclick = getLocationOnce;
$("logoutButton").onclick = logout;
$("acceptServiceButton").onclick = acceptService;
$("rejectServiceButton").onclick = rejectService;


/* =========================================================
   DISPONIBILIDAD
========================================================= */

async function toggleAvailability() {

  if (!s.user) return;

  const button = $("availabilityToggle");
  const next = !s.available;

  button.disabled = true;

  try {

    await updateDoc(
      doc(db, "proveedores", s.user.uid),
      {
        disponible: next,

        estadoConexion:
          next
            ? "disponible"
            : "desconectado",

        ultimaActualizacion:
          serverTimestamp()
      }
    );

    s.available = next;

    renderAvailability();

    if (next) {

      startLocation();

      activity(
        "Disponibilidad activada",
        "Ya puedes recibir servicios."
      );

      toast(
        "Ahora estás disponible para recibir servicios."
      );

    } else {

      stopLocation();

      await setDoc(
        doc(db, "ubicacionesProveedores", s.user.uid),
        {
          proveedorId: s.user.uid,
          disponible: false,
          actualizadoEn: serverTimestamp()
        },
        {
          merge: true
        }
      );

      $("locationText").textContent =
        "Activa tu disponibilidad para compartir ubicación.";

      activity(
        "Disponibilidad desactivada",
        "Dejaste de recibir servicios nuevos."
      );

      toast(
        "Ahora apareces como no disponible."
      );

      hideService();

    }

  } catch (error) {

    console.error(
      "Error al cambiar disponibilidad:",
      error
    );

    toast(
      "Firebase no permitió cambiar la disponibilidad."
    );

  } finally {

    button.disabled = false;

  }

}


function renderAvailability() {

  $("availabilityToggle")
    .classList
    .toggle("on", s.available);

  $("availabilityToggle")
    .setAttribute(
      "aria-pressed",
      String(s.available)
    );

  $("availabilityText").textContent =
    s.available
      ? "Disponible"
      : "No disponible";

  $("providerStatus").textContent =
    s.available
      ? "Disponible"
      : "Desconectado";

}


/* =========================================================
   SERVICIOS DISPONIBLES
========================================================= */

function listenServices() {

  const q = query(
    collection(db, "servicios"),
    where(
      "estado",
      "==",
      "buscando_proveedor"
    ),
    limit(1)
  );

  onSnapshot(
    q,

    snap => {

      if (!s.available || snap.empty) {

        hideService();
        return;

      }

      const d = snap.docs[0];

      showService({
        id: d.id,
        ...d.data()
      });

    },

    console.error
  );

}


function showService(v) {

  s.current = v;

  $("emptyService")
    .classList
    .add("hidden");

  $("serviceCard")
    .classList
    .remove("hidden");

  $("serviceType").textContent =
    v.tipoServicio ||
    v.tipo ||
    "Servicio";

  $("serviceDistance").textContent =
    v.distanciaTexto ||
    "Cercano";

  $("serviceFolio").textContent =
    v.folio ||
    v.id;

  $("serviceClient").textContent =
    v.clienteNombre ||
    v.nombreCliente ||
    "Cliente AS CLICK";

  $("serviceVehicle").textContent =
    [
      v.marca,
      v.submarca,
      v.color,
      v.placas
    ]
      .filter(Boolean)
      .join(" · ") ||
    "Vehículo por confirmar";

  $("serviceOrigin").textContent =
    v.origenTexto ||
    v.origen ||
    "Ubicación compartida";

  $("serviceDestination").textContent =
    v.destinoTexto ||
    v.destino ||
    "Por confirmar";

  startTimer(20);

}


function hideService() {

  s.current = null;

  stopTimer();

  $("emptyService")
    .classList
    .remove("hidden");

  $("serviceCard")
    .classList
    .add("hidden");

  $("serviceTimer").textContent = "--";

}


/* =========================================================
   ACEPTAR Y RECHAZAR SERVICIO
========================================================= */

async function acceptService() {

  if (!s.current) return;

  const id = s.current.id;

  await updateDoc(
    doc(db, "servicios", id),
    {
      estado: "asignado",

      proveedorId:
        s.user.uid,

      proveedorNombre:
        s.provider.nombre ||
        s.provider.nombreCompleto ||
        s.user.email,

      fechaAsignacion:
        serverTimestamp()
    }
  );

  await updateDoc(
    doc(db, "proveedores", s.user.uid),
    {
      disponible: false,

      estadoConexion:
        "ocupado",

      servicioActualId:
        id,

      ultimaActualizacion:
        serverTimestamp()
    }
  );

  s.available = false;

  renderAvailability();
  stopLocation();

  activity(
    "Servicio aceptado",
    `Folio ${s.current.folio || id}`
  );

  toast(
    "Servicio asignado correctamente."
  );

  hideService();

}


async function rejectService() {

  if (!s.current) return;

  await setDoc(
    doc(
      db,
      "servicios",
      s.current.id,
      "rechazos",
      s.user.uid
    ),
    {
      proveedorId:
        s.user.uid,

      fecha:
        serverTimestamp()
    }
  );

  activity(
    "Servicio rechazado",
    `Folio ${
      s.current.folio ||
      s.current.id
    }`
  );

  toast(
    "Servicio rechazado."
  );

  hideService();

}


/* =========================================================
   TEMPORIZADOR
========================================================= */

function startTimer(n) {

  stopTimer();

  s.seconds = n;

  $("serviceTimer").textContent =
    `${n}s`;

  s.timer = setInterval(() => {

    s.seconds--;

    $("serviceTimer").textContent =
      `${s.seconds}s`;

    if (s.seconds <= 0) {

      stopTimer();
      rejectService();

    }

  }, 1000);

}


function stopTimer() {

  if (s.timer) {

    clearInterval(s.timer);
    s.timer = null;

  }

}


/* =========================================================
   UBICACIÓN
========================================================= */

function startLocation() {

  if (
    !navigator.geolocation ||
    s.watch !== null
  ) {
    return;
  }

  $("locationText").textContent =
    "Obteniendo ubicación en tiempo real...";

  s.watch =
    navigator.geolocation.watchPosition(
      saveLocation,
      locationError,
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 15000
      }
    );

}


function stopLocation() {

  if (s.watch !== null) {

    navigator.geolocation.clearWatch(
      s.watch
    );

    s.watch = null;

  }

}


function getLocationOnce() {

  if (!navigator.geolocation) {

    toast(
      "Este dispositivo no permite ubicación."
    );

    return;

  }

  $("locationText").textContent =
    "Obteniendo ubicación...";

  navigator.geolocation.getCurrentPosition(
    saveLocation,
    locationError,
    {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 15000
    }
  );

}


async function saveLocation(p) {

  if (!s.user) return;

  const {
    latitude,
    longitude,
    accuracy
  } = p.coords;

  $("locationText").textContent =
    `Latitud ${latitude.toFixed(6)} · ` +
    `Longitud ${longitude.toFixed(6)} · ` +
    `Precisión ${Math.round(accuracy)} m`;

  try {

    await setDoc(
      doc(
        db,
        "ubicacionesProveedores",
        s.user.uid
      ),
      {
        proveedorId:
          s.user.uid,

        latitude:
          latitude,

        longitude:
          longitude,

        accuracy:
          accuracy,

        disponible:
          s.available,

        actualizadoEn:
          serverTimestamp()
      },
      {
        merge: true
      }
    );

  } catch (error) {

    console.error(
      "No se pudo guardar la ubicación:",
      error
    );

    toast(
      "Firebase no permitió guardar la ubicación."
    );

  }

}


function locationError(e) {

  $("locationText").textContent =
    ({
      1:
        "Permiso de ubicación rechazado.",

      2:
        "No fue posible detectar la ubicación.",

      3:
        "La ubicación tardó demasiado."
    })[e.code] ||
    "Error al obtener ubicación.";

}


/* =========================================================
   CERRAR SESIÓN
========================================================= */

async function logout() {

  stopLocation();

  try {

    await updateDoc(
      doc(db, "proveedores", s.user.uid),
      {
        disponible:
          false,

        estadoConexion:
          "desconectado",

        ultimaActualizacion:
          serverTimestamp()
      }
    );

    await setDoc(
      doc(
        db,
        "ubicacionesProveedores",
        s.user.uid
      ),
      {
        proveedorId:
          s.user.uid,

        disponible:
          false,

        actualizadoEn:
          serverTimestamp()
      },
      {
        merge: true
      }
    );

  } catch (e) {

    console.error(e);

  }

  await signOut(auth);

  location.replace("login.html");

}


/* =========================================================
   ACTIVIDAD Y MENSAJES
========================================================= */

function activity(a, b) {

  const el =
    document.createElement("div");

  el.className =
    "activity-item";

  el.innerHTML =
    `<span></span>` +
    `<div>` +
    `<strong>${escapeHtml(a)}</strong>` +
    `<p>${escapeHtml(b)}</p>` +
    `</div>`;

  $("activityList").prepend(el);

}


function toast(m) {

  $("toast").textContent = m;

  $("toast")
    .classList
    .add("show");

  setTimeout(
    () =>
      $("toast")
        .classList
        .remove("show"),
    2800
  );

}


function escapeHtml(v) {

  return String(v)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

}


if ("serviceWorker" in navigator) {

  addEventListener(
    "load",
    () =>
      navigator.serviceWorker
        .register("./service-worker.js")
        .catch(console.error)
  );

}
