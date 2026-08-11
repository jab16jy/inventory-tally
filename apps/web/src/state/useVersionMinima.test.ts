// apps/web/src/state/useVersionMinima.test.ts — issue #12: lectura única de
// config/app, fail-open (D8) en inactivo/ausencia/error/versión de build
// desconocida (R4-001), y corrección del render optimista (R2-001).
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const getDoc = vi.fn();

vi.mock("firebase/firestore", () => ({
  doc: (...args: unknown[]) => args,
  getDoc: (...args: unknown[]) => (getDoc as (...a: unknown[]) => unknown)(...args),
}));

vi.mock("../lib/firebase.js", () => ({ db: {} }));

const { useVersionMinima } = await import("./useVersionMinima.js");

describe("useVersionMinima (issue #12)", () => {
  it("inactivo (sin usuario autenticado): no consulta Firestore, sin bloqueo", () => {
    const { result } = renderHook(() => useVersionMinima(false, "1.0.0"));
    expect(result.current).toEqual({ bloqueado: false, cargando: false });
    expect(getDoc).not.toHaveBeenCalled();
  });

  it("sin versión de build conocida (build sin tag exacto): no consulta, sin bloqueo (R4-001)", () => {
    const { result } = renderHook(() => useVersionMinima(true, null));
    expect(result.current).toEqual({ bloqueado: false, cargando: false });
    expect(getDoc).not.toHaveBeenCalled();
  });

  it("doc config/app inexistente → sin bloqueo (D8)", async () => {
    getDoc.mockResolvedValueOnce({ exists: () => false, data: () => undefined });
    const { result } = renderHook(() => useVersionMinima(true, "1.0.0"));

    await waitFor(() => expect(result.current.cargando).toBe(false));
    expect(result.current.bloqueado).toBe(false);
  });

  it("versionMinima mayor a la actual → bloquea", async () => {
    getDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ versionMinima: "999.0.0" }),
    });
    const { result } = renderHook(() => useVersionMinima(true, "1.0.0"));

    await waitFor(() => expect(result.current.cargando).toBe(false));
    expect(result.current.bloqueado).toBe(true);
  });

  it("getDoc rechaza (offline, permiso denegado) → sin bloqueo (D8, fail-open)", async () => {
    getDoc.mockRejectedValueOnce(new Error("offline"));
    const { result } = renderHook(() => useVersionMinima(true, "1.0.0"));

    await waitFor(() => expect(result.current.cargando).toBe(false));
    expect(result.current.bloqueado).toBe(false);
  });

  it("activo pasa de false a true entre renders: no deja pasar un render optimista (R2-001)", async () => {
    getDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ versionMinima: "999.0.0" }),
    });
    const { result, rerender } = renderHook(({ activo }) => useVersionMinima(activo, "1.0.0"), {
      initialProps: { activo: false },
    });
    expect(result.current).toEqual({ bloqueado: false, cargando: false });

    rerender({ activo: true });
    // El mismo render que activa `activo` ya debe reflejar `cargando: true`
    // — nunca la app protegida optimista mientras la lectura está en curso.
    expect(result.current.cargando).toBe(true);

    await waitFor(() => expect(result.current.cargando).toBe(false));
    expect(result.current.bloqueado).toBe(true);
  });
});
