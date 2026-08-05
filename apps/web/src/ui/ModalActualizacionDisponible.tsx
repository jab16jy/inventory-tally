// apps/web/src/ui/ModalActualizacionDisponible.tsx — F4-A2, plan §5 estado 6:
// "Versión nueva disponible (bloqueo al arrancar)".
//
// `registerType` pasó de "autoUpdate" a "prompt" en vite.config.ts: con
// autoUpdate el service worker se actualiza y recarga la pestaña SOLO, sin
// avisar — puede recargarle la app al cajero a mitad de conteo y perder lo
// que aún no sincronizó (RNF-12). Con "prompt", `useRegisterSW` deja el SW
// nuevo en `waiting` y expone `needRefresh`; el cajero decide cuándo.
//
// <dialog> nativo con showModal(), mismo patrón que ModalSesionCerrada.tsx:
// se ignora `cancel` (Escape) a propósito — contar contra una versión vieja
// del código es el mismo tipo de riesgo silencioso que ese modal ya resuelve
// para la sesión cerrada por el admin, así que la única salida es el botón.
//
// Nombre accesible del botón: "Actualizar ahora", nunca "Cerrar" — misma
// restricción dura de ConteoScreen.test.tsx. Tampoco lleva role="alert": ese
// rol es de BannerPendientes en exclusiva (único riesgo real de pérdida de
// datos), y sólo puede haber uno visible a la vez.
import { useEffect, useRef } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

export function ModalActualizacionDisponible() {
  const {
    needRefresh: [necesitaActualizar],
    updateServiceWorker,
  } = useRegisterSW();
  const dialogRef = useRef<HTMLDialogElement>(null);
  // "AL ARRANCAR" es la mitad importante de la frase del plan. `needRefresh`
  // se enciende cuando el service worker detecta la versión nueva, y eso
  // ocurre en cualquier momento, no sólo al abrir la app. Sin esta regla, un
  // cajero a mitad de conteo recibía un modal sin escape cuyo único botón
  // recarga la pestaña: perdía los dígitos que aún no había guardado, y era
  // PEOR que el `autoUpdate` que este estado vino a reemplazar. Si ya empezó
  // a trabajar, el service worker nuevo se queda en espera y el bloqueo cae
  // en el siguiente arranque, que es exactamente lo que el plan pide.
  const yaTrabajaba = useRef(false);

  useEffect(() => {
    const marcar = () => {
      yaTrabajaba.current = true;
    };
    // `pointerdown` y `keydown` cubren el dedo con guante y el teclado; se
    // escuchan una sola vez porque sólo interesa el primer contacto.
    document.addEventListener("pointerdown", marcar, { once: true });
    document.addEventListener("keydown", marcar, { once: true });
    return () => {
      document.removeEventListener("pointerdown", marcar);
      document.removeEventListener("keydown", marcar);
    };
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (necesitaActualizar && !yaTrabajaba.current && !dialog.open) dialog.showModal();
    if (!necesitaActualizar && dialog.open) dialog.close();
  }, [necesitaActualizar]);

  return (
    <dialog
      ref={dialogRef}
      onCancel={(e) => e.preventDefault()}
      aria-label="Actualización disponible"
      className="w-[calc(100%-1.5rem)] max-w-sm rounded-placa border border-borde bg-placa-alta p-4 backdrop:bg-fondo/70"
    >
      <p className="text-base text-tinta">
        Hay una nueva versión de la app. Actualiza para seguir contando sin errores.
      </p>
      <button
        type="button"
        onClick={() => void updateServiceWorker(true)}
        className="mt-4 min-h-[var(--size-toque)] w-full rounded-placa bg-senal font-semibold text-fondo transition-colors duration-150 ease-out active:bg-senal/85"
      >
        Actualizar ahora
      </button>
    </dialog>
  );
}
