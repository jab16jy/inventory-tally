// apps/web/src/ui/admin/ComparativoScreen.tsx
// (docs/plan-panel-administrador.md §5, fase F4, R8) — comparativo entre
// sucursales sobre HISTÓRICOS, nunca sobre sesiones abiertas: el histórico es
// el snapshot congelado que `cerrarSesionImpl` escribe una única vez
// (packages/shared/src/models/historico.ts) y ya no se mueve mientras el
// admin mira la pantalla — a diferencia de una sesión abierta, que un cajero
// puede seguir escribiendo en ese mismo instante.
//
// `ultimoHistoricoPorSucursal` hace una consulta POR sucursal a propósito
// (packages/data/src/repositories/admin-repository.ts): no existe regla
// `match /{path=**}/historicos/{id}` ni un índice COLLECTION_GROUP, así que
// `collectionGroup("historicos")` caería en la denegación por defecto de
// `infra/firestore.rules` — y sólo en producción, nunca en el emulador. El
// fan-out N+1 es deliberado, no un descuido a corregir.
//
// El punto editorial es la PARTICIPACIÓN (% del total), no el peso absoluto
// (doc plan §5): la barra pinta la cuota; el dinero absoluto va como texto
// secundario en la columna Total. `distribuirRedondeo` reparte el sobrante
// por mayor resto para que las décimas mostradas sumen 1000 exacto — su
// doc-comment advierte que sumar los floats que devuelve con `reduce` puede
// dar 99.99999999999999, así que esa suma nunca se hace acá.
import { useEffect, useState } from "react";
import type { Historico } from "@conteo/shared/models/historico.js";
import type { Sucursal } from "@conteo/shared/models/sucursal.js";
import { distribuirRedondeo } from "@conteo/shared/services/calculadora-analisis.js";
import { moneda, porcentaje } from "../../lib/formato.js";
import { useAdminRepository } from "../../state/admin-contexto.js";
import { Tabla, type ColumnaTabla } from "./Tabla.js";

interface FilaComparativo {
  readonly sucursal: Sucursal;
  readonly historico: Historico | null;
  /** `null` = sin histórico: la sucursal no participa del reparto — no es
   *  un 0, es la ausencia de un cierre (ver `BarraOTexto`). */
  readonly participacion: number | null;
}

function useSucursales(): Sucursal[] {
  const repo = useAdminRepository();
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  useEffect(() => repo.observarSucursales(setSucursales), [repo]);
  return sucursales;
}

