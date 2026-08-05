// apps/web/src/state/useSesion.ts — F4-A1: observa UNA sesión por
// `sesionId` (al revés de la sucursal→sesión que ya usa SucursalesScreen).
// Es el consumidor de `ConteoRepository.observarSesion`, la ruta de
// escalamiento que ya nombraba el `ponytail:` de PrepararScreen.tsx —
// alimenta el modal bloqueante de "sesión cerrada por el admin"
// (doc 11 §5: `estado != 'abierta'`).
import { useEffect, useState } from "react";
import type { SesionConteo } from "@conteo/shared";
import { useConteoRepository } from "./repositorio-contexto.js";

export function useSesion(sesionId: string): SesionConteo | null {
  const repo = useConteoRepository();
  const [sesion, setSesion] = useState<SesionConteo | null>(null);

  useEffect(() => repo.observarSesion(sesionId, setSesion), [repo, sesionId]);

  return sesion;
}
