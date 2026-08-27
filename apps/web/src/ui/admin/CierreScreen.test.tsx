// apps/web/src/ui/admin/CierreScreen.test.tsx (docs/plan-panel-administrador.md
// §5, fase F4, R5) — única pantalla del admin con wireframe
// (docs/diseno/11-ux-y-navegacion.md:277-291).
import { FirebaseError } from "firebase/app";
import { FakeAdminRepository } from "@conteo/data";
import type { EstadoSincronizacion } from "@conteo/data";
import type { LineaConteo } from "@conteo/shared/models/linea-conteo.js";
import type { SesionConteo } from "@conteo/shared/models/sesion-conteo.js";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AdminRepositoryProvider } from "../../state/admin-contexto.js";
import { CierreScreen } from "./CierreScreen.js";

function sesionBase(overrides: Partial<SesionConteo> = {}): SesionConteo {
  return {
    sesionId: "ses_1",
    sucursalId: "suc_norte",
    sucursalNombre: "Sucursal Norte",
    estado: "abierta",
    abiertaEn: new Date("2026-08-01T10:00:00Z"),
    abiertaPor: "uid_admin",
    cerradaEn: null,
    cerradaPor: null,
    participantes: ["uid_ana", "uid_luis"],
    totalUnidades: 0,
    sesionCorregidaId: null,
    ...overrides,
  };
}

function lineaBase(overrides: Partial<LineaConteo> = {}): LineaConteo {
  return {
    categoriaId: "cat_5000",
    valorUnitario: 5000,
    etiqueta: "$5.000",
    area: "Aseo",
    cantidadTotal: 10,
    numAportantes: 1,
    versiones: {},
    actualizadaEn: new Date("2026-08-01T10:00:00Z"),
    actualizadaPor: "uid_ana",
    ...overrides,
  };
}

function todosSincronizados(): EstadoSincronizacion {
  return {
    participantes: [
      { uid: "uid_ana", nombre: "Ana Ramírez", sincronizado: true },
      { uid: "uid_carlos", nombre: "Carlos Díaz", sincronizado: true },
    ],
  };
}

function unoSinConfirmar(): EstadoSincronizacion {
  return {
    participantes: [
      { uid: "uid_ana", nombre: "Ana Ramírez", sincronizado: true },
      { uid: "uid_luis", nombre: "Luis Pérez", sincronizado: false },
    ],
  };
}

function renderPantalla(repo: FakeAdminRepository, sesionId = "ses_1") {
  return render(
    <MemoryRouter initialEntries={[`/admin/sesiones/${sesionId}/cerrar`]}>
      <AdminRepositoryProvider repo={repo}>
        <Routes>
          <Route path="/admin/sesiones/:sesionId/cerrar" element={<CierreScreen />} />
        </Routes>
      </AdminRepositoryProvider>
    </MemoryRouter>,
  );
}

function sembrarBase(repo: FakeAdminRepository, sincronizacion: EstadoSincronizacion) {
  repo.sembrarSesion(sesionBase());
  repo.sembrarLinea("ses_1", lineaBase());
  repo.sembrarSincronizacion("ses_1", sincronizacion);
}

