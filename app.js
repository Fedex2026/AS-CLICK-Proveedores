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

  unsubscribeActiveService: null,

  unsubscribeRequests: null,

  unsubscribeHistory: null,

  historyServices: [],

  historyDate: "",

  incomeDate: ""

};

 

const $ = id => document.getElementById(id);

 

function setText(id, value) {

  const element = $(id);

  if (element) element.textContent = value;

}

 

function setHidden(id, hidden) {

  const element = $(id);

  if (element) element.classList.toggle("hidden", hidden);

}

 

onAuthStateChanged(auth, async user => {

  clearRealtimeListeners();

 

  if (!user) {

    location.replace("login.html");

    return;

  }

 

  s.user = user;

 

  try {

    const providerSnap = await getDoc(doc(db, "proveedores", user.uid));

 

    if (!providerSnap.exists()) {

      await signOut(auth);

      location.replace("login.html");

      return;

    }

 

    s.provider = {

      id: providerSnap.id,

      ...providerSnap.data()

    };

 

    s.available = s.provider.disponible === true;

 

    setText(

      "welcomeTitle",

      `Hola, ${

        s.provider.nombre ||

        s.provider.nombreCompleto ||

        user.email ||

        "Proveedor"

      }`

    );

 

    setText(

      "providerRating",

      Number(s.provider.calificacion ?? 5).toFixed(1)

    );

 

    setText(

      "todayServices",

      s.provider.serviciosHoy ??

      s.provider.serviciosRealizadosHoy ??

      0

    );

 

    setText(

      "todayIncome",

      `$${Number(s.provider.gananciasHoy ?? 0).toLocaleString("es-MX")}`

    );

 

    renderProviderProfile();

    renderAvailability();

    listenServices();

    listenActiveService();

    initializeHistory();

 

    if (s.available || s.provider.servicioActualId) {

      startLocation();

    }

 

    s.refreshRadiusTimer = setInterval(

      evaluateAvailableServices,

      10000

    );

  } catch (error) {

    console.error("Error cargando proveedor:", error);

    toast("No fue posible cargar el perfil del proveedor.");

  }

});

 

bindClick("availabilityToggle", toggleAvailability);

bindClick("locationButton", getLocationOnce);

bindClick("logoutButton", logout);

bindClick("acceptServiceButton", acceptService);

bindClick("rejectServiceButton", rejectService);

bindClick("onTheWayButton", () => updateActiveServiceStatus("en_camino"));

bindClick("arrivalButton", () => updateActiveServiceStatus("arribo"));

bindClick("startTransferButton", () => updateActiveServiceStatus("en_traslado"));

bindClick("destinationArrivalButton", () => updateActiveServiceStatus("destino"));

bindClick("finishServiceButton", finishActiveService);

bindClick("openOriginButton", openActiveOrigin);

bindClick("openDestinationButton", openActiveDestination);

bindClick("goToActiveServiceButton", () => openView("servicios"));

bindClick("requestVehicleChangeButton", () => {

  toast("La solicitud de cambio requiere autorización del administrador.");

});

 

const profilePhotoInput = $("profilePhotoInput");

if (profilePhotoInput) {

  profilePhotoInput.addEventListener("change", event => {

    const file = event.target.files?.[0];

 

    if (!file) {

      setText("profilePhotoStatus", "No se ha seleccionado una nueva foto.");

      return;

    }

 

    setText(

      "profilePhotoStatus",

      `Foto seleccionada: ${file.name}. El cambio requiere autorización.`

    );

 

    const reader = new FileReader();

 

    reader.onload = () => {

      const image = $("profilePhoto");

      const placeholder = $("profilePhotoPlaceholder");

 

      if (image) {

        image.src = reader.result;

        image.classList.remove("hidden");

      }

 

      if (placeholder) {

        placeholder.classList.add("hidden");

      }

    };

 

    reader.readAsDataURL(file);

  });

}

bindClick("historyPreviousDay", () => changeHistoryDay(-1));

bindClick("historyNextDay", () => changeHistoryDay(1));

bindClick("historyToday", () => setHistoryDate(todayDateInputValue()));

 

bindClick("incomePreviousDay", () => changeIncomeDay(-1));

bindClick("incomeNextDay", () => changeIncomeDay(1));

bindClick("incomeTodayButton", () => setIncomeDate(todayDateInputValue()));

bindClick("downloadIncomeExcelButton", downloadIncomeExcel);

 

const incomeDateInput = $("incomeDate");

if (incomeDateInput) {

  incomeDateInput.addEventListener("change", event => {

    setIncomeDate(event.target.value);

  });

}

 

const historyDateInput = $("historyDate");

if (historyDateInput) {

  historyDateInput.addEventListener("change", event => {

    setHistoryDate(event.target.value);

  });

}

 

function bindClick(id, handler) {

  const element = $(id);

  if (element) element.addEventListener("click", handler);

}

 

async function toggleAvailability() {

  if (!s.user) return;

 

  if (s.activeService || s.provider?.servicioActualId) {

    toast("Tienes un servicio activo. Finalízalo antes de cambiar tu disponibilidad.");

    return;

  }

 

  const button = $("availabilityToggle");

  const next = !s.available;

 

  if (button) button.disabled = true;

 

  try {

    await updateDoc(doc(db, "proveedores", s.user.uid), {

      disponible: next,

      estadoConexion: next ? "disponible" : "desconectado",

      ultimaActualizacion: serverTimestamp()

    });

 

    s.available = next;

    s.provider.disponible = next;

    renderAvailability();

 

    if (next) {

      startLocation();

      activity("Disponibilidad activada", "Ya puedes recibir servicios.");

      toast("Ahora estás disponible para recibir servicios.");

      evaluateAvailableServices();

    } else {

      stopLocation();

 

      await setDoc(

        doc(db, "ubicacionesProveedores", s.user.uid),

        {

          proveedorId: s.user.uid,

          disponible: false,

          servicioActualId: null,

          actualizadoEn: serverTimestamp()

        },

        { merge: true }

      );

 

      setText(

        "locationText",

        "Activa tu disponibilidad para compartir ubicación."

      );

 

      activity(

        "Disponibilidad desactivada",

        "Dejaste de recibir servicios nuevos."

      );

 

      toast("Ahora apareces como no disponible.");

      hideService();

    }

  } catch (error) {

    console.error("Error al cambiar disponibilidad:", error);

    toast("Firebase no permitió cambiar la disponibilidad.");

  } finally {

    if (button) button.disabled = false;

  }

}

 

