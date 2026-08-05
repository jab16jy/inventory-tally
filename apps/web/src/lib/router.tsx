// apps/web/src/lib/router.tsx (doc 11 §2). F3-A dejó /login, /sucursales y
// /conteo/:sesionId; esta ola (F3-B) añade /conteo/:sesionId/preparar y
// /conteo/:sesionId/finalizar. El resto del mapa (/admin/*, …) sigue como
// stub detrás de la ruta comodín, a la espera de las próximas olas.
import { signInWithEmailAndPassword } from "firebase/auth";
import type { ReactElement, ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { calcularRedireccion } from "./guardas.js";
import { auth } from "./firebase.js";
import { useAuthState } from "../state/useAuthState.js";
import { ConteoScreenPorSesion } from "../ui/ConteoScreen.js";
import { FinalizarScreen } from "../ui/FinalizarScreen.js";
import { LoginScreen } from "../ui/LoginScreen.js";
import { PrepararScreen } from "../ui/PrepararScreen.js";
import { SucursalesScreen } from "../ui/SucursalesScreen.js";

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
        <Route path="*" element={<StubScreen titulo="Próximamente" />} />
      </Routes>
    </BrowserRouter>
  );
}
