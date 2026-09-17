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

describe("useAuthState — claim `rol` y `esAdmin` (D8/S5a)", () => {
  it("expone el claim rol cuando es un string", async () => {
    onAuthStateChanged.mockImplementation((_auth: unknown, cb: (u: unknown) => void) => {
      cb(usuarioFake({ rol: "admin_sucursal", sucursales: ["suc_norte"] }));
      return () => {};
    });

    const { result } = renderHook(() => useAuthState({} as never));

    await waitFor(() => expect(result.current).not.toBeUndefined());
    expect(result.current?.rol).toBe("admin_sucursal");
  });

  it("normaliza rol a undefined cuando el claim está ausente", async () => {
    onAuthStateChanged.mockImplementation((_auth: unknown, cb: (u: unknown) => void) => {
      cb(usuarioFake({ sucursales: ["suc_norte"] }));
      return () => {};
    });

    const { result } = renderHook(() => useAuthState({} as never));

    await waitFor(() => expect(result.current).not.toBeUndefined());
    expect(result.current?.rol).toBeUndefined();
  });

  it("normaliza rol a undefined cuando el claim no es string", async () => {
    onAuthStateChanged.mockImplementation((_auth: unknown, cb: (u: unknown) => void) => {
      cb(usuarioFake({ rol: 123, sucursales: ["suc_norte"] }));
      return () => {};
    });

    const { result } = renderHook(() => useAuthState({} as never));

    await waitFor(() => expect(result.current).not.toBeUndefined());
    expect(result.current?.rol).toBeUndefined();
  });

  it("calcula esAdmin = true para rol 'admin'", async () => {
    onAuthStateChanged.mockImplementation((_auth: unknown, cb: (u: unknown) => void) => {
      cb(usuarioFake({ rol: "admin" }));
      return () => {};
    });

    const { result } = renderHook(() => useAuthState({} as never));

    await waitFor(() => expect(result.current).not.toBeUndefined());
    expect(result.current?.esAdmin).toBe(true);
  });

  it("calcula esAdmin = true para admin_sucursal con exactamente 1 sucursal", async () => {
    onAuthStateChanged.mockImplementation((_auth: unknown, cb: (u: unknown) => void) => {
      cb(usuarioFake({ rol: "admin_sucursal", sucursales: ["suc_norte"] }));
      return () => {};
    });

    const { result } = renderHook(() => useAuthState({} as never));

    await waitFor(() => expect(result.current).not.toBeUndefined());
    expect(result.current?.esAdmin).toBe(true);
  });

  it("calcula esAdmin = false para admin_sucursal con 0 sucursales (fail-closed)", async () => {
    onAuthStateChanged.mockImplementation((_auth: unknown, cb: (u: unknown) => void) => {
      cb(usuarioFake({ rol: "admin_sucursal", sucursales: [] }));
      return () => {};
    });

    const { result } = renderHook(() => useAuthState({} as never));

    await waitFor(() => expect(result.current).not.toBeUndefined());
    expect(result.current?.esAdmin).toBe(false);
  });

  it("calcula esAdmin = false para admin_sucursal con 2 o más sucursales (fail-closed)", async () => {
    onAuthStateChanged.mockImplementation((_auth: unknown, cb: (u: unknown) => void) => {
      cb(usuarioFake({ rol: "admin_sucursal", sucursales: ["suc_norte", "suc_sur"] }));
      return () => {};
    });

    const { result } = renderHook(() => useAuthState({} as never));

    await waitFor(() => expect(result.current).not.toBeUndefined());
    expect(result.current?.esAdmin).toBe(false);
  });

  it("calcula esAdmin = false para rol 'cajero'", async () => {
    onAuthStateChanged.mockImplementation((_auth: unknown, cb: (u: unknown) => void) => {
      cb(usuarioFake({ rol: "cajero", sucursales: ["suc_norte"] }));
      return () => {};
    });

    const { result } = renderHook(() => useAuthState({} as never));

    await waitFor(() => expect(result.current).not.toBeUndefined());
    expect(result.current?.esAdmin).toBe(false);
  });
});
