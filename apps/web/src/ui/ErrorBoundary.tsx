// apps/web/src/ui/ErrorBoundary.tsx — issue #17. Una excepción no capturada
// durante el render de React desmonta el árbol entero y deja `#root` vacío: el
// cajero se queda con la pantalla en blanco a media jornada de conteo, sin
// ninguna salida dentro de la app. Se monta en main.tsx envolviendo el árbol,
// no ruta por ruta — mismo criterio que BloqueoVersionMinima.tsx.
import { Component, type ReactNode } from "react";

interface EstadoErrorBoundary {
  readonly fallo: boolean;
}

export class ErrorBoundary extends Component<
  { readonly children: ReactNode },
  EstadoErrorBoundary
> {
  override state: EstadoErrorBoundary = { fallo: false };

  static getDerivedStateFromError(): EstadoErrorBoundary {
    return { fallo: true };
  }

  // ponytail: sin `componentDidCatch` ni reporte remoto. No existe destino
  // donde reportar (issue #17, "Descartado": Analytics y Performance quedan
  // fuera de alcance mientras nadie se comprometa a leer el dashboard), y
  // React ya deja la excepción en la consola del navegador. Salida: el día que
  // exista ese lector, el gancho entra aquí y en ningún otro sitio.

  override render(): ReactNode {
    if (!this.state.fallo) return this.props.children;

    return (
      <div
        role="alert"
        className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-fondo px-4 text-center"
      >
        <p className="text-base text-tinta">
          No se pudo mostrar esta pantalla. Recarga la app y sigue contando: los aportes que ya
          confirmaste están guardados.
        </p>
        <button
          type="button"
          // El árbol que tenía el foco acaba de desmontarse, así que sin esto
          // el foco cae en <body> y quien navega con teclado o lector de
          // pantalla se queda sin ancla ni anuncio (mismo criterio que
          // primitivos/Hoja.tsx).
          autoFocus
          onClick={() => window.location.reload()}
          className="min-h-[var(--size-toque)] rounded-placa bg-senal px-4 font-semibold text-fondo transition-colors duration-150 ease-out active:bg-senal/85"
        >
          Recargar
        </button>
      </div>
    );
  }
}
