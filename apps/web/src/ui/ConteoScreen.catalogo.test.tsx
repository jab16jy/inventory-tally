// apps/web/src/ui/ConteoScreen.catalogo.test.tsx — catálogo-en-conteo
// (ADR-21, docs/diseno/13-decisiones-adr.md#adr-21; doc 11 §4 y §10).
//
// Archivo separado de ConteoScreen.test.tsx a propósito (no engordarlo): los
// dos controles nuevos ("Sin área (N)" y "+ Producto") viven en la cabecera,
// nunca dentro de FilaCategoria (fijada por 6 archivos de test y su medición
// de ~82 px, doc 11 §4).
import { FakeConteoRepository } from "@conteo/data";
import type { Area, LineaConteo, SesionConteo } from "@conteo/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ConteoRepositoryProvider } from "../state/repositorio-contexto.js";

vi.mock("firebase/auth", () => ({
  onAuthStateChanged: vi.fn(),
}));

const { ConteoScreen } = await import("./ConteoScreen.js");

function renderConteoScreen(repo: FakeConteoRepository, sesionId = "ses_1") {
  return render(
    <MemoryRouter initialEntries={[`/conteo/${sesionId}`]}>
      <ConteoRepositoryProvider repo={repo}>
        <Routes>
          <Route
            path="/conteo/:sesionId"
            element={<ConteoScreen auth={{} as never} onSalir={vi.fn()} />}
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
    area: "Aseo",
    cantidadTotal: 0,
    numAportantes: 0,
    versiones: {},
    actualizadaEn: new Date("2026-08-02T08:00:00Z"),
    actualizadaPor: "",
    ...overrides,
  };
}

function crearArea(overrides: Partial<Area> = {}): Area {
  return {
    areaId: "area_aseo",
    nombre: "Aseo",
    activa: true,
    creadaEn: new Date("2026-01-15T10:00:00Z"),
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

  it('con 12 líneas "Sin área" aparece "Sin área (12)"', async () => {
    const repo = new FakeConteoRepository({ uid: "uid_ana", nombre: "Ana Ramírez" });
    for (let i = 0; i < 12; i++) {
      repo.sembrarLinea("ses_1", crearLinea({ categoriaId: `cat_${i}`, area: "Sin área" }));
    }
    renderConteoScreen(repo);

    expect(await screen.findByRole("button", { name: /sin área \(12\)/i })).toBeInTheDocument();
  });

  // Par negativo del test anterior (AGENTS.md §2): sin esto, "N > 0" podría
  // invertirse o desaparecer sin que ningún test lo note.
  it('con 0 líneas "Sin área" el botón "Sin área" no existe', async () => {
    const repo = new FakeConteoRepository({ uid: "uid_ana", nombre: "Ana Ramírez" });
    repo.sembrarLinea("ses_1", crearLinea({ area: "Aseo" }));
    renderConteoScreen(repo);

    expect(await screen.findByRole("button", { name: /\+ producto/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /sin área/i })).not.toBeInTheDocument();
  });

  it("vincular desde HojaAreas llama a vincularArea con los args exactos y la línea deja de estar sin área", async () => {
    const repo = new FakeConteoRepository({ uid: "uid_ana", nombre: "Ana Ramírez" });
    repo.sembrarArea(crearArea({ areaId: "area_cocina", nombre: "Cocina" }));
    repo.sembrarLinea("ses_1", crearLinea({ area: "Sin área" }));
    renderConteoScreen(repo);

    fireEvent.click(await screen.findByRole("button", { name: /sin área \(1\)/i }));
    fireEvent.click(screen.getByRole("button", { name: "$5.000" }));
    fireEvent.click(screen.getByRole("button", { name: "Cocina" }));

    expect(repo.llamadas).toHaveLength(1);
    expect(repo.llamadas[0]).toEqual({
      metodo: "vincularArea",
      payload: { sesionId: "ses_1", categoriaId: "cat_5000", areaId: "area_cocina" },
    });
    // El fake replica la semántica real (I-7/ADR-21): la línea ya no cuenta
    // como "Sin área", así que la afordancia se autoextingue.
    expect(screen.queryByRole("button", { name: /sin área/i })).not.toBeInTheDocument();
  });

  it("con sesión cerrada no existe ninguno de los dos botones", async () => {
    const repo = new FakeConteoRepository({ uid: "uid_ana", nombre: "Ana Ramírez" });
    repo.sembrarLinea("ses_1", crearLinea({ area: "Sin área" }));
    repo.sembrarSesion(crearSesion({ estado: "cerrada" }));
    renderConteoScreen(repo);

    expect(await screen.findByRole("dialog", { name: /sesión cerrada/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /\+ producto/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /sin área/i })).not.toBeInTheDocument();
  });

  it("regresión doc 11 §10: ningún nombre accesible matchea /cerrar|descartar/i, y sigue habiendo un solo role=alert como máximo", async () => {
    const repo = new FakeConteoRepository(
      { uid: "uid_ana", nombre: "Ana Ramírez" },
      { retrasoSincronizacionMs: 10_000 },
    );
    repo.sembrarLinea("ses_1", crearLinea({ area: "Sin área" }));
    renderConteoScreen(repo);

    // Dispara el banner de pendientes (único role="alert" permitido) con las
    // dos hojas nuevas montadas (cerradas) alrededor.
    fireEvent.click(await screen.findByRole("button", { name: /sumar \$5\.000/i }));
    await screen.findByRole("alert");
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /cerrar|descartar/i })).not.toBeInTheDocument();

    // Y con "+ Producto" abierto, la restricción se sostiene.
    fireEvent.click(screen.getByRole("button", { name: /\+ producto/i }));
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /cerrar|descartar/i })).not.toBeInTheDocument();
  });
});
