// apps/web/src/ui/admin/CatalogoScreen.tsx — Unidad 1.3: fusiona
// CategoriasScreen y AreasScreen en una sola ruta como pestañas. Ambas
// pantallas se montan tal cual, sin extraer nada de ninguna de las dos.
//
// Accesibilidad: patrón de pestañas ARIA completo — role="tablist"/"tab" con
// aria-selected, y el contenido envuelto en role="tabpanel" asociado por
// aria-controls/aria-labelledby. Media pestaña (tab sin panel) anuncia un
// control que no lleva a ninguna parte, así que el panel no es opcional.
// No se usa aria-pressed: eso es para toggles independientes (como el filtro
// "Pendientes" de ConteoScreen), no para una selección excluyente.
//
// ponytail: sin roving tabindex ni navegación por flechas — son DOS
// pestañas y Tab las alcanza. Añadir el roving si el catálogo crece a
// cuatro o más.
import { useState } from "react";
import { AreasScreen } from "./AreasScreen.js";
import { CategoriasScreen } from "./CategoriasScreen.js";

type Pestana = "categorias" | "areas";

const PESTANAS: { readonly clave: Pestana; readonly etiqueta: string }[] = [
  { clave: "categorias", etiqueta: "Categorías" },
  { clave: "areas", etiqueta: "Áreas" },
];

export function CatalogoScreen() {
  const [pestana, setPestana] = useState<Pestana>("categorias");

  return (
    <div>
      <div
        role="tablist"
        aria-label="Catálogo"
        className="flex gap-2 border-b border-borde px-6 pt-4"
      >
        {PESTANAS.map(({ clave, etiqueta }) => (
          <button
            key={clave}
            id={`pestana-${clave}`}
            type="button"
            role="tab"
            aria-selected={pestana === clave}
            aria-controls={`panel-${clave}`}
            onClick={() => setPestana(clave)}
            className={
              "flex min-h-[var(--size-toque)] items-center border-b-2 px-3 text-micro font-semibold " +
              (pestana === clave ? "border-senal text-senal" : "border-transparent text-tenue")
            }
          >
            {etiqueta}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`panel-${pestana}`}
        aria-labelledby={`pestana-${pestana}`}
        tabIndex={0}
      >
        {pestana === "categorias" ? (
          <CategoriasScreen />
        ) : (
          <AreasScreen onIrACategorias={() => setPestana("categorias")} />
        )}
      </div>
    </div>
  );
}
