// apps/web/src/ui/admin/AnalisisScreen.tsx (docs/plan-panel-administrador.md
// §5, fase F5; rediseño rama rediseno-analisis-sesion, docs/diseno/10-analisis-y-dashboards.md
// §3) — dashboard de análisis de UNA sesión: cabecera, resumen y una tabla
// con selector de dimensión, en ese orden exacto. Antes eran 9 bloques que
// repetían la misma agregación por categoría tres veces (barras, dona, tabla
// de detalle) más "Unidades por área" (barras duplicadas) y "Evolución
// mensual" aparte — las tres primeras eran la misma pregunta ("cuánto hay de
// cada X") respondida tres veces con tres gráficas distintas, así que se
// reduce a una sola tabla ordenable con un <select> de dimensión
// (categoría/cajero/área). ADR-20 ya había quitado el panel de Comparativo de
// aquí: rankea ejecución de toda la red, no responde nada sobre ESTA sesión,
// y es uno de los 7 destinos del nav.
//
// El dinero se calcula EN CLIENTE con `totalMonetarioSesion`/`subtotal`
// (docs/plan-panel-administrador.md §4): nunca se lee `resumen/actual`, que
// un cron refresca y puede quedar `dirty` indefinidamente.
import { useEffect, useId, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import type { Area } from "@conteo/shared/models/area.js";
import type { Historico } from "@conteo/shared/models/historico.js";
import type { LineaConteo } from "@conteo/shared/models/linea-conteo.js";
import type { SesionConteo } from "@conteo/shared/models/sesion-conteo.js";
import type { Usuario } from "@conteo/shared/models/usuario.js";
import { totalMonetarioSesion, totalUnidadesSesion } from "@conteo/shared/services/calculadora.js";
import {
  agruparPorDimension,
  distribuirRedondeo,
  variacion,
  type DimensionAnalisis,
  type FilaDimension,
} from "@conteo/shared/services/calculadora-analisis.js";
import type { EstadoSincronizacion } from "@conteo/data";
import { fecha, moneda, numero, porcentaje } from "../../lib/formato.js";
import { useAdminRepository } from "../../state/admin-contexto.js";
import { useConexion } from "../../state/useConexion.js";
import { ChipEstado } from "../primitivos/ChipEstado.js";
import { Numeral } from "../primitivos/Numeral.js";
import { Placa } from "../primitivos/Placa.js";
import { EvolucionMensual } from "./EvolucionMensual.js";
import { Tabla, type ColumnaTabla, type Orden } from "./Tabla.js";

const SINCRONIZACION_VACIA: EstadoSincronizacion = { participantes: [] };

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

/** Nombres por uid para la dimensión "cajero" de la tabla — un uid en
 *  `aplicados` sin `Usuario` sembrado cae al propio uid dentro de
 *  `agruparPorDimension`, nunca aquí. */
function useUsuarios(): ReadonlyMap<string, string> {
  const repo = useAdminRepository();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  useEffect(() => repo.observarUsuarios(setUsuarios), [repo]);
  return useMemo(() => new Map(usuarios.map((u) => [u.uid, u.nombre])), [usuarios]);
}

/** Nombres por areaId para la dimensión "area" de la tabla. */
function useAreas(): ReadonlyMap<string, string> {
  const repo = useAdminRepository();
  const [areas, setAreas] = useState<Area[]>([]);
  useEffect(() => repo.observarAreas(setAreas), [repo]);
  return useMemo(() => new Map(areas.map((a) => [a.areaId, a.nombre])), [areas]);
}

/** Serie para "Valor contado por cierre" (doc 10 §5-6): consulta puntual, no
 *  un listener — mismo criterio que `useHayReconciliacion`. `sucursalId`
 *  vacío (sesión aún sin cargar) se omite en vez de pedirle al repo un id
 *  vacío. */
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

/** Las tres formas de desglosar la sesión en la tabla — constante de módulo
 *  para que añadir una dimensión más (turno) sea una entrada más, sin tocar
 *  la estructura de la pantalla. */
const DIMENSIONES: readonly { readonly valor: DimensionAnalisis; readonly etiqueta: string }[] = [
  { valor: "categoria", etiqueta: "Categoría" },
  { valor: "cajero", etiqueta: "Cajero" },
  { valor: "area", etiqueta: "Área" },
];

function etiquetaDimension(dimension: DimensionAnalisis): string {
  return DIMENSIONES.find((d) => d.valor === dimension)!.etiqueta;
}

interface FilaConPct extends FilaDimension {
  readonly pct: number;
}

/** Orden inicial de la tabla — identidad de módulo estable a propósito: si se
 *  recreara cada render, el `ordenInicial` de `Tabla` cambiaría de
 *  referencia en cada paso y con ello el estado "en reposo" del ciclo de
 *  encabezado. */
const ORDEN_INICIAL_TABLA: Orden = { clave: "valor", direccion: "desc" };

/** Columnas de la tabla — una sola definición que comparten el esqueleto (con
 *  `filas=[]`) y la tabla real. La `clave` de la primera columna es
 *  `"etiqueta"` en las TRES dimensiones, sólo cambia su rótulo: eso permite
 *  que el orden elegido por el usuario sobreviva al cambio de dimensión sin
 *  apuntar a una columna inexistente. */
function columnasTabla(dimension: DimensionAnalisis): ColumnaTabla<FilaConPct>[] {
  return [
    {
      clave: "etiqueta",
      etiqueta: etiquetaDimension(dimension),
      render: (f) => f.etiqueta,
      // "categoria": `etiqueta` ES el precio (ej. "$10.000") — ordenarlo como
      // string pondría "$10.000" antes que "$2.000". "area"/"cajero": `etiqueta`
      // es un nombre, ahí el orden alfabético sigue siendo el correcto.
      valorOrden: dimension === "categoria" ? (f) => f.precioUnitario ?? 0 : (f) => f.etiqueta,
    },
    {
      clave: "unidades",
      etiqueta: "Unidades",
      render: (f) => numero(f.unidades),
      valorOrden: (f) => f.unidades,
      alinearDerecha: true,
    },
    {
      clave: "valor",
      etiqueta: "Valor",
      render: (f) => moneda(f.valor),
      valorOrden: (f) => f.valor,
      alinearDerecha: true,
    },
    {
      clave: "pct",
      etiqueta: "%",
      render: (f) => porcentaje(f.pct),
      valorOrden: (f) => f.pct,
      alinearDerecha: true,
    },
  ];
}

/** Delta de una métrica frente a la sesión anterior. `valor` es el delta YA
 *  calculado (puede ser `null` sin sesión anterior o sin base para el
 *  cociente); `activo` es sólo el estado del chip «vs. sesión anterior». La
 *  fuente de verdad de si se pinta algo es `valor !== null`, NUNCA el chip:
 *  el chip decide visibilidad, no si el dato existe. Nunca colorea — no hay
 *  verde en el sistema y el rojo está reservado a riesgo real de pérdida de
 *  datos — la dirección la lleva el signo (+ / −, U+2212), no el matiz, así
 *  también llega a quien no distingue color. */
function Delta({ valor, activo }: { readonly valor: number | null; readonly activo: boolean }) {
  if (!activo || valor === null) return null;
  // Sin signo cuando no hubo cambio: "+0,0 %" se lee como crecimiento y aquí
  // no creció nada. El signo informa dirección, y cero no tiene dirección.
  const signo = valor > 0 ? "+" : valor < 0 ? "−" : "";
  return (
    <span className="text-micro text-tenue">
      {signo}
      {porcentaje(Math.abs(valor))}
    </span>
  );
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
  const nombresPorUid = useUsuarios();
  const nombresPorArea = useAreas();

  const [dimension, setDimension] = useState<DimensionAnalisis>("categoria");
  const [compararActivo, setCompararActivo] = useState(true);
  const idDimension = useId();

  const cargando = cargandoSesion || cargandoSync;

  // `columnas` en su propio useMemo sobre `dimension`: si se recreara cada
  // render, rompería el useMemo de `filasOrdenadas` dentro de `Tabla` (su
  // dependencia incluye `columnas` por referencia).
  const columnas = useMemo(() => columnasTabla(dimension), [dimension]);

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
  const valorPorUnidad = totalUnidades === 0 ? 0 : totalMonetario / totalUnidades;

  // `historicos[0]` NO es siempre la anterior: si ESTA sesión ya está
  // cerrada, su propio histórico encabeza la lista. Se descarta por
  // sesionId, no por índice, así el mismo código sirve para sesión abierta y
  // cerrada.
  const anterior = historicos.find((h) => h.sesionId !== sesionId) ?? null;

  const deltaValor = anterior ? variacion(totalMonetario, anterior.totalMonetario) : null;
  const deltaUnidades = anterior ? variacion(totalUnidades, anterior.totalUnidades) : null;
  const valorPorUnidadAnterior =
    anterior && anterior.totalUnidades !== 0
      ? anterior.totalMonetario / anterior.totalUnidades
      : null;
  const deltaValorPorUnidad =
    valorPorUnidadAnterior !== null ? variacion(valorPorUnidad, valorPorUnidadAnterior) : null;

  const sinConfirmar = sincronizacion.participantes.filter((p) => !p.sincronizado);
  const todosSincronizados =
    sincronizacion.participantes.length > 0 &&
    sincronizacion.participantes.every((p) => p.sincronizado);
  const estadoChip: "sincronizado" | "pendiente" | "sin-conexion" = !enLinea
    ? "sin-conexion"
    : todosSincronizados
      ? "sincronizado"
      : "pendiente";

  // % salen de `distribuirRedondeo` sobre el `valor` de TODAS las filas —
  // nunca se suman los floats resultantes contra 100, el invariante vive en
  // las décimas enteras (ver doc-comment de la función).
  const nombres =
    dimension === "cajero" ? nombresPorUid : dimension === "area" ? nombresPorArea : undefined;
  const base = agruparPorDimension(lineas, dimension, nombres);
  const pcts = distribuirRedondeo(base.map((f) => f.valor));
  const filas: FilaConPct[] = base.map((f, i) => ({ ...f, pct: pcts[i]! }));
  const filaTotal: FilaConPct = {
    clave: "__total",
    etiqueta: "Total",
    unidades: totalUnidades,
    valor: totalMonetario,
    // Literal, NUNCA la suma de `pcts`: el invariante de `distribuirRedondeo`
    // vive en décimas enteras, y sumar los floats que devuelve puede dar
    // 99.99999999999999 en vez de 100 (ver su propio doc-comment).
    pct: 100,
  };

  return (
    <section className="p-6">
      <header data-seccion="cabecera" className="pb-6">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-base font-semibold text-tinta">Análisis · {sesion.sucursalNombre}</h1>
          <ChipEstado estado={estadoChip} />
        </div>
        <p role="status" className="mt-1 text-micro text-tenue">
          {sesion.estado === "abierta" ? "Sesión abierta" : "Sesión cerrada"}
          {!enLinea && " · Mostrando datos guardados"}
          {ultimaAct ? ` · ${fecha(ultimaAct)}` : " · Sin actividad todavía"}
        </p>

        {sincronizacion.degradado && (
          <p
            role="alert"
            className="mt-3 rounded-placa border border-riesgo bg-riesgo-placa px-3 py-2 text-micro text-tinta"
          >
            No se pudo leer el estado de sincronización. El cierre queda bloqueado por seguridad.
          </p>
        )}

        {sinConfirmar.length > 0 && (
          <div className="mt-3">
            <h2 className="mb-2 text-micro tracking-[0.18em] text-tenue uppercase">
              Cajeros sin confirmar
            </h2>
            <ul className="flex flex-col gap-2">
              {sinConfirmar.map((p) => (
                <li key={p.uid} className="list-none">
                  <Placa confirmado={false} className="flex items-center justify-between">
                    <span className="text-base text-tinta">{p.nombre}</span>
                    <span className="text-micro text-riesgo">Sin confirmar</span>
                  </Placa>
                </li>
              ))}
            </ul>
          </div>
        )}

        {hayReconciliacion && (
          // `role="status"` propio, HERMANO del párrafo de estado de arriba,
          // no anidado en él — no compiten por la misma región. Este aviso
          // llega ASÍNCRONO (`useHayReconciliacion` resuelve después del
          // render inicial): sin su propio "polite", un lector de pantalla
          // nunca se entera de que apareció. Dos regiones "polite" hermanas
          // en la misma cabecera es el diseño correcto, no una duplicación.
          <p
            role="status"
            className="mt-3 rounded-placa border border-borde bg-placa px-3 py-2 text-micro text-tenue"
          >
            Algunos totales de esta sesión se corrigieron automáticamente.
          </p>
        )}
      </header>

      <div data-seccion="resumen" className="mb-6 flex flex-col gap-3">
        <button
          type="button"
          aria-pressed={compararActivo}
          disabled={!anterior}
          onClick={() => setCompararActivo((activo) => !activo)}
          className="min-h-11 w-fit rounded-placa border border-borde px-3 text-micro text-tinta aria-pressed:border-senal aria-pressed:text-senal disabled:cursor-not-allowed disabled:opacity-40"
        >
          {anterior ? "vs. sesión anterior" : "Sin sesión anterior"}
        </button>

        <div className="rounded-placa border border-borde bg-placa p-4">
          <p className="mb-1 text-micro text-tenue">Valor contado</p>
          <div className="flex flex-wrap items-baseline gap-2">
            <Numeral>{moneda(totalMonetario)}</Numeral>
            <Delta valor={deltaValor} activo={compararActivo} />
          </div>
          <EvolucionMensual historicos={historicos} etiqueta="Valor contado por cierre" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-placa border border-borde bg-placa p-4">
            <p className="mb-1 text-micro text-tenue">Valor por unidad</p>
            <div className="flex flex-wrap items-baseline gap-2">
              <Numeral tamano="medio">{moneda(valorPorUnidad)}</Numeral>
              <Delta valor={deltaValorPorUnidad} activo={compararActivo} />
            </div>
          </div>
          <div className="rounded-placa border border-borde bg-placa p-4">
            <p className="mb-1 text-micro text-tenue">Unidades</p>
            <div className="flex flex-wrap items-baseline gap-2">
              <Numeral tamano="medio">{numero(totalUnidades)}</Numeral>
              <Delta valor={deltaUnidades} activo={compararActivo} />
            </div>
            <p className="mt-1 text-micro text-tenue">
              {contadas} / {lineas.length} categorías contadas
            </p>
          </div>
        </div>
      </div>

      <div data-seccion="tabla">
        <div className="mb-3 flex items-center gap-2">
          <label htmlFor={idDimension} className="text-micro text-tenue">
            Desglose por
          </label>
          <select
            id={idDimension}
            value={dimension}
            onChange={(e) => setDimension(e.target.value as DimensionAnalisis)}
            className="min-h-[var(--size-toque)] rounded-placa border border-borde bg-fondo px-3 text-tinta focus:border-senal focus:outline-none"
          >
            {DIMENSIONES.map((d) => (
              <option key={d.valor} value={d.valor}>
                {d.etiqueta}
              </option>
            ))}
          </select>
        </div>
        {/* Sin `key={dimension}`: remontar la tabla al cambiar de dimensión
            perdería el orden elegido por el usuario (issue implícito del
            rediseño) y además invocaría de nuevo el listener de `Tabla` — no
            hay ninguno, pero el patrón general es "conservar identidad =
            conservar estado", y aquí es además la prueba visual de que
            cambiar de dimensión no recarga nada. */}
        {/* `vacio` es neutro respecto a la dimensión: "no hay categorías"
            sería falso mirando el desglose por cajero o por área, y la tabla
            queda vacía por la misma razón en las tres — nadie contó nada. */}
        <Tabla
          columnas={columnas}
          filas={filas}
          claveFila={(f) => f.clave}
          etiqueta={`Desglose por ${etiquetaDimension(dimension).toLowerCase()}`}
          vacio="Todavía no hay unidades contadas."
          ordenInicial={ORDEN_INICIAL_TABLA}
          filaTotal={filaTotal}
        />
      </div>
    </section>
  );
}

function EsqueletoAnalisis({ columnas }: { readonly columnas: ColumnaTabla<FilaConPct>[] }) {
  return (
    <section className="p-6" aria-hidden="true">
      <div data-seccion="cabecera" className="mb-6">
        <div className="mb-2 flex items-center gap-3">
          <div className="h-4 w-48 animate-pulse rounded-placa bg-placa-alta" />
          <div className="h-5 w-28 animate-pulse rounded-placa bg-placa-alta" />
        </div>
        <div className="h-3 w-40 animate-pulse rounded-placa bg-placa-alta" />
      </div>
      <div data-seccion="resumen" className="mb-6 flex flex-col gap-3">
        <div className="h-11 w-40 animate-pulse rounded-placa bg-placa-alta" />
        <div className="h-32 animate-pulse rounded-placa bg-placa-alta" />
        <div className="grid grid-cols-2 gap-3">
          <div className="h-20 animate-pulse rounded-placa bg-placa-alta" />
          <div className="h-20 animate-pulse rounded-placa bg-placa-alta" />
        </div>
      </div>
      <div data-seccion="tabla">
        <Tabla
          columnas={columnas}
          filas={[]}
          cargando
          etiqueta="Desglose"
          claveFila={(f) => f.clave}
        />
      </div>
    </section>
  );
}
