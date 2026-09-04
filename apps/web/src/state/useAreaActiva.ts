// apps/web/src/state/useAreaActiva.ts (ADR-23)
// Área activa que el contador elige al entrar a la sesión — persistida en
// localStorage por sesionId para sobrevivir a recargar/reabrir la PWA sin
// volver a preguntar cada vez.
import { useCallback, useEffect, useState } from "react";

function clave(sesionId: string): string {
  return `areaActiva:${sesionId}`;
}

export function useAreaActiva(sesionId: string): readonly [string, (areaId: string) => void] {
  // Inicializador perezoso, NO useEffect: localStorage.getItem es síncrono,
  // así que diferirlo a un efecto deja el primer render con areaActiva=""
  // durante un instante — issue #86 (revisión de resiliencia) encontró
  // exactamente esa ventana: ConteoScreen redirige a /preparar en ese primer
  // render, antes de que el efecto alcance a corregir el valor.
  const [areaActiva, setAreaActivaState] = useState(
    () => localStorage.getItem(clave(sesionId)) ?? "",
  );

  // sesionId SÍ puede cambiar sin que el componente se remonte (React Router
  // reutiliza la instancia al cambiar sólo el parámetro de ruta, mismo caso
  // que ya resolvió ConteoScreenPorSesion) — el inicializador perezoso de
  // arriba sólo corre una vez, así que este efecto releé en cada cambio.
  useEffect(() => {
    setAreaActivaState(localStorage.getItem(clave(sesionId)) ?? "");
  }, [sesionId]);

  const setAreaActiva = useCallback(
    (areaId: string) => {
      localStorage.setItem(clave(sesionId), areaId);
      setAreaActivaState(areaId);
    },
    [sesionId],
  );

  return [areaActiva, setAreaActiva] as const;
}
