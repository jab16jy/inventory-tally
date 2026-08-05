// apps/web/src/ui/primitivos/Deck.tsx
//
// El tercio inferior fijo del plan §5: totales de unidades, nunca dinero
// (I-9 — la separación de datos ni siquiera le da al cliente el
// valorUnitario agregado), y el botón que lleva a terminar. "Siempre bajo
// el pulgar": sticky al fondo del contenedor de la pantalla de conteo, no
// del documento — vive dentro de la misma <section>, no en un portal.
//
// Deliberadamente "Tu aporte"/"Equipo" sin los dos puntos de la fila
// ("Tú: N"): ConteoScreen.test.tsx busca /tú: 1/i y /equipo: 1/i, y con
// coma el total del equipo bien podría empezar en "1" a mitad de sesión.
import { Numeral } from "./Numeral.js";

const FORMATO_UNIDADES = new Intl.NumberFormat("es-CO");

export interface DeckProps {
  readonly tuAporte: number;
  readonly equipo: number;
  readonly onFinalizar: () => void;
}

export function Deck({ tuAporte, equipo, onFinalizar }: DeckProps) {
  return (
    <div className="sticky bottom-0 border-t border-borde bg-placa-alta px-3 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
      <div className="flex items-baseline justify-between gap-3 text-micro text-tenue uppercase">
        <p>
          Tu aporte{" "}
          <Numeral tamano="medio" className="text-tinta normal-case">
            {FORMATO_UNIDADES.format(tuAporte)} u
          </Numeral>
        </p>
        <p>
          Equipo{" "}
          <Numeral tamano="medio" className="text-tinta normal-case">
            {FORMATO_UNIDADES.format(equipo)} u
          </Numeral>
        </p>
      </div>

      <button
        type="button"
        onClick={onFinalizar}
        className="mt-3 min-h-[var(--size-toque)] w-full rounded-placa bg-senal font-semibold text-fondo transition-colors duration-150 ease-out active:bg-senal/85"
      >
        Finalizar conteo
      </button>
    </div>
  );
}
