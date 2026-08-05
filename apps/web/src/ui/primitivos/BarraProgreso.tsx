// apps/web/src/ui/primitivos/BarraProgreso.tsx
//
// "47/60" + la barra (plan §5, FIRST VIEWPORT). Cuántas categorías ya contó
// el cajero ACTUAL, de cuántas tiene la sesión — la fuente es
// `LineaConteo.versiones[uid]` vía `estaPendiente` (doc 10 §2), calculada en
// ConteoScreen; este primitivo sólo pinta los dos números que ya recibe.
export interface BarraProgresoProps {
  readonly contadas: number;
  readonly total: number;
}

export function BarraProgreso({ contadas, total }: BarraProgresoProps) {
  const porcentaje = total === 0 ? 0 : Math.round((contadas / total) * 100);
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <span data-numeral className="shrink-0 text-micro text-tenue">
        {contadas}/{total}
      </span>
      <div
        role="progressbar"
        aria-valuenow={contadas}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuetext={`${contadas} de ${total} categorías`}
        className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-placa bg-borde"
      >
        <div
          className="h-full bg-senal transition-[width] duration-200 ease-out"
          style={{ width: `${porcentaje}%` }}
        />
      </div>
    </div>
  );
}
