// apps/web/src/state/useMiAporte.ts (doc 07 §7)
import { useEffect, useState } from "react";
import type { Aporte } from "@conteo/shared";
import { useConteoRepository } from "./repositorio-contexto.js";

export function useMiAporte(sesionId: string, categoriaId: string): Aporte | null {
  const repo = useConteoRepository();
  const [aporte, setAporte] = useState<Aporte | null>(null);

  useEffect(
    () => repo.observarMiAporte(sesionId, categoriaId, setAporte),
    [repo, sesionId, categoriaId],
  );

  return aporte;
}