describe("CierreScreen (F4, R5)", () => {
  it("deshabilita 'Cerrar conteo' si hay alguien sin confirmar", () => {
    const repo = new FakeAdminRepository();
    sembrarBase(repo, unoSinConfirmar());

    renderPantalla(repo);

    const boton = screen.getByRole("button", { name: /cerrar conteo/i });
    expect(boton).toBeDisabled();
    // Razón accesible, no sólo un candado visual: un lector de pantalla debe
    // poder nombrar quién bloquea el cierre.
    expect(boton).toHaveAccessibleDescription(/luis pérez/i);
  });

  it("habilita 'Cerrar conteo' cuando todos están sincronizados", async () => {
    const repo = new FakeAdminRepository();
    sembrarBase(repo, todosSincronizados());

    renderPantalla(repo);

    const boton = screen.getByRole("button", { name: /cerrar conteo/i });
    expect(boton).toBeEnabled();

    fireEvent.click(boton);

    await vi.waitFor(() => {
      expect(repo.llamadas).toEqual([
        { metodo: "cerrarSesion", payload: { sesionId: "ses_1", forzar: false } },
      ]);
    });
  });

  it("oculta el forzado tras una divulgación", () => {
    const repo = new FakeAdminRepository();
    sembrarBase(repo, unoSinConfirmar());

    renderPantalla(repo);

    const detalle = screen.getByText(/forzar cierre de todos modos/i).closest("details")!;
    expect(detalle).not.toHaveAttribute("open");
    // `hidden: true`: el contenido de un <details> cerrado queda fuera del
    // árbol de accesibilidad, así que `getByRole` sin esta opción no lo
    // encontraría — precisamente lo que se está comprobando.
    expect(
      within(detalle).getByRole("button", { name: /^forzar cierre$/i, hidden: true }),
    ).not.toBeVisible();
  });

  it("advierte que se perderán los conteos sin sincronizar antes de forzar", () => {
    const repo = new FakeAdminRepository();
    sembrarBase(repo, unoSinConfirmar());

    renderPantalla(repo);

    fireEvent.click(screen.getByText(/forzar cierre de todos modos/i));

    const advertencia = screen.getByText(/se perder(á|an)/i);
    expect(advertencia).toBeVisible();
    expect(advertencia).toHaveTextContent(/luis pérez/i);
  });

  it("cierra con forzar:true al confirmar el forzado", async () => {
    const repo = new FakeAdminRepository();
    sembrarBase(repo, unoSinConfirmar());

    renderPantalla(repo);

    fireEvent.click(screen.getByText(/forzar cierre de todos modos/i));
    fireEvent.click(screen.getByRole("button", { name: /^forzar cierre$/i }));

    await vi.waitFor(() => {
      expect(repo.llamadas).toEqual([
        { metodo: "cerrarSesion", payload: { sesionId: "ses_1", forzar: true } },
      ]);
    });
  });

  it("muestra los nombres devueltos en details.sinConfirmar cuando el servidor rechaza el cierre", async () => {
    const repo = new FakeAdminRepository();
    // Todos sincronizados EN EL SNAPSHOT LOCAL — el botón queda habilitado —
    // pero el servidor responde con otra verdad: la carrera que
    // `details.sinConfirmar` existe para resolver.
    sembrarBase(repo, todosSincronizados());
    repo.cerrarSesion = vi.fn().mockRejectedValue(
      new (class extends FirebaseError {
        readonly details = { sinConfirmar: [{ uid: "uid_maria", nombre: "María Gómez" }] };
      })("functions/failed-precondition", "Hay cajeros con conteos sin sincronizar"),
    );

    renderPantalla(repo);

    fireEvent.click(screen.getByRole("button", { name: /cerrar conteo/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/maría gómez/i);
  });

  it("estado de sincronización degradado: quita el esqueleto, muestra la alerta y mantiene 'Cerrar conteo' deshabilitado", () => {
    const repo = new FakeAdminRepository();
    repo.sembrarSesion(sesionBase());
    repo.sembrarLinea("ses_1", lineaBase());
    repo.sembrarSincronizacion("ses_1", {
      participantes: [
        { uid: "uid_ana", nombre: "uid_ana", sincronizado: false },
        { uid: "uid_luis", nombre: "uid_luis", sincronizado: false },
      ],
      degradado: true,
    });

    renderPantalla(repo);

    expect(screen.queryAllByTestId("fila-esqueleto")).toHaveLength(0);
    expect(screen.getByRole("alert")).toHaveTextContent(
      /no se pudo leer el estado de sincronización/i,
    );
    // El guardián de la trampa: un estado degradado NUNCA debe habilitar el
    // cierre — si una corrección futura reintrodujera `participantes: []`
    // en el catch, este assert es el que lo detecta.
    expect(screen.getByRole("button", { name: /cerrar conteo/i })).toBeDisabled();
  });

  it("reserva la regla de tinta al bloque de sincronización", () => {
    const repo = new FakeAdminRepository();
    sembrarBase(repo, unoSinConfirmar());

    const { container } = renderPantalla(repo);

    // `Placa` sólo pinta la regla de tinta (un `<span aria-hidden="true">`
    // de 4px) cuando recibe `confirmado`; ningún icono de la pantalla usa
    // ese tag (los iconos son `<svg aria-hidden="true">`), así que el
    // selector es específico sin depender de clases de Tailwind. Debe haber
    // una por fila del bloque de sincronización...
    const bloqueSync = screen.getByRole("list", { name: /sincronización/i });
    expect(bloqueSync.querySelectorAll('span[aria-hidden="true"]')).toHaveLength(2);
    // ...y ninguna fuera de él: un test que sólo comprobara presencia
    // pasaría igual con la regla rociada por toda la pantalla.
    expect(container.querySelectorAll('span[aria-hidden="true"]')).toHaveLength(2);
  });
});
