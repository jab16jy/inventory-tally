// Resumen estadístico simple para las muestras de latencia de
// rnf-01-latencia-sincronizacion.test.ts (issue #62). Percentil por
// interpolación lineal (método común, no requiere librería aparte).
export interface ResumenLatencias {
  readonly promedio: number;
  readonly maximo: number;
  readonly p50: number;
  readonly p95: number;
}

export function resumenLatencias(muestras: readonly number[]): ResumenLatencias {
  if (muestras.length === 0) {
    throw new Error("resumenLatencias requiere al menos una muestra");
  }
  const ordenadas = [...muestras].sort((a, b) => a - b);
  return {
    promedio: ordenadas.reduce((acc, v) => acc + v, 0) / ordenadas.length,
    maximo: ordenadas[ordenadas.length - 1]!,
    p50: percentil(ordenadas, 50),
    p95: percentil(ordenadas, 95),
  };
}

function percentil(ordenadas: readonly number[], p: number): number {
  // ponytail: sin casos especiales para length===1 ni inferior===superior —
  // en ambos, peso da exactamente 0 y la fórmula general ya devuelve
  // ordenadas[inferior] sin ayuda; añadirlos era código muerto (detectado
  // por mutation testing: ambas ramas sobrevivían a un `if (false)`).
  const rango = (p / 100) * (ordenadas.length - 1);
  const inferior = Math.floor(rango);
  const superior = Math.ceil(rango);
  const peso = rango - inferior;
  return ordenadas[inferior]! * (1 - peso) + ordenadas[superior]! * peso;
}
