import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// Reemplaza estos datos por los del MISMO Firebase de AS CLICK clientes.
const firebaseConfig = {
  apiKey: "AIzaSyDeuQxzRhfVB9rXKD1pnOrNMXbrZnDj4UU",
  authDomain: "as-clicl-mexico.firebaseapp.com",
  databaseURL: "https://as-clicl-mexico-default-rtdb.firebaseio.com",
  projectId: "as-clicl-mexico",
  storageBucket: "as-clicl-mexico.firebasestorage.app",
  messagingSenderId: "908429271001",
  appId: "1:908429271001:web:40149a91fb2eef3ab4c3c8"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
