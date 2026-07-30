import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// Reemplaza estos datos por los del MISMO Firebase de AS CLICK clientes.
const firebaseConfig = {
  apiKey: "PON_AQUI_TU_API_KEY",
  authDomain: "PON_AQUI_TU_AUTH_DOMAIN",
  projectId: "PON_AQUI_TU_PROJECT_ID",
  storageBucket: "PON_AQUI_TU_STORAGE_BUCKET",
  messagingSenderId: "PON_AQUI_TU_MESSAGING_SENDER_ID",
  appId: "PON_AQUI_TU_APP_ID"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
