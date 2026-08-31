// apps/web/src/ui/admin/PanelScreen.tsx — R0
// (docs/plan-panel-administrador.md §5, fase F1): tablero de sesiones
// abiertas por sucursal.
//
// El dinero se calcula EN CLIENTE con `totalMonetarioSesion(lineas)` (doc
// plan §4, "Dinero: calculado en cliente"): nunca se lee `resumen/actual`,
// que puede quedarse `dirty` hasta 60 s o indefinidamente. `lineas` sí es
// siempre en vivo — el admin es su primer consumidor en todo el repo.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { LineaConteo, SesionConteo } from "@conteo/shared";
import { totalMonetarioSesion, totalUnidadesSesion } from "@conteo/shared";
import { moneda, numero } from "../../lib/formato.js";
import { useAdminRepository } from "../../state/admin-contexto.js";
import { useDisenoAdaptativo } from "../../state/useDisenoAdaptativo.js";
import { Numeral } from "../primitivos/Numeral.js";
import { Placa } from "../primitivos/Placa.js";

function useSesionesAbiertas(): SesionConteo[] {
  const repo = useAdminRepository();
  const [sesiones, setSesiones] = useState<SesionConteo[]>([]);
  useEffect(() => repo.observarSesionesAbiertas(setSesiones), [repo]);
  return sesiones;
}

/** Una suscripción de líneas por sesión abierta, dada de alta/baja según la
 *  lista cambia — misma clave estable por CONTENIDO que SucursalesScreen.tsx
 *  usa para `sucursalIds`, para no resuscribir en cada render. */
function useLineasPorSesion(sesionIds: readonly string[]): Map<string, LineaConteo[]> {
  const repo = useAdminRepository();
  const [lineasPorSesion, setLineasPorSesion] = useState<Map<string, LineaConteo[]>>(new Map());
  const clave = sesionIds.join(",");
  useEffect(() => {
    const unsubs = sesionIds.map((sesionId) =>
      repo.observarLineasSesion(sesionId, (lineas) => {
        setLineasPorSesion((previo) => new Map(previo).set(sesionId, lineas));
      }),
    );
    return () => unsubs.forEach((unsub) => unsub());
    // sesionIds se lee por closure; `clave` decide cuándo resuscribirse.
  }, [repo, clave]);
  return lineasPorSesion;
}

