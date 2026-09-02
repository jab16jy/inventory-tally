// apps/web/src/ui/HojaAreas.tsx — ADR-22 (supersede parcial de ADR-21): el
// cajero REETIQUETA el área de cualquier línea cuya categoría siga sin
// `areaId` fijado en el catálogo, tantas veces como quiera, incluyendo volver
// a "Sin área" — nunca crea un área nueva (eso sigue siendo del admin). Una
// línea de categoría con `areaId` de catálogo (`areaFijaPorAdmin`) NO aparece
// aquí: queda intocable sin excepción. <dialog> nativo, mismo patrón que
// Hoja.tsx (foco atrapado, Escape y backdrop gratis) — nunca un componente de
// modal genérico, ADR-19 es explícito en que este repo usa <dialog> inline
// por consumidor.
//
// "Volver", nunca "Cerrar": la pantalla de conteo no puede tener un botón
// cuyo nombre accesible matchee /cerrar|descartar/i.
import { useEffect, useRef, useState } from "react";
import type { Area, LineaConteo } from "@conteo/shared";

export interface HojaAreasProps {
  readonly abierta: boolean;
  readonly lineasReetiquetables: readonly LineaConteo[];
  readonly areas: readonly Area[];
  // Mensaje del último rechazo de reetiquetarLineaEnSesion (quien nos monta
  // hace el try/catch — ver ConteoScreen.tsx), o null sin error pendiente.
  readonly error: string | null;
  readonly onReetiquetar: (categoriaId: string, areaId?: string) => void;
  readonly onVolver: () => void;
}

export function HojaAreas({
  abierta,
  lineasReetiquetables,
  areas,
  error,
  onReetiquetar,
  onVolver,
}: HojaAreasProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  // Qué línea tiene desplegados sus botones de área. Se resetea al abrir —
  // mismo criterio que HojaNuevoProducto: reabrir el diálogo no debe
  // arrastrar el despliegue de la vez anterior.
  const [categoriaDesplegada, setCategoriaDesplegada] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (abierta && !dialog.open) dialog.showModal();
    if (!abierta && dialog.open) dialog.close();
  }, [abierta]);

  useEffect(() => {
    if (abierta) setCategoriaDesplegada(null);
  }, [abierta]);

  return (
    <dialog
      ref={dialogRef}
      onClose={onVolver}
      onCancel={onVolver}
      aria-label="Reetiquetar área"
      className="fixed inset-x-0 top-auto bottom-0 m-0 w-full max-w-md rounded-t-placa border-t border-borde bg-placa-alta p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop:bg-fondo/70 open:flex open:flex-col open:gap-3"
    >
      <div className="flex items-center justify-between">
        <p className="text-medio font-semibold text-tinta">Reetiquetar área</p>
        <button type="button" onClick={onVolver} className="text-micro text-tenue underline">
          Volver
        </button>
      </div>

      {/* role="status" (nunca "alert"): mismo criterio que HojaNuevoProducto
          — BannerPendientes ya es el único role="alert" de la pantalla. */}
      {error && (
        <p role="status" aria-live="polite" className="text-micro text-riesgo">
          {error}
        </p>
      )}

      {lineasReetiquetables.length === 0 ? (
        <p className="text-micro text-tenue">No hay productos para reetiquetar.</p>
      ) : (
        <ul className="flex flex-col gap-2 overflow-y-auto">
          {lineasReetiquetables.map((linea) => (
            <li key={linea.categoriaId} className="list-none">
              <button
                type="button"
                onClick={() =>
                  setCategoriaDesplegada((actual) =>
                    actual === linea.categoriaId ? null : linea.categoriaId,
                  )
                }
                aria-expanded={categoriaDesplegada === linea.categoriaId}
                className="flex min-h-[var(--size-toque)] w-full flex-col items-start justify-center rounded-placa border border-borde px-3 text-left text-base text-tinta"
              >
                {linea.etiqueta}
                {/* Área vigente como contexto (ADR-22): el cajero ve a qué
                    área quedó etiquetada antes de decidir si la corrige. */}
                <span className="text-micro font-normal text-tenue">{linea.area}</span>
              </button>
              {categoriaDesplegada === linea.categoriaId && (
                <div className="mt-2 flex flex-wrap gap-2 pl-2">
                  {areas.map((area) => (
                    <button
                      key={area.areaId}
                      type="button"
                      onClick={() => onReetiquetar(linea.categoriaId, area.areaId)}
                      className="min-h-[var(--size-toque)] rounded-placa border border-senal px-3 text-micro font-semibold text-senal"
                    >
                      {area.nombre}
                    </button>
                  ))}
                  {/* ADR-22: volver explícitamente a "Sin área" — el mismo
                      hueco que abrirSesion deja, no un área más. */}
                  <button
                    type="button"
                    onClick={() => onReetiquetar(linea.categoriaId, undefined)}
                    className="min-h-[var(--size-toque)] rounded-placa border border-borde px-3 text-micro font-semibold text-tenue"
                  >
                    Quitar área
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </dialog>
  );
}
