import { describe, expect, it } from "vitest";
import { crearCajeroSchema } from "./crear-cajero.schema.js";

const valido = {
  nombre: "Ana Ramírez",
  correo: "ana@negocio.com",
  passwordTemporal: "Temp2026#",
  rol: "cajero",
  sucursalesAsignadas: ["suc_norte", "suc_centro"],
};

describe("crearCajeroSchema (doc 07 §3, doc 08 §3)", () => {
  it("acepta una entrada válida", () => {
    const resultado = crearCajeroSchema.safeParse(valido);
    expect(resultado.success).toBe(true);
  });

  it("rechaza nombre vacío", () => {
    const resultado = crearCajeroSchema.safeParse({ ...valido, nombre: "" });
    expect(resultado.success).toBe(false);
  });

  it("rechaza un correo con formato inválido", () => {
    const resultado = crearCajeroSchema.safeParse({ ...valido, correo: "no-es-un-correo" });
    expect(resultado.success).toBe(false);
  });

  it("rechaza una contraseña temporal de menos de 8 caracteres", () => {
    const resultado = crearCajeroSchema.safeParse({ ...valido, passwordTemporal: "abc1234" });
    expect(resultado.success).toBe(false);
  });

  it("acepta una contraseña temporal de exactamente 8 caracteres", () => {
    const resultado = crearCajeroSchema.safeParse({ ...valido, passwordTemporal: "abcd1234" });
    expect(resultado.success).toBe(true);
  });

  it("rechaza una contraseña temporal de 8+ caracteres sin ningún dígito (regla de dígito, doc 09 §2)", () => {
    const resultado = crearCajeroSchema.safeParse({ ...valido, passwordTemporal: "abcdefgh" });
    expect(resultado.success).toBe(false);
  });

  it("acepta una contraseña temporal de 8+ caracteres con al menos un dígito (afirmativo)", () => {
    const resultado = crearCajeroSchema.safeParse({ ...valido, passwordTemporal: "abcdefg1" });
    expect(resultado.success).toBe(true);
  });

  it("rechaza un rol fuera del enum admin | cajero", () => {
    const resultado = crearCajeroSchema.safeParse({ ...valido, rol: "superadmin" });
    expect(resultado.success).toBe(false);
  });

  it("acepta el rol admin", () => {
    const resultado = crearCajeroSchema.safeParse({ ...valido, rol: "admin" });
    expect(resultado.success).toBe(true);
  });

  it("rechaza más de 10 sucursales asignadas", () => {
    const sucursalesAsignadas = Array.from({ length: 11 }, (_, i) => `suc_${i}`);
    const resultado = crearCajeroSchema.safeParse({ ...valido, sucursalesAsignadas });
    expect(resultado.success).toBe(false);
  });

  it("acepta exactamente 10 sucursales asignadas", () => {
    const sucursalesAsignadas = Array.from({ length: 10 }, (_, i) => `suc_${i}`);
    const resultado = crearCajeroSchema.safeParse({ ...valido, sucursalesAsignadas });
    expect(resultado.success).toBe(true);
  });
});
