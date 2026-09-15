import { auth, db } from "./firebase-config.js";

import {
  createUserWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js";

import {
  doc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";

const registerForm = document.getElementById("registerForm");
const registerButton = document.getElementById("registerButton");
const registerMessage = document.getElementById("registerMessage");
const tipoProveedorInput = document.getElementById("tipoProveedor");
const unidadFields = document.getElementById("unidadFields");
const gruaFields = document.getElementById("gruaFields");

const camposUnidad = [
  document.getElementById("marcaUnidad"),
  document.getElementById("subMarcaUnidad"),
  document.getElementById("colorUnidad"),
  document.getElementById("placasUnidad"),
  document.getElementById("fotoUnidad")
];

const tipoGruaInput = document.getElementById("tipoGrua");
const tonelajeGruaInput = document.getElementById("tonelajeGrua");

tipoProveedorInput.addEventListener("change", actualizarCamposPorTipo);
actualizarCamposPorTipo();

function actualizarCamposPorTipo() {
  const tipo = tipoProveedorInput.value;
  const usaUnidad = ["grua", "auxilio_vial", "ajustador"].includes(tipo);
  const esGrua = tipo === "grua";

  unidadFields.classList.toggle("hidden", !usaUnidad);
  gruaFields.classList.toggle("hidden", !esGrua);

  camposUnidad.forEach((campo) => {
    campo.required = usaUnidad;
  });

  tipoGruaInput.required = esGrua;
  tonelajeGruaInput.required = esGrua;
}

registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const nombre = document.getElementById("nombre").value.trim();
  const telefono = document.getElementById("telefono").value.trim();
  const correo = document.getElementById("correo").value.trim().toLowerCase();
  const tipoProveedor = document.getElementById("tipoProveedor").value;
  const estado = document.getElementById("estado").value.trim();
  const municipio = document.getElementById("municipio").value.trim();
  const password = document.getElementById("password").value;
  const confirmPassword = document.getElementById("confirmPassword").value;
  const aceptaTerminos = document.getElementById("aceptaTerminos").checked;

  registerMessage.textContent = "";
  registerMessage.style.color = "#fca5a5";

  if (password !== confirmPassword) {
    registerMessage.textContent = "Las contraseñas no coinciden.";
    return;
  }

  if (password.length < 6) {
    registerMessage.textContent = "La contraseña debe tener al menos 6 caracteres.";
    return;
  }

  if (!aceptaTerminos) {
    registerMessage.textContent = "Debes aceptar los términos y condiciones.";
    return;
  }

  registerButton.disabled = true;
  registerButton.textContent = "Preparando registro...";

  try {
    const fotoProveedorArchivo = document.getElementById("fotoProveedor").files[0];
    const fotoProveedorOptimizada = await optimizarImagen(fotoProveedorArchivo);
    const fotoProveedor = await subirImagenCloudinary(fotoProveedorOptimizada);

    let unidad = null;

    if (["grua", "auxilio_vial", "ajustador"].includes(tipoProveedor)) {
      const fotoUnidadArchivo = document.getElementById("fotoUnidad").files[0];
      const fotoUnidadOptimizada = await optimizarImagen(fotoUnidadArchivo);
      const fotoUnidad = await subirImagenCloudinary(fotoUnidadOptimizada);

      unidad = {
        marca: document.getElementById("marcaUnidad").value.trim(),
        subMarca: document.getElementById("subMarcaUnidad").value.trim(),
        color: document.getElementById("colorUnidad").value.trim(),
        placas: document.getElementById("placasUnidad").value.trim().toUpperCase(),
        fotoUnidad: fotoUnidad
      };

      if (tipoProveedor === "grua") {
        unidad.tipoGrua = document.getElementById("tipoGrua").value;
        unidad.tonelaje = Number(document.getElementById("tonelajeGrua").value);
      }
    }

    registerButton.textContent = "Creando cuenta...";

    const credential = await createUserWithEmailAndPassword(auth, correo, password);
    const uid = credential.user.uid;

    const datosProveedor = {
      uid: uid,
      nombre: nombre,
      correo: correo,
      telefono: telefono,
      tipoProveedor: tipoProveedor,
      fotoProveedor: fotoProveedor,
      estado: "pendiente",
      estadoSolicitud: "pendiente",
      estadoUbicacion: estado,
      municipio: municipio,
      activo: false,
      autorizado: false,
      bajaAdmin: false,
      suspendido: false,
      disponible: false,
      ocupado: false,
      estadoConexion: "desconectado",
      calificacion: 5,
      serviciosRealizados: 0,
      gananciasHoy: 0,
      gananciasMes: 0,
      aceptaTerminos: true,
      fechaRegistro: serverTimestamp(),
      ultimaActualizacion: serverTimestamp()
    };

    if (unidad) {
      datosProveedor.unidad = unidad;
    }

    await setDoc(doc(db, "proveedores", uid), datosProveedor);
    await signOut(auth);

    registerForm.reset();
    actualizarCamposPorTipo();

    registerMessage.style.color = "#43e99b";
    registerMessage.textContent = "Registro enviado correctamente. Tu cuenta está pendiente de autorización.";
    registerButton.textContent = "Registro enviado";

    setTimeout(() => {
      window.location.href = "login.html";
    }, 3500);

  } catch (error) {
    console.error("Error registrando proveedor:", error);
    console.error("Código Firebase:", error?.code);
    console.error("Mensaje Firebase:", error?.message);

    registerMessage.style.color = "#ff8c96";
    registerMessage.textContent = traducirError(error) + (error?.code ? ` (${error.code})` : "");
    registerButton.disabled = false;
    registerButton.textContent = "Crear cuenta";
  }
});

