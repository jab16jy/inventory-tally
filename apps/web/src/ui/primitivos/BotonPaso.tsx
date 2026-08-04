// apps/web/src/ui/primitivos/BotonPaso.tsx
//
// El − / + de la fila, a 56×56. El doc 11 pide un mínimo de 48 px; aquí se
// sube a 56 porque el escenario real es un cajero de pie, a veces con
// guantes, sosteniendo el teléfono con una mano durante 2–4 horas.
//
// Es el camino ALTERNATIVO de captura, no el principal (doc 11 §158-166): el
// principal es tocar la fila y escribir en el teclado numérico.
import clsx from "clsx";

export interface BotonPasoProps {
  readonly signo: "mas" | "menos";
  /** Nombre accesible completo, p. ej. "Sumar $5.000". */
  readonly etiqueta: string;
  readonly onClick: () => void;
  readonly disabled?: boolean;
}

export function BotonPaso({ signo, etiqueta, onClick, disabled = false }: BotonPasoProps) {
  return (
    <button
      type="button"
      aria-label={etiqueta}
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        "size-[var(--size-toque)] shrink-0 rounded-placa border text-medio",
        "flex items-center justify-center select-none",
        "transition-colors duration-150 ease-out",
        disabled
          ? // Nunca a saturación plena en estado inactivo: un − apagado que
            // sigue gritando ámbar entrena al cajero a ignorar el color.
            "border-borde text-tenue/40"
          : "border-borde text-tinta active:border-senal active:bg-placa-alta active:text-senal",
      )}
    >
      {/* U+2212 (menos real) y U+002B: el guion de teclado se ve corto y
          desalineado junto a un + a este tamaño. */}
      <span aria-hidden="true">{signo === "mas" ? "+" : "−"}</span>
    </button>
  );
}
