import { describe, expect, it } from "vitest";
import type { Aporte } from "../models/aporte.js";
import type { LineaConteo } from "../models/linea-conteo.js";
import { aporteConfirmado } from "./sincronizacion.js";

function linea(versiones: Record<string, number>): LineaConteo {
  return {
    categoriaId: "cat_5000",
    valorUnitario: 5000,
    etiqueta: "$5.000",
    cantidadTotal: 0,
    numAportantes: 0,
    versiones,
    actualizadaEn: new Date(),
    actualizadaPor: "",
  };
}

function aporte(uid: string, version: number): Aporte {
  return {
    uid,
    nombre: "Ana Ramírez",
    cantidad: 12,
    registradoEn: new Date(),
    dispositivoId: "dev_1",
    version,
  };
}

describe("aporteConfirmado (doc 05 §3 — RF-16)", () => {
  it("sin aporte propio no hay nada que confirmar", () => {
    expect(aporteConfirmado(linea({}), null)).toBe(false);
  });

  it("el aporte está en tránsito mientras la línea no registra su versión", () => {
    // Caso real de bodega: la escritura local ya pintó la pantalla desde la
    // caché de Firestore, pero el trigger del backend todavía no agregó.
    expect(aporteConfirmado(linea({}), aporte("uid_ana", 1))).toBe(false);
  });

  it("una versión anterior en la línea sigue siendo tránsito", () => {
    // El cajero tocó "+" otra vez antes de que confirmara el toque previo.
    expect(aporteConfirmado(linea({ uid_ana: 1 }), aporte("uid_ana", 2))).toBe(false);
  });

  it("queda confirmado cuando la línea alcanza la versión del aporte", () => {
    expect(aporteConfirmado(linea({ uid_ana: 2 }), aporte("uid_ana", 2))).toBe(true);
  });

  it("una versión mayor en la línea también cuenta como confirmado", () => {
    // El mismo cajero en otro dispositivo ya empujó la línea más adelante:
    // lo que este teléfono escribió está agregado igual.
    expect(aporteConfirmado(linea({ uid_ana: 5 }), aporte("uid_ana", 2))).toBe(true);
  });

  it("la versión de OTRO cajero no confirma la propia", () => {
    // Sin esto, el aporte de un compañero pondría la regla en sólido y el
    // cajero creería que su conteo está a salvo cuando no lo está.
    expect(aporteConfirmado(linea({ uid_beto: 9 }), aporte("uid_ana", 1))).toBe(false);
  });
});
