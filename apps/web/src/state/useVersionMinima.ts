// apps/web/src/state/useVersionMinima.ts — issue #12, D5/D8: una sola
// lectura de config/app (nunca onSnapshot), fail-open en ausencia/timeout/
// error/versión de build desconocida (R4-001). `activo` gatilla la consulta:
// `config/app` exige `autenticado()` (infra/firestore.rules), así que este
// hook sólo debe leerlo cuando ya hay un usuario real — antes de eso sería
// un permission-denied garantizado.
import { useEffect, useRef, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { requiereActualizacion } from "@conteo/shared";
import { db } from "../lib/firebase.js";

const TIMEOUT_MS = 5000;

interface EstadoVersionMinima {
  readonly bloqueado: boolean;
  readonly cargando: boolean;
}

export function useVersionMinima(
  activo: boolean,
  versionActual: string | null,
): EstadoVersionMinima {
  const consultable = activo && versionActual !== null;
  const [estado, setEstado] = useState<EstadoVersionMinima>({
    bloqueado: false,
    cargando: consultable,
  });
  const consultableAnterior = useRef(consultable);

  // R2-001: el inicializador de `useState` sólo corre en el primer mount. Si
  // `consultable` cambia en un render posterior (p.ej. la sesión resuelve),
  // sin este ajuste sincrónico el render devolvería el `estado` stale de
  // antes del cambio — dejando pasar la app protegida un frame optimista
  // antes de que el efecto siquiera arranque.
  if (consultable !== consultableAnterior.current) {
    consultableAnterior.current = consultable;
    setEstado({ bloqueado: false, cargando: consultable });
  }

  useEffect(() => {
    if (!consultable || versionActual === null) return;

    let cancelado = false;

    // Sin AbortController: el SDK de Firestore no lo soporta en getDoc(), así
    // que un timeout resuelve la carrera igual y `cancelado` sólo evita
    // pisar el estado si la respuesta real llega después (componente
    // desmontado o `activo` cambió de valor).
    const timeout = new Promise<undefined>((resolve) => {
      setTimeout(() => resolve(undefined), TIMEOUT_MS);
    });

    Promise.race([getDoc(doc(db, "config", "app")), timeout])
      .then((snap) => {
        if (cancelado) return;
        const minima = snap?.exists()
          ? (snap.data().versionMinima as string | undefined)
          : undefined;
        // D8: doc ausente, campo ausente, o timeout (snap === undefined) → sin bloqueo.
        const bloqueado = minima !== undefined && requiereActualizacion(versionActual, minima);
        setEstado({ bloqueado, cargando: false });
      })
      .catch(() => {
        // D8: lectura rechazada (offline, permiso denegado) → fail-open.
        if (!cancelado) setEstado({ bloqueado: false, cargando: false });
      });

    return () => {
      cancelado = true;
    };
  }, [consultable, versionActual]);

  return estado;
}
