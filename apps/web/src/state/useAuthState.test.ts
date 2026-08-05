// apps/web/src/state/useAuthState.test.ts (F3-A) — el hook lee el claim
// `sucursales` además de `rol`. No toca guardas.test.ts (protegido): ese
// archivo construye literales UsuarioAutenticado a mano y no pasa por este
// hook.
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const onAuthStateChanged = vi.fn();

vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (...args: unknown[]) =>
    (onAuthStateChanged as (...a: unknown[]) => unknown)(...args),
}));

const { useAuthState } = await import("./useAuthState.js");

function usuarioFake(claims: Record<string, unknown>) {
  return {
    uid: "uid_ana",
    displayName: "Ana Ramírez",
    getIdTokenResult: () => Promise.resolve({ claims }),
  };
}

describe("useAuthState — claim `sucursales` (F3-A)", () => {
  it("normaliza el claim `sucursales` a un array de strings", async () => {
    onAuthStateChanged.mockImplementation((_auth: unknown, cb: (u: unknown) => void) => {
      cb(usuarioFake({ rol: "cajero", sucursales: ["suc_norte", "suc_centro"] }));
      return () => {};
    });

    const { result } = renderHook(() => useAuthState({} as never));

    await waitFor(() => expect(result.current).not.toBeUndefined());
    expect(result.current?.sucursales).toEqual(["suc_norte", "suc_centro"]);
  });

  it("normaliza a [] cuando el claim está ausente (límite de confianza: no asumir presencia)", async () => {
    onAuthStateChanged.mockImplementation((_auth: unknown, cb: (u: unknown) => void) => {
      cb(usuarioFake({ rol: "cajero" }));
      return () => {};
    });

    const { result } = renderHook(() => useAuthState({} as never));

    await waitFor(() => expect(result.current).not.toBeUndefined());
    expect(result.current?.sucursales).toEqual([]);
  });

  it("normaliza a [] cuando el claim no es un array (tipo inesperado, los claims son `unknown`)", async () => {
    onAuthStateChanged.mockImplementation((_auth: unknown, cb: (u: unknown) => void) => {
      cb(usuarioFake({ rol: "cajero", sucursales: "suc_norte" }));
      return () => {};
    });

    const { result } = renderHook(() => useAuthState({} as never));

    await waitFor(() => expect(result.current).not.toBeUndefined());
    expect(result.current?.sucursales).toEqual([]);
  });

  it("filtra elementos que no son string dentro del array del claim", async () => {
    onAuthStateChanged.mockImplementation((_auth: unknown, cb: (u: unknown) => void) => {
      cb(usuarioFake({ rol: "cajero", sucursales: ["suc_norte", 42, null] }));
      return () => {};
    });

    const { result } = renderHook(() => useAuthState({} as never));

    await waitFor(() => expect(result.current).not.toBeUndefined());
    expect(result.current?.sucursales).toEqual(["suc_norte"]);
  });
});
