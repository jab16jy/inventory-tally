// apps/web/src/ui/BannerInstalarPwa.test.tsx — F4-A2, plan §5 estado 7:
// "PWA no instalada" (aviso persistente, instrucciones distintas en Android
// e iOS). role="status", nunca role="alert": no hay riesgo real de pérdida
// de datos aquí (DESIGN.md, "Banners de riesgo").
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BannerInstalarPwa } from "./BannerInstalarPwa.js";

function mockMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }) as unknown as typeof window.matchMedia;
}

function mockStandaloneIOS(valor: boolean | undefined) {
  Object.defineProperty(navigator, "standalone", {
    configurable: true,
    value: valor,
  });
}

afterEach(() => {
  mockMatchMedia(false);
  mockStandaloneIOS(undefined);
});

describe("BannerInstalarPwa", () => {
  it("no aparece si la app ya corre instalada (display-mode: standalone)", () => {
    mockMatchMedia(true);
    render(<BannerInstalarPwa />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("en iOS sin instalar muestra las instrucciones de Compartir, nunca un botón de instalar", () => {
    mockMatchMedia(false);
    mockStandaloneIOS(false);
    render(<BannerInstalarPwa />);

    const aviso = screen.getByRole("status");
    expect(aviso).toHaveTextContent(/compartir/i);
    expect(aviso).toHaveTextContent(/añadir a pantalla de inicio/i);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("en Android/Chrome, tras beforeinstallprompt, ofrece el botón Instalar app", () => {
    mockMatchMedia(false);
    mockStandaloneIOS(undefined);
    render(<BannerInstalarPwa />);

    expect(screen.queryByRole("button", { name: /instalar/i })).not.toBeInTheDocument();

    const prompt = vi.fn().mockResolvedValue(undefined);
    const evento = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
      prompt,
    });
    fireEvent(window, evento);

    const boton = screen.getByRole("button", { name: /instalar app/i });
    fireEvent.click(boton);
    expect(prompt).toHaveBeenCalledOnce();
  });

  it("tras pedir la instalación, el botón desaparece: el evento es de un solo uso", () => {
    // `BeforeInstallPromptEvent` sólo admite UNA llamada a prompt(). Si el
    // evento se conserva tras usarlo, el botón sigue anunciando una acción
    // que ya no puede ejecutar: el cajero descarta el diálogo nativo, vuelve
    // a tocar "Instalar app" y no pasa nada — y como el resultado se
    // descartaba con `void`, el rechazo de la segunda llamada no aparecía ni
    // en consola. Desaparecer es más honesto que un botón muerto; si el
    // navegador vuelve a emitir el evento, el aviso vuelve solo.
    mockMatchMedia(false);
    mockStandaloneIOS(undefined);
    render(<BannerInstalarPwa />);

    const prompt = vi.fn().mockResolvedValue(undefined);
    fireEvent(
      window,
      Object.assign(new Event("beforeinstallprompt", { cancelable: true }), { prompt }),
    );

    fireEvent.click(screen.getByRole("button", { name: /instalar app/i }));

    expect(screen.queryByRole("button", { name: /instalar app/i })).not.toBeInTheDocument();
    expect(prompt).toHaveBeenCalledOnce();
  });

  it("no añade role=alert ni un botón de cerrar/descartar", () => {
    mockMatchMedia(false);
    mockStandaloneIOS(false);
    render(<BannerInstalarPwa />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /cerrar|descartar/i })).not.toBeInTheDocument();
  });
});
