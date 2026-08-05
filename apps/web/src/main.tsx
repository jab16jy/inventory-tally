// apps/web/src/main.tsx — punto de entrada de la PWA (doc 06).
import { FirestoreConteoRepository, type ProveedorUsuarioActual } from "@conteo/data";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./estilos/tema.css";
import { auth, db, monitorPersistencia } from "./lib/firebase.js";
import { AppRouter } from "./lib/router.js";
import { ConteoRepositoryProvider } from "./state/repositorio-contexto.js";
import { BannerInstalarPwa } from "./ui/BannerInstalarPwa.js";
import { BannerPersistenciaDegradada } from "./ui/BannerPersistenciaDegradada.js";
import { ModalActualizacionDisponible } from "./ui/ModalActualizacionDisponible.js";

const usuarioActual: ProveedorUsuarioActual = {
  obtenerUid: () => {
    if (!auth.currentUser) throw new Error("No hay sesión activa");
    return auth.currentUser.uid;
  },
  obtenerNombre: () => auth.currentUser?.displayName ?? null,
};

const repo = new FirestoreConteoRepository(db, usuarioActual);

const raiz = document.getElementById("root");
if (!raiz) throw new Error("No se encontró #root en index.html");

createRoot(raiz).render(
  <StrictMode>
    <ConteoRepositoryProvider repo={repo}>
      <ModalActualizacionDisponible />
      <BannerPersistenciaDegradada monitor={monitorPersistencia} />
      <BannerInstalarPwa />
      <AppRouter />
    </ConteoRepositoryProvider>
  </StrictMode>,
);
