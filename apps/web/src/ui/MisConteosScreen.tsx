// apps/web/src/ui/MisConteosScreen.tsx (doc 11 §2) — historial del cajero:
// las sesiones en las que participó, de la más reciente a la más antigua.
//
// Chrome de CAJERO, no el del admin: la misma `section` + `CabeceraCajero` de
// `SucursalesScreen`, con filas de `Placa`. Deliberadamente NO usa el `Tabla`
// de `ui/admin/Tabla.tsx` — esa es una tabla de escritorio con ordenamiento
// por columna, y esta pantalla se lee de pie, con una mano, en un teléfono
// (doc 11 §1).
//
// `auth` entra por prop igual que en `SucursalesScreen`: la pantalla recibe
// su frontera de I/O desde afuera en vez de importar el singleton de
// `lib/firebase.js`, así el test la monta sin inicializar Firebase.
import type { Auth } from "firebase/auth";
import { useEffect, useState } from "react";
import type { SesionConteo } from "@conteo/shared";
import { fecha, numero } from "../lib/formato.js";
import { useConteoRepository } from "../state/repositorio-contexto.js";
import { useAuthState } from "../state/useAuthState.js";
import { CabeceraCajero } from "./CabeceraCajero.js";
import { Placa } from "./primitivos/Placa.js";

// Misma referencia estable que en `SucursalesScreen`: un `[]` literal inline
// crearía un array nuevo por render y el efecto se resuscribiría en ciclo.
const SIN_SUCURSALES: readonly string[] = [];

// ponytail: número fijo de filas fantasma. A diferencia de `SucursalesScreen`
// —donde el claim ya da la cuenta exacta de sucursales— aquí no se sabe
// cuántas sesiones vendrán hasta que la página resuelve; tres es la altura
// que evita que la pantalla salte demasiado al llegar los datos.
const FILAS_ESQUELETO = [0, 1, 2];

/**
 * ponytail: hook LOCAL, con la forma de `useSesionesPaginadas`
 * (`ui/admin/SesionesScreen.tsx`) pero sin extraer nada compartido: aquel usa
 * `AdminRepository` y sus filtros, éste usa `ConteoRepository` y el claim de
 * sucursales. Un hook común entre los dos sería una interfaz especulativa
 * sobre dos repositorios distintos.
 *
 * El `.catch()` NO es opcional: sin él un rechazo (índice compuesto ausente en
 * producción, regla que deniega, sin red) deja `cargando` en `true` para
 * siempre — el esqueleto se queda pintado y el rechazo sale como unhandled
 * rejection. Es el mismo hueco ya documentado en `SesionesScreen` y
 * `AuditoriaScreen`.
 */
function useMisSesionesPaginadas(sucursalIds: readonly string[], claveSucursales: string) {
  const repo = useConteoRepository();
  const [sesiones, setSesiones] = useState<SesionConteo[]>([]);
  const [siguienteCursor, setSiguienteCursor] = useState<unknown | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError(null);
    repo
      .listarMisSesiones(sucursalIds)
      .then((pagina) => {
        if (cancelado) return;
        setSesiones([...pagina.items]);
        setSiguienteCursor(pagina.siguienteCursor);
        setCargando(false);
      })
      .catch(() => {
        if (cancelado) return;
        setCargando(false);
        setError("No se pudieron cargar tus conteos. Intenta de nuevo.");
      });
    return () => {
      cancelado = true;
    };
    // `sucursalIds` se lee por closure a propósito; `claveSucursales` (su
    // `join(",")`) es la dependencia por CONTENIDO que decide cuándo repetir
    // la consulta — mismo criterio que en `SucursalesScreen`.
  }, [repo, claveSucursales]);

  async function cargarMas(): Promise<void> {
    setError(null);
    try {
      const pagina = await repo.listarMisSesiones(sucursalIds, siguienteCursor);
      setSesiones((actual) => [...actual, ...pagina.items]);
      setSiguienteCursor(pagina.siguienteCursor);
    } catch {
      setError("No se pudieron cargar más conteos. Intenta de nuevo.");
    }
  }

  return { sesiones, siguienteCursor, cargando, error, cargarMas };
}

