// apps/web/src/ui/admin/ComparativoScreen.tsx
// (docs/diseno/10-analisis-y-dashboards.md §6, ADR-20) — comparativo entre
// sucursales sobre HISTÓRICOS, nunca sobre sesiones abiertas: el histórico es
// el snapshot congelado que `cerrarSesionImpl` escribe una única vez
// (packages/shared/src/models/historico.ts) y ya no se mueve mientras el
// admin mira la pantalla — a diferencia de una sesión abierta, que un cajero
// puede seguir escribiendo en ese mismo instante.
//
// El punto editorial es la EJECUCIÓN del conteo, no el tamaño de la sucursal
// (ADR-20): rankear por dinero o por participación porcentual premia siempre
// a la sucursal más grande y no señala ninguna acción posible. Aquí lo
// primero que se ve es la sucursal que lleva más tiempo sin cerrar un
// conteo, juzgada contra SU PROPIA cadencia histórica
// (`medianaIntervaloDias`/`estaAtrasada`, calculadora-analisis.ts).
//
// Dos fuentes de lectura, sin índices ni reglas nuevas:
// 1. `repo.historicosRecientesPorSucursal(sucursalId, 12)` — fan-out N+1
//    deliberado, una consulta por sucursal (packages/data/src/repositories/
//    admin-repository.ts): no existe regla `match /{path=**}/historicos/{id}`
//    ni un solo índice COLLECTION_GROUP, así que `collectionGroup("historicos")`
//    caería en la denegación por defecto de `infra/firestore.rules` — y sólo
//    en producción, nunca en el emulador. No "optimizar" esto a un
//    collectionGroup.
// 2. `repo.listarSesiones({ estado: "cerrada" })` — UNA consulta, para cruzar
//    `abiertaEn` → `cerradaEn` (dato que `Historico` no guarda) y calcular la
//    Duración. Con 4-8 sucursales la primera página cubre sus últimos
//    cierres; si el cierre de una sucursal no viene en esa página, su
//    Duración muestra "—" — no se pagina para buscarla, el dato es
//    secundario y la sucursal ya sale marcada por antigüedad.
import { useEffect, useState } from "react";
import type { Historico } from "@conteo/shared/models/historico.js";
import type { Sucursal } from "@conteo/shared/models/sucursal.js";
import {
  diasEntre,
  estaAtrasada,
  medianaIntervaloDias,
} from "@conteo/shared/services/calculadora-analisis.js";
import { duracion, fecha, moneda, numero, porcentaje } from "../../lib/formato.js";
import { useAdminRepository } from "../../state/admin-contexto.js";
import { useDisenoAdaptativo } from "../../state/useDisenoAdaptativo.js";
import { Sparkline } from "./Sparkline.js";
import { Tabla, type ColumnaTabla } from "./Tabla.js";

interface FilaComparativo {
  readonly sucursal: Sucursal;
  /** Orden `cerradaEn` DESC, tal como la devuelve el repositorio. `[]` =
   *  la sucursal nunca cerró un conteo. */
  readonly historicos: readonly Historico[];
  /** `null` = sin histórico: no hay "días sin contar" que calcular todavía. */
  readonly diasSinContar: number | null;
  readonly atrasada: boolean;
  /** `null` = la sesión del último histórico no vino en la página de
   *  `listarSesiones` (o la sucursal no tiene histórico). */
  readonly duracionMs: number | null;
}

function useSucursales(): Sucursal[] {
  const repo = useAdminRepository();
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  useEffect(() => repo.observarSucursales(setSucursales), [repo]);
  return sucursales;
}

interface DatosSucursal {
  readonly historicos: readonly Historico[];
  readonly duracionMs: number | null;
}

