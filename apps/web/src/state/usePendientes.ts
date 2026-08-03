// apps/web/src/state/usePendientes.ts — RF-16: escrituras sin sincronizar.
import { useEffect, useState } from "react";
import { useConteoRepository } from "./repositorio-contexto.js";

export function usePendientes(sesionId: string): number {
  const repo = useConteoRepository();
  const [pendientes, setPendientes] = useState(0);

  useEffect(() => repo.observarEscriturasPendientes(sesionId, setPendientes), [repo, sesionId]);

  return pendientes;
}
