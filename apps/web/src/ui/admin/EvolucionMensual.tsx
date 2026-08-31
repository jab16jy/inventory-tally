// apps/web/src/ui/admin/EvolucionMensual.tsx (docs/diseno/10-analisis-y-dashboards.md
// §5-6) — evolución mensual del valor total por sesión cerrada. Mismo molde
// que Dona.tsx: SVG `aria-hidden` + <ul> accesible en paralelo con los
// MISMOS valores en texto — la dualidad es la convención de accesibilidad
// del repo para gráficas, no un adorno. La curva en sí (matemática de
// coordenadas, círculo por punto) vive en Sparkline.tsx — no se duplica aquí.
//
// `historicos` llega en orden `cerradaEn desc` (la consulta de
// `historicosRecientesPorSucursal`): se invierte aquí para que el eje X sea
// cronológico, lectura natural izquierda→derecha de una serie temporal.
import type { Historico } from "@conteo/shared/models/historico.js";
import { fecha, moneda } from "../../lib/formato.js";
import { Sparkline } from "./Sparkline.js";

export interface EvolucionMensualProps {
  readonly historicos: readonly Historico[]; // orden cerradaEn desc, como llega del repositorio
  readonly etiqueta: string;
}

const ANCHO = 280;
const ALTO = 120;
const PAD = 10;
const RADIO_PUNTO = 3;

export function EvolucionMensual({ historicos, etiqueta }: EvolucionMensualProps) {
  if (historicos.length === 0) {
    return (
      <figure aria-label={etiqueta}>
        <p className="text-micro text-tenue">Sin históricos para mostrar.</p>
      </figure>
    );
  }

  const cronologicos = [...historicos].reverse();

  return (
    <figure aria-label={etiqueta} className="flex flex-col gap-3">
      <Sparkline
        valores={cronologicos.map((h) => h.totalMonetario)}
        ancho={ANCHO}
        alto={ALTO}
        pad={PAD}
        radioPunto={RADIO_PUNTO}
      />
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
