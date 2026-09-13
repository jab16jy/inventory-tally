// apps/web/src/lib/router.tsx (doc 11 §2). F3-A dejó /login, /sucursales y
// /conteo/:sesionId; F3-B añadió /conteo/:sesionId/preparar y
// /conteo/:sesionId/finalizar. F1 del panel admin
// (docs/plan-panel-administrador.md §5) añade `/admin` con su propio
// armazón (AdminLayout); F2 sumó cajeros y sucursales; F3 suma categorías,
// sesiones y auditoría; F4 suma cierre y comparativo; F5 suma el análisis de
// una sesión, alcanzado desde el botón "Análisis →" de PanelScreen.
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import type { ReactElement, ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { FirestoreAdminRepository } from "@conteo/data";
import { calcularRedireccion, homePorRol } from "./guardas.js";
import { auth, db } from "./firebase.js";
import { functions } from "./funciones.js";
import { useAuthState } from "../state/useAuthState.js";
import { AdminRepositoryProvider } from "../state/admin-contexto.js";
import { AnalisisConteoScreen } from "../ui/AnalisisConteoScreen.js";
import { ConteoScreenPorSesion } from "../ui/ConteoScreen.js";
import { CuentaScreen } from "../ui/CuentaScreen.js";
import { FinalizarScreen } from "../ui/FinalizarScreen.js";
import { LayoutCajero } from "../ui/LayoutCajero.js";
import { LoginScreen } from "../ui/LoginScreen.js";
import { MisConteosScreen } from "../ui/MisConteosScreen.js";
import { PrepararScreen } from "../ui/PrepararScreen.js";
import { SucursalesScreen } from "../ui/SucursalesScreen.js";
import { AdminLayout } from "../ui/admin/AdminLayout.js";
import { AnalisisScreen } from "../ui/admin/AnalisisScreen.js";
import { AuditoriaScreen } from "../ui/admin/AuditoriaScreen.js";
import { CajerosScreen } from "../ui/admin/CajerosScreen.js";
import { CatalogoScreen } from "../ui/admin/CatalogoScreen.js";
import { CierreScreen } from "../ui/admin/CierreScreen.js";
import { ComparativoScreen } from "../ui/admin/ComparativoScreen.js";
import { PanelScreen } from "../ui/admin/PanelScreen.js";
import { SesionesScreen } from "../ui/admin/SesionesScreen.js";
import { SucursalesAdminScreen } from "../ui/admin/SucursalesAdminScreen.js";

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

/** Raíz "/": sin sesión a /login, con sesión al home del rol (doc 11 §2). */
function HomeSegunSesion(): ReactElement {
  const estadoAuth = useAuthState(auth);

  if (estadoAuth === undefined) return <SplashScreen />;
  if (estadoAuth === null) return <Navigate to="/login" replace />;
  return <Navigate to={homePorRol(estadoAuth)} replace />;
}

/** Versión de RequireAuth para /login: con sesión activa salta directo al
 *  home del rol (doc 11 §2); sin sesión muestra el formulario. */
function RequireAnonimo({ children }: { readonly children: ReactElement }): ReactElement {
  const estadoAuth = useAuthState(auth);

  if (estadoAuth === undefined) return <SplashScreen />;
  if (estadoAuth !== null) return <Navigate to={homePorRol(estadoAuth)} replace />;
  return children;
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
        <Route path="/" element={<HomeSegunSesion />} />
        <Route
          path="/login"
          element={
            <RequireAnonimo>
              <LoginScreen
                // Se DEVUELVE la promesa (antes se descartaba con `void`): es
                // lo que deja a LoginScreen mostrar el error inline y bloquear
                // el botón mientras el intento está en vuelo.
                onIniciarSesion={async (correo, password) => {
                  await signInWithEmailAndPassword(auth, correo, password);
                }}
              />
            </RequireAnonimo>
          }
        />
        {/* Armazón del cajero: las cuatro pantallas que se navegan por
            pestañas van DENTRO del layout; las tres de conteo quedan fuera a
            propósito, así la barra inferior no se esconde — no se monta.
            Condicionar la barra a `pathname.startsWith("/conteo")` sería
            reimplementar el routing a mano y desincronizarse en la primera
            ruta nueva. Ruta pathless: `RequireAuth` se declara una vez en vez
            de repetirse en cada hija. `calcularRedireccion` (lib/guardas.ts)
            no necesita cambios: sólo desvía /admin, y éstas son del cajero. */}
        <Route
          element={
            <RequireAuth>
              <LayoutCajero />
            </RequireAuth>
          }
        >
          <Route
            path="/sucursales"
            element={<SucursalesScreen auth={auth} onSalir={() => signOut(auth)} />}
          />
          <Route
            path="/mis-conteos"
            element={<MisConteosScreen auth={auth} onSalir={() => signOut(auth)} />}
          />
          {/* Análisis de UNA sesión, en unidades (RF-14, I-9): alcanzado
              tocando una fila del historial. */}
          <Route
            path="/mis-conteos/:sesionId"
            element={<AnalisisConteoScreen onSalir={() => signOut(auth)} />}
          />
          <Route
            path="/cuenta"
            element={<CuentaScreen auth={auth} onSalir={() => signOut(auth)} />}
          />
        </Route>
        <Route
          path="/conteo/:sesionId/preparar"
          element={
            <RequireAuth>
              <PrepararScreen auth={auth} />
            </RequireAuth>
          }
        />
        <Route
          path="/conteo/:sesionId"
          element={
            <RequireAuth>
              <ConteoScreenPorSesion auth={auth} />
            </RequireAuth>
          }
        />
        <Route
          path="/conteo/:sesionId/finalizar"
          element={
            <RequireAuth>
              <FinalizarScreen auth={auth} />
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
          <Route path="cajeros" element={<CajerosScreen />} />
          <Route path="sucursales" element={<SucursalesAdminScreen />} />
          <Route path="categorias" element={<CatalogoScreen />} />
          <Route path="sesiones" element={<SesionesScreen />} />
          {/* Alcanzada desde el botón "Cerrar →" de PanelScreen (F1 ya lo
              anticipaba) — R5, la única pantalla del admin con wireframe. */}
          <Route path="sesiones/:sesionId/cerrar" element={<CierreScreen />} />
          {/* Alcanzada desde el botón "Análisis →" de PanelScreen (F5). */}
          <Route path="sesiones/:sesionId/analisis" element={<AnalisisScreen />} />
          <Route path="auditoria" element={<AuditoriaScreen />} />
          <Route path="comparativo" element={<ComparativoScreen />} />
        </Route>
        <Route path="*" element={<StubScreen titulo="Próximamente" />} />
      </Routes>
    </BrowserRouter>
  );
}