export interface MisConteosScreenProps {
  readonly auth: Auth;
  readonly onSalir: () => void | Promise<void>;
}

export function MisConteosScreen({ auth, onSalir }: MisConteosScreenProps) {
  const estadoAuth = useAuthState(auth);
  const sucursalIds = estadoAuth?.sucursales ?? SIN_SUCURSALES;
  const claveSucursales = sucursalIds.join(",");
  const { sesiones, siguienteCursor, cargando, error, cargarMas } = useMisSesionesPaginadas(
    sucursalIds,
    claveSucursales,
  );

  // El claim es la autoridad sobre "todavía no resolvió": mientras
  // `estadoAuth` es `undefined` no se afirma nada sobre el historial.
  const esperando = estadoAuth === undefined || cargando;

  return (
    <section className="mx-auto flex min-h-dvh max-w-md flex-col px-3 pt-3">
      <CabeceraCajero titulo="Mis conteos" onSalir={onSalir} />

      {error && (
        <p
          role="alert"
          className="mb-3 rounded-placa border border-riesgo bg-riesgo-placa px-3 py-2 text-micro text-tinta"
        >
          {error}
        </p>
      )}

      {/* Región viva silenciosa: el esqueleto de abajo es `aria-hidden`, así
          que éste es el único aviso de "cargando" que llega a un lector de
          pantalla. Nunca se desmonta — sólo cambia de texto a vacío. */}
      <p className="sr-only" aria-live="polite">
        {esperando ? "Cargando tus conteos…" : ""}
      </p>

      {esperando ? (
        <ul aria-hidden="true" className="flex flex-col gap-2 pb-4">
          {FILAS_ESQUELETO.map((i) => (
            <li key={i} className="list-none" data-testid="fila-esqueleto">
              <Placa className="py-2.5">
                <div className="flex min-h-[var(--size-toque)] w-full flex-col justify-center gap-2">
                  <span className="h-[1.125rem] w-32 animate-pulse rounded-placa bg-placa-alta" />
                  <span className="h-3 w-40 animate-pulse rounded-placa bg-placa-alta" />
                </div>
              </Placa>
            </li>
          ))}
        </ul>
      ) : sesiones.length === 0 ? (
        <p className="text-base text-tenue">Todavía no participaste en ningún conteo.</p>
      ) : (
        <ul className="flex flex-col gap-2 pb-4">
          {sesiones.map((sesion) => (
            <li key={sesion.sesionId} className="list-none">
              <Placa className="py-2.5">
                <div className="flex min-h-[var(--size-toque)] w-full flex-col justify-center gap-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-medio leading-none font-semibold text-tinta">
                      {sesion.sucursalNombre}
                    </span>
                    <span className="shrink-0 text-micro text-tenue">
                      {sesion.estado === "abierta" ? "Abierta" : "Cerrada"}
                    </span>
                  </span>
                  {/* "total de la sesión" es explícito a propósito: el número
                      es `SesionConteo.totalUnidades`, es decir lo que contaron
                      TODOS los participantes juntos, no las unidades de este
                      cajero. La cantidad propia vive sólo en
                      `aportes/{uid}` y no se lee aquí (fuera de alcance). */}
                  <span className="text-micro text-tenue">
                    {fecha(sesion.abiertaEn)} · {numero(sesion.totalUnidades)} u · total de la
                    sesión
                  </span>
                </div>
              </Placa>
            </li>
          ))}
        </ul>
      )}

      {siguienteCursor !== null && (
        <button
          type="button"
          onClick={() => void cargarMas()}
          className="mb-4 min-h-[var(--size-toque)] rounded-placa border border-borde px-4 py-2 text-micro text-tinta"
        >
          Cargar más
        </button>
      )}
    </section>
  );
}