function renderAvailability() {

  const occupied = Boolean(

    s.activeService ||

    s.provider?.servicioActualId

  );

 

  const toggle = $("availabilityToggle");

 

  if (toggle) {

    toggle.classList.toggle("on", s.available && !occupied);

    toggle.classList.toggle("is-on", s.available && !occupied);

    toggle.setAttribute(

      "aria-pressed",

      String(s.available && !occupied)

    );

    toggle.disabled = occupied;

  }

 

  setText(

    "availabilityText",

    occupied

      ? "Ocupado"

      : s.available

        ? "Disponible"

        : "No disponible"

  );

 

  setText(

    "providerStatus",

    occupied

      ? "Ocupado"

      : s.available

        ? "Disponible"

        : "Desconectado"

  );

}

 

function listenServices() {

  if (s.unsubscribeRequests) {

    s.unsubscribeRequests();

  }

 

  const requestsQuery = query(

    collection(db, "solicitudes"),

    where("estado", "==", "pendiente_cabina")

  );

 

  s.unsubscribeRequests = onSnapshot(

    requestsQuery,

    snapshot => {

      s.solicitudes = snapshot.docs.map(requestDoc => ({

        id: requestDoc.id,

        ...requestDoc.data()

      }));

 

      evaluateAvailableServices();

    },

    error => {

      console.error("Error escuchando solicitudes:", error);

      toast("Firebase no permitió consultar las solicitudes.");

    }

  );

}

 

function listenActiveService() {

  if (s.unsubscribeActiveService) {

    s.unsubscribeActiveService();

  }

 

  const activeQuery = query(

    collection(db, "solicitudes"),

    where("asignacion.uidProveedor", "==", s.user.uid),

    where("estado", "in", ACTIVE_STATES)

  );

 

  s.unsubscribeActiveService = onSnapshot(

    activeQuery,

    snapshot => {

      const activeDoc = snapshot.docs[0];

 

      if (!activeDoc) {

        s.activeService = null;

 

        if (s.provider) {

          s.provider.servicioActualId = null;

        }

 

        renderActiveService();

        renderAvailability();

        return;

      }

 

      s.activeService = {

        id: activeDoc.id,

        ...activeDoc.data()

      };

 

      s.available = false;

 

      if (s.provider) {

        s.provider.servicioActualId = activeDoc.id;

      }

 

      renderAvailability();

      renderActiveService();

      startLocation();

    },

    error => {

      console.error("Error escuchando servicio activo:", error);

      toast("No fue posible cargar el servicio en curso.");

    }

  );

}

 

