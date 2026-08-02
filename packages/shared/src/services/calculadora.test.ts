import { describe, expect, it } from "vitest";
import type { Aporte } from "../models/aporte.js";
import type { LineaConteo } from "../models/linea-conteo.js";
import {
  cantidadTotalDesdeAportes,
  subtotal,
  totalMonetarioSesion,
  totalUnidadesSesion,
} from "./calculadora.js";

function crearLinea(overrides: Partial<LineaConteo> = {}): LineaConteo {
  return {
    categoriaId: "cat_5000",
    valorUnitario: 5000,
    etiqueta: "$5.000",
    cantidadTotal: 55,
    numAportantes: 2,
    versiones: { uid_ana: 3, uid_luis: 1 },
    actualizadaEn: new Date("2026-08-02T09:14:33Z"),
    actualizadaPor: "uid_luis",
    ...overrides,
  };
}

function crearAporte(overrides: Partial<Aporte> = {}): Aporte {
  return {
    uid: "uid_ana",
    nombre: "Ana Ramírez",
    cantidad: 30,
    registradoEn: new Date("2026-08-02T09:12:10Z"),
    dispositivoId: "safari-ios-a91f",
    version: 3,
    ...overrides,
  };
}

describe("subtotal", () => {
  it("multiplica cantidadTotal por valorUnitario (doc 03 §4)", () => {
    const linea = crearLinea({ cantidadTotal: 55, valorUnitario: 5000 });
    expect(subtotal(linea)).toBe(275000);
  });

  it("es exacto con enteros grandes: sin error de coma flotante", () => {
    // Equivalente a 0.10 + 0.20 en representación decimal: en unidad mínima
    // (centavos) la suma es exacta, nunca 0.30000000000000004.
    const linea = crearLinea({ cantidadTotal: 3, valorUnitario: 10 });
    expect(subtotal(linea)).toBe(30);
    expect(Number.isInteger(subtotal(linea))).toBe(true);
  });
});

describe("cantidadTotalDesdeAportes", () => {
  it("suma la cantidad de todos los aportes de una línea (doc 03 §4)", () => {
    const aportes = [
      crearAporte({ uid: "uid_ana", cantidad: 30 }),
      crearAporte({ uid: "uid_luis", cantidad: 25 }),
    ];
    expect(cantidadTotalDesdeAportes(aportes)).toBe(55);
  });

  it("devuelve 0 sin aportes", () => {
    expect(cantidadTotalDesdeAportes([])).toBe(0);
  });
});

describe("totalUnidadesSesion", () => {
  it("suma cantidadTotal de todas las líneas de la sesión", () => {
    const lineas = [
      crearLinea({ categoriaId: "cat_5000", cantidadTotal: 55 }),
      crearLinea({ categoriaId: "cat_2000", cantidadTotal: 310 }),
    ];
    expect(totalUnidadesSesion(lineas)).toBe(365);
  });

  it("devuelve 0 sin líneas", () => {
    expect(totalUnidadesSesion([])).toBe(0);
  });
});

describe("totalMonetarioSesion", () => {
  it("suma el subtotal de todas las líneas, en unidad mínima entera", () => {
    const lineas = [
      crearLinea({ categoriaId: "cat_5000", cantidadTotal: 55, valorUnitario: 5000 }),
      crearLinea({ categoriaId: "cat_2000", cantidadTotal: 310, valorUnitario: 2000 }),
    ];
    // 55*5000 + 310*2000 = 275000 + 620000 = 895000
    expect(totalMonetarioSesion(lineas)).toBe(895000);
    expect(Number.isInteger(totalMonetarioSesion(lineas))).toBe(true);
  });

  it("no acumula error de coma flotante con muchas líneas de valores fraccionables", () => {
    // 30 líneas de 1 unidad a 10 centavos: en float ingenuo (0.1 * 30) da
    // 2.9999999999999996; en enteros la suma es exacta.
    const lineas = Array.from({ length: 30 }, (_, i) =>
      crearLinea({ categoriaId: `cat_${i}`, cantidadTotal: 1, valorUnitario: 10 }),
    );
    expect(totalMonetarioSesion(lineas)).toBe(300);
  });

  it("devuelve 0 sin líneas", () => {
    expect(totalMonetarioSesion([])).toBe(0);
  });
});