export function PanelScreen() {
  const sesiones = useSesionesAbiertas();
  const sesionIds = sesiones.map((s) => s.sesionId);
  const lineasPorSesion = useLineasPorSesion(sesionIds);
  const navigate = useNavigate();
  const diseno = useDisenoAdaptativo();

  return (
    <section className="p-6">
      <header className="pb-4">
        <h1 className="text-micro tracking-[0.18em] text-tenue uppercase">Sesiones abiertas</h1>
      </header>

      {sesiones.length === 0 ? (
        <p className="text-base text-tenue">No hay sesiones de conteo abiertas.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {sesiones.map((sesion) => {
            // ponytail: "sin líneas todavía" y "sesión con cero categorías
            // activas" son indistinguibles desde el cliente — mismo hueco ya
            // aceptado en ConteoScreen.tsx (F4-B) para /conteo/:sesionId, con
            // la misma razón: no hay señal aparte que las separe.
            const lineas = lineasPorSesion.get(sesion.sesionId) ?? [];
            const cargando = lineas.length === 0;

            if (cargando) {
              return (
                <li
                  key={sesion.sesionId}
                  aria-hidden="true"
                  className="list-none"
                  data-testid="fila-esqueleto"
                >
                  <Placa className="flex items-center justify-between gap-4 py-3">
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <span className="h-[1.125rem] w-40 animate-pulse rounded-placa bg-placa-alta" />
                      <span className="h-3 w-24 animate-pulse rounded-placa bg-placa-alta" />
                    </div>
                    <span className="h-6 w-20 shrink-0 animate-pulse rounded-placa bg-placa-alta" />
                  </Placa>
                </li>
              );
            }

            // Mismo contenido, dos formas de DOM: en <600px los 6 hijos de
            // una sola fila (nombre+estado, 2 KPI, 3 botones) no caben sin
            // desbordarse — mismo criterio de useDisenoAdaptativo que ya usan
            // AdminLayout.tsx y Tabla.tsx para esta misma pantalla.
            if (diseno === "movil") {
              return (
                <li key={sesion.sesionId} className="list-none" data-testid="fila-movil">
                  <Placa className="flex flex-col gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-tinta">
                        {sesion.sucursalNombre}
                      </p>
                      <p className="text-micro text-tenue">Sesión abierta</p>
                    </div>

                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-micro text-tenue">Unidades</p>
                        <Numeral tamano="base" className="text-tinta">
                          {numero(totalUnidadesSesion(lineas))}
                        </Numeral>
                      </div>

                      <div className="text-right">
                        <p className="text-micro text-tenue">Total</p>
                        <Numeral tamano="base" className="font-semibold text-tinta">
                          {moneda(totalMonetarioSesion(lineas))}
                        </Numeral>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => navigate(`/admin/sesiones/${sesion.sesionId}/analisis`)}
                        aria-label={`Análisis — ${sesion.sucursalNombre}`}
                        className="flex-1 rounded-placa border border-borde px-3 py-2 text-micro font-semibold text-tinta transition-colors duration-150 ease-out hover:border-senal hover:text-senal"
                      >
                        Análisis →
                      </button>

                      <button
                        type="button"
                        onClick={() => navigate(`/conteo/${sesion.sesionId}/preparar`)}
                        aria-label={`Contar — ${sesion.sucursalNombre}`}
                        className="flex-1 rounded-placa border border-borde px-3 py-2 text-micro font-semibold text-tinta transition-colors duration-150 ease-out hover:border-senal hover:text-senal"
                      >
                        Contar →
                      </button>

                      <button
                        type="button"
                        onClick={() => navigate(`/admin/sesiones/${sesion.sesionId}/cerrar`)}
                        aria-label={`Cerrar sesión — ${sesion.sucursalNombre}`}
                        className="flex-1 rounded-placa border border-borde px-3 py-2 text-micro font-semibold text-tinta transition-colors duration-150 ease-out hover:border-senal hover:text-senal"
                      >
                        Cerrar →
                      </button>
                    </div>
                  </Placa>
                </li>
              );
            }

            return (
              <li key={sesion.sesionId} className="list-none">
                {/* Sin `confirmado`: la regla de tinta izquierda queda para
                    el bloque de sincronización de F4 (RF-16) — aquí no
                    diría nada. */}
                <Placa className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-semibold text-tinta">
                      {sesion.sucursalNombre}
                    </p>
                    <p className="text-micro text-tenue">Sesión abierta</p>
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="text-micro text-tenue">Unidades</p>
                    <Numeral tamano="base" className="text-tinta">
                      {numero(totalUnidadesSesion(lineas))}
                    </Numeral>
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="text-micro text-tenue">Total</p>
                    <Numeral tamano="base" className="font-semibold text-tinta">
                      {moneda(totalMonetarioSesion(lineas))}
                    </Numeral>
                  </div>

                  {/* Entrada al análisis (F5): navega, no calcula nada aquí. */}
                  <button
                    type="button"
                    onClick={() => navigate(`/admin/sesiones/${sesion.sesionId}/analisis`)}
                    aria-label={`Análisis — ${sesion.sucursalNombre}`}
                    className="shrink-0 rounded-placa border border-borde px-3 py-2 text-micro font-semibold text-tinta transition-colors duration-150 ease-out hover:border-senal hover:text-senal"
                  >
                    Análisis →
                  </button>

                  <button
                    type="button"
                    onClick={() => navigate(`/conteo/${sesion.sesionId}/preparar`)}
                    aria-label={`Contar — ${sesion.sucursalNombre}`}
                    className="shrink-0 rounded-placa border border-borde px-3 py-2 text-micro font-semibold text-tinta transition-colors duration-150 ease-out hover:border-senal hover:text-senal"
                  >
                    Contar →
                  </button>

                  {/* Entrada al cierre (F4): navega, no cierra desde aquí. */}
                  <button
                    type="button"
                    onClick={() => navigate(`/admin/sesiones/${sesion.sesionId}/cerrar`)}
                    aria-label={`Cerrar sesión — ${sesion.sucursalNombre}`}
                    className="shrink-0 rounded-placa border border-borde px-3 py-2 text-micro font-semibold text-tinta transition-colors duration-150 ease-out hover:border-senal hover:text-senal"
                  >
                    Cerrar →
                  </button>
                </Placa>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
