import type { EventoAuditoria } from "@conteo/shared/models/evento-auditoria.js";
import type { Historico } from "@conteo/shared/models/historico.js";
import type { SesionConteo } from "@conteo/shared/models/sesion-conteo.js";
import { describe, expect, it } from "vitest";
import { FakeAdminRepository } from "./fake-admin-repository.js";

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

function crearEvento(overrides: Partial<EventoAuditoria> = {}): EventoAuditoria {
  return {
    eventoId: "evt_1",
    tipo: "SESION_ABIERTA",
    ocurridoEn: new Date("2026-08-02T08:00:00Z"),
    ...overrides,
  };
}

function crearHistorico(overrides: Partial<Historico> = {}): Historico {
  return {
    sesionId: "ses_20260801_norte_01",
    cerradaEn: new Date("2026-08-01T18:00:00Z"),
    totalUnidades: 120,
    totalMonetario: 600000,
    porCategoria: {},
    ...overrides,
  };
}

describe("FakeAdminRepository (implementación en memoria, docs/plan-panel-administrador.md §4)", () => {
  it("emite las sesiones abiertas sembradas", () => {
    const repo = new FakeAdminRepository();
    repo.sembrarSesion(crearSesion());
    repo.sembrarSesion(crearSesion({ sesionId: "ses_cerrada", estado: "cerrada" }));

    const recibidas: SesionConteo[][] = [];
    repo.observarSesionesAbiertas((s) => recibidas.push(s));

    expect(recibidas.at(-1)?.map((s) => s.sesionId)).toEqual(["ses_20260802_norte_01"]);
  });

  it("notifica a los suscriptores al sembrar una sesión nueva", () => {
    const repo = new FakeAdminRepository();
    repo.sembrarSesion(crearSesion());

    const recibidas: SesionConteo[][] = [];
    repo.observarSesionesAbiertas((s) => recibidas.push(s));
    expect(recibidas).toHaveLength(1);

    repo.sembrarSesion(
      crearSesion({ sesionId: "ses_nueva", abiertaEn: new Date("2026-08-03T08:00:00Z") }),
    );

    expect(recibidas).toHaveLength(2);
    expect(recibidas.at(-1)?.map((s) => s.sesionId).sort()).toEqual([
      "ses_20260802_norte_01",
      "ses_nueva",
    ]);
  });

  it("devuelve unsubscribe que corta las notificaciones", () => {
    const repo = new FakeAdminRepository();
    repo.sembrarSesion(crearSesion());

    const recibidas: SesionConteo[][] = [];
    const unsubscribe = repo.observarSesionesAbiertas((s) => recibidas.push(s));
    expect(recibidas).toHaveLength(1);

    unsubscribe();
    repo.sembrarSesion(crearSesion({ sesionId: "ses_tras_unsub" }));

    expect(recibidas).toHaveLength(1);
  });

  it("pagina la auditoría y devuelve cursor nulo en la última página", async () => {
    const repo = new FakeAdminRepository({ tamanoPagina: 2 });
    repo.sembrarAuditoria(crearEvento({ eventoId: "evt_1", ocurridoEn: new Date("2026-08-01T00:00:00Z") }));
    repo.sembrarAuditoria(crearEvento({ eventoId: "evt_2", ocurridoEn: new Date("2026-08-02T00:00:00Z") }));
    repo.sembrarAuditoria(crearEvento({ eventoId: "evt_3", ocurridoEn: new Date("2026-08-03T00:00:00Z") }));

    const primera = await repo.listarAuditoria(null);
    expect(primera.items.map((e) => e.eventoId)).toEqual(["evt_3", "evt_2"]);
    expect(primera.siguienteCursor).not.toBeNull();

    const segunda = await repo.listarAuditoria(null, primera.siguienteCursor);
    expect(segunda.items.map((e) => e.eventoId)).toEqual(["evt_1"]);
    expect(segunda.siguienteCursor).toBeNull();
  });

  it("devuelve un histórico por sucursal, o null si no tiene ninguno", async () => {
    const repo = new FakeAdminRepository();
    repo.sembrarHistorico("suc_norte", crearHistorico());

    const historicos = await repo.ultimoHistoricoPorSucursal(["suc_norte", "suc_sur"]);

    expect(historicos.get("suc_norte")?.sesionId).toBe("ses_20260801_norte_01");
    expect(historicos.get("suc_sur")).toBeNull();
  });

  it("registra la llamada a cerrarSesion con forzar", async () => {
    const repo = new FakeAdminRepository();

    await repo.cerrarSesion({ sesionId: "ses_1", forzar: true });

    expect(repo.llamadas.at(-1)).toEqual({
      metodo: "cerrarSesion",
      payload: { sesionId: "ses_1", forzar: true },
    });
  });
});
