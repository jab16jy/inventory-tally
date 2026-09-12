// apps/web/src/state/useLineasSesion.ts (doc 07 §7)
import { useEffect, useMemo, useState } from "react";
import type { LineaConteo } from "@conteo/shared";
import { useConteoRepository } from "./repositorio-contexto.js";

/**
 * `null` hasta el primer snapshot; después SIEMPRE un array, vacío incluido.
 * La distinción no es cosmética: una sesión abierta cuyo catálogo se sembró
 * con cero categorías activas tiene cero líneas para siempre, y arrancar el
 * estado en `[]` la volvía indistinguible de "todavía están llegando" —
 * esqueleto eterno para quien la abriera. Quien no necesite separarlas cierra
 * con `?? []` en la llamada.
 */
export function useLineasSesion(sesionId: string): LineaConteo[] | null {
  const repo = useConteoRepository();
  const [lineas, setLineas] = useState<LineaConteo[] | null>(null);

  useEffect(() => {
    setLineas(null);
    return repo.observarLineas(sesionId, setLineas);
  }, [repo, sesionId]);

  return lineas;
}

/** Deriva sólo la fila que cambió: evita recalcular todas las filas en cada
 *  render (doc 07 §7). */
export function useLineaPorCategoria(
  sesionId: string,
  categoriaId: string,
): LineaConteo | undefined {
  const lineas = useLineasSesion(sesionId);
  return useMemo(() => lineas?.find((l) => l.categoriaId === categoriaId), [lineas, categoriaId]);
}