function useUltimosHistoricos(sucursalIds: readonly string[]): {
  historicos: Map<string, Historico | null>;
  cargando: boolean;
  error: string | null;
} {
  const repo = useAdminRepository();
  const [historicos, setHistoricos] = useState<Map<string, Historico | null>>(new Map());
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const clave = sucursalIds.join(",");

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError(null);
    repo
      .ultimoHistoricoPorSucursal(sucursalIds)
      .then((mapa) => {
        if (cancelado) return;
        setHistoricos(mapa);
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

  return { historicos, cargando, error };
}

/** Construye las filas: las que tienen histórico primero, de mayor a menor
 *  participación (el ranking es el punto de la pantalla); las sin histórico
 *  al final, sin porcentaje. */
function construirFilas(
  sucursales: readonly Sucursal[],
  historicos: Map<string, Historico | null>,
): FilaComparativo[] {
  const conHistorico = sucursales.filter((s) => historicos.get(s.sucursalId) != null);
  const sinHistorico = sucursales.filter((s) => historicos.get(s.sucursalId) == null);

  const montos = conHistorico.map((s) => historicos.get(s.sucursalId)!.totalMonetario);
  const participaciones = distribuirRedondeo(montos);

  const filasConHistorico = conHistorico
    .map((sucursal, i) => ({
      sucursal,
      historico: historicos.get(sucursal.sucursalId)!,
      participacion: participaciones[i]!,
    }))
    .sort((a, b) => b.participacion - a.participacion);

  const filasSinHistorico = sinHistorico.map((sucursal) => ({
    sucursal,
    historico: null,
    participacion: null,
  }));

  return [...filasConHistorico, ...filasSinHistorico];
}

/** La barra en sí es `aria-hidden`: el porcentaje que la acompaña ya está en
 *  el DOM como texto, en la misma celda — es el equivalente accesible de la
 *  gráfica, sin depender de leer un `width` en CSS.
 *
 * ponytail: sin tooltip de hover (guía dataviz por defecto para barras) —
 * el valor exacto ya está en texto plano junto a cada barra, así que un
 * tooltip repetiría lo mismo que se ve sin interactuar. Añadir si el diseño
 * pide comparar puntos con más precisión que un decimal. */
function BarraOTexto({ fila }: { readonly fila: FilaComparativo }) {
  if (fila.participacion === null) {
    return <span className="text-tenue">Sin conteos cerrados</span>;
  }
  return (
    <div className="flex items-center gap-2">
      <div
        aria-hidden="true"
        className="h-2 w-32 shrink-0 overflow-hidden rounded-placa bg-placa-alta"
      >
        <div
          className="h-full rounded-placa bg-senal"
          style={{ width: `${fila.participacion}%` }}
        />
      </div>
      <span className="text-tinta" data-testid="valor-participacion">
        {porcentaje(fila.participacion)}
      </span>
    </div>
  );
}

export interface ComparativoScreenProps {
  /**
   * `true` cuando otra pantalla la compone como una sección más — hoy sólo
   * `AnalisisScreen` (F5). Es UNA prop para UN concepto ("no soy la pantalla,
   * soy una sección de otra"), porque anidarla cambia dos cosas a la vez:
   *
   * 1. **Encabezado**: pasa de `h1` a `h2`. Anidada sin esto el documento
   *    quedaba con DOS `<h1>` y el comparativo —una subsección, hermana de
   *    las demás `h2`— se anunciaba como par del título de la página al
   *    navegar por encabezados con un lector de pantalla.
   * 2. **Relleno**: se quita el `p-6`. La pantalla contenedora ya trae el
   *    suyo, así que anidada sin esto el comparativo quedaba con 48 px de
   *    relleno contra los 24 px de todas sus secciones hermanas — desalineado
   *    justo en una pantalla cuyo trabajo es que se pueda barrer de un
   *    vistazo.
   */
  readonly anidado?: boolean;
}

export function ComparativoScreen({ anidado = false }: ComparativoScreenProps = {}) {
  const Encabezado = anidado ? "h2" : "h1";
  const sucursales = useSucursales();
  const sucursalIds = sucursales.map((s) => s.sucursalId);
  const { historicos, cargando, error } = useUltimosHistoricos(sucursalIds);

  const filas = construirFilas(sucursales, historicos);

  const columnas: ColumnaTabla<FilaComparativo>[] = [
    {
      clave: "sucursal",
      etiqueta: "Sucursal",
      render: (f) => f.sucursal.nombre,
      valorOrden: (f) => f.sucursal.nombre,
    },
    {
      clave: "participacion",
      etiqueta: "Participación",
      render: (f) => <BarraOTexto fila={f} />,
      valorOrden: (f) => f.participacion ?? -1,
    },
    {
      clave: "total",
      etiqueta: "Total",
      render: (f) => (
        <span className="text-tenue">{f.historico ? moneda(f.historico.totalMonetario) : "—"}</span>
      ),
      valorOrden: (f) => f.historico?.totalMonetario ?? -1,
      alinearDerecha: true,
    },
  ];

  return (
    <section className={anidado ? undefined : "p-6"}>
      <header className="pb-4">
        <Encabezado className="text-micro tracking-[0.18em] text-tenue uppercase">
          Comparativo
        </Encabezado>
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
