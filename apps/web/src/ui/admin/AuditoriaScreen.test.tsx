// apps/web/src/ui/admin/AuditoriaScreen.test.tsx
// (docs/plan-panel-administrador.md §5, fase F3, R6)
import { FakeAdminRepository } from "@conteo/data";
import type { EventoAuditoria } from "@conteo/shared/models/evento-auditoria.js";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdminRepositoryProvider } from "../../state/admin-contexto.js";
import { AuditoriaScreen } from "./AuditoriaScreen.js";

function eventoBase(overrides: Partial<EventoAuditoria> = {}): EventoAuditoria {
  return {
    eventoId: "evt_1",
    tipo: "SESION_ABIERTA",
    ocurridoEn: new Date("2026-08-01T10:00:00Z"),
    ...overrides,
  };
}

function renderPantalla(repo: FakeAdminRepository) {
  return render(
    <AdminRepositoryProvider repo={repo}>
      <AuditoriaScreen />
    </AdminRepositoryProvider>,
  );
}

describe("AuditoriaScreen (F3, R6)", () => {
  it("muestra un esqueleto con la forma final mientras carga", () => {
    const repo = new FakeAdminRepository();
    repo.sembrarAuditoria(eventoBase());

    renderPantalla(repo);

    expect(screen.getAllByTestId("fila-esqueleto").length).toBeGreaterThan(0);
  });

  it("lista los eventos sembrados", async () => {
    const repo = new FakeAdminRepository();
    repo.sembrarAuditoria(eventoBase());

    renderPantalla(repo);

    expect(await screen.findByText(/sesión abierta/i)).toBeInTheDocument();
  });

  it("el filtro por tipo lista TODOS los tipos del catálogo, incluso sin eventos sembrados", async () => {
    const repo = new FakeAdminRepository();
    // Ningún evento AUDITORIA_PURGADA sembrado: si el select derivara de los
    // eventos vistos en vez del tipo exportado, esta opción no existiría.
    repo.sembrarAuditoria(eventoBase());

    renderPantalla(repo);

    fireEvent.change(screen.getByLabelText(/filtrar por/i), { target: { value: "tipo" } });

    const selectTipo = await screen.findByLabelText(/^tipo$/i);
    expect(within(selectTipo).getByRole("option", { name: /auditoría purgada/i })).toBeDefined();
  });

  it("el filtro por tipo reduce los resultados a un solo tipo", async () => {
    const repo = new FakeAdminRepository();
    repo.sembrarAuditoria(eventoBase({ eventoId: "evt_abierta", tipo: "SESION_ABIERTA" }));
    repo.sembrarAuditoria(eventoBase({ eventoId: "evt_cerrada", tipo: "SESION_CERRADA" }));

    renderPantalla(repo);

    expect(await screen.findByText(/sesión cerrada/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/filtrar por/i), { target: { value: "tipo" } });
    fireEvent.change(await screen.findByLabelText(/^tipo$/i), {
      target: { value: "SESION_ABIERTA" },
    });

    // El texto se busca sólo dentro de la tabla: el `<select>` de tipo sigue
    // teniendo la opción "Sesión cerrada" en el DOM aunque no esté elegida.
    const tabla = screen.getByRole("table");
    expect(await within(tabla).findByText(/sesión abierta/i)).toBeInTheDocument();
    expect(within(tabla).queryByText(/sesión cerrada/i)).not.toBeInTheDocument();
  });

  it('"Cargar más" sólo aparece cuando hay más páginas', async () => {
    const repo = new FakeAdminRepository({ tamanoPagina: 1 });
    repo.sembrarAuditoria(
      eventoBase({ eventoId: "evt_1", ocurridoEn: new Date("2026-08-01T10:00:00Z") }),
    );
    repo.sembrarAuditoria(
      eventoBase({ eventoId: "evt_2", ocurridoEn: new Date("2026-08-02T10:00:00Z") }),
    );

    renderPantalla(repo);

    await screen.findByText(/sesión abierta/i);
    expect(screen.getByRole("button", { name: /cargar más/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /cargar más/i }));

    await vi.waitFor(() => {
      expect(screen.queryByRole("button", { name: /cargar más/i })).not.toBeInTheDocument();
    });
  });

  it("muestra un error cuando falla la carga", async () => {
    const repo = new FakeAdminRepository();
    repo.listarAuditoria = vi.fn().mockRejectedValue(new Error("network"));

    renderPantalla(repo);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /no se pudieron cargar los eventos de auditoría\. intenta de nuevo\./i,
    );
    // El defecto real: sin `.catch()`, `cargando` se queda en `true` para
    // siempre y el esqueleto no se va nunca, aunque el alert sí aparezca.
    expect(screen.queryByTestId("fila-esqueleto")).not.toBeInTheDocument();
  });

  it("muestra el autor resuelto y el contexto del evento en las columnas", async () => {
    const repo = new FakeAdminRepository();
    repo.sembrarUsuario({
      uid: "uid_admin_carlos",
      nombre: "Carlos Admin",
      correo: "carlos@negocio.com",
      rol: "admin",
      sucursalesAsignadas: [],
      activo: true,
      creadoEn: new Date(),
      creadoPor: "sistema",
    });
    repo.sembrarAuditoria(
      eventoBase({
        eventoId: "evt_cierre_1",
        tipo: "SESION_CERRADA",
        forzado: true,
        sinConfirmar: ["uid_pend"],
        ejecutadoPor: "uid_admin_carlos",
      }),
    );

    renderPantalla(repo);

    expect(await screen.findByText("Carlos Admin")).toBeInTheDocument();
    expect(screen.getByText("Gerente")).toBeInTheDocument();
    expect(
      screen.getByText(/cierre forzado \(1 pendientes sin sincronizar\)/i),
    ).toBeInTheDocument();
  });

  it("el filtro por sucursal muestra un selector con las sucursales disponibles", async () => {
    const repo = new FakeAdminRepository();
    repo.sembrarSucursal({
      sucursalId: "suc_norte",
      nombre: "Sucursal Norte",
      direccion: "Calle 1",
      conectividad: "wifi",
      activa: true,
      sesionAbiertaId: null,
      creadaEn: new Date(),
    });

    renderPantalla(repo);

    fireEvent.change(screen.getByLabelText(/filtrar por/i), { target: { value: "sucursalId" } });

    const selectSucursal = await screen.findByLabelText(/^sucursal$/i);
    expect(within(selectSucursal).getByRole("option", { name: /sucursal norte/i })).toBeDefined();
  });

  it("el filtro por usuario muestra un selector con los usuarios disponibles", async () => {
    const repo = new FakeAdminRepository();
    repo.sembrarUsuario({
      uid: "uid_maria",
      nombre: "María Gómez",
      correo: "maria@negocio.com",
      rol: "cajero",
      sucursalesAsignadas: [],
      activo: true,
      creadoEn: new Date(),
      creadoPor: "admin",
    });

    renderPantalla(repo);

    fireEvent.change(screen.getByLabelText(/filtrar por/i), { target: { value: "usuarioId" } });

    const selectUsuario = await screen.findByLabelText(/^usuario$/i);
    expect(within(selectUsuario).getByRole("option", { name: /maría gómez/i })).toBeDefined();
  });

  it("al hacer clic en Detalle se abre el modal con la información completa", async () => {
    const repo = new FakeAdminRepository();
    repo.sembrarAuditoria(
      eventoBase({
        eventoId: "evt_modal_test",
        tipo: "USUARIO_CREADO",
        usuarioNombre: "Nuevo Cajero",
      }),
    );

    renderPantalla(repo);

    const botonDetalle = await screen.findByRole("button", {
      name: /detalle de evento evt_modal_test/i,
    });
    fireEvent.click(botonDetalle);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getAllByText(/nuevo cajero/i).length).toBeGreaterThan(0);
  });
});
