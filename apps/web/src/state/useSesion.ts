// apps/web/src/state/useSesion.ts — F4-A1: observa UNA sesión por
// `sesionId` (al revés de la sucursal→sesión que ya usa SucursalesScreen).
// Es el consumidor de `ConteoRepository.observarSesion`, la ruta de
// escalamiento que ya nombraba el `ponytail:` de PrepararScreen.tsx —
// alimenta el modal bloqueante de "sesión cerrada por el admin"
// (doc 11 §5: `estado != 'abierta'`).
//
// F4-B: devuelve un estado explícito de tres casos en vez de
// `SesionConteo | null`. `null` significaba DOS cosas incompatibles —"el
// listener todavía no ha emitido nada" y "el documento no existe"— y cada
// consumidor tenía que elegir cuál asumir, siempre equivocándose en la otra.
// Costó dos defectos que la revisión encontró por separado: un esqueleto
// eterno prometiendo líneas de una sesión ya borrada, y —al exigir que la
// sesión existiera para taparlo— la pantalla en blanco durante la carga
// normal. Ausencia de respuesta y respuesta "no está" no son lo mismo, y el
// tipo ahora lo dice.
import { useEffect, useState } from "react";
import type { SesionConteo } from "@conteo/shared";
import { useConteoRepository } from "./repositorio-contexto.js";

export type EstadoSesion =
  /** El listener aún no ha emitido. No se sabe nada todavía. */
  | { readonly estado: "sin-resolver" }
  | { readonly estado: "existe"; readonly sesion: SesionConteo }
  /**
   * El listener emitió ausencia: el documento no está. Ocurre de verdad —
   * `abrirSesion` borra la sesión si la siembra de líneas falla a mitad, para
   * dejar la sucursal reintentable (su compensación D3).
   */
  | { readonly estado: "borrada" };

const SIN_RESOLVER: EstadoSesion = { estado: "sin-resolver" };

export function useSesion(sesionId: string): EstadoSesion {
  const repo = useConteoRepository();
  const [estado, setEstado] = useState<EstadoSesion>(SIN_RESOLVER);

  useEffect(() => {
    // Se vuelve a "sin-resolver" al cambiar de sesión: si no, el estado de la
    // anterior sobreviviría al primer render de la nueva y la pantalla
    // decidiría con datos de otra sesión.
    setEstado(SIN_RESOLVER);
    return repo.observarSesion(sesionId, (sesion) =>
      setEstado(sesion === null ? { estado: "borrada" } : { estado: "existe", sesion }),
    );
  }, [repo, sesionId]);

  return estado;
}
