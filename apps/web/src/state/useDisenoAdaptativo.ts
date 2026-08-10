// apps/web/src/state/useDisenoAdaptativo.ts — issue #20 item 1: los 3
// breakpoints del panel admin (doc 11 §298-304: <600px bottom-nav/tarjetas,
// 600–1024px sidebar de íconos, >1024px sidebar completo). AdminLayout.tsx y
// Tabla.tsx comparten este único hook en vez de repetir los dos umbrales
// (600, 1024) cada uno por su lado.
//
// `window.innerWidth` + evento `resize`, no `matchMedia` (a diferencia de
// useInstalacionPwa.ts): aquí cada rama monta un DOM distinto (sidebar vs.
// nav inferior, tabla vs. tarjetas), y el stub de test-setup.ts para
// `matchMedia` devuelve `matches: false` por defecto en TODOS los tests que
// no lo reasignan — eso habría forzado "móvil" por defecto en cada test
// existente de Tabla/AdminLayout. `innerWidth` no tiene ese problema: jsdom
// arranca en 1024, el mismo ancho de escritorio que ya asumían esos tests.
import { useEffect, useState } from "react";

export type DisenoAdaptativo = "movil" | "tablet" | "escritorio";

function calcular(ancho: number): DisenoAdaptativo {
  if (ancho < 600) return "movil";
  if (ancho < 1024) return "tablet";
  return "escritorio";
}

export function useDisenoAdaptativo(): DisenoAdaptativo {
  const [diseno, setDiseno] = useState<DisenoAdaptativo>(() => calcular(window.innerWidth));

  useEffect(() => {
    function actualizar(): void {
      setDiseno(calcular(window.innerWidth));
    }
    window.addEventListener("resize", actualizar);
    return () => window.removeEventListener("resize", actualizar);
  }, []);

  return diseno;
}
