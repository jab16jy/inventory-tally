import { CantidadInvalidaError } from "@conteo/shared/errors.js";
import type { LineaConteo } from "@conteo/shared/models/linea-conteo.js";
import type { SesionConteo } from "@conteo/shared/models/sesion-conteo.js";
import { describe, expect, it, vi } from "vitest";
import { FakeConteoRepository } from "./fake-conteo-repository.js";

function crearLinea(overrides: Partial<LineaConteo> = {}): LineaConteo {
  return {
    categoriaId: "cat_5000",
    valorUnitario: 5000,
    etiqueta: "$5.000",
    cantidadTotal: 0,
    numAportantes: 0,
    versiones: {},
    actualizadaEn: new Date("2026-08-02T08:00:00Z"),
    actualizadaPor: "",
    ...overrides,
  };
}

function crearSesion(overrides: Partial<SesionConteo> = {}): SesionConteo {
  return {
    sesionId: "ses_20260802_norte_01",
    sucursalId: "suc_norte",
    sucursalNombre: "Sucursal Norte",
    estado: "abierta",
    abiertaEn: new Date("2026-08-02T08:00:00Z"),
    abiertaPor: "uid_admin",
    cerradaEn: null,
    cerradaPor: null,
    participantes: [],
    totalUnidades: 0,
    sesionCorregidaId: null,
    ...overrides,
  };
}

describe("FakeConteoRepository (implementación en memoria, doc 07 §6)", () => {
  it("observarLineas emite de inmediato las líneas sembradas", () => {
    const repo = new FakeConteoRepository();
    repo.sembrarLinea("ses_1", crearLinea());

    const recibidas: LineaConteo[][] = [];
    repo.observarLineas("ses_1", (lineas) => recibidas.push(lineas));

    expect(recibidas).toHaveLength(1);
    expect(recibidas[0]).toHaveLength(1);
    expect(recibidas[0]?.[0]?.categoriaId).toBe("cat_5000");
  });

  it("registrarAporte actualiza cantidadTotal y numAportantes de la línea, y notifica observarLineas", async () => {
    const repo = new FakeConteoRepository({ uid: "uid_ana", nombre: "Ana Ramírez" });
    repo.sembrarLinea("ses_1", crearLinea());

    const recibidas: LineaConteo[][] = [];
    repo.observarLineas("ses_1", (lineas) => recibidas.push(lineas));

    await repo.registrarAporte({ sesionId: "ses_1", categoriaId: "cat_5000", cantidad: 12 });

    const ultima = recibidas.at(-1);
    expect(ultima?.[0]?.cantidadTotal).toBe(12);
    expect(ultima?.[0]?.numAportantes).toBe(1);
  });

  it("una segunda corrección del mismo cajero ajusta el delta, sin duplicar numAportantes", async () => {
    const repo = new FakeConteoRepository({ uid: "uid_ana", nombre: "Ana Ramírez" });
    repo.sembrarLinea("ses_1", crearLinea());

    await repo.registrarAporte({ sesionId: "ses_1", categoriaId: "cat_5000", cantidad: 12 });
    await repo.registrarAporte({ sesionId: "ses_1", categoriaId: "cat_5000", cantidad: 8 });

    const recibidas: LineaConteo[][] = [];
    repo.observarLineas("ses_1", (lineas) => recibidas.push(lineas));
    expect(recibidas[0]?.[0]?.cantidadTotal).toBe(8);
    expect(recibidas[0]?.[0]?.numAportantes).toBe(1);
  });

  it("registrarAporte con cantidad negativa lanza CantidadInvalidaError", async () => {
    const repo = new FakeConteoRepository();
    repo.sembrarLinea("ses_1", crearLinea());

    await expect(
      repo.registrarAporte({ sesionId: "ses_1", categoriaId: "cat_5000", cantidad: -1 }),
    ).rejects.toBeInstanceOf(CantidadInvalidaError);
  });

  it("observarMiAporte refleja el aporte propio con versión incremental", async () => {
    const repo = new FakeConteoRepository({ uid: "uid_ana", nombre: "Ana Ramírez" });
    repo.sembrarLinea("ses_1", crearLinea());

    const recibidos: Array<{ cantidad: number; version: number } | null> = [];
    repo.observarMiAporte("ses_1", "cat_5000", (a) =>
      recibidos.push(a && { cantidad: a.cantidad, version: a.version }),
    );
    expect(recibidos[0]).toBeNull();

    await repo.registrarAporte({ sesionId: "ses_1", categoriaId: "cat_5000", cantidad: 12 });
    expect(recibidos.at(-1)).toEqual({ cantidad: 12, version: 1 });

    await repo.registrarAporte({ sesionId: "ses_1", categoriaId: "cat_5000", cantidad: 15 });
    expect(recibidos.at(-1)).toEqual({ cantidad: 15, version: 2 });
  });

  it("observarSesionAbierta emite la sesión sembrada para esa sucursal, o null si no hay", () => {
    const repo = new FakeConteoRepository();
    repo.sembrarSesionAbierta("suc_norte", crearSesion());

    const recibidas: Array<SesionConteo | null> = [];
    repo.observarSesionAbierta("suc_norte", (s) => recibidas.push(s));
    expect(recibidas[0]?.sesionId).toBe("ses_20260802_norte_01");

    const otras: Array<SesionConteo | null> = [];
    repo.observarSesionAbierta("suc_centro", (s) => otras.push(s));
    expect(otras[0]).toBeNull();
  });

  it("observarEscriturasPendientes sube al registrar y baja tras sincronizar (RF-16)", async () => {
    vi.useFakeTimers();
    try {
      const repo = new FakeConteoRepository(
        { uid: "uid_ana", nombre: "Ana Ramírez" },
        { retrasoSincronizacionMs: 50 },
      );
      repo.sembrarLinea("ses_1", crearLinea());

      const valores: number[] = [];
      repo.observarEscriturasPendientes("ses_1", (n) => valores.push(n));
      expect(valores.at(-1)).toBe(0);

      const promesa = repo.registrarAporte({
        sesionId: "ses_1",
        categoriaId: "cat_5000",
        cantidad: 12,
      });
      // El registro local es instantáneo: la promesa resuelve sin esperar la
      // "sincronización" (mismo contrato que FirestoreConteoRepository).
      await promesa;
      expect(valores.at(-1)).toBe(1);

      await vi.advanceTimersByTimeAsync(50);
      expect(valores.at(-1)).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("confirmarSincronizacion no lanza cuando no hay pendientes", async () => {
    const repo = new FakeConteoRepository();
    await expect(repo.confirmarSincronizacion("ses_1")).resolves.toBeUndefined();
  });
});
