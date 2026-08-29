// apps/web/src/ui/admin/AnalisisScreen.tsx (docs/plan-panel-administrador.md
// §5, fase F5) — dashboard de análisis de UNA sesión: cabecera, 3 KPI,
// sincronización, barras, dona, extremos, tabla ordenable y comparativo, en
// ese orden exacto (docs/diseno/10-analisis-y-dashboards.md:120-142). El
// bloque de sincronización va ARRIBA de las gráficas a propósito: es lo que
// el admin necesita antes de decidir si puede cerrar el conteo (mismo motivo
// que documenta CierreScreen.tsx, alcanzado desde el botón "Análisis →" que
// PanelScreen.tsx monta junto a "Cerrar →").
//
// El dinero se calcula EN CLIENTE con `totalMonetarioSesion`/`subtotal`
// (docs/plan-panel-administrador.md §4): nunca se lee `resumen/actual`, que
// un cron refresca y puede quedar `dirty` indefinidamente.
import { useEffect, useState } from "react";
import clsx from "clsx";
import { useParams } from "react-router-dom";
import type { Historico } from "@conteo/shared/models/historico.js";
import type { LineaConteo } from "@conteo/shared/models/linea-conteo.js";
import type { SesionConteo } from "@conteo/shared/models/sesion-conteo.js";
import {
  subtotal,
  totalMonetarioSesion,
  totalPorArea,
  totalUnidadesSesion,
} from "@conteo/shared/services/calculadora.js";
import {
  agruparConOtros,
  distribuirRedondeo,
  extremosPorSubtotal,
  type PorcionAnalisis,
} from "@conteo/shared/services/calculadora-analisis.js";
import type { EstadoSincronizacion } from "@conteo/data";
import { fecha, moneda, numero, porcentaje } from "../../lib/formato.js";
import { useAdminRepository } from "../../state/admin-contexto.js";
import { useConexion } from "../../state/useConexion.js";
import { Icono } from "../primitivos/Icono.js";
import { Numeral } from "../primitivos/Numeral.js";
import { Placa } from "../primitivos/Placa.js";
import { ComparativoScreen } from "./ComparativoScreen.js";
import { Dona } from "./Dona.js";
import { EvolucionMensual } from "./EvolucionMensual.js";
import { Tabla, type ColumnaTabla } from "./Tabla.js";

const SINCRONIZACION_VACIA: EstadoSincronizacion = { participantes: [] };
const MAX_BARRAS = 8; // regla de legibilidad, doc 10:172
const MAX_PORCIONES_DONA = 7; // top 6 + "Otros"

// Mismas 3 formas de hook que CierreScreen.tsx (sesión, sincronización,
// líneas en vivo) — se reusan tal cual, sin inventar variantes nuevas.
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

/** Serie para "Evolución mensual" (doc 10 §5-6): consulta puntual, no un
 *  listener — mismo criterio que `useHayReconciliacion`. `sucursalId` vacío
 *  (sesión aún sin cargar) se omite en vez de pedirle al repo un id vacío. */
function useHistoricosRecientes(sucursalId: string): readonly Historico[] {
  const repo = useAdminRepository();
  const [historicos, setHistoricos] = useState<readonly Historico[]>([]);
  useEffect(() => {
    if (!sucursalId) return;
    let cancelado = false;
    repo
      .historicosRecientesPorSucursal(sucursalId)
      .then((serie) => {
        if (!cancelado) setHistoricos(serie);
      })
      .catch(() => {
        // ponytail: mismo criterio que useHayReconciliacion — aviso
        // discreto y no bloqueante, la sección simplemente queda vacía.
      });
    return () => {
      cancelado = true;
    };
  }, [repo, sucursalId]);
  return historicos;
}

/** issue #20 item 3 (doc 10 §220-228, fila "Datos inconsistentes"): ¿el cron
 *  semanal `reconciliarLineas` (packages/functions/src/scheduled/reconciliar-lineas.ts)
 *  corrigió alguna línea de ESTA sesión? Ese cron no expone nada que el
 *  cliente pueda leer en vivo — sólo escribe un evento `RECONCILIACION` en
 *  `auditoria` dentro de la misma transacción que corrige la línea — así que
 *  ésa es la única señal honesta disponible aquí: una consulta puntual, no un
 *  listener, sobre la misma `listarAuditoria` que ya usa AuditoriaScreen.tsx. */