function useDatosComparativo(sucursalIds: readonly string[]): {
  datos: Map<string, DatosSucursal>;
  cargando: boolean;
  error: string | null;
} {
  const repo = useAdminRepository();
  const [datos, setDatos] = useState<Map<string, DatosSucursal>>(new Map());
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const clave = sucursalIds.join(",");

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError(null);
    // ponytail: al montar, `observarSucursales` todavía no emitió y
    // `sucursalIds` está vacío, así que `listarSesiones` se pide una vez en
    // vacío y otra cuando llegan las sucursales — una consulta duplicada por
    // montaje. Cortarla con un `if (sucursalIds.length === 0) return` obliga a
    // decidir `cargando` sin saber si la lista está vacía o sólo no ha
    // llegado: o parpadea "No hay sucursales para comparar" antes del
    // esqueleto, o el esqueleto se queda fijo cuando de verdad no hay
    // ninguna. Una consulta paginada de más al abrir la pantalla es más
    // barato que cualquiera de las dos. Revisar si la pantalla pasa a
    // recargarse sola o el catálogo de sucursales se vuelve grande.
    Promise.all([
      Promise.all(sucursalIds.map((id) => repo.historicosRecientesPorSucursal(id, 12))),
      repo.listarSesiones({ estado: "cerrada" }),
    ])
      .then(([series, paginaSesiones]) => {
        if (cancelado) return;
        const sesionesPorId = new Map(paginaSesiones.items.map((s) => [s.sesionId, s]));
        const mapa = new Map<string, DatosSucursal>();
        sucursalIds.forEach((id, indice) => {
          const historicos = series[indice]!;
          const ultimo = historicos[0];
          const sesion = ultimo ? sesionesPorId.get(ultimo.sesionId) : undefined;
          const duracionMs =
            sesion?.cerradaEn != null
              ? sesion.cerradaEn.getTime() - sesion.abiertaEn.getTime()
              : null;
          mapa.set(id, { historicos, duracionMs });
        });
        setDatos(mapa);
        setCargando(false);
      })
      .catch(() => {
        // Sin esto el rechazo (regla que deniega, sin red) deja `cargando`
        // en `true` para siempre: el esqueleto se queda pintado.
        if (cancelado) return;
        setCargando(false);
        setError("No se pudo cargar el comparativo. Intenta de nuevo.");
      });
    return () => {
      cancelado = true;
    };
    // sucursalIds se lee por closure; `clave` decide cuándo se vuelve a pedir.
  }, [repo, clave]);

  return { datos, cargando, error };
}

/**
 * Arma las filas y las ORDENA por defecto: días sin contar descendente, con
 * las sucursales SIN cierres PRIMERO.
 *
 * Esto invierte a propósito el comportamiento anterior de esta pantalla:
 * bajo el ranking por dinero, una sucursal sin histórico no tenía
 * porcentaje y se mandaba al final. Bajo control de ejecución (ADR-20),
 * "nunca cerró un conteo" es la excepción MÁS fuerte que puede mostrar la
 * pantalla — se trata como "más atrasada que cualquier valor real" y sube al
 * principio, no se esconde al fondo.
 */
function construirFilas(
  sucursales: readonly Sucursal[],
  datos: Map<string, DatosSucursal>,
  ahora: Date,
): FilaComparativo[] {
  const filas = sucursales.map((sucursal): FilaComparativo => {
    const datoSucursal = datos.get(sucursal.sucursalId);
    const historicos = datoSucursal?.historicos ?? [];
    const ultimo = historicos[0];
    const diasSinContar = ultimo ? diasEntre(ultimo.cerradaEn, ahora) : null;
    const mediana = medianaIntervaloDias(historicos.map((h) => h.cerradaEn));
    return {
      sucursal,
      historicos,
      diasSinContar,
      atrasada: diasSinContar !== null && estaAtrasada(diasSinContar, mediana),
      duracionMs: datoSucursal?.duracionMs ?? null,
    };
  });

  return [...filas].sort((a, b) => {
    if (a.diasSinContar === null) return b.diasSinContar === null ? 0 : -1;
    if (b.diasSinContar === null) return 1;
    return b.diasSinContar - a.diasSinContar;
  });
}

function CeldaDiasSinContar({ fila }: { readonly fila: FilaComparativo }) {
  if (fila.diasSinContar === null) {
    return <span className="text-tenue">Sin conteos cerrados</span>;
  }
  return (
    <span className={fila.atrasada ? "text-riesgo" : "text-tinta"}>
      {numero(fila.diasSinContar)}
      {/* Nunca sólo color: un lector de pantalla no distingue `text-riesgo`
       *  de `text-tinta`, así que la marca también va en texto. */}
      {fila.atrasada && " · atrasada"}
    </span>
  );
}

/** El equivalente accesible de `<Sparkline>` es responsabilidad de quien lo
 *  monta (su doc-comment): el SVG es `aria-hidden`, así que la variación
 *  respecto al cierre anterior va al lado, como texto plano. */
