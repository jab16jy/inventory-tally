// apps/web/src/lib/router.tsx (doc 11 §2). F3-A dejó /login, /sucursales y
// /conteo/:sesionId; F3-B añadió /conteo/:sesionId/preparar y
// /conteo/:sesionId/finalizar. F1 del panel admin
// (docs/plan-panel-administrador.md §5) añade `/admin` con su propio
// armazón (AdminLayout) y su primera pantalla real (PanelScreen); el resto
// de las siete rutas de /admin sigue detrás de la ruta comodín, a la espera
// de F2-F5.
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import type { ReactElement, ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { FirestoreAdminRepository } from "@conteo/data";
import { calcularRedireccion } from "./guardas.js";
import { auth, db } from "./firebase.js";
import { functions } from "./funciones.js";
import { useAuthState } from "../state/useAuthState.js";
import { AdminRepositoryProvider } from "../state/admin-contexto.js";
import { ConteoScreenPorSesion } from "../ui/ConteoScreen.js";
import { FinalizarScreen } from "../ui/FinalizarScreen.js";
import { LoginScreen } from "../ui/LoginScreen.js";
import { PrepararScreen } from "../ui/PrepararScreen.js";
import { SucursalesScreen } from "../ui/SucursalesScreen.js";
import { AdminLayout } from "../ui/admin/AdminLayout.js";
import { PanelScreen } from "../ui/admin/PanelScreen.js";

// Módulo, no componente: una sola instancia para todo el árbol de /admin,
// igual que `auth`/`db` en lib/firebase.ts. Sin React.lazy — no hay ninguno
// hoy en esta app y no se está sumando ninguna librería de gráficas que lo
// justifique (doc plan §1); un `// ponytail:` si algún día hace falta.
const adminRepo = new FirestoreAdminRepository(db, functions);

function SplashScreen() {
  return <p>Cargando…</p>;
}

function StubScreen({ titulo }: { readonly titulo: string }) {
  return <p>{titulo} — próximamente</p>;
}

/** Guarda de conveniencia (doc 11 §2): la autorización real está en las
 *  Security Rules, no aquí. */
function RequireAuth({ children }: { readonly children: ReactElement }): ReactElement {
  const estadoAuth = useAuthState(auth);
  const location = useLocation();

  if (estadoAuth === undefined) return <SplashScreen />;
  const destino = calcularRedireccion(estadoAuth, location.pathname);
  if (destino) return <Navigate to={destino} state={{ from: location }} replace />;
  return children;
}

export function AppRouter(): ReactNode {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={
            <LoginScreen
              // Se DEVUELVE la promesa (antes se descartaba con `void`): es
              // lo que deja a LoginScreen mostrar el error inline y bloquear
              // el botón mientras el intento está en vuelo.
              onIniciarSesion={async (correo, password) => {
                await signInWithEmailAndPassword(auth, correo, password);
              }}
            />
          }
        />
        <Route
          path="/sucursales"
          element={
            <RequireAuth>
              <SucursalesScreen auth={auth} />
            </RequireAuth>
          }
        />
        <Route
          path="/conteo/:sesionId/preparar"
          element={
            <RequireAuth>
              <PrepararScreen />
            </RequireAuth>
          }
        />
        <Route
          path="/conteo/:sesionId"
          element={
            <RequireAuth>
              <ConteoScreenPorSesion />
            </RequireAuth>
          }
        />
        <Route
          path="/conteo/:sesionId/finalizar"
          element={
            <RequireAuth>
              <FinalizarScreen />
            </RequireAuth>
          }
        />
        <Route
          path="/admin"
          element={
            <RequireAuth>
              <AdminRepositoryProvider repo={adminRepo}>
                <AdminLayout onSalir={() => signOut(auth)} />
              </AdminRepositoryProvider>
            </RequireAuth>
          }
        >
          <Route index element={<PanelScreen />} />
        </Route>
        <Route path="*" element={<StubScreen titulo="Próximamente" />} />
      </Routes>
    </BrowserRouter>
  );
}
