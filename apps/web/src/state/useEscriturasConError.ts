// apps/web/src/state/useEscriturasConError.ts — issue #41: escrituras que
// agotaron sus reintentos automáticos y siguen sin confirmarse.
import { useEffect, useState } from "react";
import { useConteoRepository } from "./repositorio-contexto.js";

export function useEscriturasConError(sesionId: string): number {
  const repo = useConteoRepository();
  const [errores, setErrores] = useState(0);

  useEffect(() => repo.observarEscriturasConError(sesionId, setErrores), [repo, sesionId]);

  return errores;
}
