import { describe, expect, it } from "vitest";
import { actualizarCajeroSchema } from "./actualizar-cajero.schema.js";

const valido = {
  uid: "uid_ana",
  nombre: "Ana R.",
  rol: "cajero",
  sucursalesAsignadas: ["suc_1"],
};

describe("actualizarCajeroSchema (design.md D-6: reemplazo total, no parche parcial)", () => {
  it("acepta el objeto completo (afirmativo)", () => {
    const resultado = actualizarCajeroSchema.safeParse(valido);
    expect(resultado.success).toBe(true);
  });

  it("rechaza un objeto parcial sin rol ni sucursalesAsignadas (negativo, discrimina el reemplazo total)", () => {
    const { uid, nombre } = valido;
    const resultado = actualizarCajeroSchema.safeParse({ uid, nombre });
    expect(resultado.success).toBe(false);
  });

  it("rechaza un rol fuera del enum admin | cajero, con el resto de campos válidos (negativo, discrimina sólo el enum)", () => {
    const resultado = actualizarCajeroSchema.safeParse({ ...valido, rol: "superadmin" });
    expect(resultado.success).toBe(false);
  });

  it("rechaza más de 10 sucursales asignadas, con el resto de campos válidos (negativo, discrimina sólo el máximo)", () => {
    const sucursalesAsignadas = Array.from({ length: 11 }, (_, i) => `suc_${i}`);
    const resultado = actualizarCajeroSchema.safeParse({ ...valido, sucursalesAsignadas });
    expect(resultado.success).toBe(false);
  });
});
