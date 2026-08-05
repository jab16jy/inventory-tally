// apps/web/src/state/useMiAporte.ts (doc 07 §7)
import { useEffect, useState } from "react";
import type { Aporte } from "@conteo/shared";
import { useConteoRepository } from "./repositorio-contexto.js";

export function useMiAporte(sesionId: string, categoriaId: string): Aporte | null {
  const repo = useConteoRepository();
  const [aporte, setAporte] = useState<Aporte | null>(null);

  useEffect(() => {
    // categoriaId vacío = "nada en edición todavía" (así lo usa la Hoja de
    // ConteoScreen antes de que el cajero toque una fila): sin este guard,
    // FirestoreConteoRepository intentaría construir una referencia de
    // documento con un segmento de ruta vacío y el SDK lanzaría.
    if (!categoriaId) {
      setAporte(null);
      return;
    }
    return repo.observarMiAporte(sesionId, categoriaId, setAporte);
  }, [repo, sesionId, categoriaId]);

  return aporte;
}
