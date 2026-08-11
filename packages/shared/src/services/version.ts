const FORMATO_VERSION = /^(\d+)\.(\d+)\.(\d+)$/;

/**
 * ¿La versión instalada obliga a actualizar antes de seguir? (issue #12 —
 * bloqueo por versión mínima)
 *
 * Sin dependencia `semver`: sólo comparamos major.minor.patch, sin
 * pre-release ni build metadata, así que tres enteros alcanzan.
 *
 * Fail-closed: una versión que no matchea `x.y.z` (vacía, con letras, con
 * otro número de componentes, negativa) SIEMPRE bloquea. El origen típico es
 * un build roto o el sentinel "0.0.0" de un checkout sin tag git —ambos
 * casos donde asumir "está bien" sería peor que pedir de más.
 */
export function requiereActualizacion(actual: string, minima: string): boolean {
  const a = FORMATO_VERSION.exec(actual);
  const m = FORMATO_VERSION.exec(minima);
  if (!a || !m) return true;

  for (let i = 1; i <= 3; i++) {
    const diff = Number(a[i]) - Number(m[i]);
    if (diff !== 0) return diff < 0;
  }
  return false;
}
