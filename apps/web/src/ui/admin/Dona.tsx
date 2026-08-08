// apps/web/src/ui/admin/Dona.tsx (docs/plan-panel-administrador.md §5, fase F5)
//
// Dona de participación (dinero) en SVG puro con `stroke-dasharray`: un
// <circle fill="none"> por porción, todos compartiendo cx/cy/r/strokeWidth,
// apilados sobre una pista (`--color-placa-alta`, el paso "vacío" de la
// rampa). El SVG es `aria-hidden`: una dona no la lee un screen reader, así
// que la <ul> de al lado ES el equivalente accesible Y la leyenda que
// dataviz exige para ≥2 series — no dos cosas separadas.
//
// Igual que ComparativoScreen: los porcentajes salen de `distribuirRedondeo`
// (mayor resto, décimas enteras) y se usan tal cual para el arco y para el
// texto, así el dibujo y la etiqueta nunca discrepan y el anillo cierra en
// 100,0 exacto. Nunca se suman los floats que devuelve — el invariante vive
// en las décimas (ver su doc-comment).
import type { PorcionAnalisis } from "@conteo/shared/services/calculadora-analisis.js";
import { distribuirRedondeo } from "@conteo/shared/services/calculadora-analisis.js";
import { moneda, porcentaje } from "../../lib/formato.js";

export interface DonaProps {
  readonly porciones: readonly PorcionAnalisis[]; // ya agrupadas/ordenadas desc por quien llama
  readonly etiqueta: string; // nombre accesible de la figura
}

// Rampa ordinal de un solo matiz (ámbar, `--color-senal`) por opacidad de
// trazo. Validada con el validador dataviz (`--ordinal`, tema oscuro,
// superficie #16191f): monotonía de luminosidad, ΔL adyacente ≥ 0.06,
// contraste del extremo más tenue 2.01:1, un solo matiz — las 4
// comprobaciones pasan verbatim con este orden. No "mejorar" esto a una
// paleta categórica: la magnitud es un orden, no una categoría.
const OPACIDADES = [1, 0.88, 0.75, 0.64, 0.52, 0.41, 0.3] as const;

function opacidadDe(indice: number): number {
  // ponytail: el llamador garantiza ≤7 porciones vía `agruparConOtros(..., 7)`;
  // si igual llegara más, repetir la última (más tenue) es honesto — nunca
  // leer más allá del arreglo (undefined → NaN en el atributo SVG). El
  // `clamp` acota el índice antes de indexar, así TS sabe que cae en rango.
  const acotado = Math.min(indice, OPACIDADES.length - 1);
  return OPACIDADES[acotado]!;
}

const CENTRO = 80;
const RADIO = 60;
const GROSOR = 20;
const CIRCUNFERENCIA = 2 * Math.PI * RADIO;
const HUECO_PX = 2; // separación visual entre porciones contiguas (stacked bar radial)

export function Dona({ porciones, etiqueta }: DonaProps) {
  if (porciones.length === 0) {
    return (
      <figure aria-label={etiqueta}>
        <p className="text-micro text-tenue">Sin datos para mostrar.</p>
      </figure>
    );
  }

  const porcentajes = distribuirRedondeo(porciones.map((p) => p.monto));

  let acumulado = 0;
  const arcos = porcentajes.map((p) => {
    const longitudBruta = (CIRCUNFERENCIA * p) / 100;
    // Con una sola porción no hay nada que separar: sin hueco. Con más de
    // una, el hueco jamás puede volver el arco negativo — piso en 0 cuando
    // la porción es más angosta que el propio hueco.
    const longitud = porciones.length === 1 ? longitudBruta : Math.max(0, longitudBruta - HUECO_PX);
    const desplazamiento = -acumulado;
    acumulado += longitudBruta;
    return { longitud, desplazamiento };
  });

  return (
    <figure aria-label={etiqueta} className="flex items-center gap-4">
      <svg
        aria-hidden="true"
        viewBox={`0 0 ${CENTRO * 2} ${CENTRO * 2}`}
        width={CENTRO * 2}
        height={CENTRO * 2}
      >
        <g transform={`rotate(-90 ${CENTRO} ${CENTRO})`}>
          <circle
            cx={CENTRO}
            cy={CENTRO}
            r={RADIO}
            fill="none"
            stroke="var(--color-placa-alta)"
            strokeWidth={GROSOR}
          />
          {arcos.map((arco, i) => (
            <circle
              key={i}
              cx={CENTRO}
              cy={CENTRO}
              r={RADIO}
              fill="none"
              stroke="var(--color-senal)"
              strokeWidth={GROSOR}
              strokeOpacity={opacidadDe(i)}
              strokeDasharray={`${arco.longitud} ${CIRCUNFERENCIA - arco.longitud}`}
              strokeDashoffset={arco.desplazamiento}
            />
          ))}
        </g>
      </svg>
      <ul className="flex flex-col gap-1.5">
        {porciones.map((porcion, i) => (
          <li key={`${i}-${porcion.etiqueta}`} className="flex items-center gap-2 text-micro">
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-full bg-senal"
              style={{ opacity: opacidadDe(i) }}
            />
            <span className="text-tinta">{porcion.etiqueta}</span>
            <span className="text-tenue" data-testid="porcion-porcentaje">
              {porcentaje(porcentajes[i]!)}
            </span>
            <span className="text-tenue">{moneda(porcion.monto)}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
