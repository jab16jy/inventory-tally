// apps/web/src/ui/admin/SesionesScreen.test.tsx
// (docs/plan-panel-administrador.md §5, fase F3, R4)
import { FakeAdminRepository } from "@conteo/data";
import type { SesionConteo } from "@conteo/shared/models/sesion-conteo.js";
import type { Sucursal } from "@conteo/shared/models/sucursal.js";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AdminRepositoryProvider } from "../../state/admin-contexto.js";
import { SesionesScreen } from "./SesionesScreen.js";

function sucursalBase(overrides: Partial<Sucursal> = {}): Sucursal {
  return {
    sucursalId: "suc_norte",
    nombre: "Sucursal Norte",
    direccion: "Calle 10 # 5-20",
    conectividad: "wifi",
    activa: true,
    sesionAbiertaId: null,
    creadaEn: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

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
    participantes: [],
    totalUnidades: 0,
    sesionCorregidaId: null,
    ...overrides,
  };
}

function renderPantalla(repo: FakeAdminRepository) {
  return render(
    <MemoryRouter initialEntries={["/admin/sesiones"]}>
      <AdminRepositoryProvider repo={repo}>
        <Routes>
          <Route path="/admin/sesiones" element={<SesionesScreen />} />
          <Route path="/admin/sesiones/:sesionId/analisis" element={<p>Pantalla de análisis</p>} />
        </Routes>
      </AdminRepositoryProvider>
    </MemoryRouter>,
  );
}

describe("SesionesScreen (F3, R4)", () => {
  it("muestra un esqueleto con la forma final mientras carga", () => {
    const repo = new FakeAdminRepository();
    repo.sembrarSesion(sesionBase());

    renderPantalla(repo);

    // `listarSesiones` es una promesa: justo después de montar, todavía no
    // se resolvió el primer `.then()` (es un microtask pendiente), así que
    // la pantalla está en su estado de carga real, sin necesidad de un doble
    // a medida.
    expect(screen.getAllByTestId("fila-esqueleto").length).toBeGreaterThan(0);
  });

  it("lista las sesiones sembradas", async () => {
    const repo = new FakeAdminRepository();
    repo.sembrarSesion(sesionBase());

    renderPantalla(repo);

    expect(await screen.findByText("Sucursal Norte")).toBeInTheDocument();
    expect(screen.queryByTestId("fila-esqueleto")).not.toBeInTheDocument();
  });

  it("el filtro de estado reduce los resultados", async () => {
    const repo = new FakeAdminRepository();
    repo.sembrarSesion(sesionBase({ sesionId: "ses_abierta", estado: "abierta" }));
    repo.sembrarSesion(
      sesionBase({
        sesionId: "ses_cerrada",
        sucursalNombre: "Sucursal Sur",
        estado: "cerrada",
        cerradaEn: new Date("2026-08-02T10:00:00Z"),
        cerradaPor: "uid_admin",
      }),
    );

    renderPantalla(repo);

    expect(await screen.findByText("Sucursal Sur")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/estado/i), { target: { value: "abierta" } });

    expect(await screen.findByText("Sucursal Norte")).toBeInTheDocument();
    expect(screen.queryByText("Sucursal Sur")).not.toBeInTheDocument();
  });

  it('"Cargar más" sólo aparece cuando hay más páginas, y las trae al hacer click', async () => {
    const repo = new FakeAdminRepository({ tamanoPagina: 2 });
    repo.sembrarSucursal(sucursalBase());
    repo.sembrarSesion(
      sesionBase({ sesionId: "ses_1", abiertaEn: new Date("2026-08-01T10:00:00Z") }),
    );
    repo.sembrarSesion(
      sesionBase({
        sesionId: "ses_2",
        sucursalNombre: "Norte 2",
        abiertaEn: new Date("2026-08-02T10:00:00Z"),
      }),
    );
    repo.sembrarSesion(
      sesionBase({
        sesionId: "ses_3",
        sucursalNombre: "Norte 3",
        abiertaEn: new Date("2026-08-03T10:00:00Z"),
      }),
    );

    renderPantalla(repo);

    await screen.findByText("Norte 3");
    expect(screen.getByRole("button", { name: /cargar más/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /cargar más/i }));

    await screen.findByText("Sucursal Norte");
    expect(screen.queryByRole("button", { name: /cargar más/i })).not.toBeInTheDocument();
  });

  it("muestra un error cuando falla la carga", async () => {
    const repo = new FakeAdminRepository();
    repo.listarSesiones = vi.fn().mockRejectedValue(new Error("network"));

    renderPantalla(repo);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /no se pudieron cargar las sesiones\. intenta de nuevo\./i,
    );
    // El defecto real: sin `.catch()`, `cargando` se queda en `true` para
    // siempre y el esqueleto no se va nunca, aunque el alert sí aparezca.
    expect(screen.queryByTestId("fila-esqueleto")).not.toBeInTheDocument();
  });

  it('cada fila ofrece "Análisis" y navega al dashboard de la sesión', async () => {
    // Causa raíz: AnalisisScreen ya existe completo, pero SesionesScreen
    // (donde viven las sesiones CERRADAS) no ofrece ninguna acción por fila
    // para llegar ahí — sólo PanelScreen lo hace, y sólo para abiertas.
    const repo = new FakeAdminRepository();
    repo.sembrarSesion(
      sesionBase({ estado: "cerrada", cerradaEn: new Date("2026-08-02T10:00:00Z") }),
    );

    renderPantalla(repo);

    const boton = await screen.findByRole("button", { name: /análisis — sucursal norte/i });
    fireEvent.click(boton);

    expect(await screen.findByText("Pantalla de análisis")).toBeInTheDocument();
  });

  // Par afirmativo del arreglo hallado por la revisión: en el historial la
  // misma sucursal aparece muchas veces (una fila por conteo cerrado). Sin
  // la fecha en el nombre accesible, ambos botones serían indistinguibles.
  it("distingue el botón de análisis de dos conteos de la misma sucursal", async () => {
    const repo = new FakeAdminRepository();
    repo.sembrarSucursal(sucursalBase());
    repo.sembrarSesion(
      sesionBase({
        sesionId: "ses_agosto",
        estado: "cerrada",
        abiertaEn: new Date("2026-08-01T10:00:00Z"),
        cerradaEn: new Date("2026-08-01T18:00:00Z"),
      }),
    );
    repo.sembrarSesion(
      sesionBase({
        sesionId: "ses_julio",
        estado: "cerrada",
        abiertaEn: new Date("2026-07-01T10:00:00Z"),
        cerradaEn: new Date("2026-07-01T18:00:00Z"),
      }),
    );

    renderPantalla(repo);

    const botones = await screen.findAllByRole("button", { name: /análisis — sucursal norte/i });
    expect(botones).toHaveLength(2);
    const nombres = botones.map((b) => b.getAttribute("aria-label"));
    expect(new Set(nombres).size).toBe(2);
  });
});
