import { auth, db } from "./firebase-config.js";

import {
  onAuthStateChanged,
  signOut
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
  updateDoc,
  setDoc,
  serverTimestamp,
  runTransaction
 collection,
 doc,
 getDoc,
 onSnapshot,
 query,
 where,
 updateDoc,
 setDoc,
 serverTimestamp,
 runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";


 
const ACTIVE_STATES = [
 "asignado",
 "en_camino",
 "arribo",
 "en_traslado",
 "destino"
];
 
const s = {
  user: null,
  provider: null,

  available: false,

  current: null,

  timer: null,
  seconds: 0,

  watch: null,

  latitude: null,
  longitude: null,
  accuracy: null,

  solicitudes: [],

  rejected: new Set(),

  refreshRadiusTimer: null
 user: null,
 provider: null,
 available: false,
 current: null,
 activeService: null,
 timer: null,
 seconds: 0,
 watch: null,
 latitude: null,
 longitude: null,
 accuracy: null,
 solicitudes: [],
 rejected: new Set(),
 refreshRadiusTimer: null,
 unsubscribeActiveService: null
};


 
const $ = id => document.getElementById(id);


/* =========================================================
   INICIO DE SESIÓN Y CARGA DEL PROVEEDOR
========================================================= */

 
onAuthStateChanged(auth, async user => {

  if (!user) {

    location.replace("login.html");

    return;

  }

  s.user = user;

  try {

    const snap = await getDoc(
      doc(
        db,
        "proveedores",
        user.uid
      )
    );

    if (!snap.exists()) {

      await signOut(auth);

      location.replace("login.html");

      return;

    }

    s.provider = snap.data();

    s.available =
      s.provider.disponible === true;

    $("welcomeTitle").textContent =
      `Hola, ${
        s.provider.nombre ||
        s.provider.nombreCompleto ||
        user.email
      }`;

    $("providerRating").textContent =
      Number(
        s.provider.calificacion ?? 5
      ).toFixed(1);

    $("todayServices").textContent =
      s.provider.serviciosHoy ??
      s.provider.serviciosRealizadosHoy ??
      0;

    $("todayIncome").textContent =
      `$${Number(
        s.provider.gananciasHoy ?? 0
      ).toLocaleString("es-MX")}`;

    renderAvailability();

    if (s.available) {

      startLocation();

    }

    listenServices();

    /*
      Revisa nuevamente las solicitudes cada 10 segundos.

      Esto permite ampliar automáticamente el radio conforme
      pasa el tiempo desde que se creó la solicitud.
    */
    s.refreshRadiusTimer =
      setInterval(
        evaluateAvailableServices,
        10000
      );

  } catch (error) {

    console.error(
      "Error cargando proveedor:",
      error
    );

    toast(
      "No fue posible cargar el perfil del proveedor."
    );

  }

 if (!user) {
   location.replace("login.html");
   return;
 }
 
 s.user = user;
 
 try {
   const snap = await getDoc(doc(db, "proveedores", user.uid));
 
   if (!snap.exists()) {
     await signOut(auth);
     location.replace("login.html");
     return;
   }
 
   s.provider = snap.data();
   s.available = s.provider.disponible === true;
 
   $("welcomeTitle").textContent = `Hola, ${
     s.provider.nombre ||
     s.provider.nombreCompleto ||
     user.email
   }`;
 
   $("providerRating").textContent = Number(s.provider.calificacion ?? 5).toFixed(1);
   $("todayServices").textContent = s.provider.serviciosHoy ?? s.provider.serviciosRealizadosHoy ?? 0;
   $("todayIncome").textContent = $${Number(s.provider.gananciasHoy ?? 0).toLocaleString("es-MX")};
 
   renderAvailability();
   listenServices();
   listenActiveService();
 
   if (s.available || s.provider.servicioActualId) {
     startLocation();
   }
 
   s.refreshRadiusTimer = setInterval(evaluateAvailableServices, 10000);
 } catch (error) {
   console.error("Error cargando proveedor:", error);
   toast("No fue posible cargar el perfil del proveedor.");
 }
});


$("availabilityToggle").onclick =
  toggleAvailability;

$("locationButton").onclick =
  getLocationOnce;

$("logoutButton").onclick =
  logout;

$("acceptServiceButton").onclick =
  acceptService;

$("rejectServiceButton").onclick =
  rejectService;


/* =========================================================
   DISPONIBILIDAD
========================================================= */

 
$("availabilityToggle").onclick = toggleAvailability;
$("locationButton").onclick = getLocationOnce;
$("logoutButton").onclick = logout;
$("acceptServiceButton").onclick = acceptService;
$("rejectServiceButton").onclick = rejectService;
$("onTheWayButton").onclick = () => updateActiveServiceStatus("en_camino");
$("arrivalButton").onclick = () => updateActiveServiceStatus("arribo");
$("startTransferButton").onclick = () => updateActiveServiceStatus("en_traslado");
$("destinationArrivalButton").onclick = () => updateActiveServiceStatus("destino");
$("finishServiceButton").onclick = finishActiveService;
$("openOriginButton").onclick = openActiveOrigin;
$("openDestinationButton").onclick = openActiveDestination;
$("goToActiveServiceButton").onclick = () => openView("servicios");
 
async function toggleAvailability() {

  if (!s.user) return;

  const button =
    $("availabilityToggle");

  const next =
    !s.available;

  button.disabled = true;

  try {

    await updateDoc(
      doc(
        db,
        "proveedores",
        s.user.uid
      ),
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

      evaluateAvailableServices();

    } else {

      stopLocation();

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

 if (!s.user) return;
 
 if (s.activeService) {
   toast("Tienes un servicio activo. Finalízalo antes de cambiar tu disponibilidad.");
   return;
 }
 
 const button = $("availabilityToggle");
 const next = !s.available;
 button.disabled = true;
 
 try {
   await updateDoc(doc(db, "proveedores", s.user.uid), {
     disponible: next,
     estadoConexion: next ? "disponible" : "desconectado",
     ultimaActualizacion: serverTimestamp()
   });
 
   s.available = next;
   renderAvailability();
 
   if (next) {
     startLocation();
     activity("Disponibilidad activada", "Ya puedes recibir servicios.");
     toast("Ahora estás disponible para recibir servicios.");
     evaluateAvailableServices();
   } else {
     stopLocation();
     await setDoc(doc(db, "ubicacionesProveedores", s.user.uid), {
       proveedorId: s.user.uid,
       disponible: false,
       actualizadoEn: serverTimestamp()
     }, { merge: true });
 
     $("locationText").textContent = "Activa tu disponibilidad para compartir ubicación.";
     activity("Disponibilidad desactivada", "Dejaste de recibir servicios nuevos.");
     toast("Ahora apareces como no disponible.");
     hideService();
   }
 } catch (error) {
   console.error("Error al cambiar disponibilidad:", error);
   toast("Firebase no permitió cambiar la disponibilidad.");
 } finally {
   button.disabled = false;
 }
}


 
function renderAvailability() {

  $("availabilityToggle")
    .classList
    .toggle(
      "on",
      s.available
    );

  $("availabilityToggle")
    .classList
    .toggle(
      "is-on",
      s.available
    );

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

 const occupied = Boolean(s.activeService || s.provider?.servicioActualId);
 
 $("availabilityToggle").classList.toggle("on", s.available);
 $("availabilityToggle").classList.toggle("is-on", s.available);
 $("availabilityToggle").setAttribute("aria-pressed", String(s.available));
 $("availabilityToggle").disabled = occupied;
 
 $("availabilityText").textContent = occupied
   ? "Ocupado"
   : s.available
     ? "Disponible"
     : "No disponible";
 
 $("providerStatus").textContent = occupied
   ? "Ocupado"
   : s.available
     ? "Disponible"
     : "Desconectado";
}


/* =========================================================
   ESCUCHAR SOLICITUDES REALES
========================================================= */

 
function listenServices() {

  const solicitudesQuery = query(
    collection(
      db,
      "solicitudes"
    ),
    where(
      "estado",
      "==",
      "pendiente_cabina"
    )
  );

  onSnapshot(
    solicitudesQuery,

    snapshot => {

      s.solicitudes =
        snapshot.docs.map(
          solicitudDoc => ({
            id: solicitudDoc.id,
            ...solicitudDoc.data()
          })
        );

      evaluateAvailableServices();

    },

    error => {

      console.error(
        "Error escuchando solicitudes:",
        error
      );

      toast(
        "Firebase no permitió consultar las solicitudes."
      );

    }
  );

 const solicitudesQuery = query(
   collection(db, "solicitudes"),
   where("estado", "==", "pendiente_cabina")
 );
 
 onSnapshot(solicitudesQuery, snapshot => {
   s.solicitudes = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
   evaluateAvailableServices();
 }, error => {
   console.error("Error escuchando solicitudes:", error);
   toast("Firebase no permitió consultar las solicitudes.");
 });
}


/* =========================================================
   BUSCAR EL SERVICIO MÁS CERCANO
========================================================= */

 
function listenActiveService() {
 if (s.unsubscribeActiveService) s.unsubscribeActiveService();
 
 const activeQuery = query(
   collection(db, "solicitudes"),
   where("asignacion.uidProveedor", "==", s.user.uid),
   where("estado", "in", ACTIVE_STATES)
 );
 
 s.unsubscribeActiveService = onSnapshot(activeQuery, snapshot => {
   const active = snapshot.docs[0];
 
   if (!active) {
     s.activeService = null;
     renderActiveService();
     renderAvailability();
     return;
   }
 
   s.activeService = { id: active.id, ...active.data() };
   s.available = false;
   renderAvailability();
   renderActiveService();
   startLocation();
 }, error => {
   console.error("Error escuchando servicio activo:", error);
   toast("No fue posible cargar el servicio en curso.");
 });
}
 
function evaluateAvailableServices() {

  if (!s.available) {

    hideService();

    return;

  }

  if (
    !Number.isFinite(s.latitude) ||
    !Number.isFinite(s.longitude)
  ) {

    hideService();

    return;

  }

  const providerType =
    normalizeServiceType(
      s.provider?.tipoProveedor ||
      s.provider?.tipo ||
      ""
    );

  const availableRequests =
    s.solicitudes
      .filter(request => {

        if (
          s.rejected.has(request.id)
        ) {
          return false;
        }

        const requestType =
          normalizeServiceType(
            request.servicio?.tipo ||
            request.servicio?.nombre ||
            ""
          );

        if (
          !providerType ||
          requestType !== providerType
        ) {
          return false;
        }

        const assignedProvider =
          request.asignacion
            ?.uidProveedor;

        if (
          assignedProvider &&
          String(assignedProvider).trim()
        ) {
          return false;
        }

        const latitude =
          Number(
            request.ubicacion?.latitud
          );

        const longitude =
          Number(
            request.ubicacion?.longitud
          );

        if (
          !Number.isFinite(latitude) ||
          !Number.isFinite(longitude)
        ) {
          return false;
        }

        const distance =
          calculateDistanceKm(
            s.latitude,
            s.longitude,
            latitude,
            longitude
          );

        const allowedRadius =
          getAllowedRadiusKm(request);

        request.__distanceKm =
          distance;

        request.__allowedRadiusKm =
          allowedRadius;

        return (
          distance <= allowedRadius &&
          distance <= 70
        );

      })
      .sort(
        (a, b) =>
          a.__distanceKm -
          b.__distanceKm
      );

  if (
    availableRequests.length === 0
  ) {

    hideService();

    return;

  }

  const nearest =
    availableRequests[0];

  if (
    s.current?.id === nearest.id
  ) {

    updateDistanceDisplay(nearest);

    return;

  }

  showService(nearest);

 if (s.activeService || !s.available) {
   hideService();
   return;
 }
 
 if (!Number.isFinite(s.latitude) || !Number.isFinite(s.longitude)) {
   hideService();
   return;
 }
 
 const providerType = normalizeServiceType(
   s.provider?.tipoProveedor || s.provider?.tipo || ""
 );
 
 const availableRequests = s.solicitudes
   .filter(request => {
     if (s.rejected.has(request.id)) return false;
 
     const requestType = normalizeServiceType(
       request.servicio?.tipo || request.servicio?.nombre || ""
     );
 
     if (!providerType || requestType !== providerType) return false;
 
     const assignedProvider = request.asignacion?.uidProveedor;
     if (assignedProvider && String(assignedProvider).trim()) return false;
 
     const latitude = Number(request.ubicacion?.latitud);
     const longitude = Number(request.ubicacion?.longitud);
 
     if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
 
     const distance = calculateDistanceKm(
       s.latitude,
       s.longitude,
       latitude,
       longitude
     );
 
     const allowedRadius = getAllowedRadiusKm(request);
     request.__distanceKm = distance;
     request.__allowedRadiusKm = allowedRadius;
 
     return distance <= allowedRadius && distance <= 70;
   })
   .sort((a, b) => a._distanceKm - b._distanceKm);
 
 if (!availableRequests.length) {
   hideService();
   return;
 }
 
 const nearest = availableRequests[0];
 
 if (s.current?.id === nearest.id) {
   updateDistanceDisplay(nearest);
   return;
 }
 
 showService(nearest);
}


/* =========================================================
   RADIO PROGRESIVO
========================================================= */

 
function getAllowedRadiusKm(request) {

  const createdAtMs =
    getRequestCreatedTime(request);

  if (!createdAtMs) {

    return 70;

  }

  const ageSeconds =
    Math.max(
      0,
      Math.floor(
        (
          Date.now() -
          createdAtMs
        ) / 1000
      )
    );

  /*
    0 a 20 segundos:
    proveedores a 10 km.

    20 a 40 segundos:
    proveedores a 25 km.

    40 a 60 segundos:
    proveedores a 40 km.

    Más de 60 segundos:
    proveedores hasta 70 km.
  */

  if (ageSeconds < 20) {

    return 10;

  }

  if (ageSeconds < 40) {

    return 25;

  }

  if (ageSeconds < 60) {

    return 40;

  }

  return 70;

 const createdAtMs = getRequestCreatedTime(request);
 if (!createdAtMs) return 70;
 
 const ageSeconds = Math.max(0, Math.floor((Date.now() - createdAtMs) / 1000));
 if (ageSeconds < 20) return 10;
 if (ageSeconds < 40) return 25;
 if (ageSeconds < 60) return 40;
 return 70;
}


 
function getRequestCreatedTime(request) {

  const created =
    request.creadoEn ||
    request.fechaCreacion ||
    request.creadaEn;

  if (!created) {

    return null;

  }

  if (
    typeof created.toMillis ===
    "function"
  ) {

    return created.toMillis();

  }

  if (
    created.seconds
  ) {

    return (
      created.seconds * 1000
    );

  }

  const parsed =
    new Date(created).getTime();

  return Number.isFinite(parsed)
    ? parsed
    : null;

 const created = request.creadoEn || request.fechaCreacion || request.creadaEn;
 if (!created) return null;
 if (typeof created.toMillis === "function") return created.toMillis();
 if (created.seconds) return created.seconds * 1000;
 const parsed = new Date(created).getTime();
 return Number.isFinite(parsed) ? parsed : null;
}


/* =========================================================
   MOSTRAR SOLICITUD
========================================================= */

 
function showService(v) {

  s.current = v;

  $("emptyService")
    .classList
    .add("hidden");

  $("serviceCard")
    .classList
    .remove("hidden");

  $("serviceType").textContent =
    v.servicio?.nombre ||
    formatServiceType(
      v.servicio?.tipo
    ) ||
    "Servicio";

  updateDistanceDisplay(v);

  $("serviceFolio").textContent =
    v.folioOficial ||
    v.folio ||
    v.id;

  $("serviceClient").textContent =
    v.cliente?.nombre ||
    "Cliente AS CLICK";

  $("serviceVehicle").textContent =
    [
      v.vehiculo?.marca,
      v.vehiculo?.subMarca ||
      v.vehiculo?.submarca,
      v.vehiculo?.color,
      v.vehiculo?.placas
    ]
      .filter(Boolean)
      .join(" · ") ||
    "Vehículo por confirmar";

  const originElement =
    $("serviceOrigin");

  const latitude =
    Number(v.ubicacion?.latitud);

  const longitude =
    Number(v.ubicacion?.longitud);

  const mapsUrl =
    v.ubicacion?.enlaceGoogleMaps ||
    (
      Number.isFinite(latitude) &&
      Number.isFinite(longitude)
        ? `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`
        : ""
    );

  if (mapsUrl) {

    originElement.innerHTML = `
      <a
        href="${mapsUrl}"
        target="_blank"
        rel="noopener noreferrer"
        style="
          display:inline-block;
          color:#38bdf8;
          font-weight:700;
          text-decoration:none;
          padding:8px 12px;
          border:1px solid #38bdf8;
          border-radius:10px;
          cursor:pointer;
        "
      >
        📍 Abrir ubicación y ver ruta
      </a>
    `;

  } else {

    originElement.textContent =
      buildOriginText(v);

  }

  $("serviceDestination").textContent =
    buildDestinationText(v);

  startTimer(90);

 s.current = v;
 $("emptyService").classList.add("hidden");
 $("serviceCard").classList.remove("hidden");
 
 $("serviceType").textContent = v.servicio?.nombre || formatServiceType(v.servicio?.tipo) || "Servicio";
 updateDistanceDisplay(v);
 $("serviceFolio").textContent = v.folioOficial || v.folio || v.id;
 $("serviceClient").textContent = v.cliente?.nombre || "Cliente AS CLICK";
 $("serviceVehicle").textContent = vehicleText(v);
 
 const originElement = $("serviceOrigin");
 const mapsUrl = buildOriginMapsUrl(v);
 
 if (mapsUrl) {
   originElement.innerHTML = <a href="${mapsUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;color:#38bdf8;font-weight:700;text-decoration:none;padding:8px 12px;border:1px solid #38bdf8;border-radius:10px;cursor:pointer;">📍 Abrir ubicación y ver ruta</a>;
 } else {
   originElement.textContent = buildOriginText(v);
 }
 
 $("serviceDestination").textContent = buildDestinationText(v);
 startTimer(90);
}


 
function updateDistanceDisplay(v) {

  const distance =
    Number(v.__distanceKm);

  if (!Number.isFinite(distance)) {

    $("serviceDistance").textContent =
      "Cercano";

    return;

  }

  const eta =
    estimateMinutes(distance);

  $("serviceDistance").textContent =
    `${distance.toFixed(1)} km · ${eta} min`;

 const distance = Number(v.__distanceKm);
 if (!Number.isFinite(distance)) {
   $("serviceDistance").textContent = "Cercano";
   return;
 }
 $("serviceDistance").textContent = ${distance.toFixed(1)} km · ${estimateMinutes(distance)} min;
}
 
function vehicleText(v) {
 return [
   v.vehiculo?.marca,
   v.vehiculo?.subMarca || v.vehiculo?.submarca,
   v.vehiculo?.color,
   v.vehiculo?.placas
 ].filter(Boolean).join(" · ") || "Vehículo por confirmar";
}


 
function buildOriginText(v) {

  const originText =
    v.ubicacion?.direccion ||
    v.ubicacion?.domicilio ||
    v.origenTexto ||
    v.origen;

  if (originText) {

    return originText;

  }

  const latitude =
    Number(
      v.ubicacion?.latitud
    );

  const longitude =
    Number(
      v.ubicacion?.longitud
    );

  if (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude)
  ) {

    return (
      `${latitude.toFixed(6)}, ` +
      `${longitude.toFixed(6)}`
    );

  }

  return "Ubicación compartida";

 const originText = v.ubicacion?.direccion || v.ubicacion?.domicilio || v.origenTexto || v.origen;
 if (originText) return originText;
 
 const latitude = Number(v.ubicacion?.latitud);
 const longitude = Number(v.ubicacion?.longitud);
 
 if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
   return ${latitude.toFixed(6)}, ${longitude.toFixed(6)};
 }
 
 return "Ubicación compartida";
}


 
function buildDestinationText(v) {

  return (
    v.destino?.direccion ||
    v.destinoTexto ||
    v.servicio?.destino ||
    v.destino ||
    "Por confirmar"
  );

 if (typeof v.destino === "string") return v.destino;
 return v.destino?.direccion || v.destinoTexto || v.servicio?.destino || "Por confirmar";
}
 
function buildOriginMapsUrl(v) {
 const latitude = Number(v.ubicacion?.latitud);
 const longitude = Number(v.ubicacion?.longitud);
 return v.ubicacion?.enlaceGoogleMaps || (
   Number.isFinite(latitude) && Number.isFinite(longitude)
     ? https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}
     : ""
 );
}


 
function buildDestinationMapsUrl(v) {
 const destination = buildDestinationText(v);
 if (!destination || destination === "Por confirmar") return "";
 return https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)};
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

  $("serviceTimer").textContent =
    "--";

 s.current = null;
 stopTimer();
 $("emptyService").classList.remove("hidden");
 $("serviceCard").classList.add("hidden");
 $("serviceTimer").textContent = "--";
}


