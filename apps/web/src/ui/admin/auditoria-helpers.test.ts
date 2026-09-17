// apps/web/src/ui/admin/auditoria-helpers.test.ts
import type { EventoAuditoria } from "@conteo/shared/models/evento-auditoria.js";
import type { Sucursal } from "@conteo/shared/models/sucursal.js";
import type { Usuario } from "@conteo/shared/models/usuario.js";
import { describe, expect, it } from "vitest";
import { describirContexto, obtenerAutor, obtenerNombreSucursal } from "./auditoria-helpers.js";

function evento(overrides: Partial<EventoAuditoria>): EventoAuditoria {
  return {
    eventoId: "evt_123",
    tipo: "SESION_ABIERTA",
    ocurridoEn: new Date("2026-08-01T10:00:00Z"),
    ...overrides,
  };
}

const mockUsuarios = new Map<string, Usuario>([
  [
    "uid_admin_1",
    {
      uid: "uid_admin_1",
      nombre: "Carlos Admin",
      correo: "admin@negocio.com",
      rol: "admin",
      sucursalesAsignadas: [],
      activo: true,
      creadoEn: new Date(),
      creadoPor: "sistema",
    },
  ],
  [
    "uid_cajero_1",
    {
      uid: "uid_cajero_1",
      nombre: "Ana Cajera",
      correo: "ana@negocio.com",
      rol: "cajero",
      sucursalesAsignadas: ["suc_1"],
      activo: true,
      creadoEn: new Date(),
      creadoPor: "uid_admin_1",
    },
  ],
]);

const mockSucursales = new Map<string, Sucursal>([
  [
    "suc_1",
    {
      sucursalId: "suc_1",
      nombre: "Sucursal Norte",
      direccion: "Calle 10 # 20",
      conectividad: "wifi",
      activa: true,
      sesionAbiertaId: null,
      creadaEn: new Date(),
    },
  ],
]);

describe("auditoria-helpers · obtenerAutor", () => {
  it("identifica eventos generados por cron como Sistema Automático", () => {
    const e = evento({ tipo: "AUDITORIA_PURGADA", origen: "cron", eliminados: 50 });
    const autor = obtenerAutor(e, mockUsuarios);
    expect(autor.nombre).toBe("Sistema");
    expect(autor.rol).toBe("Automático");
  });

  it("prioriza usuarioNombre cuando está denormalizado en el evento", () => {
    const e = evento({
      tipo: "APORTE_CREADO",
      usuarioId: "uid_cajero_1",
      usuarioNombre: "Ana Cajera (Histórico)",
    });
    const autor = obtenerAutor(e, mockUsuarios);
    expect(autor.nombre).toBe("Ana Cajera (Histórico)");
    expect(autor.rol).toBe("Cajero");
  });

  it("resuelve ejecutadoPor contra el mapa de usuarios", () => {
    const e = evento({
      tipo: "USUARIO_CREADO",
      ejecutadoPor: "uid_admin_1",
    });
    const autor = obtenerAutor(e, mockUsuarios);
    expect(autor.nombre).toBe("Carlos Admin");
    expect(autor.rol).toBe("Gerente");
  });

  it("muestra el UID si ejecutadoPor no está en el mapa de usuarios", () => {
    const e = evento({
      tipo: "USUARIO_CREADO",
      ejecutadoPor: "uid_desconocido",
    });
    const autor = obtenerAutor(e, mockUsuarios);
    expect(autor.nombre).toBe("uid_desconocido");
  });

  it("retorna guion cuando no hay autor determinable", () => {
    const e = evento({ tipo: "SESION_ABIERTA" });
    const autor = obtenerAutor(e);
    expect(autor.nombre).toBe("—");
  });
});

describe("auditoria-helpers · describirContexto", () => {
  it("describe APORTE_MODIFICADO con cantidad anterior y nueva", () => {
    const e = evento({
      tipo: "APORTE_MODIFICADO",
      cantidadAnterior: 30,
      cantidadNueva: 28,
    });
    expect(describirContexto(e)).toBe("Ajuste de aporte: 30 → 28 unid.");
  });

  it("describe APORTE_CREADO con cantidad inicial", () => {
    const e = evento({
      tipo: "APORTE_CREADO",
      cantidadNueva: 15,
    });
    expect(describirContexto(e)).toBe("Aporte inicial: 15 unid.");
  });

  it("describe SESION_CERRADA normal", () => {
    const e = evento({
      tipo: "SESION_CERRADA",
      forzado: false,
    });
    expect(describirContexto(e)).toBe("Cierre normal de sesión");
  });

  it("describe SESION_CERRADA forzada con pendientes", () => {
    const e = evento({
      tipo: "SESION_CERRADA",
      forzado: true,
      sinConfirmar: ["uid_1", "uid_2"],
    });
    expect(describirContexto(e)).toBe("Cierre forzado (2 pendientes sin sincronizar)");
  });

  it("describe CIERRE_BLOQUEADO con participantes sin confirmar", () => {
    const e = evento({
      tipo: "CIERRE_BLOQUEADO",
      sinConfirmar: ["uid_1", "uid_2", "uid_3"],
    });
    expect(describirContexto(e)).toBe("Bloqueado por 3 participantes sin sincronizar");
  });

  it("describe USUARIO_ACTUALIZADO listando los campos modificados", () => {
    const e = evento({
      tipo: "USUARIO_ACTUALIZADO",
      campos: ["activo", "nombre"],
    });
    expect(describirContexto(e)).toBe("Campos actualizados: activo, nombre");
  });

  it("describe RECONCILIACION con ajuste de unidades", () => {
    const e = evento({
      tipo: "RECONCILIACION",
      cantidadAnterior: 10,
      cantidadNueva: 12,
    });
    expect(describirContexto(e)).toBe("Reconciliación: 10 → 12 unid.");
  });

  it("describe AUDITORIA_PURGADA con número de eventos eliminados", () => {
    const e = evento({
      tipo: "AUDITORIA_PURGADA",
      eliminados: 400,
    });
    expect(describirContexto(e)).toBe("Purga de retención: 400 eventos eliminados");
  });

  it("describe CATEGORIA_CREADA indicando si provino de un conteo", () => {
    const e = evento({
      tipo: "CATEGORIA_CREADA",
      origen: "conteo",
    });
    expect(describirContexto(e)).toBe("Creada desde conteo en sesión");
  });
});

describe("auditoria-helpers · obtenerNombreSucursal", () => {
  it("retorna el nombre de la sucursal cuando existe en el mapa", () => {
    const e = evento({ sucursalId: "suc_1" });
    expect(obtenerNombreSucursal(e, mockSucursales)).toBe("Sucursal Norte");
  });

  it("retorna sucursalNombre si ya viene denormalizado", () => {
    const e = evento({ sucursalNombre: "Sucursal Centro" });
    expect(obtenerNombreSucursal(e)).toBe("Sucursal Centro");
  });

  it("retorna el ID si no está en el mapa", () => {
    const e = evento({ sucursalId: "suc_desconocida" });
    expect(obtenerNombreSucursal(e, mockSucursales)).toBe("suc_desconocida");
  });

  it("retorna Global si no está ligada a una sucursal", () => {
    const e = evento({});
    expect(obtenerNombreSucursal(e)).toBe("Global");
  });
});
