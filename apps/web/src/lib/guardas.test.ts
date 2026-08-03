import { describe, expect, it } from "vitest";
import { calcularRedireccion } from "./guardas.js";

describe("calcularRedireccion (doc 11 §2)", () => {
  it("no redirige mientras el estado de auth está resolviéndose (undefined)", () => {
    expect(calcularRedireccion(undefined, "/sucursales")).toBeNull();
  });

  it("redirige a /login cuando no hay sesión", () => {
    expect(calcularRedireccion(null, "/sucursales")).toBe("/login");
  });

  it("redirige a /sucursales si un cajero intenta entrar a /admin", () => {
    const auth = { uid: "uid_ana", nombre: "Ana", esAdmin: false };
    expect(calcularRedireccion(auth, "/admin/cajeros")).toBe("/sucursales");
  });

  it("deja pasar a un admin en /admin", () => {
    const auth = { uid: "uid_admin", nombre: "Admin", esAdmin: true };
    expect(calcularRedireccion(auth, "/admin/cajeros")).toBeNull();
  });

  it("deja pasar a un cajero autenticado en /sucursales", () => {
    const auth = { uid: "uid_ana", nombre: "Ana", esAdmin: false };
    expect(calcularRedireccion(auth, "/sucursales")).toBeNull();
  });
});