/* =========================================================
   ACEPTAR SERVICIO
========================================================= */

 
async function acceptService() {

  if (
    !s.current ||
    !s.user
  ) {
    return;
  }

  const currentRequest =
    s.current;

  const id =
    currentRequest.id;

  const acceptButton =
    $("acceptServiceButton");

  const rejectButton =
    $("rejectServiceButton");

  acceptButton.disabled = true;
  rejectButton.disabled = true;

  try {

    const requestRef =
      doc(
        db,
        "solicitudes",
        id
      );

    await runTransaction(
      db,

      async transaction => {

        const requestSnap =
          await transaction.get(
            requestRef
          );

        if (
          !requestSnap.exists()
        ) {

          throw new Error(
            "La solicitud ya no existe."
          );

        }

        const requestData =
          requestSnap.data();

        const assignedUid =
          requestData
            .asignacion
            ?.uidProveedor;

        if (
          requestData.estado !==
          "pendiente_cabina"
        ) {

          throw new Error(
            "Este servicio ya no está disponible."
          );

        }

        if (
          assignedUid &&
          String(assignedUid).trim()
        ) {

          throw new Error(
            "Otro proveedor aceptó el servicio primero."
          );

        }

        const distance =
          Number(
            currentRequest
              .__distanceKm
          );

        const eta =
          estimateMinutes(
            distance
          );

        transaction.update(
          requestRef,
          {
            estado:
              "asignado",

            "asignacion.uidProveedor":
              s.user.uid,

            "asignacion.nombreProveedor":
              s.provider.nombre ||
              s.provider.nombreCompleto ||
              s.user.email,

            "asignacion.telefonoProveedor":
              s.provider.telefono ||
              "",

            "asignacion.fotoProveedor":
              s.provider.foto ||
              s.provider.fotoURL ||
              "",

            "asignacion.tiempoEstimadoMinutos":
              eta,

            distanciaProveedorKm:
              Number.isFinite(distance)
                ? Number(
                    distance.toFixed(2)
                  )
                : null,

            fechaAsignacion:
              serverTimestamp(),

            actualizadoEn:
              serverTimestamp()
          }
        );

      }
    );

    await updateDoc(
      doc(
        db,
        "proveedores",
        s.user.uid
      ),
      {
        disponible:
          false,

        estadoConexion:
          "ocupado",

        servicioActualId:
          id,

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

        servicioActualId:
          id,

        actualizadoEn:
          serverTimestamp()
      },
      {
        merge: true
      }
    );

    s.available =
      false;

    renderAvailability();

    stopLocation();

    activity(
      "Servicio aceptado",
      `Folio ${
        currentRequest.folioOficial ||
        currentRequest.folio ||
        id
      }`
    );

    toast(
      "Servicio asignado correctamente."
    );

    hideService();

  } catch (error) {

    console.error(
      "Error aceptando servicio:",
      error
    );

    toast(
      error.message ||
      "No fue posible aceptar el servicio."
    );

    evaluateAvailableServices();

  } finally {

    acceptButton.disabled =
      false;

    rejectButton.disabled =
      false;

  }

 if (!s.current || !s.user) return;
 
 const currentRequest = s.current;
 const id = currentRequest.id;
 const acceptButton = $("acceptServiceButton");
 const rejectButton = $("rejectServiceButton");
 acceptButton.disabled = true;
 rejectButton.disabled = true;
 
 try {
   const requestRef = doc(db, "solicitudes", id);
 
   await runTransaction(db, async transaction => {
     const requestSnap = await transaction.get(requestRef);
     if (!requestSnap.exists()) throw new Error("La solicitud ya no existe.");
 
     const requestData = requestSnap.data();
     const assignedUid = requestData.asignacion?.uidProveedor;
 
     if (requestData.estado !== "pendiente_cabina") {
       throw new Error("Este servicio ya no está disponible.");
     }
 
     if (assignedUid && String(assignedUid).trim()) {
       throw new Error("Otro proveedor aceptó el servicio primero.");
     }
 
     const distance = Number(currentRequest.__distanceKm);
     const eta = estimateMinutes(distance);
 
     transaction.update(requestRef, {
       estado: "asignado",
       "asignacion.uidProveedor": s.user.uid,
       "asignacion.nombreProveedor": s.provider.nombre || s.provider.nombreCompleto || s.user.email,
       "asignacion.telefonoProveedor": s.provider.telefono || "",
       "asignacion.fotoProveedor": s.provider.foto || s.provider.fotoURL || "",
       "asignacion.tiempoEstimadoMinutos": eta,
       distanciaProveedorKm: Number.isFinite(distance) ? Number(distance.toFixed(2)) : null,
       fechaAsignacion: serverTimestamp(),
       actualizadoEn: serverTimestamp()
     });
   });
 
   await updateDoc(doc(db, "proveedores", s.user.uid), {
     disponible: false,
     estadoConexion: "ocupado",
     servicioActualId: id,
     ultimaActualizacion: serverTimestamp()
   });
 
   await setDoc(doc(db, "ubicacionesProveedores", s.user.uid), {
     proveedorId: s.user.uid,
     disponible: false,
     servicioActualId: id,
     actualizadoEn: serverTimestamp()
   }, { merge: true });
 
   s.available = false;
   s.provider.servicioActualId = id;
   renderAvailability();
   startLocation();
   stopTimer();
   hideService();
 
   activity("Servicio aceptado", Folio ${currentRequest.folioOficial || currentRequest.folio || id});
   toast("Servicio asignado correctamente. Abre Servicios para darle seguimiento.");
   openView("servicios");
 } catch (error) {
   console.error("Error aceptando servicio:", error);
   toast(error.message || "No fue posible aceptar el servicio.");
   evaluateAvailableServices();
 } finally {
   acceptButton.disabled = false;
   rejectButton.disabled = false;
 }
}


