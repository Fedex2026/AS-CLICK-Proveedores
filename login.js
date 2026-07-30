import { auth } from "./firebase-config.js";

import {
  onAuthStateChanged,
  signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const form = document.getElementById("loginForm");
const button = document.getElementById("loginButton");
const message = document.getElementById("loginMessage");

onAuthStateChanged(auth, (user) => {
  if (user) {
    location.replace("index.html");
  }
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  message.textContent = "";
  button.disabled = true;
  button.textContent = "Validando...";

  try {
    await signInWithEmailAndPassword(
      auth,
      document.getElementById("email").value.trim(),
      document.getElementById("password").value
    );

    location.replace("index.html");

  } catch (err) {
    console.error(err);

    message.textContent =
      err.code?.includes("invalid-credential")
        ? "Correo o contraseña incorrectos."
        : err.message || "No fue posible iniciar sesión.";

  } finally {
    button.disabled = false;
    button.textContent = "Entrar";
  }
});