function evaluateAvailableServices() {

  if (s.activeService || !s.available) {

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

 

  const providerType = normalizeServiceType(

    s.provider?.tipoProveedor ||

    s.provider?.tipo ||

    ""

  );

 

  const availableRequests = s.solicitudes

    .filter(request => {

      if (s.rejected.has(request.id)) return false;

 

      const requestType = normalizeServiceType(

        request.servicio?.tipo ||

        request.servicio?.nombre ||

        request.tipoServicio ||

        request.tipo ||

        ""

      );

 

      if (providerType && requestType !== providerType) {

        return false;

      }

 

      const assignedProvider =

        request.asignacion?.uidProveedor ||

        request.proveedorId;

 

      if (

        assignedProvider &&

        String(assignedProvider).trim()

      ) {

        return false;

      }

 

      const latitude = Number(

        request.ubicacion?.latitud ??

        request.ubicacion?.latitude ??

        request.latitud ??

        request.latitude

      );

 

      const longitude = Number(

        request.ubicacion?.longitud ??

        request.ubicacion?.longitude ??

        request.longitud ??

        request.longitude

      );

 

      if (

        !Number.isFinite(latitude) ||

        !Number.isFinite(longitude)

      ) {

        return false;

      }

 

      const distance = calculateDistanceKm(

        s.latitude,

        s.longitude,

        latitude,

        longitude

      );

 

      const allowedRadius = getAllowedRadiusKm(request);

 

      request.__distanceKm = distance;

      request.__allowedRadiusKm = allowedRadius;

 

      return (

        distance <= allowedRadius &&

        distance <= 70

      );

    })

    .sort(

      (a, b) =>

        Number(a.__distanceKm) -

        Number(b.__distanceKm)

    );

 

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

 

function getAllowedRadiusKm(request) {

  const createdAtMs = getRequestCreatedTime(request);

 

  if (!createdAtMs) return 70;

 

  const ageSeconds = Math.max(

    0,

    Math.floor(

      (Date.now() - createdAtMs) / 1000

    )

  );

 

  if (ageSeconds < 20) return 10;

  if (ageSeconds < 40) return 25;

  if (ageSeconds < 60) return 40;

 

  return 70;

}

 

function getRequestCreatedTime(request) {

  const created =

    request.creadoEn ||

    request.fechaCreacion ||

    request.creadaEn ||

    request.createdAt;

 

  if (!created) return null;

 

  if (typeof created.toMillis === "function") {

    return created.toMillis();

  }

 

  if (created.seconds) {

    return created.seconds * 1000;

  }

 

  const parsed = new Date(created).getTime();

 

  return Number.isFinite(parsed)

    ? parsed

    : null;

}

 

function showService(request) {

  s.current = request;

 

  setHidden("emptyService", true);

  setHidden("serviceCard", false);

 

  setText(

    "serviceType",

    request.servicio?.nombre ||

    formatServiceType(

      request.servicio?.tipo ||

      request.tipoServicio ||

      request.tipo

    )

  );

 

  updateDistanceDisplay(request);

 

  setText(

    "serviceFolio",

    request.folioOficial ||

    request.folio ||

    request.id

  );

 

  setText(

    "serviceClient",

    request.cliente?.nombre ||

    request.clienteNombre ||

    request.nombreCliente ||

    "Cliente AS CLICK"

  );

 

  setText(

    "serviceVehicle",

    vehicleText(request)

  );

 

  const originElement = $("serviceOrigin");

  const originMapsUrl = buildOriginMapsUrl(request);

 

  if (originElement) {

    if (originMapsUrl) {

      originElement.innerHTML = `

        <a

          href="${escapeAttribute(originMapsUrl)}"

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

      originElement.textContent = buildOriginText(request);

    }

  }

 

  setText(

    "serviceDestination",

    buildDestinationText(request)

  );

 

  startTimer(90);

}

 

function updateDistanceDisplay(request) {

  const distance = Number(request.__distanceKm);

 

  if (!Number.isFinite(distance)) {

    setText("serviceDistance", "Cercano");

    return;

  }

 

  setText(

    "serviceDistance",

    `${distance.toFixed(1)} km · ${estimateMinutes(distance)} min`

  );

}

 

function vehicleText(request) {

  return [

    request.vehiculo?.marca ?? request.marca,

    request.vehiculo?.subMarca ??

      request.vehiculo?.submarca ??

      request.submarca,

    request.vehiculo?.color ?? request.color,

    request.vehiculo?.placas ?? request.placas

  ]

    .filter(Boolean)

    .join(" · ") ||

    "Vehículo por confirmar";

}

 

function buildOriginText(request) {

  const originText =

    request.ubicacion?.direccion ||

    request.ubicacion?.domicilio ||

    request.origenTexto ||

    request.origen;

 

  if (typeof originText === "string" && originText.trim()) {

    return originText;

  }

 

  const latitude = Number(

    request.ubicacion?.latitud ??

    request.ubicacion?.latitude ??

    request.latitud ??

    request.latitude

  );

 

  const longitude = Number(

    request.ubicacion?.longitud ??

    request.ubicacion?.longitude ??

    request.longitud ??

    request.longitude

  );

 

  if (

    Number.isFinite(latitude) &&

    Number.isFinite(longitude)

  ) {

    return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;

  }

 

  return "Ubicación compartida";

}

 

function buildDestinationText(request) {

  if (

    typeof request.destino === "string" &&

    request.destino.trim()

  ) {

    return request.destino;

  }

 

  return (

    request.destino?.direccion ||

    request.destinoTexto ||

    request.servicio?.destino ||

    "Por confirmar"

  );

}

 

function buildOriginMapsUrl(request) {

  if (request.ubicacion?.enlaceGoogleMaps) {

    return request.ubicacion.enlaceGoogleMaps;

  }

 

  const latitude = Number(

    request.ubicacion?.latitud ??

    request.ubicacion?.latitude ??

    request.latitud ??

    request.latitude

  );

 

  const longitude = Number(

    request.ubicacion?.longitud ??

    request.ubicacion?.longitude ??

    request.longitud ??

    request.longitude

  );

 

  if (

    Number.isFinite(latitude) &&

    Number.isFinite(longitude)

  ) {

    return `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;

  }

 

  return "";

}

 

function buildDestinationMapsUrl(request) {

  const destination = buildDestinationText(request);

 

  if (

    !destination ||

    destination === "Por confirmar"

  ) {

    return "";

  }

 

  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;

}

 

function hideService() {

  s.current = null;

  stopTimer();

 

  setHidden("emptyService", false);

  setHidden("serviceCard", true);

  setText("serviceTimer", "--");

}

 

async function acceptService() {

  if (!s.current || !s.user) return;

 

  const currentRequest = s.current;

  const id = currentRequest.id;

  const acceptButton = $("acceptServiceButton");

  const rejectButton = $("rejectServiceButton");

 

  if (acceptButton) acceptButton.disabled = true;

  if (rejectButton) rejectButton.disabled = true;

 

  try {

    const requestRef = doc(db, "solicitudes", id);

 

    await runTransaction(

      db,

      async transaction => {

        const requestSnap =

          await transaction.get(requestRef);

 

        if (!requestSnap.exists()) {

          throw new Error(

            "La solicitud ya no existe."

          );

        }

 

        const requestData = requestSnap.data();

        const assignedUid =

          requestData.asignacion?.uidProveedor ||

          requestData.proveedorId;

 

        if (

          requestData.estado !== "pendiente_cabina"

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

 

        const distance = Number(

          currentRequest.__distanceKm

        );

 

        const eta = estimateMinutes(distance);

 

        transaction.update(requestRef, {

          estado: "asignado",

          "asignacion.uidProveedor": s.user.uid,

          "asignacion.nombreProveedor":

            s.provider.nombre ||

            s.provider.nombreCompleto ||

            s.user.email,

          "asignacion.telefonoProveedor":

            s.provider.telefono || "",

          "asignacion.fotoProveedor":

            s.provider.foto ||

            s.provider.fotoURL ||

            "",

          "asignacion.tiempoEstimadoMinutos":

            eta,

          distanciaProveedorKm:

            Number.isFinite(distance)

              ? Number(distance.toFixed(2))

              : null,

          fechaAsignacion:

            serverTimestamp(),

          actualizadoEn:

            serverTimestamp()

        });

      }

    );

 

    await updateDoc(

      doc(db, "proveedores", s.user.uid),

      {

        disponible: false,

        estadoConexion: "ocupado",

        servicioActualId: id,

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

        proveedorId: s.user.uid,

        disponible: false,

        servicioActualId: id,

        actualizadoEn:

          serverTimestamp()

      },

      { merge: true }

    );

 

    s.available = false;

    s.provider.servicioActualId = id;

    s.activeService = {

      ...currentRequest,

      id,

      estado: "asignado",

      asignacion: {

        ...(currentRequest.asignacion || {}),

        uidProveedor: s.user.uid

      }

    };

 

    renderAvailability();

    renderActiveService();

    startLocation();

    stopTimer();

    hideService();

 

    activity(

      "Servicio aceptado",

      `Folio ${

        currentRequest.folioOficial ||

        currentRequest.folio ||

        id

      }`

    );

 

    toast(

      "Servicio asignado correctamente. Abre Servicios para darle seguimiento."

    );

 

    openView("servicios");

  } catch (error) {

    console.error("Error aceptando servicio:", error);

    toast(

      error.message ||

      "No fue posible aceptar el servicio."

    );

    evaluateAvailableServices();

  } finally {

    if (acceptButton) acceptButton.disabled = false;

    if (rejectButton) rejectButton.disabled = false;

  }

}

 

async function rejectService() {

  if (!s.current || !s.user) return;

 

  const currentRequest = s.current;

  const id = currentRequest.id;

 

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

        proveedorId: s.user.uid,

        proveedorNombre:

          s.provider?.nombre ||

          s.provider?.nombreCompleto ||

          s.user.email,

        fecha: serverTimestamp()

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

 

  toast("Servicio rechazado.");

  hideService();

 

  setTimeout(

    evaluateAvailableServices,

    300

  );

}

 

function renderActiveService() {

  const request = s.activeService;

  const hasActive = Boolean(request);

 

  setHidden("activeServiceEmpty", hasActive);

  setHidden("activeServiceCard", !hasActive);

  setHidden("dashboardActiveService", !hasActive);

 

  if (!request) {

    setText("activeServiceStatusBadge", "Sin servicio");

    setHidden("startTransferButton", false);

    setHidden("destinationArrivalButton", false);

    setHidden("openDestinationButton", false);

    return;

  }

 

  const folio =

    request.folioOficial ||

    request.folio ||

    request.id;

 

  const statusName =

    formatStatus(request.estado);

 

  setText("activeServiceFolio", folio);

 

  setText(

    "activeServiceClient",

    request.cliente?.nombre ||

    request.clienteNombre ||

    "Cliente AS CLICK"

  );

 

  setText(

    "activeServicePhone",

    request.cliente?.telefono ||

    request.telefonoCliente ||

    "No disponible"

  );

 

  setText(

    "activeServiceVehicle",

    vehicleText(request)

  );

 

  setText(

    "activeServiceOrigin",

    buildOriginText(request)

  );

 

  setText(

    "activeServiceDestination",

    buildDestinationText(request)

  );

 

  setText(

    "activeServiceStatus",

    statusName

  );

 

  setText(

    "activeServiceStatusBadge",

    statusName

  );

 

  setText(

    "dashboardActiveTitle",

    `Servicio ${folio}`

  );

 

  setText(

    "dashboardActiveSummary",

    `${statusName} · ${buildOriginText(request)}`

  );

 

  const finishButton = $("finishServiceButton");

  if (finishButton) {

    finishButton.textContent =

      getRequestServiceType(request) === "grua"

        ? "Finalizar servicio"

        : "Terminar servicio";

  }

 

  updateProgressButtons(request);

}

 

function getRequestServiceType(request) {

  return normalizeServiceType(

    request?.servicio?.tipo ||

    request?.servicio?.nombre ||

    request?.tipoServicio ||

    request?.tipo ||

    ""

  );

}

 

function updateProgressButtons(request) {

  const status = request?.estado;

  const serviceType = getRequestServiceType(request);

  const isTowTruck = serviceType === "grua";

 

  // Grúa conserva el flujo completo:

  // Aceptar -> En camino -> Arribo -> Iniciar traslado ->

  // Llegué al destino -> Finalizar servicio

  setHidden("startTransferButton", !isTowTruck);

  setHidden("destinationArrivalButton", !isTowTruck);

  setHidden("openDestinationButton", !isTowTruck);

 

  if (isTowTruck) {

    const order = [

      "asignado",

      "en_camino",

      "arribo",

      "en_traslado",

      "destino"

    ];

 

    const currentIndex = order.indexOf(status);

 

    setButtonDisabled(

      "onTheWayButton",

      currentIndex !== 0

    );

 

    setButtonDisabled(

      "arrivalButton",

      currentIndex !== 1

    );

 

    setButtonDisabled(

      "startTransferButton",

      currentIndex !== 2

    );

 

    setButtonDisabled(

      "destinationArrivalButton",

      currentIndex !== 3

    );

 

    setButtonDisabled(

      "finishServiceButton",

      currentIndex !== 4

    );

 

    return;

  }

 

  // Ajustador, Abogado y Auxilio vial:

  // Aceptar -> En camino -> Arribo -> Terminar servicio

  setButtonDisabled(

    "onTheWayButton",

    status !== "asignado"

  );

 

  setButtonDisabled(

    "arrivalButton",

    status !== "en_camino"

  );

 

  setButtonDisabled(

    "finishServiceButton",

    status !== "arribo"

  );

}

 

function setButtonDisabled(id, disabled) {

  const button = $(id);

  if (button) button.disabled = disabled;

}

 

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

 

    if (dateFields[nextStatus]) {

      updates[dateFields[nextStatus]] =

        serverTimestamp();

    }

 

    await updateDoc(

      doc(

        db,

        "solicitudes",

        s.activeService.id

      ),

      updates

    );

 

    s.activeService = {

      ...s.activeService,

      estado: nextStatus

    };

 

    renderActiveService();

 

    activity(

      formatStatus(nextStatus),

      `Folio ${

        s.activeService.folioOficial ||

        s.activeService.folio ||

        s.activeService.id

      }`

    );

 

    toast(

      `Estado actualizado: ${formatStatus(nextStatus)}.`

    );

  } catch (error) {

    console.error(

      "Error actualizando estado:",

      error

    );

 

    toast(

      "No fue posible actualizar el estado del servicio."

    );

  }

}

 

async function finishActiveService() {

  if (!s.activeService || !s.user) return;

 

  const id = s.activeService.id;

 

  try {

    await updateDoc(

      doc(db, "solicitudes", id),

      {

        estado: "finalizado",

        fechaFinalizacion:

          serverTimestamp(),

        actualizadoEn:

          serverTimestamp()

      }

    );

 

    await updateDoc(

      doc(db, "proveedores", s.user.uid),

      {

        disponible: true,

        estadoConexion: "disponible",

        servicioActualId: null,

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

        proveedorId: s.user.uid,

        disponible: true,

        servicioActualId: null,

        actualizadoEn:

          serverTimestamp()

      },

      { merge: true }

    );

 

    s.activeService = null;

    s.available = true;

    s.provider.servicioActualId = null;

 

    renderAvailability();

    renderActiveService();

    startLocation();

 

    activity(

      "Servicio finalizado",

      `Folio ${id}`

    );

 

    toast(

      "Servicio finalizado. Ya estás disponible nuevamente."

    );

 

    openView("dashboard");

    evaluateAvailableServices();

  } catch (error) {

    console.error(

      "Error finalizando servicio:",

      error

    );

 

    toast(

      "No fue posible finalizar el servicio."

    );

  }

}

 

function openActiveOrigin() {

  if (!s.activeService) return;

 

  const url =

    buildOriginMapsUrl(s.activeService);

 

  if (url) {

    window.open(

      url,

      "_blank",

      "noopener,noreferrer"

    );

  } else {

    toast(

      "El servicio no tiene una ubicación de origen válida."

    );

  }

}

 

function openActiveDestination() {

  if (!s.activeService) return;

 

  const url =

    buildDestinationMapsUrl(s.activeService);

 

  if (url) {

    window.open(

      url,

      "_blank",

      "noopener,noreferrer"

    );

  } else {

    toast(

      "El destino todavía no está confirmado."

    );

  }

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

 

  return statuses[value] ||

    "Servicio activo";

}

 

function startTimer(seconds) {

  stopTimer();

 

  s.seconds = seconds;

  setText(

    "serviceTimer",

    `${seconds}s`

  );

 

  s.timer = setInterval(() => {

    s.seconds -= 1;

 

    setText(

      "serviceTimer",

      `${s.seconds}s`

    );

 

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

 

function startLocation() {

  if (

    !navigator.geolocation ||

    s.watch !== null

  ) {

    return;

  }

 

  setText(

    "locationText",

    "Obteniendo ubicación en tiempo real..."

  );

 

  s.watch =

    navigator.geolocation.watchPosition(

      saveLocation,

      locationError,

      {

        enableHighAccuracy: true,

        maximumAge: 5000,

        timeout: 15000

      }

    );

}

 

function stopLocation() {

  if (s.watch !== null) {

    navigator.geolocation.clearWatch(s.watch);

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

 

  setText(

    "locationText",

    "Obteniendo ubicación..."

  );

 

  navigator.geolocation.getCurrentPosition(

    saveLocation,

    locationError,

    {

      enableHighAccuracy: true,

      maximumAge: 5000,

      timeout: 15000

    }

  );

}

 

async function saveLocation(position) {

  if (!s.user) return;

 

  const {

    latitude,

    longitude,

    accuracy

  } = position.coords;

 

  s.latitude = latitude;

  s.longitude = longitude;

  s.accuracy = accuracy;

 

  setText(

    "locationText",

    `Latitud ${latitude.toFixed(6)} · Longitud ${longitude.toFixed(6)} · Precisión ${Math.round(accuracy)} m`

  );

 

  try {

    await setDoc(

      doc(

        db,

        "ubicacionesProveedores",

        s.user.uid

      ),

      {

        proveedorId: s.user.uid,

        latitude,

        longitude,

        latitud: latitude,

        longitud: longitude,

        accuracy,

        disponible:

          s.available &&

          !s.activeService,

        servicioActualId:

          s.activeService?.id ||

          s.provider?.servicioActualId ||

          null,

        tipoProveedor:

          normalizeServiceType(

            s.provider?.tipoProveedor ||

            s.provider?.tipo ||

            ""

          ),

        actualizadoEn:

          serverTimestamp()

      },

      { merge: true }

    );

 

    if (s.activeService) {

      await setDoc(

        doc(

          db,

          "solicitudes",

          s.activeService.id,

          "seguimiento",

          "ubicacionProveedor"

        ),

        {

          proveedorId: s.user.uid,

          latitude,

          longitude,

          latitud: latitude,

          longitud: longitude,

          accuracy,

          estado:

            s.activeService.estado,

          actualizadoEn:

            serverTimestamp()

        },

        { merge: true }

      );

    }

 

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

}

 

function locationError(error) {

  const messages = {

    1: "Permiso de ubicación rechazado.",

    2: "No fue posible detectar la ubicación.",

    3: "La ubicación tardó demasiado."

  };

 

  setText(

    "locationText",

    messages[error.code] ||

    "Error al obtener ubicación."

  );

}

 

async function logout() {

  stopLocation();

  stopTimer();

  clearRealtimeListeners();

 

  try {

    if (s.user) {

      await updateDoc(

        doc(db, "proveedores", s.user.uid),

        {

          disponible: false,

          estadoConexion:

            s.activeService

              ? "ocupado"

              : "desconectado",

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

          proveedorId: s.user.uid,

          disponible: false,

          servicioActualId:

            s.activeService?.id || null,

          actualizadoEn:

            serverTimestamp()

        },

        { merge: true }

      );

    }

  } catch (error) {

    console.error(

      "Error cerrando sesión:",

      error

    );

  }

 

  await signOut(auth);

  location.replace("login.html");

}

 

function clearRealtimeListeners() {

  if (s.refreshRadiusTimer) {

    clearInterval(s.refreshRadiusTimer);

    s.refreshRadiusTimer = null;

  }

 

  if (s.unsubscribeRequests) {

    s.unsubscribeRequests();

    s.unsubscribeRequests = null;

  }

 

  if (s.unsubscribeActiveService) {

    s.unsubscribeActiveService();

    s.unsubscribeActiveService = null;

  }

 

  if (s.unsubscribeHistory) {

    s.unsubscribeHistory();

    s.unsubscribeHistory = null;

  }

}

 

function initializeHistory() {

  if (!s.user) return;

 

  if (!s.historyDate) {

    s.historyDate = todayDateInputValue();

  }

 

  const input = $("historyDate");

  if (input) input.value = s.historyDate;

 

  if (!s.incomeDate) {

    s.incomeDate = todayDateInputValue();

  }

 

  const incomeInput = $("incomeDate");

  if (incomeInput) incomeInput.value = s.incomeDate;

 

  listenHistory();

}

 

function listenHistory() {

  if (!s.user) return;

 

  if (s.unsubscribeHistory) {

    s.unsubscribeHistory();

  }

 

  const historyQuery = query(

    collection(db, "solicitudes"),

    where("asignacion.uidProveedor", "==", s.user.uid)

  );

 

  s.unsubscribeHistory = onSnapshot(

    historyQuery,

    snapshot => {

      s.historyServices = snapshot.docs

        .map(historyDoc => ({

          id: historyDoc.id,

          ...historyDoc.data()

        }))

        .filter(service => service.estado === "finalizado");

 

      renderHistory();

      renderIncome();

    },

    error => {

      console.error("Error cargando historial:", error);

      toast("No fue posible cargar el historial.");

    }

  );

}

 

function todayDateInputValue() {

  const now = new Date();

  return localDateInputValue(now);

}

 

function localDateInputValue(date) {

  const year = date.getFullYear();

  const month = String(date.getMonth() + 1).padStart(2, "0");

  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;

}

 

function setHistoryDate(value) {

  if (!value) return;

 

  s.historyDate = value;

 

  const input = $("historyDate");

  if (input && input.value !== value) {

    input.value = value;

  }

 

  renderHistory();

}

 

function changeHistoryDay(days) {

  const base = s.historyDate || todayDateInputValue();

  const [year, month, day] = base.split("-").map(Number);

  const date = new Date(year, month - 1, day);

  date.setDate(date.getDate() + days);

  setHistoryDate(localDateInputValue(date));

}

 

function setIncomeDate(value) {

  if (!value) return;

 

  s.incomeDate = value;

 

  const input = $("incomeDate");

  if (input && input.value !== value) {

    input.value = value;

  }

 

  renderIncome();

}

 

function changeIncomeDay(days) {

  const base = s.incomeDate || todayDateInputValue();

  const [year, month, day] = base.split("-").map(Number);

  const date = new Date(year, month - 1, day);

  date.setDate(date.getDate() + days);

  setIncomeDate(localDateInputValue(date));

}

 

function getServiceFinalizationDate(service) {

  const value =

    service.fechaFinalizacion ||

    service.finalizadoEn ||

    service.actualizadoEn;

 

  if (!value) return null;

 

  if (typeof value.toDate === "function") {

    return value.toDate();

  }

 

  if (value.seconds) {

    return new Date(value.seconds * 1000);

  }

 

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? null : parsed;

}

 

function renderHistory() {

  const list = $("historyList");

  const empty = $("historyEmpty");

 

  if (!list || !empty) return;

 

  const selectedDate =

    s.historyDate || todayDateInputValue();

 

  const services = s.historyServices

    .filter(service => {

      const date = getServiceFinalizationDate(service);

      return date && localDateInputValue(date) === selectedDate;

    })

    .sort((a, b) => {

      const dateA = getServiceFinalizationDate(a);

      const dateB = getServiceFinalizationDate(b);

      return (dateB?.getTime() || 0) - (dateA?.getTime() || 0);

    });

 

  setHidden("historyEmpty", services.length > 0);

  setHidden("historyList", services.length === 0);

 

  if (!services.length) {

    list.innerHTML = "";

    return;

  }

 

  list.innerHTML = services

    .map(service => {

      const folio =

        service.folioOficial ||

        service.folio ||

        service.id;

 

      const serviceType = formatServiceType(

        service.servicio?.tipo ||

        service.servicio?.nombre ||

        service.tipoServicio ||

        service.tipo

      );

 

      const client =

        service.cliente?.nombre ||

        service.clienteNombre ||

        service.nombreCliente ||

        "Cliente AS CLICK";

 

      const vehicle = vehicleText(service);

      const finishedAt = getServiceFinalizationDate(service);

 

      const time = finishedAt

        ? finishedAt.toLocaleTimeString("es-MX", {

            hour: "2-digit",

            minute: "2-digit"

          })

        : "--:--";

 

      return `

        <article class="history-item">

          <div class="history-item-main">

            <span class="service-badge">${escapeHtml(serviceType)}</span>

            <strong>${escapeHtml(folio)}</strong>

          </div>

 

          <div class="history-item-data">

            <div>

              <span>Cliente</span>

              <strong>${escapeHtml(client)}</strong>

            </div>

 

            <div>

              <span>Vehículo</span>

              <strong>${escapeHtml(vehicle)}</strong>

            </div>

 

            <div>

              <span>Finalizado</span>

              <strong>${escapeHtml(time)}</strong>

            </div>

 

            <div>

              <span>Estado</span>

              <strong>Finalizado</strong>

            </div>

          </div>

        </article>

      `;

    })

    .join("");

}

 

function normalizeText(value) {

  return String(value || "")

    .trim()

    .toLowerCase()

    .normalize("NFD")

    .replace(/[\u0300-\u036f]/g, "")

    .replace(/[_-]+/g, " ");

}

 

function getServiceVehicleClass(service) {

  return normalizeText(

    service.vehiculo?.tipoServicio ||

    service.vehiculo?.tipoUso ||

    service.vehiculo?.servicio ||

    service.servicio?.modalidad ||

    service.servicio?.tipoVehiculo ||

    service.tipoVehiculo ||

    service.tipoUsoVehiculo ||

    service.modalidadVehiculo ||

    service.modalidad ||

    service.tipoCliente ||

    service.cliente?.tipo ||

    ""

  );

}

 

function isPublicServiceVehicle(service) {

  const value = getServiceVehicleClass(service);

 

  return (

    value.includes("servicio publico") ||

    value.includes("publico") ||

    value.includes("transporte publico")

  );

}

 

function getIncomeServiceType(service) {

  const value = normalizeText(

    service.servicio?.tipo ||

    service.servicio?.nombre ||

    service.tipoServicio ||

    service.tipo ||

    ""

  );

 

  if (value.includes("ajustador")) {

    return "ajustador";

  }

 

  if (value.includes("abogado")) {

    return "abogado";

  }

 

  if (

    value.includes("auxilio") ||

    value.includes("paso de corriente") ||

    value.includes("cambio de llanta") ||

    value.includes("surtir gasolina") ||

    value.includes("gasolina")

  ) {

    return "auxilio_vial";

  }

 

  if (value.includes("grua")) {

    return "grua";

  }

 

  return normalizeServiceType(value);

}

 

function getProviderEarning(service) {

  const type = getIncomeServiceType(service);

  const isPublic = isPublicServiceVehicle(service);

 

  if (type === "ajustador") {

    return isPublic ? 250 : 300;

  }

 

  if (type === "abogado") {

    return isPublic ? 350 : 500;

  }

 

  if (type === "auxilio_vial") {

    return 100;

  }

 

  // Grúa no tiene tarifa fija aquí.

  return 0;

}

 

function isSameLocalDay(dateA, dateB) {

  return (

    dateA.getFullYear() === dateB.getFullYear() &&

    dateA.getMonth() === dateB.getMonth() &&

    dateA.getDate() === dateB.getDate()

  );

}

 

function startOfCurrentWeek(date) {

  const result = new Date(

    date.getFullYear(),

    date.getMonth(),

    date.getDate()

  );

 

  const day = result.getDay();

  const diff = day === 0 ? 6 : day - 1;

  result.setDate(result.getDate() - diff);

  result.setHours(0, 0, 0, 0);

 

  return result;

}

 

function formatMoney(value) {

  return new Intl.NumberFormat("es-MX", {

    style: "currency",

    currency: "MXN",

    maximumFractionDigits: 0

  }).format(value || 0);

}

 

function downloadIncomeExcel() {

  const selectedDate =

    s.incomeDate || todayDateInputValue();

 

  const movements = (Array.isArray(s.historyServices)

    ? s.historyServices

    : []

  )

    .map(service => {

      const date = getServiceFinalizationDate(service);

      const amount = getProviderEarning(service);

 

      return {

        service,

        date,

        amount

      };

    })

    .filter(item =>

      item.date &&

      item.amount > 0 &&

      localDateInputValue(item.date) === selectedDate

    )

    .sort((a, b) => b.date.getTime() - a.date.getTime());

 

  if (!movements.length) {

    toast("No hay movimientos para descargar en esta fecha.");

    return;

  }

 

  const escapeCsv = value => {

    const text = String(value ?? "");

    return `"${text.replace(/"/g, '""')}"`;

  };

 

  const rows = [

    [

      "Fecha",

      "Hora",

      "Folio",

      "Tipo de servicio",

      "Tipo de vehículo",

      "Ganancia"

    ]

  ];

 

  movements.forEach(item => {

    const service = item.service;

 

    const folio =

      service.folioOficial ||

      service.folio ||

      service.id;

 

    const serviceType = formatServiceType(

      service.servicio?.tipo ||

      service.servicio?.nombre ||

      service.tipoServicio ||

      service.tipo

    );

 

    const vehicleClass = isPublicServiceVehicle(service)

      ? "Servicio público"

      : "Particular";

 

    rows.push([

      item.date.toLocaleDateString("es-MX"),

      item.date.toLocaleTimeString("es-MX", {

        hour: "2-digit",

        minute: "2-digit"

      }),

      folio,

      serviceType,

      vehicleClass,

      item.amount

    ]);

  });

 

  const csv = rows

    .map(row => row.map(escapeCsv).join(","))

    .join("\r\n");

 

  const blob = new Blob(

    ["\uFEFF" + csv],

    {

      type: "text/csv;charset=utf-8;"

    }

  );

 

  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");

 

  link.href = url;

  link.download = `ganancias-${selectedDate}.csv`;

 

  document.body.appendChild(link);

  link.click();

  link.remove();

 

  URL.revokeObjectURL(url);

}

 

function renderIncome() {

  const services = Array.isArray(s.historyServices)

    ? s.historyServices

    : [];

 

  const now = new Date();

  const weekStart = startOfCurrentWeek(now);

  const monthStart = new Date(

    now.getFullYear(),

    now.getMonth(),

    1

  );

 

  let today = 0;

  let week = 0;

  let month = 0;

  let total = 0;

 

  const allMovements = services

    .map(service => {

      const date = getServiceFinalizationDate(service);

      const amount = getProviderEarning(service);

 

      return {

        service,

        date,

        amount

      };

    })

    .filter(item => item.date && item.amount > 0)

    .sort((a, b) => b.date.getTime() - a.date.getTime());

 

  allMovements.forEach(item => {

    total += item.amount;

 

    if (isSameLocalDay(item.date, now)) {

      today += item.amount;

    }

 

    if (item.date >= weekStart && item.date <= now) {

      week += item.amount;

    }

 

    if (item.date >= monthStart && item.date <= now) {

      month += item.amount;

    }

  });

 

  setText("incomeToday", formatMoney(today));

  setText("incomeWeek", formatMoney(week));

  setText("incomeMonth", formatMoney(month));

  setText("incomeTotal", formatMoney(total));

 

  const selectedIncomeDate =

    s.incomeDate || todayDateInputValue();

 

  const movements = allMovements.filter(item =>

    localDateInputValue(item.date) === selectedIncomeDate

  );

 

  const list = $("incomeMovements");

  const empty = $("incomeEmpty");

 

  if (!list || !empty) return;

 

  setHidden("incomeEmpty", movements.length > 0);

  setHidden("incomeMovements", movements.length === 0);

 

  if (!movements.length) {

    list.innerHTML = "";

    return;

  }

 

  list.innerHTML = movements

    .map(item => {

      const service = item.service;

 

      const folio =

        service.folioOficial ||

        service.folio ||

        service.id;

 

      const serviceType = formatServiceType(

        service.servicio?.tipo ||

        service.servicio?.nombre ||

        service.tipoServicio ||

        service.tipo

      );

 

      const vehicleClass = isPublicServiceVehicle(service)

        ? "Servicio público"

        : "Particular";

 

      const dateText = item.date.toLocaleDateString("es-MX", {

        day: "2-digit",

        month: "2-digit",

        year: "numeric"

      });

 

      const timeText = item.date.toLocaleTimeString("es-MX", {

        hour: "2-digit",

        minute: "2-digit"

      });

 

      return `

        <article class="income-item">

          <div class="income-item-main">

            <div>

              <span class="service-badge">${escapeHtml(serviceType)}</span>

              <strong>${escapeHtml(folio)}</strong>

            </div>

 

            <strong class="income-amount">${escapeHtml(formatMoney(item.amount))}</strong>

          </div>

 

          <div class="income-item-data">

            <span>${escapeHtml(vehicleClass)}</span>

            <span>${escapeHtml(dateText)} · ${escapeHtml(timeText)}</span>

          </div>

        </article>

      `;

    })

    .join("");

}

 

function calculateDistanceKm(

  latitude1,

  longitude1,

  latitude2,

  longitude2

) {

  const earthRadiusKm = 6371;

 

  const latitudeDifference =

    degreesToRadians(

      latitude2 - latitude1

    );

 

  const longitudeDifference =

    degreesToRadians(

      longitude2 - longitude1

    );

 

  const firstLatitude =

    degreesToRadians(latitude1);

 

  const secondLatitude =

    degreesToRadians(latitude2);

 

  const haversine =

    Math.sin(latitudeDifference / 2) ** 2 +

    Math.cos(firstLatitude) *

    Math.cos(secondLatitude) *

    Math.sin(longitudeDifference / 2) ** 2;

 

  const angularDistance =

    2 *

    Math.atan2(

      Math.sqrt(haversine),

      Math.sqrt(1 - haversine)

    );

 

  return earthRadiusKm *

    angularDistance;

}

 

function degreesToRadians(value) {

  return value *

    Math.PI /

    180;

}

 

function estimateMinutes(distanceKm) {

  if (!Number.isFinite(distanceKm)) {

    return null;

  }

 

  return Math.max(

    5,

    Math.round(

      (distanceKm / 35) * 60

    )

  );

}

 

function renderProviderProfile() {

  if (!s.provider) return;

 

  const provider = s.provider;

 

  const name =

    provider.nombreCompleto ||

    provider.nombre ||

    s.user?.displayName ||

    "Proveedor AS CLICK";

 

  const email =

    provider.correo ||

    provider.email ||

    s.user?.email ||

    "—";

 

  const phone =

    provider.telefono ||

    provider.celular ||

    provider.phone ||

    "—";

 

  const providerType = formatServiceType(

    provider.tipoServicio ||

    provider.tipo ||

    provider.servicio ||

    "Proveedor"

  );

 

  const rating = Number(

    provider.calificacion ??

    provider.rating ??

    5

  ).toFixed(1);

 

  setText("profileName", name);

  setText("profileServiceType", providerType);

  setText("profileRating", rating);

  setText("profileFullName", name);

  setText("profilePhone", phone);

  setText("profileEmail", email);

  setText("profileProviderType", providerType);

 

  const photo =

    provider.foto ||

    provider.fotoURL ||

    provider.photoURL ||

    "";

 

  const image = $("profilePhoto");

  const placeholder = $("profilePhotoPlaceholder");

 

  if (photo && image) {

    image.src = photo;

    image.classList.remove("hidden");

    placeholder?.classList.add("hidden");

  } else {

    image?.classList.add("hidden");

    placeholder?.classList.remove("hidden");

  }

 

  const vehicle =

    provider.unidad ||

    provider.vehiculo ||

    {};

 

  const vehicleType =

    vehicle.tipoUnidad ||

    vehicle.tipo ||

    provider.tipoUnidad ||

    "—";

 

  const brand =

    vehicle.marca ||

    provider.marcaUnidad ||

    "";

 

  const model =

    vehicle.modelo ||

    provider.modeloUnidad ||

    "";

 

  const brandModel =

    [brand, model].filter(Boolean).join(" · ") ||

    "—";

 

  setText("profileVehicleType", vehicleType);

  setText("profileVehicleModel", brandModel);

  setText(

    "profileVehicleColor",

    vehicle.color ||

    provider.colorUnidad ||

    "—"

  );

  setText(

    "profileVehiclePlates",

    vehicle.placas ||

    provider.placas ||

    provider.placasUnidad ||

    "—"

  );

  setText(

    "profileVehicleEconomic",

    vehicle.numeroEconomico ||

    vehicle.economico ||

    provider.numeroEconomico ||

    provider.economico ||

    "—"

  );

 

  const normalizedType = normalizeServiceType(

    provider.tipoServicio ||

    provider.tipo ||

    provider.servicio ||

    ""

  );

 

  const showVehicle =

    normalizedType === "grua" ||

    normalizedType === "auxilio_vial" ||

    normalizedType === "ajustador";

 

  setHidden("profileVehicleCard", !showVehicle);

}

 

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

    grua: "grua",

    gruas: "grua",

    auxilio: "auxilio_vial",

    auxilio_vial: "auxilio_vial",

    ajustador: "ajustador",

    ajustadores: "ajustador",

    abogado: "abogado",

    abogados: "abogado"

  };

 

  return types[normalized] ||

    normalized;

}

 

function formatServiceType(value) {

  const names = {

    grua: "Grúa",

    auxilio_vial: "Auxilio vial",

    ajustador: "Ajustador",

    abogado: "Abogado"

  };

 

  return names[

    normalizeServiceType(value)

  ] || "Servicio";

}

 

function activity(title, description) {

  const list = $("activityList");

 

  if (!list) return;

 

  const element =

    document.createElement("div");

 

  element.className =

    "activity-item";

 

  element.innerHTML =

    `<span></span>` +

    `<div>` +

    `<strong>${escapeHtml(title)}</strong>` +

    `<p>${escapeHtml(description)}</p>` +

    `</div>`;

 

  list.prepend(element);

}

 

function toast(message) {

  const element = $("toast");

 

  if (!element) {

    console.log(message);

    return;

  }

 

  element.textContent = message;

  element.classList.add("show");

 

  clearTimeout(toast.timer);

 

  toast.timer = setTimeout(

    () =>

      element.classList.remove("show"),

    2800

  );

}

 

function escapeHtml(value) {

  return String(value ?? "")

    .replaceAll("&", "&amp;")

    .replaceAll("<", "&lt;")

    .replaceAll(">", "&gt;")

    .replaceAll('"', "&quot;")

    .replaceAll("'", "&#039;");

}

 

function escapeAttribute(value) {

  return escapeHtml(value);

}

 

const viewTitles = {

  dashboard: "Panel del proveedor",

  servicios: "Servicios",

  historial: "Historial",

  ganancias: "Ganancias",

  perfil: "Mi perfil"

};

 

function openView(viewName) {

  document

    .querySelectorAll(".nav-item")

    .forEach(item => {

      item.classList.toggle(

        "active",

        item.dataset.view === viewName

      );

    });

 

  document

    .querySelectorAll(".app-view")

    .forEach(view => {

      const active =

        view.id === `view-${viewName}`;

 

      view.hidden = !active;

      view.classList.toggle(

        "active",

        active

      );

    });

 

  const title =

    $("currentViewTitle");

 

  if (title) {

    title.textContent =

      viewTitles[viewName] ||

      "Panel del proveedor";

  }

 

  window.scrollTo({

    top: 0,

    behavior: "smooth"

  });

}

 

document

  .querySelectorAll(".nav-item")

  .forEach(button => {

    button.addEventListener(

      "click",

      () =>

        openView(

          button.dataset.view

        )

    );

  });

 

if ("serviceWorker" in navigator) {

  addEventListener(

    "load",

    () =>

      navigator.serviceWorker

        .register("./service-worker.js?v=4")

        .catch(console.error)

  );

}
