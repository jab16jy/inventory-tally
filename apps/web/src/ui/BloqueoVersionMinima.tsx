// apps/web/src/ui/BloqueoVersionMinima.tsx — issue #12, D3/D4/D5: pantalla
// completa de bloqueo por versión mínima, envolviendo AppRouter entero
// (main.tsx) para que aplique a toda la app y no ruta por ruta.
import type { ReactNode } from "react";
import { auth } from "../lib/firebase.js";
import { useAuthState } from "../state/useAuthState.js";
import { useVersionMinima } from "../state/useVersionMinima.js";

export function BloqueoVersionMinima({ children }: { readonly children: ReactNode }) {
  const estadoAuth = useAuthState(auth);
  // Sin sesión (undefined = resolviendo, null = sin login) no hay nada que
  // proteger todavía: config/app exige autenticado() (infra/firestore.rules),
  // y las rutas públicas (/login) tampoco deben bloquearse. RequireAuth
  // (lib/router.tsx) sigue gestionando el acceso por ruta como siempre.
  const hayUsuario = estadoAuth !== undefined && estadoAuth !== null;
  const { bloqueado, cargando } = useVersionMinima(hayUsuario, __VERSION_APP__);

  if (!hayUsuario) return <>{children}</>;
  // D5: bloquea el render hasta tener la primera respuesta — nada de montaje
  // optimista. Mismo espíritu que SplashScreen (lib/router.tsx).
  if (cargando) return <p>Cargando…</p>;
  if (!bloqueado) return <>{children}</>;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-fondo px-4 text-center">
      <p className="text-base text-tinta">
        Esta versión de la app ya no es compatible. Actualízala para seguir usándola.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="min-h-[var(--size-toque)] rounded-placa bg-senal px-4 font-semibold text-fondo transition-colors duration-150 ease-out active:bg-senal/85"
      >
        Actualizar
      </button>
    </div>
  );
}
