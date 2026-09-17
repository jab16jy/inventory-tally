// apps/web/src/state/useAuthState.ts (doc 07 §7) — sesión activa, rol y
// sucursales asignadas. `rol` y `sucursales` vienen de los custom claims
// del token (doc 04 §3: se duplican ahí justamente para que las Security
// Rules y este hook lean la misma fuente — `infra/firestore.rules:16`,
// `tools/seed.ts:41`).
import { onAuthStateChanged, type Auth } from "firebase/auth";
import { useEffect, useState } from "react";
import type { EstadoAuth } from "../lib/guardas.js";

/**
 * El SDK tipa `token.claims` como `Record<string, unknown>`: el claim
 * `sucursales` puede llegar ausente (usuario sin sucursales asignadas) o
 * con un tipo inesperado (un custom claim mal escrito desde otra
 * herramienta, o un token viejo con otra forma). Es un límite de confianza
 * — se valida elemento por elemento, nunca se castea a ciegas.
 */
function normalizarSucursales(valor: unknown): readonly string[] {
  if (!Array.isArray(valor)) return [];
  return valor.filter((v): v is string => typeof v === "string");
}

export function useAuthState(auth: Auth): EstadoAuth {
  const [estado, setEstado] = useState<EstadoAuth>(undefined);

  useEffect(() => {
    return onAuthStateChanged(auth, (usuario) => {
      if (!usuario) {
        setEstado(null);
        return;
      }
      void usuario.getIdTokenResult().then((token) => {
        const sucursales = normalizarSucursales(token.claims.sucursales);
        const rol = typeof token.claims.rol === "string" ? token.claims.rol : undefined;
        const esAdmin = rol === "admin" || (rol === "admin_sucursal" && sucursales.length === 1);
        setEstado({
          uid: usuario.uid,
          nombre: usuario.displayName,
          esAdmin,
          sucursales,
          rol,
        });
      });
    });
  }, [auth]);

  return estado;
}
