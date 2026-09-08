// apps/web/src/ui/ModalActualizacionDisponible.test.tsx — F4-A2, plan §5
// estado 6: "Versión nueva disponible (bloqueo al arrancar)".
//
// `virtual:pwa-register/react` es un módulo virtual de Vite (lo registra el
// plugin VitePWA en tiempo de build/dev, no existe como archivo). Vitest no
// puede mockear con datos controlables algo que en modo test sólo resuelve
// al stub no-op de `vite-plugin-pwa/dist/client/dev/react.js` (needRefresh
// siempre en false) — así que se reemplaza con `vi.mock` para poder
// simular needRefresh=true por test.
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ModalActualizacionDisponible } from "./ModalActualizacionDisponible.js";

let necesitaActualizar = false;
const updateServiceWorker = vi.fn();

vi.mock("virtual:pwa-register/react", () => ({
  useRegisterSW: () => ({
    needRefresh: [necesitaActualizar, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker,
  }),
}));

describe("ModalActualizacionDisponible", () => {
  it("no bloquea cuando no hay actualización pendiente", () => {
    necesitaActualizar = false;
    render(<ModalActualizacionDisponible />);
    expect(screen.queryByText(/nueva versión/i)).not.toBeVisible();
  });

  it("bloquea con la nueva versión, sin role=alert (reservado a BannerPendientes)", () => {
    necesitaActualizar = true;
    render(<ModalActualizacionDisponible />);

    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.getByText(/nueva versión/i)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /cerrar|descartar/i })).not.toBeInTheDocument();
  });

  it("tocar Actualizar ahora activa el service worker en espera", () => {
    necesitaActualizar = true;
    render(<ModalActualizacionDisponible />);

    fireEvent.click(screen.getByRole("button", { name: /actualizar ahora/i }));
    expect(updateServiceWorker).toHaveBeenCalledWith(true);
  });

  it("el modal va centrado (m-auto: el preflight anula el margin:auto del UA)", () => {
    necesitaActualizar = true;
    render(<ModalActualizacionDisponible />);

    expect(screen.getByRole("dialog")).toHaveClass("m-auto");
  });

  it("NO bloquea si el cajero ya empezó a usar la app: el plan dice «al arrancar»", () => {
    // `needRefresh` se enciende cuando el service worker detecta la versión
    // nueva, y eso pasa en cualquier momento — no sólo al arrancar. Sin esta
    // regla, un cajero a mitad de conteo recibía un modal sin escape cuyo
    // único botón recarga la app, perdiendo los dígitos que aún no había
    // guardado. Es peor que el `autoUpdate` que este estado vino a
    // reemplazar. El service worker nuevo se queda en espera y el bloqueo
    // ocurre en el siguiente arranque, que es lo que el plan §5 pide.
    // `rerender` es necesario, no decorativo: `necesitaActualizar` es una
    // variable de módulo que el mock lee EN CADA render, así que cambiarla
    // sin volver a renderizar deja el test pasando sin ejercer nada.
    necesitaActualizar = false;
    const { rerender } = render(<ModalActualizacionDisponible />);

    fireEvent.pointerDown(document.body); // el cajero ya está trabajando
    necesitaActualizar = true;
    rerender(<ModalActualizacionDisponible />);

    expect(screen.getByText(/nueva versión/i)).not.toBeVisible();
  });

  it("sí bloquea si la actualización llega antes de que el cajero toque nada", () => {
    // Control positivo del test anterior: sin este caso, la regla de "no
    // interrumpir" podría estar apagando el modal SIEMPRE y nadie lo notaría.
    necesitaActualizar = false;
    const { rerender } = render(<ModalActualizacionDisponible />);

    necesitaActualizar = true;
    rerender(<ModalActualizacionDisponible />);

    expect(screen.getByText(/nueva versión/i)).toBeVisible();
  });
});
