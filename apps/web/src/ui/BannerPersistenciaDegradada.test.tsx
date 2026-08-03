import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { instalarMonitorPersistencia } from "../lib/persistencia-monitor.js";
import { BannerPersistenciaDegradada } from "./BannerPersistenciaDegradada.js";

describe("BannerPersistenciaDegradada", () => {
  it("no muestra nada mientras la persistencia funciona normalmente", () => {
    const monitor = instalarMonitorPersistencia({ warn: vi.fn() });
    render(<BannerPersistenciaDegradada monitor={monitor} />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("muestra un aviso visible cuando el SDK degrada a caché en memoria", () => {
    const consolaFalsa = { warn: vi.fn() };
    const monitor = instalarMonitorPersistencia(consolaFalsa);
    render(<BannerPersistenciaDegradada monitor={monitor} />);

    act(() => {
      consolaFalsa.warn(
        "Error using user provided cache. Falling back to memory cache: cuota excedida",
      );
    });

    expect(screen.getByRole("alert")).toHaveTextContent(/no pudo guardar/i);
  });
});
