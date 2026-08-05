// apps/web/src/ui/BannerInstalarPwa.tsx — F4-A2, plan §5 estado 7: "PWA no
// instalada (aviso persistente con instrucciones que difieren entre Android
// e iOS)".
//
// role="status" + aria-live="polite", NUNCA role="alert": no hay riesgo real
// de pérdida de datos en no tener la app instalada (ese rol es de
// BannerPendientes en exclusiva, y la pantalla de conteo no admite un
// segundo `role="alert"` a la vez — plan §6). Sin botón de cerrar/descartar:
// el plan pide "aviso persistente" y el precedente de los otros banners de
// shell (BannerPersistenciaDegradada) tampoco lo lleva.
//
// iOS no tiene `beforeinstallprompt` ni prompt programático (doc 11 §7): la
// única vía real es Compartir → Añadir a pantalla de inicio. El plan pide
// "instrucciones ilustradas", pero no hay ninguna captura de iOS real y
// verificable en este repo para ilustrar — inventar un SVG que imite la UI
// de Apple sería una interfaz que no se puede verificar, así que esta rama
// queda en texto honesto (ver reporte final).
import { useInstalacionPwa } from "../state/useInstalacionPwa.js";

export function BannerInstalarPwa() {
  const { instalada, esIOS, puedeInstalar, instalar } = useInstalacionPwa();
  if (instalada) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-wrap items-center gap-3 border-b border-borde bg-placa px-3 py-2.5 text-base text-tinta"
    >
      {esIOS ? (
        <p>
          Instala esta app: toca <strong>Compartir</strong> y luego{" "}
          <strong>Añadir a pantalla de inicio</strong>.
        </p>
      ) : (
        <>
          <p>Instala esta app para mejor rendimiento y almacenamiento sin conexión.</p>
          {/* ponytail: sin `beforeinstallprompt` (navegador que no lo dispara,
              o Chrome que aún no decidió ofrecerlo) el aviso se queda en
              texto sin botón — el dispositivo objetivo es un Android con
              Chrome real (doc 06 §235), donde el evento sí llega. Si un
              cajero real usa un navegador que nunca lo dispara, escalar a un
              enlace "Cómo instalar" con los pasos manuales del menú. */}
          {puedeInstalar && (
            <button
              type="button"
              onClick={instalar}
              className="min-h-[var(--size-toque)] shrink-0 rounded-placa border border-senal px-4 font-semibold text-senal transition-colors duration-150 ease-out active:bg-placa-alta"
            >
              Instalar app
            </button>
          )}
        </>
      )}
    </div>
  );
}