/* =========================================================
   RECHAZAR SERVICIO
========================================================= */

 
async function rejectService() {

  if (
    !s.current ||
    !s.user
  ) {
    return;
  }

  const currentRequest =
    s.current;

  const id =
    currentRequest.id;

  s.rejected.add(id);

  try {

    await setDoc(
      doc(
        db,
        "solicitudes",
        id,
        "rechazos",
        s.user.uid
      ),
      {
        proveedorId:
          s.user.uid,

        proveedorNombre:
          s.provider?.nombre ||
          s.provider?.nombreCompleto ||
          s.user.email,

        fecha:
          serverTimestamp()
      }
    );

  } catch (error) {

    console.error(
      "No se pudo guardar el rechazo:",
      error
    );

  }

  activity(
    "Servicio rechazado",
    `Folio ${
      currentRequest.folioOficial ||
      currentRequest.folio ||
      id
    }`
  );

  toast(
    "Servicio rechazado."
  );

  hideService();

  setTimeout(
    evaluateAvailableServices,
    300
  );

 if (!s.current || !s.user) return;
 
 const currentRequest = s.current;
 const id = currentRequest.id;
 s.rejected.add(id);
 
 try {
   await setDoc(doc(db, "solicitudes", id, "rechazos", s.user.uid), {
     proveedorId: s.user.uid,
     proveedorNombre: s.provider?.nombre || s.provider?.nombreCompleto || s.user.email,
     fecha: serverTimestamp()
   });
 } catch (error) {
   console.error("No se pudo guardar el rechazo:", error);
 }
 
 activity("Servicio rechazado", Folio ${currentRequest.folioOficial || currentRequest.folio || id});
 toast("Servicio rechazado.");
 hideService();
 setTimeout(evaluateAvailableServices, 300);
}
 
