import { auth, db } from "./firebase-config.js";

import {
  createUserWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  doc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";


const registerForm = document.getElementById("registerForm");
const registerButton = document.getElementById("registerButton");
const registerMessage = document.getElementById("registerMessage");


registerForm.addEventListener("submit", async (event) => {

  event.preventDefault();

  const nombre = document
    .getElementById("nombre")
    .value
    .trim();

  const telefono = document
    .getElementById("telefono")
    .value
    .trim();

  const correo = document
    .getElementById("correo")
    .value
    .trim()
    .toLowerCase();

  const tipoProveedor = document
    .getElementById("tipoProveedor")
    .value;

  const estado = document
    .getElementById("estado")
    .value
    .trim();

  const municipio = document
    .getElementById("municipio")
    .value
    .trim();

  const password = document
    .getElementById("password")
    .value;

  const confirmPassword = document
    .getElementById("confirmPassword")
    .value;

  const aceptaTerminos = document
    .getElementById("aceptaTerminos")
    .checked;


  registerMessage.textContent = "";


  if (password !== confirmPassword) {

    registerMessage.textContent =
      "Las contraseñas no coinciden.";

    return;

  }


  if (password.length < 6) {

    registerMessage.textContent =
      "La contraseña debe tener al menos 6 caracteres.";

    return;

  }


  if (!aceptaTerminos) {

    registerMessage.textContent =
      "Debes aceptar los términos y condiciones.";

    return;

  }


  registerButton.disabled = true;
  registerButton.textContent = "Creando cuenta...";


  try {

    const credential =
      await createUserWithEmailAndPassword(
        auth,
        correo,
        password
      );


    const uid = credential.user.uid;


    await setDoc(
      doc(db, "proveedores", uid),
      {
        uid: uid,

        nombre: nombre,

        correo: correo,

        telefono: telefono,

        tipoProveedor: tipoProveedor,

        estado: "pendiente",

        estadoSolicitud: "pendiente",

        estadoUbicacion: estado,

        municipio: municipio,

        activo: false,

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
      }
    );


    await signOut(auth);


    registerForm.reset();

    registerMessage.style.color = "#43e99b";

    registerMessage.textContent =
      "Registro enviado correctamente. Tu cuenta está pendiente de autorización.";


    registerButton.textContent = "Registro enviado";


    setTimeout(() => {

      window.location.href = "login.html";

    }, 3500);


  } catch (error) {

    console.error("Error registrando proveedor:", error);

    registerMessage.style.color = "#ff8c96";
    registerMessage.textContent = traducirError(error);

    registerButton.disabled = false;
    registerButton.textContent = "Crear cuenta";

  }

});


function traducirError(error) {

  const code = error?.code || "";


  if (code === "auth/email-already-in-use") {

    return "Este correo ya tiene una cuenta registrada.";

  }


  if (code === "auth/invalid-email") {

    return "El correo electrónico no es válido.";

  }


  if (code === "auth/weak-password") {

    return "La contraseña es demasiado débil.";

  }


  if (code === "auth/network-request-failed") {

    return "No fue posible conectarse. Revisa tu conexión.";

  }


  if (code === "permission-denied") {

    return "Firebase no permitió guardar el registro.";

  }


  return "No fue posible crear la cuenta. Inténtalo nuevamente.";

}
