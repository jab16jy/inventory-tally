import { describe, expect, it } from "vitest";
import type { LineaConteo } from "../models/linea-conteo.js";
import { cantidadEsAbsurda, promedioCategoria } from "./riesgo.js";

function linea(cantidadTotal: number, numAportantes: number): LineaConteo {
  return {
    categoriaId: "cat_5000",
    valorUnitario: 5000,
    etiqueta: "$5.000",
    area: "Aseo",
    cantidadTotal,
    numAportantes,
    versiones: {},
    actualizadaEn: new Date(),
    actualizadaPor: "",
  };
}

describe("promedioCategoria (doc 10 §10)", () => {
  it("sin aportantes, el promedio es 0 (sin línea base con la que comparar)", () => {
    expect(promedioCategoria(linea(0, 0))).toBe(0);
  });

  it("cantidadTotal / numAportantes con aportantes reales", () => {
    expect(promedioCategoria(linea(40, 4))).toBe(10);
  });
});

describe("cantidadEsAbsurda (doc 10 §10 — 'confirmación suave si supera 10× el promedio')", () => {
  it("sin promedio (categoría virgen), nunca es absurda", () => {
    expect(cantidadEsAbsurda(999, 0)).toBe(false);
  });

  it("justo en el límite (exactamente 10×) todavía no es absurda", () => {
    expect(cantidadEsAbsurda(100, 10)).toBe(false);
  });

  it("un dígito por encima del límite sí es absurda", () => {
    expect(cantidadEsAbsurda(101, 10)).toBe(true);
  });

  it("una cantidad normal, por debajo del promedio, no es absurda", () => {
    expect(cantidadEsAbsurda(8, 10)).toBe(false);
  });
});