function renderActiveService() {
 const v = s.activeService;
 const hasActive = Boolean(v);
 
 $("activeServiceEmpty").classList.toggle("hidden", hasActive);
 $("activeServiceCard").classList.toggle("hidden", !hasActive);
 $("dashboardActiveService").classList.toggle("hidden", !hasActive);
 
 if (!v) {
   $("activeServiceStatusBadge").textContent = "Sin servicio";
   return;
 }
 
 const folio = v.folioOficial || v.folio || v.id;
 const statusName = formatStatus(v.estado);
 
 $("activeServiceFolio").textContent = folio;
 $("activeServiceClient").textContent = v.cliente?.nombre || "Cliente AS CLICK";
 $("activeServicePhone").textContent = v.cliente?.telefono || v.telefonoCliente || "No disponible";
 $("activeServiceVehicle").textContent = vehicleText(v);
 $("activeServiceOrigin").textContent = buildOriginText(v);
 $("activeServiceDestination").textContent = buildDestinationText(v);
 $("activeServiceStatus").textContent = statusName;
 $("activeServiceStatusBadge").textContent = statusName;
 $("dashboardActiveTitle").textContent = Servicio ${folio};
 $("dashboardActiveSummary").textContent = ${statusName} · ${buildOriginText(v)};
 
 updateProgressButtons(v.estado);
}
 
