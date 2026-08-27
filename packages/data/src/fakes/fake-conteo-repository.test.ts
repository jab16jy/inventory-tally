import { CantidadInvalidaError } from "@conteo/shared/errors.js";
import type { EventoAuditoria } from "@conteo/shared/models/evento-auditoria.js";
import type { LineaConteo } from "@conteo/shared/models/linea-conteo.js";
import type { SesionConteo } from "@conteo/shared/models/sesion-conteo.js";
import type { Sucursal } from "@conteo/shared/models/sucursal.js";
import { describe, expect, it, vi } from "vitest";
import { FakeConteoRepository } from "./fake-conteo-repository.js";

function crearEvento(overrides: Partial<EventoAuditoria> = {}): EventoAuditoria {
  return {
    eventoId: "e1",
    tipo: "APORTE_CREADO",
    ocurridoEn: new Date("2026-08-02T08:00:00Z"),
    ...overrides,
  };
}

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

function crearSucursal(overrides: Partial<Sucursal> = {}): Sucursal {
  return {
    sucursalId: "suc_norte",
    nombre: "Sucursal Norte",
    direccion: "Cra 43 #75-120",
    conectividad: "datos",
    activa: true,
    sesionAbiertaId: null,
    creadaEn: new Date("2026-01-15T10:00:00Z"),
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

  it("observarSesion emite la sesión sembrada por sesionId, o null si no hay ninguna (F4-A1)", () => {
    const repo = new FakeConteoRepository();
    repo.sembrarSesion(crearSesion());

    const recibidas: Array<SesionConteo | null> = [];
    repo.observarSesion("ses_20260802_norte_01", (s) => recibidas.push(s));
    expect(recibidas[0]?.sesionId).toBe("ses_20260802_norte_01");

    const otras: Array<SesionConteo | null> = [];
    repo.observarSesion("ses_inexistente", (s) => otras.push(s));
    expect(otras[0]).toBeNull();
  });

  it("observarSesion notifica a los suscriptores activos cuando la sesión sembrada cambia de estado", () => {
    // Ruta que dispara el modal bloqueante del cajero (F4-A1, doc 11 §5,
    // "estado != 'abierta'"): el admin cierra la sesión MIENTRAS el cajero
    // sigue con la pantalla abierta, no antes de que la observe.
    const repo = new FakeConteoRepository();
    repo.sembrarSesion(crearSesion());

    const recibidas: Array<SesionConteo | null> = [];
    repo.observarSesion("ses_20260802_norte_01", (s) => recibidas.push(s));
    expect(recibidas.at(-1)?.estado).toBe("abierta");

    repo.sembrarSesion(crearSesion({ estado: "cerrada", cerradaPor: "uid_admin" }));
    expect(recibidas.at(-1)?.estado).toBe("cerrada");
  });

  it("observarSucursales emite [] de inmediato cuando no hay IDs, mismo contrato que la implementación real", () => {
    const repo = new FakeConteoRepository();
    const recibidas: Sucursal[][] = [];
    repo.observarSucursales([], (s) => recibidas.push(s));
    expect(recibidas).toEqual([[]]);
  });

  it("observarSucursales emite las sembradas ordenadas por nombre, desempatando por id", () => {
    const repo = new FakeConteoRepository();
    repo.sembrarSucursal(crearSucursal({ sucursalId: "suc_b", nombre: "Sucursal Bosque" }));
    repo.sembrarSucursal(crearSucursal({ sucursalId: "suc_a", nombre: "Sucursal Alameda" }));

    const recibidas: Sucursal[][] = [];
    repo.observarSucursales(["suc_b", "suc_a"], (s) => recibidas.push(s));

    expect(recibidas.at(-1)?.map((s) => s.sucursalId)).toEqual(["suc_a", "suc_b"]);
  });

  it("observarSucursales omite un ID sembrado que no existe, sin romper", () => {
    const repo = new FakeConteoRepository();
    repo.sembrarSucursal(crearSucursal({ sucursalId: "suc_a" }));

    const recibidas: Sucursal[][] = [];
    repo.observarSucursales(["suc_a", "suc_inexistente"], (s) => recibidas.push(s));

    expect(recibidas.at(-1)?.map((s) => s.sucursalId)).toEqual(["suc_a"]);
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

  it("uidActual devuelve el uid del usuario fake inyectado", () => {
    const repo = new FakeConteoRepository({ uid: "uid_ana", nombre: "Ana Ramírez" });
    expect(repo.uidActual()).toBe("uid_ana");
  });

  it("listarAuditoria (ticket #45) devuelve sólo eventos de las sucursalIds pedidas, ordenados desc por ocurridoEn", async () => {
    const repo = new FakeConteoRepository();
    repo.sembrarAuditoria(
      crearEvento({
        eventoId: "e_norte_viejo",
        sucursalId: "suc_norte",
        ocurridoEn: new Date("2026-01-01T00:00:00Z"),
      }),
    );
    repo.sembrarAuditoria(
      crearEvento({
        eventoId: "e_norte_nuevo",
        sucursalId: "suc_norte",
        ocurridoEn: new Date("2026-06-01T00:00:00Z"),
      }),
    );
    repo.sembrarAuditoria(crearEvento({ eventoId: "e_sur", sucursalId: "suc_sur" }));

    const pagina = await repo.listarAuditoria(["suc_norte"]);

    expect(pagina.items.map((e) => e.eventoId)).toEqual(["e_norte_nuevo", "e_norte_viejo"]);
    expect(pagina.siguienteCursor).toBeNull();
  });

  it("listarAuditoria omite eventos sin sucursalId (los 6 tipos que no lo llevan)", async () => {
    const repo = new FakeConteoRepository();
    repo.sembrarAuditoria(crearEvento({ eventoId: "e_sin_sucursal", tipo: "USUARIO_CREADO" }));

    const pagina = await repo.listarAuditoria(["suc_norte"]);

    expect(pagina.items).toEqual([]);
  });

  describe("issue #41 — reintento con backoff y fallo expuesto", () => {
    it("mientras queden rechazos sembrados por debajo de MAX_REINTENTOS, no marca error y termina sincronizando", async () => {
      vi.useFakeTimers();
      try {
        const repo = new FakeConteoRepository({ uid: "uid_ana", nombre: "Ana Ramírez" });
        repo.sembrarLinea("ses_1", crearLinea());
        repo.sembrarRechazosAporte("ses_1", "cat_5000", 2); // menos que MAX_REINTENTOS (3)

        const pendientes: number[] = [];
        const errores: number[] = [];
        repo.observarEscriturasPendientes("ses_1", (n) => pendientes.push(n));
        repo.observarEscriturasConError("ses_1", (n) => errores.push(n));

        await repo.registrarAporte({ sesionId: "ses_1", categoriaId: "cat_5000", cantidad: 12 });
        expect(pendientes.at(-1)).toBe(1);

        await vi.advanceTimersByTimeAsync(0);

        expect(errores.at(-1)).toBe(0);
        expect(pendientes.at(-1)).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });

    it("al agotar MAX_REINTENTOS rechazos sembrados, marca fallo permanente sin decrementar pendientes", async () => {
      vi.useFakeTimers();
      try {
        const repo = new FakeConteoRepository({ uid: "uid_ana", nombre: "Ana Ramírez" });
        repo.sembrarLinea("ses_1", crearLinea());
        repo.sembrarRechazosAporte("ses_1", "cat_5000", 10); // más que suficientes para agotar

        const pendientes: number[] = [];
        const errores: number[] = [];
        repo.observarEscriturasPendientes("ses_1", (n) => pendientes.push(n));
        repo.observarEscriturasConError("ses_1", (n) => errores.push(n));

        await repo.registrarAporte({ sesionId: "ses_1", categoriaId: "cat_5000", cantidad: 12 });
        await vi.advanceTimersByTimeAsync(0);

        expect(errores.at(-1)).toBe(1);
        expect(pendientes.at(-1)).toBe(1); // nunca se pierde en silencio
      } finally {
        vi.useRealTimers();
      }
    });

    it("reintentarEscriturasFallidas limpia el error y reintenta; si ya no quedan rechazos sembrados, termina en éxito", async () => {
      vi.useFakeTimers();
      try {
        const repo = new FakeConteoRepository({ uid: "uid_ana", nombre: "Ana Ramírez" });
        repo.sembrarLinea("ses_1", crearLinea());
        // Exactamente MAX_REINTENTOS + 1 (4): agota los intentos automáticos
        // (intentos 0..3) una sola vez y no deja rechazos sembrados para el
        // reintento manual, que por eso debe terminar en éxito.
        repo.sembrarRechazosAporte("ses_1", "cat_5000", 4);

        const pendientes: number[] = [];
        const errores: number[] = [];
        repo.observarEscriturasPendientes("ses_1", (n) => pendientes.push(n));
        repo.observarEscriturasConError("ses_1", (n) => errores.push(n));

        await repo.registrarAporte({ sesionId: "ses_1", categoriaId: "cat_5000", cantidad: 12 });
        await vi.advanceTimersByTimeAsync(0);
        expect(errores.at(-1)).toBe(1);

        repo.reintentarEscriturasFallidas("ses_1");
        expect(errores.at(-1)).toBe(0); // se limpia de inmediato

        await vi.advanceTimersByTimeAsync(0);

        expect(errores.at(-1)).toBe(0);
        expect(pendientes.at(-1)).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
