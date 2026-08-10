// apps/web/src/state/useDisenoAdaptativo.test.ts — issue #20 item 1, doc 11
// §298-304: los 3 breakpoints del panel admin.
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useDisenoAdaptativo } from "./useDisenoAdaptativo.js";

const ANCHO_ORIGINAL = window.innerWidth;

function fijarAncho(ancho: number): void {
  Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: ancho });
}

afterEach(() => {
  fijarAncho(ANCHO_ORIGINAL);
});

describe("useDisenoAdaptativo (doc 11 §298-304)", () => {
  it("< 600px es 'movil'", () => {
    fijarAncho(375);
    const { result } = renderHook(() => useDisenoAdaptativo());
    expect(result.current).toBe("movil");
  });

  it("599px sigue siendo 'movil' (límite excluyente)", () => {
    fijarAncho(599);
    const { result } = renderHook(() => useDisenoAdaptativo());
    expect(result.current).toBe("movil");
  });

  it("entre 600 y 1024px es 'tablet'", () => {
    fijarAncho(800);
    const { result } = renderHook(() => useDisenoAdaptativo());
    expect(result.current).toBe("tablet");
  });

  it("1024px ya es 'escritorio' (el límite pertenece al tramo de arriba)", () => {
    fijarAncho(1024);
    const { result } = renderHook(() => useDisenoAdaptativo());
    expect(result.current).toBe("escritorio");
  });

  it("> 1024px es 'escritorio'", () => {
    fijarAncho(1440);
    const { result } = renderHook(() => useDisenoAdaptativo());
    expect(result.current).toBe("escritorio");
  });

  it("reacciona a un cambio de tamaño de ventana en vivo", () => {
    fijarAncho(1440);
    const { result } = renderHook(() => useDisenoAdaptativo());
    expect(result.current).toBe("escritorio");

    act(() => {
      fijarAncho(375);
      window.dispatchEvent(new Event("resize"));
    });

    expect(result.current).toBe("movil");
  });
});