function updateProgressButtons(status) {
 const order = ["asignado", "en_camino", "arribo", "en_traslado", "destino"];
 const currentIndex = order.indexOf(status);
 
 $("onTheWayButton").disabled = currentIndex !== 0;
 $("arrivalButton").disabled = currentIndex !== 1;
 $("startTransferButton").disabled = currentIndex !== 2;
 $("destinationArrivalButton").disabled = currentIndex !== 3;
 $("finishServiceButton").disabled = currentIndex !== 4;
}


/* =========================================================
   TEMPORIZADOR
========================================================= */

 
async function updateActiveServiceStatus(nextStatus) {
 if (!s.activeService || !s.user) return;
 
 try {
   const updates = {
     estado: nextStatus,
     actualizadoEn: serverTimestamp()
   };
 
   const dateFields = {
     en_camino: "fechaEnCamino",
     arribo: "fechaArribo",
     en_traslado: "fechaInicioTraslado",
     destino: "fechaLlegadaDestino"
   };
 
   if (dateFields[nextStatus]) updates[dateFields[nextStatus]] = serverTimestamp();
 
   await updateDoc(doc(db, "solicitudes", s.activeService.id), updates);
   activity(formatStatus(nextStatus), Folio ${s.activeService.folioOficial || s.activeService.folio || s.activeService.id});
   toast(Estado actualizado: ${formatStatus(nextStatus)}.);
 } catch (error) {
   console.error("Error actualizando estado:", error);
   toast("No fue posible actualizar el estado del servicio.");
 }
}
 
