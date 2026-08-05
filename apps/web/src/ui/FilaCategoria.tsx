// apps/web/src/ui/FilaCategoria.tsx (doc 07 §7, doc 11 §4)
//
// Envuelta en React.memo recibiendo sólo su línea por props: evita
// recalcular las demás filas cuando cambia una sola (clave para 55 fps con
// 200 categorías). El aporte propio ("Tú") se suscribe DENTRO del
// componente vía useMiAporte, así que sólo esta fila se re-renderiza cuando
// cambia su propio aporte — el resto de la lista no se entera.
//
// VESTIRLA NO PUEDE SUBIR ESA SUSCRIPCIÓN AL PADRE. Si algún día la fila
// necesita algo más del repositorio, se suscribe aquí dentro también.
//
// `onCantidadPropiaCambio` (F2) NO rompe esa regla: la suscripción sigue
// siendo ésta, la de la propia fila; sólo se REPORTA el número resultante
// hacia arriba para que ConteoScreen sume "Tu aporte" en el Deck sin abrir
// una segunda suscripción por categoría (doc 10 §2, "cero lecturas
// adicionales" — aquí, cero suscripciones adicionales).
import { memo, useEffect } from "react";
import { aporteConfirmado, type LineaConteo } from "@conteo/shared";
import { useConteoRepository } from "../state/repositorio-contexto.js";
import { useMiAporte } from "../state/useMiAporte.js";
import { BotonPaso } from "./primitivos/BotonPaso.js";
import { Numeral } from "./primitivos/Numeral.js";
import { Placa } from "./primitivos/Placa.js";

interface FilaCategoriaProps {
  readonly sesionId: string;
  readonly linea: LineaConteo;
  /** Abre la Hoja (teclado numérico) para esta categoría — el camino
   *  PRINCIPAL de captura es tocar la fila (doc 11 §158-166). */
  readonly onSeleccionar?: (categoriaId: string) => void;
  /** Reporta el aporte propio actual, para el total del Deck. */
  readonly onCantidadPropiaCambio?: (categoriaId: string, cantidad: number) => void;
}

function FilaCategoriaBase({
  sesionId,
  linea,
  onSeleccionar,
  onCantidadPropiaCambio,
}: FilaCategoriaProps) {
  const repo = useConteoRepository();
  const miAporte = useMiAporte(sesionId, linea.categoriaId);
  const miCantidad = miAporte?.cantidad ?? 0;
  const confirmado = aporteConfirmado(linea, miAporte);

  useEffect(() => {
    onCantidadPropiaCambio?.(linea.categoriaId, miCantidad);
  }, [linea.categoriaId, miCantidad, onCantidadPropiaCambio]);

  function registrar(cantidad: number): void {
    void repo.registrarAporte({
      sesionId,
      categoriaId: linea.categoriaId,
      cantidad: Math.max(0, cantidad),
    });
  }

  return (
    <li
      aria-label={`Valor ${linea.etiqueta}, tu aporte ${miCantidad}, total del equipo ${linea.cantidadTotal}`}
      // Virtualización nativa (decisión del plan §3): el navegador se salta
      // el layout de las filas fuera de pantalla y `contain-intrinsic-size`
      // le da la altura que debe reservar para que la barra de scroll no
      // salte. Una línea de CSS en lugar de react-virtual; se mide con 200
      // filas antes de considerar una librería.
      className="list-none [content-visibility:auto] [contain-intrinsic-size:auto_5rem]"
    >
      <Placa confirmado={confirmado} className="py-2.5">
        {/* El stepper se centra contra las DOS líneas de texto en vez de
            colgar de la primera: así la fila mide ~78 px en vez de ~105 y
            entran cuatro categorías más en el primer viewport, que con 60
            categorías es la diferencia entre desplazarse 6 veces o 9. */}
        <div className="flex items-center gap-2">
          {/* Tocar la fila es el camino PRINCIPAL de captura (doc 11
              §158-166): abre la Hoja con teclado numérico. Un <button>, no
              un <div onClick>, para que tenga foco y rol nativos — de ahí
              que el bloque "Tú/Equipo" de abajo sea un <span> (contenido de
              frase) y no un <p> (de bloque), que no es válido dentro de un
              button. */}
          <button
            type="button"
            onClick={() => onSeleccionar?.(linea.categoriaId)}
            aria-label={`Contar ${linea.etiqueta}`}
            className="min-w-0 flex-1 text-left"
          >
            <Numeral className="block text-tinta">{linea.etiqueta}</Numeral>

            {/* Cada cifra tiene que quedar en el MISMO nodo de texto que su
                etiqueta: ConteoScreen.test.tsx consulta por
                findByText(/tú: 1/i), y meter el número en un <span> aparte
                rompe esa consulta. Es la restricción más fuerte del
                rediseño de la fila. */}
            <span className="mt-1 flex gap-3 text-micro text-tenue">
              <span>Tú: {miAporte ? miCantidad : "—"}</span>
              <span>Equipo: {linea.cantidadTotal}</span>
              {/* La regla de tinta dice esto mismo en color, y el color no
                  llega a un lector de pantalla. Visualmente sobra —repetir
                  "Guardado" en 60 filas es ruido— así que va sólo para
                  lectores. Sin aria-live: 60 filas anunciándose a la vez
                  serían inservibles; se lee al recorrer la fila. */}
              <span className="sr-only">{confirmado ? "Guardado" : "Sin enviar"}</span>
            </span>
          </button>

          <BotonPaso
            signo="menos"
            etiqueta={`Restar ${linea.etiqueta}`}
            onClick={() => registrar(miCantidad - 1)}
            disabled={miCantidad === 0}
          />

          <Numeral
            tamano="medio"
            data-testid="mi-cantidad"
            className="w-9 shrink-0 text-center text-tinta"
          >
            {miCantidad}
          </Numeral>

          <BotonPaso
            signo="mas"
            etiqueta={`Sumar ${linea.etiqueta}`}
            onClick={() => registrar(miCantidad + 1)}
          />
        </div>
      </Placa>
    </li>
  );
}

export const FilaCategoria = memo(FilaCategoriaBase);
