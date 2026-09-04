// apps/web/src/state/useAreasActivas.ts
// Promovido desde ConteoScreen.tsx (antes local, "un solo consumidor"): con
// el área activa obligatoria (ADR-23) hay tres consumidores —
// PrepararScreen (elegir), ConteoScreen (preseleccionar en "+ Producto") y
// AnalisisConteoScreen/FinalizarScreen (resolver id → nombre) — y un hook de
// ~6 líneas no vale la pena triplicar.
import { useEffect, useState } from "react";
import type { Area } from "@conteo/shared";
import type { ConteoRepository } from "@conteo/data";

/** `cargado` distingue "todavía no llegó el primer snapshot" de "catálogo
 *  sin áreas" — ambos arrancan en `[]`. PrepararScreen lo necesita para no
 *  habilitar "Empezar a contar" durante la ventana de carga (ADR-23); los
 *  demás consumidores sólo resuelven nombres y toleran el valor transitorio.
 *
 * ponytail: `observarAreasActivas` (igual que el resto de los listeners de
 * `FirestoreConteoRepository`) no tiene callback de error — si el listener
 * jamás emite (permiso revocado a mitad de sesión, o primera carga en frío
 * sin red y sin caché), `cargado` se queda en `false` para siempre y el
 * botón de PrepararScreen queda deshabilitado sin explicación. Mismo techo
 * que ya tiene "Cargando catálogo…" en esa misma pantalla — no es nuevo de
 * este hook. Ruta de escalamiento: manejo de errores de onSnapshot a nivel
 * de repositorio, no parcheado hook por hook. */
export function useAreasActivas(repo: ConteoRepository): readonly [Area[], boolean] {
  const [areas, setAreas] = useState<Area[]>([]);
  const [cargado, setCargado] = useState(false);
  useEffect(
    () =>
      repo.observarAreasActivas((a) => {
        setAreas(a);
        setCargado(true);
      }),
    [repo],
  );
  return [areas, cargado] as const;
}
