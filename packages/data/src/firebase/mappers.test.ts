import { Timestamp } from "firebase/firestore";
import { describe, expect, it } from "vitest";
import {
  aporteDesdeDoc,
  lineaConteoDesdeDoc,
  sesionConteoDesdeDoc,
  sucursalDesdeDoc,
} from "./mappers.js";

describe("aporteDesdeDoc (doc 04 §3)", () => {
  it("mapea un documento de aporte a Aporte, con Timestamp → Date", () => {
    const registradoEn = Timestamp.fromDate(new Date("2026-08-02T09:12:10Z"));
    const aporte = aporteDesdeDoc({
      uid: "uid_ana",
      nombre: "Ana Ramírez",
      cantidad: 30,
      registradoEn,
      dispositivoId: "safari-ios-a91f",
      version: 3,
    });

    expect(aporte).toEqual({
      uid: "uid_ana",
      nombre: "Ana Ramírez",
      cantidad: 30,
      registradoEn: registradoEn.toDate(),
      dispositivoId: "safari-ios-a91f",
      version: 3,
    });
  });
});

describe("lineaConteoDesdeDoc (doc 04 §3)", () => {
  it("mapea un documento de línea a LineaConteo, usando el id como categoriaId", () => {
    const actualizadaEn = Timestamp.fromDate(new Date("2026-08-02T09:14:33Z"));
    const linea = lineaConteoDesdeDoc("cat_5000", {
      valorUnitario: 5000,
      etiqueta: "$5.000",
      cantidadTotal: 55,
      numAportantes: 2,
      versiones: { uid_ana: 3, uid_luis: 1 },
      actualizadaEn,
      actualizadaPor: "uid_luis",
    });

    expect(linea).toEqual({
      categoriaId: "cat_5000",
      valorUnitario: 5000,
      etiqueta: "$5.000",
      cantidadTotal: 55,
      numAportantes: 2,
      versiones: { uid_ana: 3, uid_luis: 1 },
      actualizadaEn: actualizadaEn.toDate(),
      actualizadaPor: "uid_luis",
    });
  });
});

describe("sesionConteoDesdeDoc (doc 04 §3)", () => {
  it("mapea una sesión abierta, con cerradaEn/cerradaPor null", () => {
    const abiertaEn = Timestamp.fromDate(new Date("2026-08-02T08:00:00Z"));
    const sesion = sesionConteoDesdeDoc("ses_20260802_norte_01", {
      sucursalId: "suc_norte",
      sucursalNombre: "Sucursal Norte",
      estado: "abierta",
      abiertaEn,
      abiertaPor: "uid_admin",
      cerradaEn: null,
      cerradaPor: null,
      participantes: ["uid_ana", "uid_luis"],
      totalUnidades: 1840,
      sesionCorregidaId: null,
    });

    expect(sesion).toEqual({
      sesionId: "ses_20260802_norte_01",
      sucursalId: "suc_norte",
      sucursalNombre: "Sucursal Norte",
      estado: "abierta",
      abiertaEn: abiertaEn.toDate(),
      abiertaPor: "uid_admin",
      cerradaEn: null,
      cerradaPor: null,
      participantes: ["uid_ana", "uid_luis"],
      totalUnidades: 1840,
      sesionCorregidaId: null,
    });
  });
});

describe("sucursalDesdeDoc (doc 04 §3)", () => {
  it("mapea con conectividad datos, sesionAbiertaId null y creadaEn convertido", () => {
    const creadaEn = Timestamp.fromDate(new Date("2026-01-15T10:00:00Z"));
    const sucursal = sucursalDesdeDoc("suc_norte", {
      nombre: "Sucursal Norte",
      direccion: "Cra 43 #75-120",
      conectividad: "datos",
      activa: true,
      sesionAbiertaId: null,
      creadaEn,
    });

    expect(sucursal).toEqual({
      sucursalId: "suc_norte",
      nombre: "Sucursal Norte",
      direccion: "Cra 43 #75-120",
      conectividad: "datos",
      activa: true,
      sesionAbiertaId: null,
      creadaEn: creadaEn.toDate(),
    });
  });

  it("mapea con una sesión abierta", () => {
    const creadaEn = Timestamp.fromDate(new Date("2026-01-15T10:00:00Z"));
    const sucursal = sucursalDesdeDoc("suc_norte", {
      nombre: "Sucursal Norte",
      direccion: "Cra 43 #75-120",
      conectividad: "wifi",
      activa: true,
      sesionAbiertaId: "ses_20260802_norte_01",
      creadaEn,
    });

    expect(sucursal.sesionAbiertaId).toBe("ses_20260802_norte_01");
    expect(sucursal.conectividad).toBe("wifi");
  });
});

describe("sesionConteoDesdeDoc (doc 04 §3)", () => {
  it("mapea cerradaEn como Date cuando la sesión está cerrada", () => {
    const abiertaEn = Timestamp.fromDate(new Date("2026-08-02T08:00:00Z"));
    const cerradaEn = Timestamp.fromDate(new Date("2026-08-02T11:30:00Z"));
    const sesion = sesionConteoDesdeDoc("ses_20260802_norte_01", {
      sucursalId: "suc_norte",
      sucursalNombre: "Sucursal Norte",
      estado: "cerrada",
      abiertaEn,
      abiertaPor: "uid_admin",
      cerradaEn,
      cerradaPor: "uid_admin",
      participantes: ["uid_ana"],
      totalUnidades: 1840,
      sesionCorregidaId: null,
    });

    expect(sesion.cerradaEn).toEqual(cerradaEn.toDate());
    expect(sesion.cerradaPor).toBe("uid_admin");
  });
});
