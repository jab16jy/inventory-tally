// apps/web/src/ui/admin/CierreScreen.tsx (docs/plan-panel-administrador.md §5,
// fase F4, R5) — única pantalla del admin con wireframe
// (docs/diseno/11-ux-y-navegacion.md:277-291). Alcanzada desde el botón
// "Cerrar →" que `PanelScreen.tsx` ya monta para cada sesión abierta (F1 lo
// anticipó); no se repite la navegación en `SesionesScreen` porque su test
// monta el componente sin `<Router>` y `useNavigate`/`<Link>` exigen ese
// contexto en cuanto se renderizan — añadirlo ahí pondría en rojo los cinco
// tests ya verdes de ese archivo sin tocar una sola línea de ellos.
//
// El dinero se calcula EN CLIENTE con `totalMonetarioSesion(lineas)`
// (docs/plan-panel-administrador.md §4): nunca se lee `resumen/actual`, que
// un cron refresca cada minuto y puede quedar `dirty` indefinidamente.
import { useEffect, useId, useState } from "react";
import clsx from "clsx";
import { FirebaseError } from "firebase/app";
import { useParams } from "react-router-dom";
import type { LineaConteo } from "@conteo/shared/models/linea-conteo.js";
import type { SesionConteo } from "@conteo/shared/models/sesion-conteo.js";
import { totalMonetarioSesion, totalUnidadesSesion } from "@conteo/shared/services/calculadora.js";
import type { EstadoSincronizacion } from "@conteo/data";
import { moneda, numero } from "../../lib/formato.js";
import { useAdminRepository } from "../../state/admin-contexto.js";
import { Icono } from "../primitivos/Icono.js";
import { Placa } from "../primitivos/Placa.js";

interface ParticipanteServidor {
  readonly uid: string;
  readonly nombre: string;
}

/**
 * `cerrarSesion` rechaza con `HttpsError("failed-precondition", …, {
 * sinConfirmar })`, que en el cliente llega como `FirebaseError.details`
 * (doc plan §3, `cerrar-sesion.ts`). Cruza una frontera de confianza (la
 * forma la decide el backend, no TypeScript), así que se valida en vez de
 * confiar en un cast.
 */
function sinConfirmarDelServidor(error: unknown): readonly ParticipanteServidor[] | null {
  if (!(error instanceof FirebaseError)) return null;
  const detalles = (error as { details?: unknown }).details;
  if (typeof detalles !== "object" || detalles === null) return null;
  const sinConfirmar = (detalles as { sinConfirmar?: unknown }).sinConfirmar;
  if (!Array.isArray(sinConfirmar)) return null;
  return sinConfirmar.filter(
    (p): p is ParticipanteServidor =>
      typeof p === "object" &&
      p !== null &&
      typeof (p as Partial<ParticipanteServidor>).uid === "string" &&
      typeof (p as Partial<ParticipanteServidor>).nombre === "string",
  );
}

const SINCRONIZACION_VACIA: EstadoSincronizacion = { participantes: [] };

function useSesion(sesionId: string): { sesion: SesionConteo | null; cargando: boolean } {
  const repo = useAdminRepository();
  const [sesion, setSesion] = useState<SesionConteo | null>(null);
  const [cargando, setCargando] = useState(true);
  useEffect(() => {
    setCargando(true);
    return repo.observarSesion(sesionId, (s) => {
      setSesion(s);
      setCargando(false);
    });
  }, [repo, sesionId]);
  return { sesion, cargando };
}

function useSincronizacion(sesionId: string): {
  estado: EstadoSincronizacion;
  cargando: boolean;
} {
  const repo = useAdminRepository();
  const [estado, setEstado] = useState<EstadoSincronizacion>(SINCRONIZACION_VACIA);
  const [cargando, setCargando] = useState(true);
  useEffect(() => {
    setCargando(true);
    return repo.observarSincronizacion(sesionId, (e) => {
      setEstado(e);
      setCargando(false);
    });
  }, [repo, sesionId]);
  return { estado, cargando };
}

function useLineas(sesionId: string): LineaConteo[] {
  const repo = useAdminRepository();
  const [lineas, setLineas] = useState<LineaConteo[]>([]);
  useEffect(() => repo.observarLineasSesion(sesionId, setLineas), [repo, sesionId]);
  return lineas;
}

