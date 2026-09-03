// apps/web/src/ui/admin/PanelScreen.test.tsx — R0
// (docs/plan-panel-administrador.md §5, fase F1)
import { FakeAdminRepository } from "@conteo/data";
import type { LineaConteo, SesionConteo } from "@conteo/shared";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { AdminRepositoryProvider } from "../../state/admin-contexto.js";
import { PanelScreen } from "./PanelScreen.js";

const ANCHO_ORIGINAL = window.innerWidth;

function fijarAncho(ancho: number): void {
  Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: ancho });
}

afterEach(() => {
  fijarAncho(ANCHO_ORIGINAL);
});

function sesionBase(overrides: Partial<SesionConteo> = {}): SesionConteo {
  return {
    sesionId: "ses_norte",
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

function lineaBase(
  categoriaId: string,
  valorUnitario: number,
  cantidadTotal: number,
  overrides: Partial<LineaConteo> = {},
): LineaConteo {
  return {
    categoriaId,
    valorUnitario,
    etiqueta: `$${valorUnitario}`,
    porArea: {},
    cantidadTotal,
    numAportantes: 1,
    versiones: {},
    actualizadaEn: new Date("2026-08-01T10:00:00Z"),
    actualizadaPor: "uid_ana",
    ...overrides,
  };
}

function renderPanel(repo: FakeAdminRepository) {
  return render(
    <MemoryRouter>
      <AdminRepositoryProvider repo={repo}>
        <PanelScreen />
      </AdminRepositoryProvider>
    </MemoryRouter>,
  );
}

describe("PanelScreen (R0, F1)", () => {
  it("muestra un esqueleto con la forma final mientras carga", () => {
    const repo = new FakeAdminRepository();
    repo.sembrarSesion(sesionBase());

    renderPanel(repo);

    expect(screen.getAllByTestId("fila-esqueleto").length).toBeGreaterThan(0);
    expect(screen.queryByText("Sucursal Norte")).not.toBeInTheDocument();
  });

  it("lista una fila por sucursal con sesión abierta", () => {
    const repo = new FakeAdminRepository();
    repo.sembrarSesion(sesionBase());
    repo.sembrarLinea("ses_norte", lineaBase("cat_5000", 5000, 10));

    renderPanel(repo);

    expect(screen.getByText("Sucursal Norte")).toBeInTheDocument();
    expect(screen.queryByTestId("fila-esqueleto")).not.toBeInTheDocument();
  });

  it("muestra el valor total en pesos calculado desde las líneas", () => {
    const repo = new FakeAdminRepository();
    repo.sembrarSesion(sesionBase());
    repo.sembrarLinea("ses_norte", lineaBase("cat_5000", 5000, 10)); // 50.000
    repo.sembrarLinea("ses_norte", lineaBase("cat_1000", 1000, 3)); // 3.000

    renderPanel(repo);

    // 10×5.000 + 3×1.000 = 53.000. `getByText` normaliza espacios (incluido
    // el U+00A0 que Intl inserta entre "$" y la cifra) a un espacio normal
    // antes de comparar — por eso el literal lleva un espacio normal, y no
    // hace falta reproducir el U+00A0 aquí (formato.test.ts ya lo verifica
    // con `toBe`, que sí compara los bytes exactos).
    expect(screen.getByText("$ 53.000")).toBeInTheDocument();
  });

  it("ofrece cerrar sólo en las sucursales con sesión abierta", () => {
    const repo = new FakeAdminRepository();
    repo.sembrarSesion(sesionBase({ sesionId: "ses_norte", sucursalNombre: "Sucursal Norte" }));
    repo.sembrarLinea("ses_norte", lineaBase("cat_5000", 5000, 1));
    repo.sembrarSesion(
      sesionBase({ sesionId: "ses_sur", sucursalId: "suc_sur", sucursalNombre: "Sucursal Sur" }),
    );
    repo.sembrarLinea("ses_sur", lineaBase("cat_5000", 5000, 1));

    renderPanel(repo);

    expect(screen.getAllByRole("button", { name: /cerrar/i })).toHaveLength(2);
  });

  it("ofrece contar en cada sucursal con sesión abierta", () => {
    const repo = new FakeAdminRepository();
    repo.sembrarSesion(sesionBase({ sesionId: "ses_norte", sucursalNombre: "Sucursal Norte" }));
    repo.sembrarLinea("ses_norte", lineaBase("cat_5000", 5000, 1));
    repo.sembrarSesion(
      sesionBase({ sesionId: "ses_sur", sucursalId: "suc_sur", sucursalNombre: "Sucursal Sur" }),
    );
    repo.sembrarLinea("ses_sur", lineaBase("cat_5000", 5000, 1));

    renderPanel(repo);

    expect(screen.getAllByRole("button", { name: /contar/i })).toHaveLength(2);
  });

  it("muestra un estado vacío cuando no hay ninguna sesión abierta", () => {
    const repo = new FakeAdminRepository();

    renderPanel(repo);

    expect(screen.getByText(/no hay sesiones de conteo abiertas/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /cerrar/i })).not.toBeInTheDocument();
  });

  it("a 375px sigue ofreciendo las tres acciones accesibles (issue overflow móvil)", () => {
    fijarAncho(375);
    const repo = new FakeAdminRepository();
    repo.sembrarSesion(sesionBase());
    repo.sembrarLinea("ses_norte", lineaBase("cat_5000", 5000, 10));

    renderPanel(repo);

    expect(screen.getByRole("button", { name: /análisis/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /contar/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cerrar/i })).toBeInTheDocument();
    expect(screen.getByTestId("fila-movil")).toBeInTheDocument();
  });

  it("a 1024px (escritorio) no usa la estructura de fila móvil", () => {
    const repo = new FakeAdminRepository();
    repo.sembrarSesion(sesionBase());
    repo.sembrarLinea("ses_norte", lineaBase("cat_5000", 5000, 10));

    renderPanel(repo);

    expect(screen.queryByTestId("fila-movil")).not.toBeInTheDocument();
  });
});
