// apps/web/src/state/useAuthState.ts (doc 07 §7) — sesión activa y rol.
// `rol` viene de los custom claims del token (doc 04 §3: se duplica ahí
// justamente para que las Security Rules y este hook lean la misma fuente).
import { onAuthStateChanged, type Auth } from "firebase/auth";
import { useEffect, useState } from "react";
import type { EstadoAuth } from "../lib/guardas.js";

export function useAuthState(auth: Auth): EstadoAuth {
  const [estado, setEstado] = useState<EstadoAuth>(undefined);

  useEffect(() => {
    return onAuthStateChanged(auth, (usuario) => {
      if (!usuario) {
        setEstado(null);
        return;
      }
      void usuario.getIdTokenResult().then((token) => {
        setEstado({
          uid: usuario.uid,
          nombre: usuario.displayName,
          esAdmin: token.claims.rol === "admin",
        });
      });
    });
  }, [auth]);

  return estado;
}
