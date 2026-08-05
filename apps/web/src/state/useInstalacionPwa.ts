// apps/web/src/state/useInstalacionPwa.ts — F4-A2, plan §5 estado 7: "PWA no
// instalada". Plataforma nativa, sin librería (doc 11 §7):
// `matchMedia("(display-mode: standalone)")` detecta instalada, y en iOS se
// suma `navigator.standalone` porque Safari no implementa display-mode ahí.
import { useEffect, useState } from "react";

/** Chrome/Android disparan este evento antes de ofrecer el prompt nativo de
 *  instalación. No es un estándar: no vive en lib.dom.d.ts. */
interface BeforeInstallPromptEvent extends Event {
  readonly prompt: () => Promise<void>;
}

function tieneStandaloneIOS(): boolean {
  return typeof (navigator as Navigator & { standalone?: boolean }).standalone === "boolean";
}

function detectarInstalada(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export interface EstadoInstalacionPwa {
  readonly instalada: boolean;
  /** true sólo en Safari iOS: ahí NO existe `beforeinstallprompt` ni prompt
   *  programático — la única vía es Compartir → Añadir a pantalla de inicio
   *  (doc 11 §7). */
  readonly esIOS: boolean;
  /** El navegador ya capturó el evento de instalación (Chrome/Android); su
   *  sola presencia es lo que habilita el botón. */
  readonly puedeInstalar: boolean;
  readonly instalar: () => void;
}

export function useInstalacionPwa(): EstadoInstalacionPwa {
  const [instalada, setInstalada] = useState(detectarInstalada);
  const [evento, setEvento] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const mql = window.matchMedia("(display-mode: standalone)");
    const actualizar = () => setInstalada(detectarInstalada());
    mql.addEventListener("change", actualizar);

    function capturarPrompt(e: Event) {
      e.preventDefault();
      setEvento(e as BeforeInstallPromptEvent);
    }
    window.addEventListener("beforeinstallprompt", capturarPrompt);

    function marcarInstalada() {
      setInstalada(true);
      setEvento(null);
    }
    window.addEventListener("appinstalled", marcarInstalada);

    return () => {
      mql.removeEventListener("change", actualizar);
      window.removeEventListener("beforeinstallprompt", capturarPrompt);
      window.removeEventListener("appinstalled", marcarInstalada);
    };
  }, []);

  return {
    instalada,
    esIOS: tieneStandaloneIOS(),
    puedeInstalar: evento !== null,
    // El evento se suelta ANTES de usarlo, no después:
    // `BeforeInstallPromptEvent` sólo admite una llamada a `prompt()`, y
    // conservarlo dejaba el botón anunciando una acción que ya no podía
    // ejecutar — el cajero descarta el diálogo nativo, vuelve a tocar
    // "Instalar app" y no ocurre nada, con el rechazo de la segunda llamada
    // tragado por el `void`. Sólo `appinstalled` lo limpiaba, y ése no
    // llega justamente cuando la persona descarta. Que el aviso desaparezca
    // es más honesto que un botón muerto; si el navegador vuelve a emitir
    // el evento, `capturarPrompt` lo recaptura y el aviso vuelve solo.
    instalar: () => {
      if (!evento) return;
      setEvento(null);
      void evento.prompt();
    },
  };
}
