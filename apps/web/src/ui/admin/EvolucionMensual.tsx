// apps/web/src/ui/admin/EvolucionMensual.tsx (docs/diseno/10-analisis-y-dashboards.md
// §5-6) — evolución mensual del valor total por sesión cerrada. Mismo molde
// que Dona.tsx: SVG `aria-hidden` + <ul> accesible en paralelo con los
// MISMOS valores en texto — la dualidad es la convención de accesibilidad
// del repo para gráficas, no un adorno.
//
// `historicos` llega en orden `cerradaEn desc` (la consulta de
// `historicosRecientesPorSucursal`): se invierte aquí para que el eje X sea
// cronológico, lectura natural izquierda→derecha de una serie temporal.
import type { Historico } from "@conteo/shared/models/historico.js";
import { fecha, moneda } from "../../lib/formato.js";

export interface EvolucionMensualProps {
  readonly historicos: readonly Historico[]; // orden cerradaEn desc, como llega del repositorio
  readonly etiqueta: string;
}

const ANCHO = 280;
const ALTO = 120;
const PAD = 10;

function puntos(cronologicos: readonly Historico[]): { x: number; y: number }[] {
  const montos = cronologicos.map((h) => h.totalMonetario);
  const min = Math.min(...montos);
  const rango = Math.max(...montos) - min;
  const pasoX = cronologicos.length > 1 ? (ANCHO - 2 * PAD) / (cronologicos.length - 1) : 0;
  return cronologicos.map((h, i) => ({
    x: PAD + i * pasoX,
    y: rango === 0 ? ALTO / 2 : PAD + (ALTO - 2 * PAD) * (1 - (h.totalMonetario - min) / rango),
  }));
}

export function EvolucionMensual({ historicos, etiqueta }: EvolucionMensualProps) {
  if (historicos.length === 0) {
    return (
      <figure aria-label={etiqueta}>
        <p className="text-micro text-tenue">Sin históricos para mostrar.</p>
      </figure>
    );
  }

  const cronologicos = [...historicos].reverse();
  const coords = puntos(cronologicos);

  return (
    <figure aria-label={etiqueta} className="flex flex-col gap-3">
      <svg aria-hidden="true" viewBox={`0 0 ${ANCHO} ${ALTO}`} width={ANCHO} height={ALTO}>
        {/* ponytail: con un solo histórico una polyline de un punto no se
            ve — se pinta sólo el círculo (marca "hay un cierre", sin
            insinuar tendencia); a partir de 2 puntos se añade la línea. */}
        {coords.length > 1 && (
          <polyline
            fill="none"
            stroke="var(--color-senal)"
            strokeWidth={2}
            points={coords.map((p) => `${p.x},${p.y}`).join(" ")}
          />
        )}
        {coords.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={3} fill="var(--color-senal)" />
        ))}
      </svg>
      <ul className="flex flex-col gap-1">
        {cronologicos.map((h) => (
          <li key={h.sesionId} className="flex items-center gap-2 text-micro">
            <span className="text-tenue">{fecha(h.cerradaEn)}</span>
            <span className="text-tinta">{moneda(h.totalMonetario)}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
