// apps/web/src/state/useLineasSesion.ts (doc 07 §7)
import { useEffect, useMemo, useState } from "react";
import type { LineaConteo } from "@conteo/shared";
import { useConteoRepository } from "./repositorio-contexto.js";

export function useLineasSesion(sesionId: string): LineaConteo[] {
  const repo = useConteoRepository();
  const [lineas, setLineas] = useState<LineaConteo[]>([]);

  useEffect(() => repo.observarLineas(sesionId, setLineas), [repo, sesionId]);

  return lineas;
}

/** Deriva sólo la fila que cambió: evita recalcular todas las filas en cada
 *  render (doc 07 §7). */
export function useLineaPorCategoria(
  sesionId: string,
  categoriaId: string,
): LineaConteo | undefined {
  const lineas = useLineasSesion(sesionId);
  return useMemo(() => lineas.find((l) => l.categoriaId === categoriaId), [lineas, categoriaId]);
}
