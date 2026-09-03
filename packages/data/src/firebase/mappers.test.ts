import { Timestamp } from "firebase/firestore";
import { describe, expect, it } from "vitest";
import {
  aporteDesdeDoc,
  areaDesdeDoc,
  categoriaValorDesdeDoc,
  eventoAuditoriaDesdeDoc,
  lineaConteoDesdeDoc,
  sesionConteoDesdeDoc,
  sucursalDesdeDoc,
  usuarioDesdeDoc,
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
      area: "Efectivo",
      areaFijaPorAdmin: true,
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
      area: "Efectivo",
      areaFijaPorAdmin: true,
      cantidadTotal: 55,
      numAportantes: 2,
      versiones: { uid_ana: 3, uid_luis: 1 },
      actualizadaEn: actualizadaEn.toDate(),
      actualizadaPor: "uid_luis",
    });
  });

  it("mapea aplicados cuando el doc lo trae (base de onAporteEscrito/reconciliarLineas)", () => {
    const actualizadaEn = Timestamp.fromDate(new Date("2026-08-02T09:14:33Z"));
    const linea = lineaConteoDesdeDoc("cat_5000", {
      valorUnitario: 5000,
      etiqueta: "$5.000",
      area: "Efectivo",
      areaFijaPorAdmin: true,
      cantidadTotal: 55,
      numAportantes: 2,
      versiones: { uid_ana: 3, uid_luis: 1 },
      actualizadaEn,
      actualizadaPor: "uid_luis",
      aplicados: { uid_ana: 40, uid_luis: 15 },
    });

    expect(linea.aplicados).toEqual({ uid_ana: 40, uid_luis: 15 });
  });

  it("deja aplicados en undefined cuando el doc no lo trae (abrirSesion siembra líneas sin ese mapa)", () => {
    const actualizadaEn = Timestamp.fromDate(new Date("2026-08-02T09:14:33Z"));
    const linea = lineaConteoDesdeDoc("cat_5000", {
      valorUnitario: 5000,
      etiqueta: "$5.000",
      area: "Efectivo",
      areaFijaPorAdmin: false,
      cantidadTotal: 0,
      numAportantes: 0,
      versiones: {},
      actualizadaEn,
      actualizadaPor: "uid_admin",
    });

    expect(linea.aplicados).toBeUndefined();
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

describe("usuarioDesdeDoc (docs/plan-panel-administrador.md §4)", () => {
  it("convierte creadoEn a Date y deja pwaInstalada/ultimoAccesoEn en undefined cuando el doc no los trae", () => {
    const creadoEn = Timestamp.fromDate(new Date("2026-08-02T09:00:00Z"));
    const usuario = usuarioDesdeDoc("uid_admin", {
      nombre: "Admin Uno",
      correo: "admin@ejemplo.com",
      rol: "admin",
      sucursalesAsignadas: ["suc_norte"],
      activo: true,
      creadoEn,
      creadoPor: "uid_root",
    });

    expect(usuario).toEqual({
      uid: "uid_admin",
      nombre: "Admin Uno",
      correo: "admin@ejemplo.com",
      rol: "admin",
      sucursalesAsignadas: ["suc_norte"],
      activo: true,
      creadoEn: creadoEn.toDate(),
      creadoPor: "uid_root",
      pwaInstalada: undefined,
      ultimoAccesoEn: undefined,
    });
  });

  it("convierte ultimoAccesoEn a Date cuando el doc lo trae", () => {
    const creadoEn = Timestamp.fromDate(new Date("2026-08-02T09:00:00Z"));
    const ultimoAccesoEn = Timestamp.fromDate(new Date("2026-08-05T14:30:00Z"));
    const usuario = usuarioDesdeDoc("uid_cajero", {
      nombre: "Cajero Uno",
      correo: "cajero@ejemplo.com",
      rol: "cajero",
      sucursalesAsignadas: ["suc_norte"],
      activo: true,
      creadoEn,
      creadoPor: "uid_admin",
      pwaInstalada: true,
      ultimoAccesoEn,
    });

    expect(usuario.pwaInstalada).toBe(true);
    expect(usuario.ultimoAccesoEn).toEqual(ultimoAccesoEn.toDate());
  });
});

describe("categoriaValorDesdeDoc (docs/plan-panel-administrador.md §4)", () => {
  it("mapea con el id como categoriaId y creadaEn convertido a Date", () => {
    const creadaEn = Timestamp.fromDate(new Date("2026-01-10T08:00:00Z"));
    const categoria = categoriaValorDesdeDoc("cat_5000", {
      valor: 5000,
      etiqueta: "$5.000",
      activa: true,
      orden: 1,
      creadaEn,
    });

    expect(categoria).toEqual({
      categoriaId: "cat_5000",
      valor: 5000,
      etiqueta: "$5.000",
      activa: true,
      orden: 1,
      creadaEn: creadaEn.toDate(),
      sucursalesAsignadas: undefined,
      areaId: undefined,
    });
  });

  it("mapea sucursalesAsignadas cuando está presente (D4/D6: catálogo por sucursal)", () => {
    const creadaEn = Timestamp.fromDate(new Date("2026-01-10T08:00:00Z"));
    const categoria = categoriaValorDesdeDoc("cat_nombrado", {
      valor: 45000,
      etiqueta: "Refrigerador X200",
      activa: true,
      orden: 1,
      creadaEn,
      sucursalesAsignadas: ["suc_norte"],
    });

    expect(categoria.sucursalesAsignadas).toEqual(["suc_norte"]);
  });

  it("mapea areaIds cuando está presente (N:M, issue #81)", () => {
    const creadaEn = Timestamp.fromDate(new Date("2026-01-10T08:00:00Z"));
    const categoria = categoriaValorDesdeDoc("cat_5000", {
      valor: 5000,
      etiqueta: "$5.000",
      activa: true,
      orden: 1,
      creadaEn,
      areaIds: ["area_efectivo", "area_aseo"],
    });

    expect(categoria.areaIds).toEqual(["area_efectivo", "area_aseo"]);
  });
});

describe("areaDesdeDoc (docs/plan-panel-administrador.md §4)", () => {
  it("mapea con el id como areaId y creadaEn convertido a Date", () => {
    const creadaEn = Timestamp.fromDate(new Date("2026-01-10T08:00:00Z"));
    const area = areaDesdeDoc("area_efectivo", {
      nombre: "Efectivo",
      activa: true,
      creadaEn,
    });

    expect(area).toEqual({
      areaId: "area_efectivo",
      nombre: "Efectivo",
      activa: true,
      creadaEn: creadaEn.toDate(),
    });
  });
});

describe("eventoAuditoriaDesdeDoc (docs/plan-panel-administrador.md §4)", () => {
  it("usa el id del doc como eventoId, convierte ocurridoEn a Date y preserva los campos heterogéneos del tipo", () => {
    const ocurridoEn = Timestamp.fromDate(new Date("2026-08-02T10:00:00Z"));
    const evento = eventoAuditoriaDesdeDoc("evt_001", {
      tipo: "SESION_ABIERTA",
      ocurridoEn,
      sesionId: "ses_20260802_norte_01",
      sucursalId: "suc_norte",
      sinConfirmar: false,
      campos: { antes: 10, despues: 12 },
    });

    expect(evento).toEqual({
      eventoId: "evt_001",
      tipo: "SESION_ABIERTA",
      ocurridoEn: ocurridoEn.toDate(),
      sesionId: "ses_20260802_norte_01",
      sucursalId: "suc_norte",
      sinConfirmar: false,
      campos: { antes: 10, despues: 12 },
    });
  });
});
