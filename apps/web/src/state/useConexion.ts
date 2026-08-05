// apps/web/src/state/useConexion.ts — navigator.onLine + eventos nativos
// (la plataforma ya resuelve esto: sin librería). Alimenta ChipEstado:
// "sin conexión" es el único estado que el sistema pinta en rojo (plan §1),
// porque mientras dure no hay forma de confirmar nada nuevo con el
// servidor — a diferencia de "pendiente" (en tránsito, con conexión), que
// se resuelve solo.
import { useEffect, useState } from "react";

export function useConexion(): boolean {
  const [enLinea, setEnLinea] = useState(() => navigator.onLine);

  useEffect(() => {
    function actualizar(): void {
      setEnLinea(navigator.onLine);
    }
    window.addEventListener("online", actualizar);
    window.addEventListener("offline", actualizar);
    return () => {
      window.removeEventListener("online", actualizar);
      window.removeEventListener("offline", actualizar);
    };
  }, []);

  return enLinea;
}