function CeldaTendencia({ historicos }: { readonly historicos: readonly Historico[] }) {
  if (historicos.length < 2) {
    return <span className="text-tenue">—</span>;
  }
  // Sparkline pide orden cronológico (izquierda→derecha); el repositorio
  // entrega DESC, así que se invierte.
  const valores = [...historicos].reverse().map((h) => h.totalMonetario);
  const actual = historicos[0]!.totalMonetario;
  const anterior = historicos[1]!.totalMonetario;
  const variacionTexto = anterior === 0 ? "—" : formatearVariacion(actual, anterior);
  return (
    <div className="flex items-center gap-2">
      {/* 12 puntos posibles en celda: el radio por defecto (2) los deja casi
       *  tocándose, radioPunto={1} los separa. */}
      <Sparkline valores={valores} radioPunto={1} />
      <span className="text-tenue">{variacionTexto}</span>
    </div>
  );
}

function formatearVariacion(actual: number, anterior: number): string {
  const cambio = ((actual - anterior) / anterior) * 100;
  const signo = cambio > 0 ? "+" : "";
  return `${signo}${porcentaje(cambio)}`;
}

export function ComparativoScreen() {
  const diseno = useDisenoAdaptativo();
  const sucursales = useSucursales();
  const sucursalIds = sucursales.map((s) => s.sucursalId);
  const { datos, cargando, error } = useDatosComparativo(sucursalIds);

  const filas = construirFilas(sucursales, datos, new Date());

  const columnas: ColumnaTabla<FilaComparativo>[] = [
    {
      clave: "sucursal",
      etiqueta: "Sucursal",
      render: (f) => f.sucursal.nombre,
      valorOrden: (f) => f.sucursal.nombre,
    },
    {
      clave: "diasSinContar",
      etiqueta: "Días sin contar",
      render: (f) => <CeldaDiasSinContar fila={f} />,
      // Sin cierres ordena como "infinito": coherente con que aparezca
      // primero bajo el orden descendente por defecto.
      valorOrden: (f) => f.diasSinContar ?? Number.POSITIVE_INFINITY,
    },
    {
      clave: "ultimoCierre",
      etiqueta: "Último cierre",
      render: (f) => (f.historicos[0] ? fecha(f.historicos[0].cerradaEn) : "—"),
      valorOrden: (f) => f.historicos[0]?.cerradaEn.getTime() ?? -1,
    },
    {
      clave: "duracion",
      etiqueta: "Duración",
      render: (f) => (f.duracionMs !== null ? duracion(f.duracionMs) : "—"),
      valorOrden: (f) => f.duracionMs ?? -1,
    },
    {
      clave: "unidades",
      etiqueta: "Unidades",
      render: (f) => (f.historicos[0] ? numero(f.historicos[0].totalUnidades) : "—"),
      valorOrden: (f) => f.historicos[0]?.totalUnidades ?? -1,
      alinearDerecha: true,
    },
    {
      clave: "tendencia",
      etiqueta: "Tendencia",
      render: (f) => <CeldaTendencia historicos={f.historicos} />,
      // Sin `valorOrden`: no ordenable — una forma de tendencia no tiene un
      // criterio de comparación con sentido entre sucursales.
    },
  ];

  // `Total $` es contexto, nunca criterio de orden por defecto (ADR-20):
  // sólo aparece en escritorio.
  if (diseno === "escritorio") {
    columnas.push({
      clave: "total",
      etiqueta: "Total $",
      render: (f) => (
        <span className="text-tenue">
          {f.historicos[0] ? moneda(f.historicos[0].totalMonetario) : "—"}
        </span>
      ),
      valorOrden: (f) => f.historicos[0]?.totalMonetario ?? -1,
      alinearDerecha: true,
    });
  }

  return (
    <section className="p-6">
      <header className="pb-4">
        <h1 className="text-micro tracking-[0.18em] text-tenue uppercase">Comparativo</h1>
      </header>

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-placa border border-riesgo bg-riesgo-placa px-3 py-2 text-micro text-tinta"
        >
          {error}
        </p>
      )}

      <Tabla
        columnas={columnas}
        filas={filas}
        claveFila={(f) => f.sucursal.sucursalId}
        etiqueta="Comparativo de sucursales"
        vacio="No hay sucursales para comparar."
        cargando={cargando}
      />
    </section>
  );
}