function useHayReconciliacion(sesionId: string): boolean {
  const repo = useAdminRepository();
  const [hay, setHay] = useState(false);
  useEffect(() => {
    let cancelado = false;
    setHay(false);
    repo
      .listarAuditoria({ campo: "sesionId", valor: sesionId })
      .then((pagina) => {
        if (!cancelado) setHay(pagina.items.some((e) => e.tipo === "RECONCILIACION"));
      })
      .catch(() => {
        // ponytail: aviso discreto y no bloqueante — si la consulta falla, se
        // omite en silencio en vez de sumar un segundo estado de error a una
        // pantalla cuyo fallo real (sesión/sincronización) ya tiene el suyo.
      });
    return () => {
      cancelado = true;
    };
  }, [repo, sesionId]);
  return hay;
}

/** Última escritura entre las líneas de la sesión. No hay `recalculadoEn`
 *  disponible sin leer `resumen/actual` (prohibido, ver cabecera del
 *  archivo), así que esta es la señal de frescura más honesta que el
 *  cliente puede mostrar sin violar esa regla. */
function ultimaActualizacion(lineas: readonly LineaConteo[]): Date | null {
  if (lineas.length === 0) return null;
  return lineas.reduce(
    (max, l) => (l.actualizadaEn > max ? l.actualizadaEn : max),
    lineas[0]!.actualizadaEn,
  );
}

function anchoPorcentual(valor: number, maximo: number): number {
  if (maximo <= 0) return 0;
  return (valor / maximo) * 100;
}

interface FilaDetalle {
  readonly linea: LineaConteo;
  readonly pctUnidades: number;
  readonly pctDinero: number;
}

/** Columnas de la tabla de detalle — una sola definición que comparten el
 *  esqueleto (con `filas=[]`) y la tabla real, en vez de duplicarla. */
function columnasDetalle(): ColumnaTabla<FilaDetalle>[] {
  return [
    {
      clave: "valor",
      etiqueta: "Valor",
      render: (f) => f.linea.etiqueta,
      valorOrden: (f) => f.linea.etiqueta,
    },
    {
      clave: "unidades",
      etiqueta: "Unidades",
      render: (f) => numero(f.linea.cantidadTotal),
      valorOrden: (f) => f.linea.cantidadTotal,
      alinearDerecha: true,
    },
    {
      clave: "subtotal",
      etiqueta: "Subtotal",
      render: (f) => moneda(subtotal(f.linea)),
      valorOrden: (f) => subtotal(f.linea),
      alinearDerecha: true,
    },
    {
      clave: "pctUnidades",
      etiqueta: "% Und",
      render: (f) => porcentaje(f.pctUnidades),
      valorOrden: (f) => f.pctUnidades,
      alinearDerecha: true,
    },
    {
      clave: "pctDinero",
      etiqueta: "% $",
      render: (f) => porcentaje(f.pctDinero),
      valorOrden: (f) => f.pctDinero,
      alinearDerecha: true,
    },
    {
      clave: "actualizada",
      etiqueta: "Últ. act.",
      render: (f) => fecha(f.linea.actualizadaEn),
      valorOrden: (f) => f.linea.actualizadaEn.getTime(),
    },
  ];
}