async function optimizarImagen(archivo) {
  if (!archivo) {
    throw new Error("Debes seleccionar las fotografías solicitadas.");
  }

  if (!archivo.type.startsWith("image/")) {
    throw new Error("El archivo seleccionado debe ser una imagen.");
  }

  const dataUrlOriginal = await leerArchivoComoDataURL(archivo);
  const imagen = await cargarImagen(dataUrlOriginal);

  const maxDimension = 650;
  let width = imagen.naturalWidth || imagen.width;
  let height = imagen.naturalHeight || imagen.height;

  if (width > maxDimension || height > maxDimension) {
    const escala = Math.min(maxDimension / width, maxDimension / height);
    width = Math.round(width * escala);
    height = Math.round(height * escala);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(imagen, 0, 0, width, height);

  return canvas.toDataURL("image/jpeg", 0.58);
}

async function subirImagenCloudinary(imagenDataUrl) {
  const formData = new FormData();
  formData.append("file", imagenDataUrl);
  formData.append("upload_preset", "subastando_fierros");

  const response = await fetch(
    "https://api.cloudinary.com/v1_1/vobmt656/image/upload",
    {
      method: "POST",
      body: formData
    }
  );

  if (!response.ok) {
    let detalle = "";
    try {
      const errorCloudinary = await response.json();
      detalle = errorCloudinary?.error?.message || "";
    } catch (_) {}

    throw new Error(
      detalle
        ? `No fue posible subir la fotografía a Cloudinary: ${detalle}`
        : "No fue posible subir la fotografía a Cloudinary."
    );
  }

  const resultado = await response.json();

  if (!resultado?.secure_url) {
    throw new Error("Cloudinary no devolvió la URL de la fotografía.");
  }

  return resultado.secure_url;
}

function leerArchivoComoDataURL(archivo) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("No fue posible leer la fotografía."));

    reader.readAsDataURL(archivo);
  });
}

function cargarImagen(src) {
  return new Promise((resolve, reject) => {
    const imagen = new Image();

    imagen.onload = () => resolve(imagen);
    imagen.onerror = () => reject(new Error("No fue posible procesar la fotografía."));

    imagen.src = src;
  });
}

function traducirError(error) {
  const code = error?.code || "";

  if (code === "auth/email-already-in-use") return "Este correo ya tiene una cuenta registrada.";
  if (code === "auth/invalid-email") return "El correo electrónico no es válido.";
  if (code === "auth/weak-password") return "La contraseña es demasiado débil.";
  if (code === "auth/network-request-failed") return "No fue posible conectarse. Revisa tu conexión.";

  if (code === "permission-denied" || code === "firestore/permission-denied") {
    return "La cuenta sí se creó en Authentication, pero Firestore no permitió guardar el proveedor.";
  }

  return error?.message || "No fue posible crear la cuenta. Inténtalo nuevamente.";
}
