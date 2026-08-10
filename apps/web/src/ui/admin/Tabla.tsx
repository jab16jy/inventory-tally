// apps/web/src/ui/admin/Tabla.tsx (docs/plan-panel-administrador.md §5, fase
// F2): shell de tabla que reusan F2-F5. Vive en `ui/admin/`, no en
// `ui/primitivos/` (doc plan §5, "aquí nace ui/admin/Tabla.tsx") — no tiene
// acceso a repositorio, sólo props, pero no es un primitivo de la PWA de
// cajero: es de escritorio y de "Placa de bodega · escritorio" (doc plan §1),
// `text-base` en vez del numeral de 32px.
//
// issue #20 item 1 (doc 11 §298-304): < 600px pinta tarjetas en vez de
// `<table>` — la fila apilada en pares etiqueta/valor, mismo criterio visual
// que las Placa de la PWA de cajero. 600–1024px y > 1024px comparten el mismo
// `<table>`, envuelto en `overflow-x-auto`: a 1024px+ ya no hace falta
// desplazar, así que el wrapper es un no-op ahí — no hace falta una tercera
// rama sólo para el ancho del contenedor.
//
// ponytail: sin paginación, selección de filas, resize de columnas ni sticky
// header — ninguna pantalla de F2-F5 los pide todavía. Añadir cuando una lo
// haga.
import clsx from "clsx";
import { useMemo, useState, type ReactNode } from "react";
import { useDisenoAdaptativo } from "../../state/useDisenoAdaptativo.js";
import { Icono } from "../primitivos/Icono.js";

export interface ColumnaTabla<T> {
  readonly clave: string;
  readonly etiqueta: string;
  readonly render: (fila: T) => ReactNode;
  /** Presente = columna ordenable, y esta función decide el valor de
   *  comparación. Ausente = columna no ordenable, sin `aria-sort`. */
  readonly valorOrden?: (fila: T) => string | number;
  readonly alinearDerecha?: boolean;
}

export interface TablaProps<T> {
  readonly columnas: readonly ColumnaTabla<T>[];
  readonly filas: readonly T[];
  readonly claveFila: (fila: T) => string;
  /** Nombre accesible de la tabla (`aria-label`). */
  readonly etiqueta: string;
  readonly vacio?: ReactNode;
  /** Mientras es `true`, ignora `filas`/`vacio` y pinta filas de esqueleto
   *  dentro de la MISMA tabla (mismos `<th>`, misma forma) — nunca un
   *  spinner (docs/plan-panel-administrador.md §5, no negociables). */
  readonly cargando?: boolean;
}

const FILAS_ESQUELETO = 3;

type Direccion = "asc" | "desc";
interface Orden {
  readonly clave: string;
  readonly direccion: Direccion;
}

export function Tabla<T>({
  columnas,
  filas,
  claveFila,
  etiqueta,
  vacio,
  cargando = false,
}: TablaProps<T>) {
  const diseno = useDisenoAdaptativo();
  const [orden, setOrden] = useState<Orden | null>(null);

  const filasOrdenadas = useMemo(() => {
    const columna = orden && columnas.find((c) => c.clave === orden.clave);
    if (!orden || !columna?.valorOrden) return filas;
    const { valorOrden } = columna;
    const signo = orden.direccion === "asc" ? 1 : -1;
    return [...filas].sort((a, b) => {
      const va = valorOrden(a);
      const vb = valorOrden(b);
      if (va < vb) return -signo;
      if (va > vb) return signo;
      return 0;
    });
  }, [filas, orden, columnas]);

  // Ciclo de 3 estados por columna: sin ordenar → ascendente → descendente →
  // sin ordenar. Cada click cambia sólo la columna clicada.
  function alternarOrden(clave: string): void {
    setOrden((actual) => {
      if (actual?.clave !== clave) return { clave, direccion: "asc" };
      if (actual.direccion === "asc") return { clave, direccion: "desc" };
      return null;
    });
  }

  if (!cargando && filas.length === 0) {
    return <p className="text-base text-tenue">{vacio ?? "No hay datos."}</p>;
  }

  if (diseno === "movil") {
    return (
      <ul aria-label={etiqueta} className="flex flex-col gap-2">
        {cargando
          ? Array.from({ length: FILAS_ESQUELETO }, (_, i) => (
              <li
                key={`esqueleto-${i}`}
                aria-hidden="true"
                data-testid="fila-esqueleto"
                className="list-none rounded-placa border border-borde bg-placa p-3"
              >
                <span className="block h-4 w-3/4 animate-pulse rounded-placa bg-placa-alta" />
              </li>
            ))
          : filasOrdenadas.map((fila) => (
              <li
                key={claveFila(fila)}
                className="list-none rounded-placa border border-borde bg-placa p-3"
              >
                <dl className="flex flex-col gap-1.5">
                  {columnas.map((columna) => (
                    <div key={columna.clave} className="flex items-baseline justify-between gap-3">
                      <dt className="text-micro text-tenue">{columna.etiqueta}</dt>
                      <dd
                        className={clsx(
                          "text-base text-tinta",
                          columna.alinearDerecha && "text-right",
                        )}
                      >
                        {columna.render(fila)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
      </ul>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border border-borde text-base" aria-label={etiqueta}>
        <thead>
          <tr className="border-b border-borde bg-placa">
            {columnas.map((columna) => {
              const ordenable = columna.valorOrden !== undefined;
              const activa = orden?.clave === columna.clave;
              return (
                <th
                  key={columna.clave}
                  scope="col"
                  aria-sort={
                    !ordenable
                      ? undefined
                      : activa
                        ? orden.direccion === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                  }
                  className={clsx(
                    "px-3 py-2 text-left font-semibold text-tenue",
                    columna.alinearDerecha && "text-right",
                  )}
                >
                  {ordenable ? (
                    <button
                      type="button"
                      onClick={() => alternarOrden(columna.clave)}
                      className={clsx(
                        "inline-flex items-center gap-1 hover:text-tinta",
                        columna.alinearDerecha && "flex-row-reverse",
                      )}
                    >
                      {columna.etiqueta}
                      {activa && (
                        <Icono
                          nombre="chevron"
                          className={clsx(
                            "size-3 shrink-0",
                            orden.direccion === "asc" ? "-rotate-90" : "rotate-90",
                          )}
                        />
                      )}
                    </button>
                  ) : (
                    columna.etiqueta
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {cargando
            ? Array.from({ length: FILAS_ESQUELETO }, (_, i) => (
                <tr
                  key={`esqueleto-${i}`}
                  aria-hidden="true"
                  data-testid="fila-esqueleto"
                  className="border-b border-borde last:border-b-0"
                >
                  {columnas.map((columna) => (
                    <td key={columna.clave} className="px-3 py-2">
                      <span className="block h-4 w-3/4 animate-pulse rounded-placa bg-placa-alta" />
                    </td>
                  ))}
                </tr>
              ))
            : filasOrdenadas.map((fila) => (
                <tr key={claveFila(fila)} className="border-b border-borde last:border-b-0">
                  {columnas.map((columna) => (
                    <td
                      key={columna.clave}
                      className={clsx(
                        "px-3 py-2 text-tinta",
                        columna.alinearDerecha && "text-right",
                      )}
                    >
                      {columna.render(fila)}
                    </td>
                  ))}
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  );
}