async function finishActiveService() {
 if (!s.activeService || !s.user) return;
 
 const id = s.activeService.id;
 
 try {
   await updateDoc(doc(db, "solicitudes", id), {
     estado: "finalizado",
     fechaFinalizacion: serverTimestamp(),
     actualizadoEn: serverTimestamp()
   });
 
   await updateDoc(doc(db, "proveedores", s.user.uid), {
     disponible: true,
     estadoConexion: "disponible",
     servicioActualId: null,
     ultimaActualizacion: serverTimestamp()
   });
 
   await setDoc(doc(db, "ubicacionesProveedores", s.user.uid), {
     proveedorId: s.user.uid,
     disponible: true,
     servicioActualId: null,
     actualizadoEn: serverTimestamp()
   }, { merge: true });
 
   s.activeService = null;
   s.available = true;
   s.provider.servicioActualId = null;
   renderAvailability();
   renderActiveService();
   startLocation();
   activity("Servicio finalizado", Folio ${id});
   toast("Servicio finalizado. Ya estás disponible nuevamente.");
   openView("dashboard");
   evaluateAvailableServices();
 } catch (error) {
   console.error("Error finalizando servicio:", error);
   toast("No fue posible finalizar el servicio.");
 }
}
 
function openActiveOrigin() {
 if (!s.activeService) return;
 const url = buildOriginMapsUrl(s.activeService);
 if (url) window.open(url, "_blank", "noopener,noreferrer");
 else toast("El servicio no tiene una ubicación de origen válida.");
}
 
function openActiveDestination() {
 if (!s.activeService) return;
 const url = buildDestinationMapsUrl(s.activeService);
 if (url) window.open(url, "_blank", "noopener,noreferrer");
 else toast("El destino todavía no está confirmado.");
}
 
function formatStatus(value) {
 const statuses = {
   asignado: "Asignado",
   en_camino: "En camino",
   arribo: "Arribo",
   en_traslado: "En traslado",
   destino: "En destino",
   finalizado: "Finalizado"
 };
 return statuses[value] || "Servicio activo";
}
 
