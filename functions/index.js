/* =========================================================
   AS CLICK - CLOUD FUNCTIONS
   Notificaciones push a proveedores
   Archivo: functions/index.js
   Firebase Functions v2 + Firebase Admin SDK
   ========================================================= */

const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();

const db = getFirestore();

const APP_PROVEEDORES_URL = "https://as-click-proveedores.vercel.app/";

function normalizarTexto(valor = "") {
  return String(valor)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizarTipoServicio(valor = "") {
  const texto = normalizarTexto(valor)
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (texto.includes("grua")) return "grua";
  if (texto.includes("ajustador")) return "ajustador";
  if (texto.includes("abogado")) return "abogado";
  if (texto.includes("auxilio")) return "auxilio_vial";

  return texto.replace(/\s+/g, "_");
}

function obtenerTipoSolicitud(solicitud = {}) {
  return normalizarTipoServicio(
    solicitud.servicio?.tipo ||
    solicitud.servicio?.nombre ||
    solicitud.tipoServicio ||
    solicitud.tipo ||
    ""
  );
}

function obtenerTipoProveedor(proveedor = {}) {
  return normalizarTipoServicio(
    proveedor.tipoProveedor ||
    proveedor.tipo ||
    proveedor.servicio ||
    ""
  );
}

function nombreTipoServicio(tipo = "") {
  const nombres = {
    grua: "Grúa",
    ajustador: "Ajustador",
    abogado: "Abogado",
    auxilio_vial: "Auxilio vial"
  };

  return nombres[tipo] || "Servicio";
}

function crearContenidoNotificacion(solicitudId, solicitud, tipoSolicitud) {
  const folio =
    solicitud.folioOficial ||
    solicitud.folio ||
    solicitudId;

  if (
    solicitud.estado === "pendiente_cotizacion" ||
    tipoSolicitud === "grua"
  ) {
    return {
      title: "🚛 Nueva solicitud de grúa",
      body: `Nueva solicitud disponible · Folio ${folio}. Abre AS CLICK para revisar y cotizar.`
    };
  }

  const servicio = nombreTipoServicio(tipoSolicitud);

  return {
    title: `🚨 Nuevo servicio de ${servicio}`,
    body: `Tienes un nuevo servicio disponible · Folio ${folio}. Abre AS CLICK para revisarlo.`
  };
}

function obtenerFcmTokenProveedor(proveedor = {}) {
  return String(
    proveedor.fcmToken ||
    proveedor.fid ||
    proveedor.firebaseInstallationId ||
    ""
  ).trim();
}

exports.notificarNuevaSolicitudProveedor = onDocumentCreated(
  {
    document: "solicitudes/{solicitudId}",
    region: "us-central1",
    retry: false
  },
  async event => {
    const snapshot = event.data;

    if (!snapshot) {
      console.log("[AS CLICK FCM] Evento recibido sin documento.");
      return;
    }

    const solicitudId = event.params.solicitudId;
    const solicitud = snapshot.data() || {};
    const estado = String(solicitud.estado || "").trim();

    if (!["pendiente_cabina", "pendiente_cotizacion"].includes(estado)) {
      console.log(
        `[AS CLICK FCM] Solicitud ${solicitudId} ignorada por estado: ${
          estado || "sin estado"
        }`
      );
      return;
    }

    const tipoSolicitud = obtenerTipoSolicitud(solicitud);

    if (!tipoSolicitud) {
      console.log(
        `[AS CLICK FCM] Solicitud ${solicitudId} sin tipo de servicio.`
      );
      return;
    }

    console.log(
      `[AS CLICK FCM] Nueva solicitud ${solicitudId} · ${tipoSolicitud} · ${estado}`
    );

    const proveedoresSnap = await db
      .collection("proveedores")
      .where("disponible", "==", true)
      .get();

    const tokens = [];

    proveedoresSnap.forEach(docSnap => {
      const proveedor = docSnap.data() || {};
      const tipoProveedor = obtenerTipoProveedor(proveedor);

      if (proveedor.activo !== true) return;
      if (proveedor.autorizado !== true) return;
      if (proveedor.servicioActualId) return;
      if (tipoProveedor !== tipoSolicitud) return;

      const token = obtenerFcmTokenProveedor(proveedor);

      if (!token) {
        console.log(
          `[AS CLICK FCM] Proveedor ${docSnap.id} disponible pero sin token FCM registrado.`
        );
        return;
      }

      tokens.push(token);
    });

    const tokensUnicos = [...new Set(tokens)].slice(0, 500);

    if (!tokensUnicos.length) {
      console.log(
        `[AS CLICK FCM] No hay proveedores ${tipoSolicitud} disponibles con token FCM para ${solicitudId}.`
      );

      await snapshot.ref.set(
        {
          notificacionProveedores: {
            enviada: false,
            motivo: "sin_proveedores_con_token_fcm",
            intentados: 0,
            enviados: 0,
            fallidos: 0,
            tipoServicio: tipoSolicitud,
            actualizadoEn: FieldValue.serverTimestamp()
          }
        },
        { merge: true }
      );

      return;
    }

    const contenido = crearContenidoNotificacion(
      solicitudId,
      solicitud,
      tipoSolicitud
    );

    const folio = String(
      solicitud.folioOficial ||
      solicitud.folio ||
      solicitudId
    );

    const mensaje = {
      tokens: tokensUnicos,
      data: {
        title: contenido.title,
        body: contenido.body,
        solicitudId: String(solicitudId),
        folio,
        tipoServicio: String(tipoSolicitud),
        estado,
        icon: `${APP_PROVEEDORES_URL}icon-192.png`,
        badge: `${APP_PROVEEDORES_URL}icon-192.png`,
        url: APP_PROVEEDORES_URL
      },
      webpush: {
        headers: {
          Urgency: "high",
          TTL: "90"
        }
      }
    };

    try {
      const respuesta = await getMessaging().sendEachForMulticast(mensaje);

      console.log(
        `[AS CLICK FCM] Solicitud ${solicitudId}: ` +
        `${respuesta.successCount} enviadas, ` +
        `${respuesta.failureCount} fallidas.`
      );

      if (respuesta.failureCount > 0) {
        respuesta.responses.forEach((resultado, indice) => {
          if (!resultado.success) {
            console.error(
              `[AS CLICK FCM] Falló token ${tokensUnicos[indice]}:`,
              resultado.error?.code ||
              resultado.error?.message ||
              resultado.error
            );
          }
        });
      }

      await snapshot.ref.set(
        {
          notificacionProveedores: {
            enviada: respuesta.successCount > 0,
            intentados: tokensUnicos.length,
            enviados: respuesta.successCount,
            fallidos: respuesta.failureCount,
            tipoServicio: tipoSolicitud,
            actualizadoEn: FieldValue.serverTimestamp()
          }
        },
        { merge: true }
      );
    } catch (error) {
      console.error(
        `[AS CLICK FCM] Error enviando notificación de ${solicitudId}:`,
        error
      );

      await snapshot.ref.set(
        {
          notificacionProveedores: {
            enviada: false,
            intentados: tokensUnicos.length,
            enviados: 0,
            fallidos: tokensUnicos.length,
            tipoServicio: tipoSolicitud,
            error: String(
              error?.code ||
              error?.message ||
              error
            ),
            actualizadoEn: FieldValue.serverTimestamp()
          }
        },
        { merge: true }
      );

      throw error;
    }
  }
);
