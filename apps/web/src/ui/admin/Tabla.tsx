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
  /** Siembra el orden inicial Y pasa a ser el estado "en reposo" del ciclo de
   *  encabezado: sin él, asc → desc → sin orden; con él, el tercer clic
   *  vuelve AQUÍ en vez de dejar la tabla en orden de inserción. Sin la prop
   *  el comportamiento es idéntico al de hoy (`?? null`). */
  readonly ordenInicial?: Orden;
  /** Fila fija al pie: NO participa del orden. Se ignora mientras `cargando`
   *  y cuando no hay filas — un total de nada sería un cero fabricado. */
  readonly filaTotal?: T;
}

const FILAS_ESQUELETO = 3;

type Direccion = "asc" | "desc";
export interface Orden {
  readonly clave: string;
  readonly direccion: Direccion;
}

/** Cuerpo etiqueta/valor de una tarjeta móvil. Lo comparten la fila normal y
 *  la fila total: sólo cambia la superficie del `<li>` que la envuelve. */
function CuerpoTarjeta<T>({
  columnas,
  fila,
}: {
  readonly columnas: readonly ColumnaTabla<T>[];
  readonly fila: T;
}) {
  return (
    <dl className="flex flex-col gap-1.5">
      {columnas.map((columna) => (
        <div key={columna.clave} className="flex items-baseline justify-between gap-3">
          <dt className="text-micro text-tenue">{columna.etiqueta}</dt>
          <dd className={clsx("text-base text-tinta", columna.alinearDerecha && "text-right")}>
            {columna.render(fila)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function Tabla<T>({
  columnas,
  filas,
  claveFila,
  etiqueta,
  vacio,
  cargando = false,
  ordenInicial,
  filaTotal,
}: TablaProps<T>) {
  const diseno = useDisenoAdaptativo();
  const [orden, setOrden] = useState<Orden | null>(ordenInicial ?? null);
  // La condición va en línea en cada rama en vez de en un booleano aparte:
  // TypeScript no estrecha `filaTotal` a través de una variable booleana, y
  // guardarlo así evita los dos `as T` que harían falta si no.
  const total = !cargando ? filaTotal : undefined;

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
      return ordenInicial ?? null;
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
                <CuerpoTarjeta columnas={columnas} fila={fila} />
              </li>
            ))}
        {total !== undefined && (
          // Superficie elevada (`bg-placa-alta`) en vez de `bg-placa`: se lee
          // como "esto no es una fila más" sin inventar un color nuevo.
          <li className="list-none rounded-placa border border-borde bg-placa-alta p-3">
            <CuerpoTarjeta columnas={columnas} fila={total} />
          </li>
        )}
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
        {total !== undefined && (
          // `<tfoot>` aparte de `<tbody>`: la fila total no pasa por
          // `filasOrdenadas`, así que ordenar por Valor nunca la salta al
          // medio de la tabla. `border-t` + `bg-placa` + `font-semibold`
          // (tokens del tema) la distinguen de una fila más.
          <tfoot>
            <tr className="border-t border-borde bg-placa font-semibold">
              {columnas.map((columna, i) => {
                const contenido = columna.render(total);
                const clases = clsx("px-3 py-2 text-tinta", columna.alinearDerecha && "text-right");
                // Primera columna = etiqueta del total: `<th scope="row">`
                // la anuncia como encabezado de fila, no como un dato más.
                return i === 0 ? (
                  <th key={columna.clave} scope="row" className={clases}>
                    {contenido}
                  </th>
                ) : (
                  <td key={columna.clave} className={clases}>
                    {contenido}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