export function CierreScreen() {
  const { sesionId = "" } = useParams<{ sesionId: string }>();
  const repo = useAdminRepository();
  const { sesion, cargando: cargandoSesion } = useSesion(sesionId);
  const { estado: sincronizacion, cargando: cargandoSync } = useSincronizacion(sesionId);
  const lineas = useLineas(sesionId);

  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const idRazonBloqueo = useId();

  const participantes = sincronizacion.participantes;
  const pendientes = participantes.filter((p) => !p.sincronizado);
  const todosSincronizados = pendientes.length === 0;
  const nombresPendientes = pendientes.map((p) => p.nombre).join(", ");

  async function cerrar(forzar: boolean): Promise<void> {
    setError(null);
    setEnviando(true);
    try {
      await repo.cerrarSesion({ sesionId, forzar });
    } catch (err) {
      // La respuesta del servidor es la que manda — puede nombrar cajeros
      // distintos a los que el snapshot local mostraba hace un instante,
      // que es exactamente la carrera que `details.sinConfirmar` existe
      // para resolver (ver `sinConfirmarDelServidor`).
      const deServidor = sinConfirmarDelServidor(err);
      if (deServidor && deServidor.length > 0) {
        setError(
          `Hay cajeros con conteos sin sincronizar: ${deServidor.map((p) => p.nombre).join(", ")}.`,
        );
      } else {
        setError("No se pudo cerrar la sesión. Intenta de nuevo.");
      }
    } finally {
      setEnviando(false);
    }
  }

  if (cargandoSesion || cargandoSync) {
    return <EsqueletoCierre />;
  }

  if (sesion && sesion.estado !== "abierta") {
    return (
      <section className="p-6">
        <p className="text-base text-tinta">Esta sesión ya está cerrada.</p>
      </section>
    );
  }

  const totalUnidades = totalUnidadesSesion(lineas);
  const totalMonetario = totalMonetarioSesion(lineas);

  return (
    <section className="p-6">
      <header className="pb-4">
        <h1 className="text-base font-semibold text-tinta">
          Cerrar conteo · {sesion?.sucursalNombre ?? "—"}
        </h1>
      </header>

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-placa border border-riesgo bg-riesgo-placa px-3 py-2 text-micro text-tinta"
        >
          {error}
        </p>
      )}

      {sincronizacion.degradado && (
        <p
          role="alert"
          className="mb-4 rounded-placa border border-riesgo bg-riesgo-placa px-3 py-2 text-micro text-tinta"
        >
          No se pudo leer el estado de sincronización. El cierre queda bloqueado por seguridad.
        </p>
      )}

      <div className="mb-4 rounded-placa border border-borde bg-placa p-4">
        <h2 className="mb-3 text-micro tracking-[0.18em] text-tenue uppercase">
          Estado de sincronización
        </h2>
        <ul aria-label="Estado de sincronización" className="flex flex-col gap-2">
          {participantes.map((p) => (
            <li key={p.uid} className="list-none">
              <Placa confirmado={p.sincronizado} className="flex items-center justify-between">
                <span className="text-base text-tinta">{p.nombre}</span>
                <span
                  className={clsx(
                    "inline-flex items-center gap-1.5 text-micro",
                    p.sincronizado ? "text-senal" : "text-riesgo",
                  )}
                >
                  {p.sincronizado ? (
                    <>
                      <Icono nombre="visto" className="size-3.5 shrink-0" />
                      Sincronizado
                    </>
                  ) : (
                    "Sin confirmar"
                  )}
                </span>
              </Placa>
            </li>
          ))}
        </ul>
      </div>

      <div className="mb-4 rounded-placa border border-borde bg-placa p-4">
        <p className="text-base text-tinta">
          Total: {numero(totalUnidades)} unidades · {moneda(totalMonetario)}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <div>
          <button
            type="button"
            onClick={() => void cerrar(false)}
            disabled={!todosSincronizados || enviando}
            title={!todosSincronizados ? `Falta confirmar: ${nombresPendientes}` : undefined}
            aria-describedby={!todosSincronizados ? idRazonBloqueo : undefined}
            className={clsx(
              "min-h-[var(--size-toque)] rounded-placa px-4 text-micro font-semibold transition-colors duration-150 ease-out",
              !todosSincronizados || enviando
                ? "cursor-not-allowed bg-senal/40 text-fondo/70"
                : "bg-senal text-fondo hover:bg-senal/85",
            )}
          >
            Cerrar conteo
          </button>
          {!todosSincronizados && (
            <p id={idRazonBloqueo} className="mt-1.5 text-micro text-tenue">
              Falta confirmar: {nombresPendientes}
            </p>
          )}
        </div>

        <details className="rounded-placa border border-borde">
          <summary className="cursor-pointer px-3 py-2.5 text-micro text-tenue hover:text-tinta">
            Forzar cierre de todos modos
          </summary>
          <div className="flex flex-col gap-3 border-t border-borde p-3">
            <p className="text-micro text-riesgo">
              {pendientes.length > 0
                ? `Los conteos sin sincronizar de ${nombresPendientes} se perderán al forzar el cierre. Esta acción no se puede deshacer.`
                : "Forzar el cierre salta la verificación de sincronización del servidor."}
            </p>
            <button
              type="button"
              onClick={() => void cerrar(true)}
              disabled={enviando}
              className="self-start rounded-placa border border-riesgo px-3 py-2 text-micro font-semibold text-riesgo transition-colors duration-150 ease-out hover:bg-riesgo-placa disabled:cursor-not-allowed disabled:opacity-40"
            >
              Forzar cierre
            </button>
          </div>
        </details>
      </div>
    </section>
  );
}

function EsqueletoCierre() {
  return (
    <section className="p-6" aria-hidden="true">
      <div className="mb-4 h-4 w-64 animate-pulse rounded-placa bg-placa-alta" />
      <div className="mb-4 rounded-placa border border-borde bg-placa p-4">
        <div className="mb-3 h-3 w-40 animate-pulse rounded-placa bg-placa-alta" />
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }, (_, i) => (
            <div
              key={i}
              data-testid="fila-esqueleto"
              className="h-11 animate-pulse rounded-placa bg-placa-alta"
            />
          ))}
        </div>
      </div>
      <div className="h-10 w-56 animate-pulse rounded-placa bg-placa-alta" />
    </section>
  );
}