function startTimer(n) {

  stopTimer();

  s.seconds =
    n;

  $("serviceTimer").textContent =
    `${n}s`;

  s.timer =
    setInterval(
      () => {

        s.seconds--;

        $("serviceTimer").textContent =
          `${s.seconds}s`;

        if (
          s.seconds <= 0
        ) {

          stopTimer();

          rejectService();

        }

      },
      1000
    );

 stopTimer();
 s.seconds = n;
 $("serviceTimer").textContent = ${n}s;
 s.timer = setInterval(() => {
   s.seconds--;
   $("serviceTimer").textContent = ${s.seconds}s;
   if (s.seconds <= 0) {
     stopTimer();
     rejectService();
   }
 }, 1000);
}


 
function stopTimer() {

  if (s.timer) {

    clearInterval(
      s.timer
    );

    s.timer =
      null;

  }

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
    navigator.geolocation
      .watchPosition(
        saveLocation,
        locationError,
        {
          enableHighAccuracy:
            true,

          maximumAge:
            0,

          timeout:
            15000
        }
      );

 if (!navigator.geolocation || s.watch !== null) return;
 $("locationText").textContent = "Obteniendo ubicación en tiempo real...";
 s.watch = navigator.geolocation.watchPosition(saveLocation, locationError, {
   enableHighAccuracy: true,
   maximumAge: 0,
   timeout: 15000
 });
}


 
function stopLocation() {

  if (
    s.watch !== null
  ) {

    navigator.geolocation
      .clearWatch(
        s.watch
      );

    s.watch =
      null;

  }

 if (s.watch !== null) {
   navigator.geolocation.clearWatch(s.watch);
   s.watch = null;
 }
}


 
function getLocationOnce() {

  if (
    !navigator.geolocation
  ) {

    toast(
      "Este dispositivo no permite ubicación."
    );

    return;

  }

  $("locationText").textContent =
    "Obteniendo ubicación...";

  navigator.geolocation
    .getCurrentPosition(
      saveLocation,
      locationError,
      {
        enableHighAccuracy:
          true,

        maximumAge:
          0,

        timeout:
          15000
      }
    );

 if (!navigator.geolocation) {
   toast("Este dispositivo no permite ubicación.");
   return;
 }
 $("locationText").textContent = "Obteniendo ubicación...";
 navigator.geolocation.getCurrentPosition(saveLocation, locationError, {
   enableHighAccuracy: true,
   maximumAge: 0,
   timeout: 15000
 });
}


 
async function saveLocation(p) {

  if (!s.user) return;

  const {
    latitude,
    longitude,
    accuracy
  } = p.coords;

  s.latitude =
    latitude;

  s.longitude =
    longitude;

  s.accuracy =
    accuracy;

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

        tipoProveedor:
          normalizeServiceType(
            s.provider?.tipoProveedor ||
            s.provider?.tipo ||
            ""
          ),

        actualizadoEn:
          serverTimestamp()
      },
      {
        merge:
          true
      }
    );

    evaluateAvailableServices();

  } catch (error) {

    console.error(
      "No se pudo guardar la ubicación:",
      error
    );

    toast(
      "Firebase no permitió guardar la ubicación."
    );

  }

 if (!s.user) return;
 
 const { latitude, longitude, accuracy } = p.coords;
 s.latitude = latitude;
 s.longitude = longitude;
 s.accuracy = accuracy;
 
 $("locationText").textContent = Latitud ${latitude.toFixed(6)} · Longitud ${longitude.toFixed(6)} · Precisión ${Math.round(accuracy)} m;
 
 try {
   await setDoc(doc(db, "ubicacionesProveedores", s.user.uid), {
     proveedorId: s.user.uid,
     latitude,
     longitude,
     accuracy,
     disponible: s.available && !s.activeService,
     servicioActualId: s.activeService?.id || s.provider?.servicioActualId || null,
     tipoProveedor: normalizeServiceType(s.provider?.tipoProveedor || s.provider?.tipo || ""),
     actualizadoEn: serverTimestamp()
   }, { merge: true });
 
   if (s.activeService) {
     await setDoc(doc(db, "solicitudes", s.activeService.id, "seguimiento", "ubicacionProveedor"), {
       proveedorId: s.user.uid,
       latitude,
       longitude,
       accuracy,
       estado: s.activeService.estado,
       actualizadoEn: serverTimestamp()
     }, { merge: true });
   }
 
   evaluateAvailableServices();
 } catch (error) {
   console.error("No se pudo guardar la ubicación:", error);
   toast("Firebase no permitió guardar la ubicación.");
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

 $("locationText").textContent = ({
   1: "Permiso de ubicación rechazado.",
   2: "No fue posible detectar la ubicación.",
   3: "La ubicación tardó demasiado."
 })[e.code] || "Error al obtener ubicación.";
}


/* =========================================================
   CERRAR SESIÓN
========================================================= */

 
async function logout() {

  stopLocation();

  stopTimer();

  if (
    s.refreshRadiusTimer
  ) {

    clearInterval(
      s.refreshRadiusTimer
    );

    s.refreshRadiusTimer =
      null;

  }

  try {

    await updateDoc(
      doc(
        db,
        "proveedores",
        s.user.uid
      ),
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
        merge:
          true
      }
    );

  } catch (error) {

    console.error(error);

  }

  await signOut(auth);

  location.replace(
    "login.html"
  );

 stopLocation();
 stopTimer();
 
 if (s.refreshRadiusTimer) {
   clearInterval(s.refreshRadiusTimer);
   s.refreshRadiusTimer = null;
 }
 
 if (s.unsubscribeActiveService) s.unsubscribeActiveService();
 
 try {
   await updateDoc(doc(db, "proveedores", s.user.uid), {
     disponible: false,
     estadoConexion: s.activeService ? "ocupado" : "desconectado",
     ultimaActualizacion: serverTimestamp()
   });
 
   await setDoc(doc(db, "ubicacionesProveedores", s.user.uid), {
     proveedorId: s.user.uid,
     disponible: false,
     servicioActualId: s.activeService?.id || null,
     actualizadoEn: serverTimestamp()
   }, { merge: true });
 } catch (error) {
   console.error(error);
 }
 
 await signOut(auth);
 location.replace("login.html");
}


/* =========================================================
   DISTANCIA Y TIEMPO ESTIMADO
========================================================= */

