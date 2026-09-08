// apps/web/src/ui/ModalSesionCerrada.tsx — F4-A1, doc 11 §5: "Sesión cerrada
// por el admin" → "⚫ Modal bloqueante + salida" (`estado != 'abierta'`).
// Hoy el cajero no se entera y sigue registrando aportes contra una sesión
// que ya no acepta escrituras (bug real que cierra esta ola).
//
// <dialog> nativo con showModal() — mismo patrón que Hoja.tsx (plan §3): el
// resto del árbol queda inerte mientras está abierto, así que ningún +/- de
// fila puede seguir escribiendo mientras el modal está encima, sin
// deshabilitar cada control a mano. Se ignora `cancel` (tecla Escape) a
// propósito: la ÚNICA salida es el botón, nunca un descarte silencioso que
// deje al cajero de vuelta en una pantalla que ya no sirve para nada.
//
// Nombre accesible del botón: "Salir", nunca "Cerrar" — restricción dura de
// ConteoScreen.test.tsx (ningún botón ahí puede matchear /cerrar|descartar/i).
// Tampoco lleva role="alert": ese rol está reservado a BannerPendientes (el
// único riesgo real de pérdida de datos de la pantalla) y la restricción es
// UN SOLO role="alert" a la vez.
import { useEffect, useRef } from "react";

export interface ModalSesionCerradaProps {
  readonly abierta: boolean;
  readonly onSalir: () => void;
}

export function ModalSesionCerrada({ abierta, onSalir }: ModalSesionCerradaProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (abierta && !dialog.open) dialog.showModal();
    if (!abierta && dialog.open) dialog.close();
  }, [abierta]);

  return (
    <dialog
      ref={dialogRef}
      onCancel={(e) => e.preventDefault()}
      aria-label="Sesión cerrada"
      className="m-auto w-[calc(100%-1.5rem)] max-w-sm rounded-placa border border-borde bg-placa-alta p-4 backdrop:bg-fondo/70"
    >
      <p className="text-base text-tinta">
        El administrador cerró esta sesión. Ya no puedes registrar más conteos aquí.
      </p>
      <button
        type="button"
        onClick={onSalir}
        className="mt-4 min-h-[var(--size-toque)] w-full rounded-placa bg-senal font-semibold text-fondo transition-colors duration-150 ease-out active:bg-senal/85"
      >
        Salir
      </button>
    </dialog>
  );
}
