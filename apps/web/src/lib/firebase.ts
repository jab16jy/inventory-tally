// apps/web/src/lib/firebase.ts (doc 06 §4)
import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";
import { instalarMonitorPersistencia } from "./persistencia-monitor.js";

// Decisión de esta ola: los docs no fijan la config real de Firebase (eso es
// del doc 12, fuera de alcance). Se usan valores mínimos válidos para el
// proyecto demo de los emuladores (`--project demo-conteo-eficiente`, ver
// infra/firebase.json); producción los sobrescribe con VITE_FIREBASE_*.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? "demo-api-key",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? "demo-conteo-eficiente.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "demo-conteo-eficiente",
  storageBucket:
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? "demo-conteo-eficiente.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "0",
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? "1:0:web:0",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Instalado ANTES de initializeFirestore: la degradación silenciosa a
// caché en memoria puede ocurrir en el primer acceso a IndexedDB, que
// Firestore hace de forma perezosa (no dentro de initializeFirestore
// mismo), así que el monitor debe estar armado desde el arranque.
export const monitorPersistencia = instalarMonitorPersistencia();

// doc 06 §4 / nota de API: el SDK instalado (firebase@11.10.0) usa
// `FirestoreSettings.localCache` — confirmado contra
// node_modules/@firebase/firestore/dist/index.d.ts:1177
// (`localCache?: FirestoreLocalCache`), que es la autoridad. Parte de la
// documentación de Firebase menciona `FirestoreSettings.cache`, pero esa
// clave no existe en los tipos del SDK instalado.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    // Multi-pestaña: sin esto sólo la primera pestaña tiene persistencia y
    // el resto queda en memoria sin avisar (doc 06 §4).
    tabManager: persistentMultipleTabManager(),
  }),
});

if (import.meta.env.VITE_USE_EMULATORS === "true") {
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connectAuthEmulator(auth, "http://127.0.0.1:9099");
}

// doc 06 §4: reduce la probabilidad de limpieza automática del
// almacenamiento por el navegador. No es garantía (por eso el monitor de
// persistencia existe aparte); sólo se registra para diagnóstico.
void navigator.storage?.persist();