function calculateDistanceKm(
  latitude1,
  longitude1,
  latitude2,
  longitude2
) {

  const earthRadiusKm =
    6371;

  const latitudeDifference =
    degreesToRadians(
      latitude2 -
      latitude1
    );

  const longitudeDifference =
    degreesToRadians(
      longitude2 -
      longitude1
    );

  const firstLatitude =
    degreesToRadians(
      latitude1
    );

  const secondLatitude =
    degreesToRadians(
      latitude2
    );

  const haversine =
    Math.sin(
      latitudeDifference / 2
    ) ** 2 +
    Math.cos(
      firstLatitude
    ) *
    Math.cos(
      secondLatitude
    ) *
    Math.sin(
      longitudeDifference / 2
    ) ** 2;

  const angularDistance =
    2 *
    Math.atan2(
      Math.sqrt(haversine),
      Math.sqrt(1 - haversine)
    );

  return (
    earthRadiusKm *
    angularDistance
  );

 
function calculateDistanceKm(latitude1, longitude1, latitude2, longitude2) {
 const earthRadiusKm = 6371;
 const latitudeDifference = degreesToRadians(latitude2 - latitude1);
 const longitudeDifference = degreesToRadians(longitude2 - longitude1);
 const firstLatitude = degreesToRadians(latitude1);
 const secondLatitude = degreesToRadians(latitude2);
 
 const haversine = Math.sin(latitudeDifference / 2) ** 2 +
   Math.cos(firstLatitude) * Math.cos(secondLatitude) *
   Math.sin(longitudeDifference / 2) ** 2;
 
 const angularDistance = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
 return earthRadiusKm * angularDistance;
}


 
function degreesToRadians(value) {

  return (
    value *
    Math.PI /
    180
  );

 return value * Math.PI / 180;
}


 
function estimateMinutes(distanceKm) {

  if (
    !Number.isFinite(distanceKm)
  ) {

    return null;

  }

  const averageSpeedKmH =
    35;

  return Math.max(
    5,
    Math.round(
      (
        distanceKm /
        averageSpeedKmH
      ) * 60
    )
  );

 if (!Number.isFinite(distanceKm)) return null;
 return Math.max(5, Math.round((distanceKm / 35) * 60));
}


/* =========================================================
   NORMALIZACIÓN DE TIPO DE SERVICIO
========================================================= */

 
function normalizeServiceType(value) {

  const normalized =
    String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(
        /[\u0300-\u036f]/g,
        ""
      )
      .replace(
        /[\s-]+/g,
        "_"
      );

  const types = {
    grua:
      "grua",

    gruas:
      "grua",

    auxilio:
      "auxilio_vial",

    auxilio_vial:
      "auxilio_vial",

    ajustador:
      "ajustador",

    ajustadores:
      "ajustador",

    abogado:
      "abogado",

    abogados:
      "abogado"
  };

  return (
    types[normalized] ||
    normalized
  );

 const normalized = String(value || "")
   .trim()
   .toLowerCase()
   .normalize("NFD")
   .replace(/[\u0300-\u036f]/g, "")
   .replace(/[\s-]+/g, "_");
 
 const types = {
   grua: "grua",
   gruas: "grua",
   auxilio: "auxilio_vial",
   auxilio_vial: "auxilio_vial",
   ajustador: "ajustador",
   ajustadores: "ajustador",
   abogado: "abogado",
   abogados: "abogado"
 };
 
 return types[normalized] || normalized;
}


 
function formatServiceType(value) {

  const type =
    normalizeServiceType(value);

  const names = {
    grua:
      "Grúa",

    auxilio_vial:
      "Auxilio vial",

    ajustador:
      "Ajustador",

    abogado:
      "Abogado"
  };

  return (
    names[type] ||
    "Servicio"
  );

 const names = {
   grua: "Grúa",
   auxilio_vial: "Auxilio vial",
   ajustador: "Ajustador",
   abogado: "Abogado"
 };
 return names[normalizeServiceType(value)] || "Servicio";
}


/* =========================================================
   ACTIVIDAD Y MENSAJES
========================================================= */

 
function activity(a, b) {

  const el =
    document.createElement(
      "div"
    );

  el.className =
    "activity-item";

  el.innerHTML =
    `<span></span>` +
    `<div>` +
    `<strong>${escapeHtml(a)}</strong>` +
    `<p>${escapeHtml(b)}</p>` +
    `</div>`;

  $("activityList")
    .prepend(el);

 const el = document.createElement("div");
 el.className = "activity-item";
 el.innerHTML = <span></span><div><strong>${escapeHtml(a)}</strong><p>${escapeHtml(b)}</p></div>;
 $("activityList").prepend(el);
}


 
function toast(m) {

  $("toast").textContent =
    m;

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

 $("toast").textContent = m;
 $("toast").classList.add("show");
 setTimeout(() => $("toast").classList.remove("show"), 2800);
}


 
function escapeHtml(v) {

  return String(v)
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#039;"
    );

 return String(v)
   .replaceAll("&", "&amp;")
   .replaceAll("<", "&lt;")
   .replaceAll(">", "&gt;")
   .replaceAll('"', "&quot;")
   .replaceAll("'", "&#039;");
}


/* =========================================================
   SERVICE WORKER
========================================================= */

if (
  "serviceWorker" in navigator
) {

  addEventListener(
    "load",
    () =>
      navigator
        .serviceWorker
        .register(
          "./service-worker.js?v=2"
        )
        .catch(
          console.error
        )
  );

 
if ("serviceWorker" in navigator) {
 addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js?v=3").catch(console.error));
}

/* =========================================================
   NAVEGACIÓN DEL MENÚ LATERAL
========================================================= */

 
const viewTitles = {
  dashboard: "Panel del proveedor",
  servicios: "Servicios",
  historial: "Historial",
  ganancias: "Ganancias",
  perfil: "Mi perfil"
 dashboard: "Panel del proveedor",
 servicios: "Servicios",
 historial: "Historial",
 ganancias: "Ganancias",
 perfil: "Mi perfil"
};

 
function openView(viewName) {
 document.querySelectorAll(".nav-item").forEach(item => {
   item.classList.toggle("active", item.dataset.view === viewName);
 });
 
 document.querySelectorAll(".app-view").forEach(view => {
   const active = view.id === view-${viewName};
   view.hidden = !active;
   view.classList.toggle("active", active);
 });
 
 const title = $("currentViewTitle");
 if (title) title.textContent = viewTitles[viewName] || "Panel del proveedor";
 window.scrollTo({ top: 0, behavior: "smooth" });
}
 
document.querySelectorAll(".nav-item").forEach(button => {
  button.addEventListener("click", () => {
    const viewName = button.dataset.view;

    document.querySelectorAll(".nav-item").forEach(item => {
      item.classList.remove("active");
    });

    document.querySelectorAll(".app-view").forEach(view => {
      view.hidden = true;
      view.classList.remove("active");
    });

    button.classList.add("active");

    const targetView = document.getElementById(`view-${viewName}`);

    if (targetView) {
      targetView.hidden = false;
      targetView.classList.add("active");
    }

    const title = document.getElementById("currentViewTitle");

    if (title) {
      title.textContent =
        viewTitles[viewName] ||
        "Panel del proveedor";
    }

    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  });
 button.addEventListener("click", () => openView(button.dataset.view));
});
