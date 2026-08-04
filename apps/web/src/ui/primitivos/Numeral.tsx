// apps/web/src/ui/primitivos/Numeral.tsx
//
// El numeral condensado tabular: el outlier deliberado de la escala
// tipográfica y el objeto que define el mundo. `data-numeral` es lo que
// engancha las cifras tabulares y el eje `wdth` de Archivo desde tema.css —
// sin tabular-nums las columnas bailan al incrementar, justo en el momento
// en que el cajero está mirando la cifra.
import clsx from "clsx";
import type { ReactNode } from "react";

const TAMANOS = {
  /** La denominación: 2rem, el outlier. */
  placa: "text-numeral leading-none font-semibold",
  /** Cantidades dentro de un control. */
  medio: "text-medio leading-none font-semibold",
  /** Cifras en línea con el texto corrido. */
  base: "text-base leading-none font-medium",
} as const;

export interface NumeralProps {
  readonly tamano?: keyof typeof TAMANOS;
  readonly className?: string;
  readonly children: ReactNode;
  readonly "data-testid"?: string;
}

export function Numeral({
  tamano = "placa",
  className,
  children,
  "data-testid": testId,
}: NumeralProps) {
  return (
    <span data-numeral data-testid={testId} className={clsx(TAMANOS[tamano], className)}>
      {children}
    </span>
  );
}
