// apps/web/src/ui/admin/Sparkline.tsx (docs/diseno/10-analisis-y-dashboards.md
// §5-6) — micro-gráfica de línea reutilizable: la matemática de coordenadas
// que antes vivía sólo en EvolucionMensual.tsx (`puntos()`), extraída para
// dibujarse también en tamaño celda dentro de una fila de tabla.
//
// Cada Sparkline normaliza SUS PROPIOS valores (min/max de su propia serie),
// igual que hacía EvolucionMensual: dos sparklines de filas distintas NO son
// comparables en altura entre sí — cada una dibuja la FORMA de su tendencia,
// no su magnitud relativa frente a otras filas. Apiladas en una columna de
// tabla eso invita visualmente a compararlas; no lo son.
//
// El SVG es `aria-hidden` (misma convención que EvolucionMensual.tsx):
// NUNCA lleva su propio equivalente accesible. Quien monte este componente
// es responsable de aportar los valores como texto en el DOM al lado — un
// tooltip o el SVG solo no bastan, sería una celda muda para lectores de
// pantalla.
export interface SparklineProps {
  readonly valores: readonly number[]; // orden cronológico: izquierda → derecha
  readonly ancho?: number;
  readonly alto?: number;
  readonly pad?: number;
  readonly radioPunto?: number;
  // Se pasa tal cual al <svg>. Aditiva: quien no la use conserva el markup
  // de siempre. Existe porque `ancho` fijo (280 en EvolucionMensual) desborda
  // una card angosta en pantallas de 320px si el consumidor no puede pedirle
  // al SVG que ocupe el ancho real de su contenedor en vez del atributo fijo.
  readonly className?: string;
}

const ANCHO_POR_DEFECTO = 64;
const ALTO_POR_DEFECTO = 20;
const PAD_POR_DEFECTO = 3;
const RADIO_PUNTO_POR_DEFECTO = 2;

function puntos(
  valores: readonly number[],
  ancho: number,
  alto: number,
  pad: number,
): { x: number; y: number }[] {
  const min = Math.min(...valores);
  const rango = Math.max(...valores) - min;
  const pasoX = valores.length > 1 ? (ancho - 2 * pad) / (valores.length - 1) : 0;
  return valores.map((v, i) => ({
    x: pad + i * pasoX,
    y: rango === 0 ? alto / 2 : pad + (alto - 2 * pad) * (1 - (v - min) / rango),
  }));
}

export function Sparkline({
  valores,
  ancho = ANCHO_POR_DEFECTO,
  alto = ALTO_POR_DEFECTO,
  pad = PAD_POR_DEFECTO,
  radioPunto = RADIO_PUNTO_POR_DEFECTO,
  className,
}: SparklineProps) {
  // ponytail: serie vacía, nada que dibujar — quien llama decide el mensaje
  // (EvolucionMensual ya lo hace antes de llegar aquí).
  if (valores.length === 0) return null;

  const coords = puntos(valores, ancho, alto, pad);

  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${ancho} ${alto}`}
      width={ancho}
      height={alto}
      className={className}
    >
      {/* ponytail: con un solo valor una polyline de un punto no se ve —
          se pinta sólo el círculo (marca "hay un dato", sin insinuar
          tendencia); a partir de 2 puntos se añade la línea. */}
      {coords.length > 1 && (
        <polyline
          fill="none"
          stroke="var(--color-senal)"
          strokeWidth={2}
          points={coords.map((p) => `${p.x},${p.y}`).join(" ")}
        />
      )}
      {coords.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={radioPunto} fill="var(--color-senal)" />
      ))}
    </svg>
  );
}
