import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const form=document.getElementById("loginForm"),button=document.getElementById("loginButton"),message=document.getElementById("loginMessage");

onAuthStateChanged(auth,async user=>{if(user&&await autorizado(user.uid)) location.replace("index.html")});

form.addEventListener("submit",async e=>{
  e.preventDefault(); message.textContent=""; button.disabled=true; button.textContent="Validando...";
  try{
    const cred=await signInWithEmailAndPassword(auth,document.getElementById("email").value.trim(),document.getElementById("password").value);
    if(!await autorizado(cred.user.uid)){await signOut(auth);throw new Error("Tu cuenta no está autorizada como proveedor.")}
    location.replace("index.html");
  }catch(err){console.error(err);message.textContent=err.code?.includes("invalid-credential")?"Correo o contraseña incorrectos.":err.message||"No fue posible iniciar sesión."}
  finally{button.disabled=false;button.textContent="Entrar"}
});

async function autorizado(uid){const snap=await getDoc(doc(db,"proveedores",uid));if(!snap.exists())return false;const d=snap.data();return d.activo===true||String(d.estado||"").toLowerCase()==="activo"}
