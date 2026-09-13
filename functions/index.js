/* =========================================================

   AS CLICK - CLOUD FUNCTIONS / NOTIFICACIONES A PROVEEDORES

   Archivo: functions/index.js

   Firebase Functions v2 + Firebase Admin SDK

   ========================================================= */

const { onDocumentCreated } = require("firebase-functions/v2/firestore");

const { initializeApp } = require("firebase-admin/app");

const { getFirestore } = require("firebase-admin/firestore");

const { getMessaging } = require("firebase-admin/messaging");

initializeApp();

const db = getFirestore();

function normalizarTexto(valor = "") {

  return String(valor)

    .trim()

    .toLowerCase()

    .normalize("NFD")

    .replace(/[\u0300-\u036f]/g, "");

}

function normalizarTipoServicio(valor = "") {

  const texto = normalizarTexto(valor).replace(/[_-]+/g, " ").replace(/\s+/g, " ");

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

function textoTipoServicio(tipo) {

  const nombres = {

    grua: "Grúa",

    ajustador: "Ajustador",

    abogado: "Abogado",

    auxilio_vial: "Auxilio vial"

  };

  return nombres[tipo] || "Servicio";

}

function crearContenidoNotificacion(solicitudId, solicitud, tipo) {

  const folio =

    solicitud.folioOficial ||

    solicitud.folio ||

    solicitudId;

  if (solicitud.estado === "pendiente_cotizacion" || tipo === "grua") {

    return {

      title: "🚛 Nueva solicitud de grúa",

      body: `Nueva solicitud disponible · Folio ${folio}. Abre AS CLICK para revisar y cotizar.`

    };

  }

  const nombre = textoTipoServicio(tipo);

  return {

    title: `🚨 Nuevo servicio de ${nombre}`,

    body: `Tienes un nuevo servicio disponible · Folio ${folio}. Abre AS CLICK para revisarlo.`

  };

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

      console.log("[AS CLICK FCM] Evento sin documento.");

      return;

    }

    const solicitudId = event.params.solicitudId;

    const solicitud = snapshot.data() || {};

    const estado = String(solicitud.estado || "").trim();

    if (!["pendiente_cabina", "pendiente_cotizacion"].includes(estado)) {

      console.log(

        `[AS CLICK FCM] Solicitud ${solicitudId} ignorada por estado: ${estado || "sin estado"}`

      );

      return;

    }

    const tipoSolicitud = obtenerTipoSolicitud(solicitud);

    if (!tipoSolicitud) {

      console.log(`[AS CLICK FCM] Solicitud ${solicitudId} sin tipo de servicio.`);

      return;

    }

    const proveedoresSnap = await db

      .collection("proveedores")

      .where("disponible", "==", true)

      .get();

    const fids = [];

    const proveedoresDestino = [];

    proveedoresSnap.forEach(docSnap => {

      const proveedor = docSnap.data() || {};

      const tipoProveedor = obtenerTipoProveedor(proveedor);

      if (proveedor.activo !== true) return;

      if (proveedor.autorizado !== true) return;

      if (proveedor.servicioActualId) return;

      if (tipoProveedor !== tipoSolicitud) return;

      // El app.js actual guarda aquí el Firebase Installation ID (FID).

      // El nombre histórico del campo se conserva para no romper tu app.

      const fid = String(

        proveedor.fcmToken ||

        proveedor.fid ||

        proveedor.firebaseInstallationId ||

        ""

      ).trim();

      if (!fid) return;

      fids.push(fid);

      proveedoresDestino.push({

        uid: docSnap.id,

        fid,

        nombre: proveedor.nombre || proveedor.nombreCompleto || "Proveedor"

      });

    });

    const fidsUnicos = [...new Set(fids)].slice(0, 500);

    if (!fidsUnicos.length) {

      console.log(

        `[AS CLICK FCM] No hay proveedores ${tipoSolicitud} disponibles con FID para ${solicitudId}.`

      );

      return;

    }

    const contenido = crearContenidoNotificacion(

      solicitudId,

      solicitud,

      tipoSolicitud

    );

    // Se envía como DATA-ONLY para que firebase-messaging-sw.js

    // controle la notificación de segundo plano sin duplicarla.

    const mensaje = {

      fids: fidsUnicos,

      data: {

        title: contenido.title,

        body: contenido.body,

        solicitudId: String(solicitudId),

        folio: String(

          solicitud.folioOficial ||

          solicitud.folio ||

          solicitudId

        ),

        tipoServicio: String(tipoSolicitud),

        estado: String(estado),

        url: "/AS-CLICK-Proveedores/"

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

        `[AS CLICK FCM] Solicitud ${solicitudId}: ${respuesta.successCount} enviadas, ${respuesta.failureCount} fallidas.`

      );

      if (respuesta.failureCount > 0) {

        respuesta.responses.forEach((resultado, indice) => {

          if (!resultado.success) {

            console.error(

              "[AS CLICK FCM] Error de envío",

              {

                fid: fidsUnicos[indice],

                error: resultado.error?.code || resultado.error?.message || resultado.error

              }

            );

          }

        });

      }

      await snapshot.ref.set(

        {

          notificacionProveedores: {

            enviada: respuesta.successCount > 0,

            enviados: respuesta.successCount,

            fallidos: respuesta.failureCount,

            intentados: fidsUnicos.length,

            tipoServicio: tipoSolicitud,

            fechaServidor: new Date().toISOString()

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

            error: String(error?.code || error?.message || error),

            tipoServicio: tipoSolicitud,

            fechaServidor: new Date().toISOString()

          }

        },

        { merge: true }

      );

      throw error;

    }

  }

);