export function AnalisisScreen() {
  const { sesionId = "" } = useParams<{ sesionId: string }>();
  const { sesion, cargando: cargandoSesion } = useSesion(sesionId);
  const { estado: sincronizacion, cargando: cargandoSync } = useSincronizacion(sesionId);
  const lineas = useLineas(sesionId);
  // issue #20 item 3 (doc 10 §220-228): "sin conexión" y "datos
  // inconsistentes" — ninguno de los dos bloquea el esqueleto de carga de
  // arriba: son avisos que se suman sobre el dashboard ya cargado, no un
  // reemplazo de pantalla como "sesión no encontrada".
  const enLinea = useConexion();
  const hayReconciliacion = useHayReconciliacion(sesionId);
  const historicos = useHistoricosRecientes(sesion?.sucursalId ?? "");

  const cargando = cargandoSesion || cargandoSync;

  // % Und y % $ salen de `distribuirRedondeo` sobre TODAS las líneas, unidades
  // y dinero por separado — nunca se suman los floats resultantes contra 100,
  // el invariante vive en las décimas enteras (ver doc-comment de la función).
  const pctUnidades = distribuirRedondeo(lineas.map((l) => l.cantidadTotal));
  const pctDinero = distribuirRedondeo(lineas.map((l) => subtotal(l)));
  const filasDetalle: FilaDetalle[] = lineas.map((linea, i) => ({
    linea,
    pctUnidades: pctUnidades[i]!,
    pctDinero: pctDinero[i]!,
  }));
  const columnas = columnasDetalle();

  if (cargando) {
    return <EsqueletoAnalisis columnas={columnas} />;
  }

  if (!sesion) {
    return (
      <section className="p-6">
        <p className="text-base text-tinta">No se encontró la sesión.</p>
      </section>
    );
  }

  const totalUnidades = totalUnidadesSesion(lineas);
  const totalMonetario = totalMonetarioSesion(lineas);
  // Numerador = líneas con cantidadTotal > 0; denominador = lineas.length,
  // NUNCA observarCategorias(): abrirSesion siembra una línea por categoría
  // activa al abrir y la congela (I-7), así que el conteo de líneas de ESTA
  // sesión es la verdad para esta sesión — el catálogo de categorías de hoy
  // puede legítimamente haber cambiado desde entonces, y leerlo aquí
  // reportaría un denominador que ya no describe lo que se contó.
  const contadas = lineas.filter((l) => l.cantidadTotal > 0).length;
  const ultimaAct = ultimaActualizacion(lineas);

  const porcionesBarras = agruparConOtros(
    lineas.map((l) => ({ etiqueta: l.etiqueta, monto: l.cantidadTotal })),
    MAX_BARRAS,
  );
  const maxBarra = porcionesBarras.reduce((max, p) => Math.max(max, p.monto), 0);

  const porcionesDona: PorcionAnalisis[] = agruparConOtros(
    lineas.map((l) => ({ etiqueta: l.etiqueta, monto: subtotal(l) })),
    MAX_PORCIONES_DONA,
  );

  const extremos = extremosPorSubtotal(lineas);
  const porArea = totalPorArea(lineas);
  const maxArea = porArea.reduce((max, a) => Math.max(max, a.cantidad), 0);

  return (
    <section className="p-6">
      <header data-seccion="cabecera" className="pb-4">
        <h1 className="text-base font-semibold text-tinta">Análisis · {sesion.sucursalNombre}</h1>
        <p className="text-micro text-tenue">
          {sesion.estado === "abierta" ? "Sesión abierta" : "Sesión cerrada"}
          {ultimaAct ? ` · Actualizado: ${fecha(ultimaAct)}` : " · Sin actividad todavía"}
        </p>
      </header>

      {/* "Sin conexión" (doc 10 §226): datos en caché + timestamp. `enLinea`
          es `navigator.onLine` (useConexion.ts, ya usado en la PWA de
          cajero) — el propio dashboard ya renderizado abajo ES el dato en
          caché, así que este aviso no cambia qué se pinta, sólo lo rotula
          honesto. `ultimaAct` reusa el mismo timestamp de la cabecera (no
          hay "hace X min" en este repo — `fecha()` es el único formateador
          de fecha que existe, mismo criterio que la cabecera de arriba). */}
      {!enLinea && (
        <p
          role="status"
          className="mb-4 rounded-placa border border-borde bg-placa px-3 py-2 text-micro text-tenue"
        >
          Mostrando datos guardados
          {ultimaAct ? ` · ${fecha(ultimaAct)}` : ""}
        </p>
      )}

      {/* "Datos inconsistentes" (doc 10 §227): aviso discreto, nunca
          role="alert" — a diferencia del banner de sincronización degradada
          de más abajo, esto no bloquea ninguna acción del admin. */}
      {hayReconciliacion && (
        <p
          role="status"
          className="mb-4 rounded-placa border border-borde bg-placa px-3 py-2 text-micro text-tenue"
        >
          Algunos totales de esta sesión se corrigieron automáticamente.
        </p>
      )}

      <div data-seccion="kpis" className="mb-4 grid grid-cols-3 gap-3">
        <div className="rounded-placa border border-borde bg-placa p-4">
          <p className="mb-1 text-micro text-tenue">Total unidades</p>
          <Numeral>{numero(totalUnidades)}</Numeral>
        </div>
        <div className="rounded-placa border border-borde bg-placa p-4">
          <p className="mb-1 text-micro text-tenue">Valor total</p>
          <Numeral>{moneda(totalMonetario)}</Numeral>
        </div>
        <div className="rounded-placa border border-borde bg-placa p-4">
          <p className="mb-1 text-micro text-tenue">Categorías contadas</p>
          <Numeral>{`${contadas} / ${lineas.length}`}</Numeral>
        </div>
      </div>

      <div
        data-seccion="sincronizacion"
        className="mb-4 rounded-placa border border-borde bg-placa p-4"
      >
        <h2 className="mb-3 text-micro tracking-[0.18em] text-tenue uppercase">
          Estado de sincronización
        </h2>
        {sincronizacion.degradado && (
          <p
            role="alert"
            className="mb-3 rounded-placa border border-riesgo bg-riesgo-placa px-3 py-2 text-micro text-tinta"
          >
            No se pudo leer el estado de sincronización. El cierre queda bloqueado por seguridad.
          </p>
        )}
        <ul aria-label="Estado de sincronización" className="flex flex-col gap-2">
          {sincronizacion.participantes.map((p) => (
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

      <div data-seccion="barras" className="mb-4">
        <h2 className="mb-3 text-micro tracking-[0.18em] text-tenue uppercase">
          Unidades por categoría
        </h2>
        {/* Serie única y nominal (una barra = una categoría de valor): TODAS
            del mismo color (`bg-senal`). Una rampa por valor aquí doblaría la
            codificación — el largo de la barra ya dice la magnitud, sumarle
            un matiz distinto por barra le robaría el canal de identidad a
            algo que no lo necesita. Una serie no lleva caja de leyenda. */}
        {porcionesBarras.length === 0 ? (
          <p className="text-base text-tenue">Todavía no hay unidades contadas.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {/* La clave lleva el índice porque `etiqueta` NO es única: nada en
                `CategoriaValor` ni en `crearCategoria` lo impide, y dos
                categorías con la misma etiqueta darían claves repetidas
                (React reutilizaría el nodo equivocado y pintaría el ancho de
                una barra bajo la etiqueta de otra). Misma clave compuesta que
                usa `Dona.tsx` sobre estos mismos datos. */}
            {porcionesBarras.map((p, i) => (
              <li key={`${i}-${p.etiqueta}`} className="flex items-center gap-3">
                <span className="w-28 shrink-0 truncate text-micro text-tenue">{p.etiqueta}</span>
                <div
                  aria-hidden="true"
                  className="h-2 flex-1 overflow-hidden rounded-placa bg-placa-alta"
                >
                  <div
                    className="h-full rounded-placa bg-senal"
                    style={{ width: `${anchoPorcentual(p.monto, maxBarra)}%` }}
                  />
                </div>
                <span className="w-14 shrink-0 text-right text-tinta" data-testid="valor-barra">
                  {numero(p.monto)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div data-seccion="dona" className="mb-4">
        <h2 className="mb-3 text-micro tracking-[0.18em] text-tenue uppercase">
          Participación en dinero
        </h2>
        <Dona porciones={porcionesDona} etiqueta="Participación en dinero" />
      </div>

      <div data-seccion="extremos" className="mb-4">
        <h2 className="mb-3 text-micro tracking-[0.18em] text-tenue uppercase">Extremos</h2>
        {extremos ? (
          <div className="flex flex-col gap-1 text-base text-tinta">
            <p>
              Mayor: {extremos.mayor.etiqueta} · {moneda(subtotal(extremos.mayor))} (
              {numero(extremos.mayor.cantidadTotal)} u.)
            </p>
            <p>
              Menor: {extremos.menor.etiqueta} · {moneda(subtotal(extremos.menor))} (
              {numero(extremos.menor.cantidadTotal)} u.)
            </p>
          </div>
        ) : (
          <p className="text-base text-tenue">Todavía no hay categorías contadas.</p>
        )}
      </div>

      <div data-seccion="detalle" className="mb-4">
        <h2 className="mb-3 text-micro tracking-[0.18em] text-tenue uppercase">
          Detalle por categoría
        </h2>
        <Tabla
          columnas={columnas}
          filas={filasDetalle}
          claveFila={(f) => f.linea.categoriaId}
          etiqueta="Detalle por categoría"
          vacio="No hay categorías contadas."
        />
      </div>

      <div data-seccion="areas" className="mb-4">
        <h2 className="mb-3 text-micro tracking-[0.18em] text-tenue uppercase">
          Unidades por área
        </h2>
        {/* Mismo patrón de barras que la sección "barras" de más arriba
            (una <ul>, ancho porcentual aria-hidden + valor en texto), sobre
            totalPorArea — sin agregación propia (doc calculadora.ts:44). */}
        {porArea.length === 0 ? (
          <p className="text-base text-tenue">Todavía no hay unidades por área contadas.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {porArea.map(({ area, cantidad }) => (
              <li key={area} className="flex items-center gap-3">
                <span className="w-28 shrink-0 truncate text-micro text-tenue">{area}</span>
                <div
                  aria-hidden="true"
                  className="h-2 flex-1 overflow-hidden rounded-placa bg-placa-alta"
                >
                  <div
                    className="h-full rounded-placa bg-senal"
                    style={{ width: `${anchoPorcentual(cantidad, maxArea)}%` }}
                  />
                </div>
                <span className="w-14 shrink-0 text-right text-tinta">{numero(cantidad)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div data-seccion="evolucion" className="mb-4">
        <h2 className="mb-3 text-micro tracking-[0.18em] text-tenue uppercase">
          Evolución mensual
        </h2>
        <EvolucionMensual historicos={historicos} etiqueta="Evolución mensual" />
      </div>

      {/* Composición, no extracción: `ComparativoScreen` ya trae su propio
          fetch, el comentario del fan-out N+1, las barras y la tabla —
          montarlo tal cual reusa todo eso con una línea de diferencia y deja
          ComparativoScreen.test.tsx intacto. */}
      <div data-seccion="comparativo">
        <ComparativoScreen anidado />
      </div>
    </section>
  );
}

function EsqueletoAnalisis({ columnas }: { readonly columnas: ColumnaTabla<FilaDetalle>[] }) {
  return (
    <section className="p-6" aria-hidden="true">
      <div data-seccion="cabecera" className="mb-4">
        <div className="mb-2 h-4 w-64 animate-pulse rounded-placa bg-placa-alta" />
        <div className="h-3 w-40 animate-pulse rounded-placa bg-placa-alta" />
      </div>
      <div data-seccion="kpis" className="mb-4 grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-placa bg-placa-alta" />
        ))}
      </div>
      <div
        data-seccion="sincronizacion"
        className="mb-4 rounded-placa border border-borde bg-placa p-4"
      >
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
      <div data-seccion="barras" className="mb-4 h-32 animate-pulse rounded-placa bg-placa-alta" />
      <div data-seccion="dona" className="mb-4 h-40 animate-pulse rounded-placa bg-placa-alta" />
      <div data-seccion="extremos" className="mb-4 h-8 animate-pulse rounded-placa bg-placa-alta" />
      <div data-seccion="detalle" className="mb-4">
        <Tabla
          columnas={columnas}
          filas={[]}
          cargando
          etiqueta="Detalle por categoría"
          claveFila={(f) => f.linea.categoriaId}
        />
      </div>
      <div data-seccion="areas" className="mb-4 h-24 animate-pulse rounded-placa bg-placa-alta" />
      <div
        data-seccion="evolucion"
        className="mb-4 h-32 animate-pulse rounded-placa bg-placa-alta"
      />
      <div data-seccion="comparativo" className="h-32 animate-pulse rounded-placa bg-placa-alta" />
    </section>
  );
}
