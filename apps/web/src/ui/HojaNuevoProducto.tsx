// apps/web/src/ui/HojaNuevoProducto.tsx — ADR-21: el cajero puede dar de
// alta un producto nuevo dentro de su propia sesión (crearCategoriaEnSesion
// nunca fija valorUnitario, eso lo hace el admin después).
//
// <dialog> nativo con DOS VISTAS DENTRO DEL MISMO DIÁLOGO — precedente
// documentado en Hoja.tsx (F4-A1, confirmación suave de cantidad absurda):
// "sustituye el teclado por una segunda vista, nunca un segundo <dialog>".
// Aquí la segunda vista confirma la creación antes de escribir (doc 11 §10,
// "Producto creado por error o duplicado").
//
// "Corregir", nunca "Cancelar": no cancela el conteo, vuelve al formulario
// con el nombre tecleado intacto. role="status", nunca "alert": la pantalla
// de conteo admite un solo role="alert" a la vez, reservado a
// BannerPendientes.
import { useEffect, useId, useRef, useState } from "react";
import { FirebaseError } from "firebase/app";
import type { Area } from "@conteo/shared";
import { Spinner } from "./primitivos/Spinner.js";

/**
 * mensajeDeError — antes esta pantalla descartaba el error real en el
 * `catch` y mostraba siempre el mismo texto genérico, sin importar la causa
 * (ni un `console.error` para depurar). Diferencia los dos códigos que
 * `crearCategoriaEnSesionImpl` puede rechazar sobre el área elegida
 * (packages/functions/src/callables/crear-categoria-en-sesion.ts) — el resto
 * (red, sesión cerrada, etc.) cae al mensaje genérico, que sigue siendo
 * honesto para una causa no reconocida.
 */
function mensajeDeError(error: unknown): string {
  if (error instanceof FirebaseError) {
    if (error.code === "functions/not-found") {
      return "El área elegida ya no existe. Elige otra o deja «Sin área».";
    }
    if (error.code === "functions/failed-precondition") {
      return "El área elegida ya no está activa. Elige otra o deja «Sin área».";
    }
  }
  return "No se pudo crear el producto. Intenta de nuevo.";
}

export interface HojaNuevoProductoProps {
  readonly abierta: boolean;
  readonly areas: readonly Area[];
  readonly onCrear: (etiqueta: string, areaId?: string) => Promise<void>;
  readonly onVolver: () => void;
}

const CAMPO =
  "w-full min-h-[var(--size-toque)] rounded-placa border border-borde bg-fondo px-3 " +
  "text-tinta placeholder:text-tenue focus:border-senal focus:outline-none";

export function HojaNuevoProducto({ abierta, areas, onCrear, onVolver }: HojaNuevoProductoProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [etiqueta, setEtiqueta] = useState("");
  const [areaId, setAreaId] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idEtiqueta = useId();
  const idArea = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (abierta && !dialog.open) dialog.showModal();
    if (!abierta && dialog.open) dialog.close();
  }, [abierta]);

  // Se resetea al ABRIR, no en cada render: quien nos monta cierra el
  // diálogo tras crear con éxito (ConteoScreen), así que reabrirlo siempre
  // parte de un formulario en blanco en vez de arrastrar el producto
  // anterior.
  useEffect(() => {
    if (abierta) {
      setEtiqueta("");
      setAreaId("");
      setConfirmando(false);
      setEnviando(false);
      setError(null);
    }
  }, [abierta]);

  function continuar(): void {
    if (!etiqueta.trim()) return;
    setError(null);
    setConfirmando(true);
  }

  function corregir(): void {
    // El texto tecleado queda intacto: si "Corregir" lo borrara, el cajero
    // reescribe todo — es justo lo que lo distingue de "Volver".
    setConfirmando(false);
  }

  async function confirmarCreacion(): Promise<void> {
    setEnviando(true);
    setError(null);
    try {
      await onCrear(etiqueta.trim(), areaId || undefined);
      // Sin cerrar aquí: quien nos monta decide (cambia `abierta` a false),
      // igual que Hoja.tsx delega el avance a quien la monta.
    } catch (error) {
      // Antes se descartaba silenciosamente: sin esto, un 400/403 real del
      // servidor no dejaba ningún rastro para depurar.
      console.error("crearCategoriaEnSesion falló", error);
      setError(mensajeDeError(error));
      setEnviando(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onVolver}
      onCancel={onVolver}
      aria-label="Nuevo producto"
      className="fixed inset-x-0 top-auto bottom-0 m-0 w-full max-w-md rounded-t-placa border-t border-borde bg-placa-alta p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop:bg-fondo/70 open:flex open:flex-col open:gap-3"
    >
      {confirmando ? (
        // role="status" (nunca "alert"): mismo criterio que la confirmación
        // suave de Hoja.tsx — es una confirmación, no una alerta, y el
        // banner de pendientes ya es el único role="alert" de la pantalla.
        <div role="status" aria-live="polite" className="flex flex-col gap-3">
          <p className="text-base text-tinta">¿Crear el producto «{etiqueta.trim()}»?</p>
          {error && <p className="text-micro text-riesgo">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={corregir}
              disabled={enviando}
              className="min-h-[var(--size-toque)] flex-1 rounded-placa border border-borde text-medio font-semibold text-tinta active:border-senal active:bg-fondo"
            >
              Corregir
            </button>
            <button
              type="button"
              onClick={() => void confirmarCreacion()}
              disabled={enviando}
              className="flex min-h-[var(--size-toque)] flex-1 items-center justify-center gap-1.5 rounded-placa border border-senal bg-senal text-medio font-semibold text-fondo disabled:opacity-60"
            >
              {enviando && <Spinner className="size-4 shrink-0" />}
              Sí, crear
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-medio font-semibold text-tinta">Nuevo producto</p>
            <button type="button" onClick={onVolver} className="text-micro text-tenue underline">
              Volver
            </button>
          </div>

          <div>
            <label htmlFor={idEtiqueta} className="mb-1.5 block text-micro text-tenue">
              Nombre
            </label>
            <input
              id={idEtiqueta}
              type="text"
              value={etiqueta}
              onChange={(e) => setEtiqueta(e.target.value)}
              placeholder="p. ej. Bolsas"
              className={CAMPO}
            />
          </div>

          <div>
            <label htmlFor={idArea} className="mb-1.5 block text-micro text-tenue">
              Área
            </label>
            <select
              id={idArea}
              value={areaId}
              onChange={(e) => setAreaId(e.target.value)}
              className={CAMPO}
            >
              <option value="">Sin área</option>
              {areas.map((area) => (
                <option key={area.areaId} value={area.areaId}>
                  {area.nombre}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={continuar}
            disabled={!etiqueta.trim()}
            className={
              "min-h-[var(--size-toque)] w-full rounded-placa font-semibold transition-colors duration-150 ease-out " +
              (etiqueta.trim()
                ? "bg-senal text-fondo active:bg-senal/85"
                : "bg-senal/40 text-fondo/70")
            }
          >
            Continuar
          </button>
        </div>
      )}
    </dialog>
  );
}
