// apps/web/src/lib/guardas-comparativo.test.ts (D9/S5a) — guarda de acceso a
// /admin/comparativo para admin_sucursal.
// guardas.test.ts se mantiene intacto (archivo protegido).
import { describe, expect, it } from "vitest";
import { calcularRedireccion } from "./guardas.js";

describe("calcularRedireccion — /admin/comparativo (D9/S5a)", () => {
  const adminSucursal = {
    uid: "uid_admin_suc",
    nombre: "Admin Sucursal",
    esAdmin: true,
    rol: "admin_sucursal",
    sucursales: ["suc_norte"],
  };

  it("redirige a /admin a un admin_sucursal que intenta acceder a /admin/comparativo", () => {
    expect(calcularRedireccion(adminSucursal, "/admin/comparativo")).toBe("/admin");
  });

  it("redirige a /admin a un admin_sucursal en subrutas de /admin/comparativo", () => {
    expect(calcularRedireccion(adminSucursal, "/admin/comparativo/detalle")).toBe("/admin");
  });

  it("deja pasar a un admin_sucursal en otras rutas del panel admin (par negativo)", () => {
    expect(calcularRedireccion(adminSucursal, "/admin")).toBeNull();
    expect(calcularRedireccion(adminSucursal, "/admin/cajeros")).toBeNull();
    expect(calcularRedireccion(adminSucursal, "/admin/sesiones")).toBeNull();
    expect(calcularRedireccion(adminSucursal, "/admin/auditoria")).toBeNull();
  });

  it("deja pasar a un Gerente (rol: 'admin') en /admin/comparativo (par afirmativo)", () => {
    const gerente = {
      uid: "uid_gerente",
      nombre: "Gerente",
      esAdmin: true,
      rol: "admin",
    };
    expect(calcularRedireccion(gerente, "/admin/comparativo")).toBeNull();
  });

  it("deja pasar a un admin sin claim rol explícito (compatibilidad legacy) en /admin/comparativo", () => {
    const adminLegacy = {
      uid: "uid_admin",
      nombre: "Admin",
      esAdmin: true,
    };
    expect(calcularRedireccion(adminLegacy, "/admin/comparativo")).toBeNull();
  });

  it("regresión: redirige a /sucursales a un cajero que intenta acceder a /admin/comparativo", () => {
    const cajero = {
      uid: "uid_ana",
      nombre: "Ana",
      esAdmin: false,
      rol: "cajero",
      sucursales: ["suc_norte"],
    };
    expect(calcularRedireccion(cajero, "/admin/comparativo")).toBe("/sucursales");
  });

  it("regresión: redirige a /login cuando no hay sesión en /admin/comparativo", () => {
    expect(calcularRedireccion(null, "/admin/comparativo")).toBe("/login");
  });

  it("regresión: no redirige cuando el estado auth está resolviéndose (undefined)", () => {
    expect(calcularRedireccion(undefined, "/admin/comparativo")).toBeNull();
  });
});
