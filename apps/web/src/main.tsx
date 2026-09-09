// apps/web/src/main.tsx — punto de entrada de la PWA (doc 06).
import { FirestoreConteoRepository, type ProveedorUsuarioActual } from "@conteo/data";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./estilos/tema.css";
import { auth, db, monitorPersistencia } from "./lib/firebase.js";
import { functions } from "./lib/funciones.js";
import { AppRouter } from "./lib/router.js";
import { ConteoRepositoryProvider } from "./state/repositorio-contexto.js";
import { BannerInstalarPwa } from "./ui/BannerInstalarPwa.js";
import { BannerPersistenciaDegradada } from "./ui/BannerPersistenciaDegradada.js";
import { BloqueoVersionMinima } from "./ui/BloqueoVersionMinima.js";
import { ErrorBoundary } from "./ui/ErrorBoundary.js";
import { ModalActualizacionDisponible } from "./ui/ModalActualizacionDisponible.js";

const usuarioActual: ProveedorUsuarioActual = {
  obtenerUid: () => {
    if (!auth.currentUser) throw new Error("No hay sesión activa");
    return auth.currentUser.uid;
  },
  obtenerNombre: () => auth.currentUser?.displayName ?? null,
};

const repo = new FirestoreConteoRepository(db, usuarioActual, functions);

const raiz = document.getElementById("root");
if (!raiz) throw new Error("No se encontró #root en index.html");

createRoot(raiz).render(
  <StrictMode>
    {/* Envuelve el árbol entero, proveedor incluido: cualquier pantalla que
        reviente cae en el fallback en vez de dejar #root vacío (issue #17). */}
    <ErrorBoundary>
      <ConteoRepositoryProvider repo={repo}>
        <ModalActualizacionDisponible />
        <BannerPersistenciaDegradada monitor={monitorPersistencia} />
        <BannerInstalarPwa />
        <BloqueoVersionMinima>
          <AppRouter />
        </BloqueoVersionMinima>
      </ConteoRepositoryProvider>
    </ErrorBoundary>
  </StrictMode>,
);
