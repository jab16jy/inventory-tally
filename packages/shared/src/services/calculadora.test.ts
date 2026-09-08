import { describe, expect, it } from "vitest";
import type { Aporte, Partida } from "../models/aporte.js";
import type { LineaConteo } from "../models/linea-conteo.js";
import {
  cantidadTotalDesdeAportes,
  quitarPartida,
  subtotal,
  totalMonetarioSesion,
  totalPartidas,
  totalUnidadesSesion,
  totalPorArea,
} from "./calculadora.js";

function crearLinea(overrides: Partial<LineaConteo> = {}): LineaConteo {
  return {
    categoriaId: "cat_5000",
    valorUnitario: 5000,
    etiqueta: "$5.000",
    porArea: {},
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
    areaId: "area_1",
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

describe("totalPorArea", () => {
  it("suma cantidad de líneas de la misma área, independientemente del precio", () => {
    const lineas = [
      crearLinea({ categoriaId: "cat_5000", porArea: { area_aseo: 55 }, valorUnitario: 5000 }),
      crearLinea({ categoriaId: "cat_2000", porArea: { area_aseo: 310 }, valorUnitario: 2000 }),
    ];
    expect(totalPorArea(lineas)).toEqual([{ areaId: "area_aseo", cantidad: 365 }]);
  });

  it("separa áreas distintas", () => {
    const lineas = [
      crearLinea({ categoriaId: "cat_5000", porArea: { area_aseo: 55 } }),
      crearLinea({ categoriaId: "cat_2000", porArea: { area_cocina: 310 } }),
    ];
    expect(totalPorArea(lineas)).toEqual([
      { areaId: "area_aseo", cantidad: 55 },
      { areaId: "area_cocina", cantidad: 310 },
    ]);
  });

  it("suma múltiples áreas dentro de la misma línea", () => {
    const lineas = [
      crearLinea({ categoriaId: "cat_5000", porArea: { area_aseo: 10, area_cocina: 20 } }),
      crearLinea({ categoriaId: "cat_2000", porArea: { area_aseo: 15 } }),
    ];
    expect(totalPorArea(lineas)).toEqual([
      { areaId: "area_aseo", cantidad: 25 },
      { areaId: "area_cocina", cantidad: 20 },
    ]);
  });

  it("devuelve [] sin líneas", () => {
    expect(totalPorArea([])).toEqual([]);
  });

  it("ordena el resultado alfabéticamente por areaId", () => {
    const lineas = [
      crearLinea({ categoriaId: "cat_1", porArea: { area_cocina: 1 } }),
      crearLinea({ categoriaId: "cat_2", porArea: { area_aseo: 1 } }),
      crearLinea({ categoriaId: "cat_3", porArea: { area_ferreteria: 1 } }),
    ];
    expect(totalPorArea(lineas).map((t) => t.areaId)).toEqual([
      "area_aseo",
      "area_cocina",
      "area_ferreteria",
    ]);
  });
});

describe("totalPartidas", () => {
  it("suma la cantidad de todas las tandas agrupadas", () => {
    const partidas: Partida[] = [
      { id: "p1", cantidad: 50 },
      { id: "p2", cantidad: 30 },
    ];
    expect(totalPartidas(partidas)).toBe(80);
  });

  it("devuelve 0 con un array vacío", () => {
    expect(totalPartidas([])).toBe(0);
  });

  it("devuelve 0 con undefined (aportes viejos sin partidas)", () => {
    expect(totalPartidas(undefined)).toBe(0);
  });
});

describe("quitarPartida", () => {
  it("quita la tanda del id pedido y devuelve lo restado", () => {
    const partidas: Partida[] = [
      { id: "p1", cantidad: 50 },
      { id: "p2", cantidad: 30 },
    ];
    const resultado = quitarPartida(partidas, "p1");
    expect(resultado.partidas).toEqual([{ id: "p2", cantidad: 30 }]);
    expect(resultado.restado).toBe(50);
  });

  it("ids duplicados: quita UNA sola entrada y resta exactamente esa cantidad", () => {
    // R3-002 del review de ADR-24. Nada en el tipo `Partida`, en los
    // repositorios ni en las reglas impide dos tandas con el mismo id. Con
    // `find` para restar y `filter` para borrar, el ledger perdía las dos
    // entradas mientras `restado` informaba una sola: quien reste eso de
    // `Aporte.cantidad` deja el total POR ENCIMA de la suma real del ledger,
    // que es dinero contado que nadie puede ya borrar desde la papelera.
    const partidas: Partida[] = [
      { id: "dup", cantidad: 50 },
      { id: "otra", cantidad: 30 },
      { id: "dup", cantidad: 50 },
    ];
    const resultado = quitarPartida(partidas, "dup");
    expect(resultado.partidas).toEqual([
      { id: "otra", cantidad: 30 },
      { id: "dup", cantidad: 50 },
    ]);
    expect(resultado.restado).toBe(50);
    expect(totalPartidas(resultado.partidas)).toBe(totalPartidas(partidas) - resultado.restado);
  });

  it("id inexistente: deja el array intacto y restado 0 (idempotente ante doble toque)", () => {
    const partidas: Partida[] = [{ id: "p1", cantidad: 50 }];
    const resultado = quitarPartida(partidas, "p_no_existe");
    expect(resultado.partidas).toEqual(partidas);
    expect(resultado.restado).toBe(0);
  });

  it("dos tandas con la misma cantidad: quita sólo la del id pedido", () => {
    const partidas: Partida[] = [
      { id: "p1", cantidad: 20 },
      { id: "p2", cantidad: 20 },
    ];
    const resultado = quitarPartida(partidas, "p2");
    expect(resultado.partidas).toEqual([{ id: "p1", cantidad: 20 }]);
    expect(resultado.restado).toBe(20);
  });
});
