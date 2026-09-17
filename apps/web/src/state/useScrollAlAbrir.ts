// apps/web/src/state/useScrollAlAbrir.ts — el formulario de crear/editar se
// pinta arriba del <section> (AreasScreen/CategoriasScreen/CajerosScreen/
// SucursalesAdminScreen.tsx), pero quien scrollea es el <main
// overflow-y-auto> de AdminLayout.tsx, no la ventana: con muchas filas el
// admin queda mirando la tabla y no ve que el formulario ya se abrió.
// scrollIntoView() sube por los ancestros hasta encontrar el que scrollea,
// así que no hace falta saber cuál es desde acá.
import { useEffect, useRef, type RefObject } from "react";

export function useScrollAlAbrir<T extends HTMLElement>(abierto: boolean): RefObject<T | null> {
  const ref = useRef<T>(null);

  useEffect(() => {
    // jsdom (tests) no implementa scrollIntoView — el `?.` evita que truene.
    if (abierto) ref.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }, [abierto]);

  return ref;
}
