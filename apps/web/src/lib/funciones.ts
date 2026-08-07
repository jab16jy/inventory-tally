// apps/web/src/lib/funciones.ts — primer punto del repo que usa Cloud
// Functions callables (docs/plan-panel-administrador.md §4: `AdminRepository`
// escribe TODO vía httpsCallable, nunca directo a Firestore). Mismo patrón
// de conexión al emulador que apps/web/src/lib/firebase.ts.
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";
import { app } from "./firebase.js";

// Región fija: las 10 callables del panel admin (existentes y nuevas) fijan
// { region: "us-central1" } (doc plan §3).
export const functions = getFunctions(app, "us-central1");

if (import.meta.env.VITE_USE_EMULATORS === "true") {
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
}
