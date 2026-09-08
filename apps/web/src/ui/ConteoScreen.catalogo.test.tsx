// apps/web/src/ui/ConteoScreen.catalogo.test.tsx — catálogo-en-conteo
// (ADR-21, docs/diseno/13-decisiones-adr.md#adr-21; doc 11 §4 y §10).
//
// Archivo separado de ConteoScreen.test.tsx a propósito (no engordarlo): los
// dos controles nuevos ("Sin área (N)" y "+ Producto") viven en la cabecera,
// nunca dentro de FilaCategoria (fijada por 6 archivos de test y su medición
// de ~82 px, doc 11 §4).
import { FakeConteoRepository } from "@conteo/data";
import type { LineaConteo, SesionConteo } from "@conteo/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ConteoRepositoryProvider } from "../state/repositorio-contexto.js";

vi.mock("firebase/auth", () => ({
  onAuthStateChanged: vi.fn(),
}));

const { ConteoScreen } = await import("./ConteoScreen.js");

function renderConteoScreen(repo: FakeConteoRepository, sesionId = "ses_1") {
  // ADR-23: sin esto, ConteoScreen redirige a /preparar por falta de área activa.
  localStorage.setItem(`areaActiva:${sesionId}`, "area_1");
  return render(
    <MemoryRouter initialEntries={[`/conteo/${sesionId}`]}>
      <ConteoRepositoryProvider repo={repo}>
        <Routes>
          <Route
            path="/conteo/:sesionId"
            element={<ConteoScreen auth={{} as never} />}
          />
        </Routes>
      </ConteoRepositoryProvider>
    </MemoryRouter>,
  );
}

function crearLinea(overrides: Partial<LineaConteo> = {}): LineaConteo {
  return {
    categoriaId: "cat_5000",
    valorUnitario: 5000,
    etiqueta: "$5.000",
    porArea: {},
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
    sesionId: "ses_1",
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

describe("ConteoScreen · catálogo en conteo (ADR-21, doc 11 §4/§10)", () => {
  it("la confirmación es obligatoria: crearCategoriaEnSesion no se llama hasta 'Sí, crear', y 'Corregir' cancela sin llamar", async () => {
    const repo = new FakeConteoRepository({ uid: "uid_ana", nombre: "Ana Ramírez" });
    repo.sembrarLinea("ses_1", crearLinea());
    renderConteoScreen(repo);

    fireEvent.click(await screen.findByRole("button", { name: /\+ producto/i }));
    fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: "Bolsas" } });
    fireEvent.click(screen.getByRole("button", { name: /continuar/i }));

    // Escribir el nombre y pulsar "Continuar" NO llama a la callable — sólo
    // abre la confirmación. Un test que sólo comprobara el final pasaría
    // igual sin este paso intermedio.
    expect(repo.llamadas).toHaveLength(0);
    expect(await screen.findByRole("status")).toHaveTextContent("¿Crear el producto «Bolsas»?");

    fireEvent.click(screen.getByRole("button", { name: /corregir/i }));
    expect(repo.llamadas).toHaveLength(0);
    expect(screen.getByLabelText(/nombre/i)).toHaveValue("Bolsas");

    fireEvent.click(screen.getByRole("button", { name: /continuar/i }));
    fireEvent.click(screen.getByRole("button", { name: /sí, crear/i }));

    expect(repo.llamadas).toHaveLength(1);
    expect(repo.llamadas[0]).toMatchObject({
      metodo: "crearCategoriaEnSesion",
      payload: expect.objectContaining({ sesionId: "ses_1", etiqueta: "Bolsas" }),
    });
  });

  it("con sesión cerrada no existe el botón + Producto", async () => {
    const repo = new FakeConteoRepository({ uid: "uid_ana", nombre: "Ana Ramírez" });
    repo.sembrarLinea("ses_1", crearLinea());
    repo.sembrarSesion(crearSesion({ estado: "cerrada" }));
    renderConteoScreen(repo);

    expect(await screen.findByRole("dialog", { name: /sesión cerrada/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /\+ producto/i })).not.toBeInTheDocument();
  });

  it("regresión doc 11 §10: ningún nombre accesible matchea /cerrar|descartar/i, y sigue habiendo un solo role=alert como máximo", async () => {
    const repo = new FakeConteoRepository(
      { uid: "uid_ana", nombre: "Ana Ramírez" },
      { retrasoSincronizacionMs: 10_000 },
    );
    repo.sembrarLinea("ses_1", crearLinea());
    renderConteoScreen(repo);

    // Dispara el banner de pendientes (único role="alert" permitido) agrupando
    // una tanda desde la Hoja.
    fireEvent.click(await screen.findByRole("button", { name: /contar \$5\.000/i }));
    fireEvent.click(screen.getByRole("button", { name: "1" }));
    fireEvent.click(screen.getByRole("button", { name: /agrupar/i }));
    await screen.findByRole("alert");
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /cerrar|descartar/i })).not.toBeInTheDocument();

    // Y con "+ Producto" abierto, la restricción se sostiene.
    fireEvent.click(screen.getByRole("button", { name: /\+ producto/i }));
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /cerrar|descartar/i })).not.toBeInTheDocument();
  });
});
