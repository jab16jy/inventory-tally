// apps/web/src/lib/etiqueta-rol.test.ts (specs/admin-sucursal, "Requirement:
// Rol labels") — mapeo puro rol crudo → etiqueta de UI.
import { describe, expect, it } from "vitest";
import { etiquetaRol } from "./etiqueta-rol.js";

describe("etiquetaRol (specs/admin-sucursal, Requirement: Rol labels)", () => {
  it.each([
    ["admin", "Gerente"],
    ["admin_sucursal", "Admin de sucursal"],
    ["cajero", "Cajero"],
  ] as const)("mapea rol=%s a la etiqueta '%s'", (rol, esperado) => {
    expect(etiquetaRol(rol)).toBe(esperado);
  });

  it("rol ausente cae a 'Cajero', mismo default que tenían los call sites reemplazados", () => {
    expect(etiquetaRol(undefined)).toBe("Cajero");
  });
});
