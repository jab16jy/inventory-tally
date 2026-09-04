// apps/web/src/ui/AnalisisConteoScreen.test.tsx — dashboard de análisis del
// cajero para UN conteo (RF-14: "Dashboard operativo para el cajero, sin
// información monetaria"). El eje de todos estos tests es la invariante I-9
// (el cajero NUNCA ve dinero): cada uno afirma unidades, nunca `$`.
import { FakeConteoRepository } from "@conteo/data";
import type { LineaConteo, SesionConteo } from "@conteo/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ConteoRepositoryProvider } from "../state/repositorio-contexto.js";
import { AnalisisConteoScreen } from "./AnalisisConteoScreen.js";

function crearSesion(overrides: Partial<SesionConteo> = {}): SesionConteo {
  return {
    sesionId: "ses_1",
    sucursalId: "suc_norte",
    sucursalNombre: "Sucursal Norte",
    estado: "cerrada",
    abiertaEn: new Date("2026-08-02T13:00:00Z"),
    abiertaPor: "uid_admin",
    cerradaEn: new Date("2026-08-02T15:00:00Z"),
    cerradaPor: "uid_admin",
    participantes: ["uid_ana", "uid_luis"],
    totalUnidades: 10,
    sesionCorregidaId: null,
    ...overrides,
  };
}

function crearLinea(overrides: Partial<LineaConteo> = {}): LineaConteo {
  return {
    categoriaId: "c1",
    valorUnitario: 1_000_000,
    // Sin "$" a propósito: la etiqueta de categoría en producción SÍ puede
    // llevar "$" (es la denominación, ver DESIGN.md), pero eso confundiría
    // la prueba de la invariante monetaria de abajo — ese test verifica que
    // no se calcule/pinte DINERO (subtotal/total), no que el sistema entero
    // evite el carácter "$" en cualquier texto.
    etiqueta: "Categoría",
    porArea: {},
    cantidadTotal: 0,
    numAportantes: 0,
    versiones: {},
    actualizadaEn: new Date("2026-08-02T14:00:00Z"),
    actualizadaPor: "uid_ana",
    ...overrides,
  };
}

function renderPantalla(repo: FakeConteoRepository, sesionId = "ses_1") {
  return render(
    <MemoryRouter initialEntries={[`/mis-conteos/${sesionId}`]}>
      <ConteoRepositoryProvider repo={repo}>
        <Routes>
          <Route
            path="/mis-conteos/:sesionId"
            element={<AnalisisConteoScreen onSalir={vi.fn()} />}
          />
        </Routes>
      </ConteoRepositoryProvider>
    </MemoryRouter>,
  );
}

describe("AnalisisConteoScreen", () => {
  it("muestra tu aporte y el total del equipo por separado, nunca fusionados", async () => {
    const repo = new FakeConteoRepository({ uid: "uid_ana", nombre: "Ana" });
    repo.sembrarSesion(crearSesion());
    repo.sembrarLinea(
      "ses_1",
      crearLinea({ categoriaId: "c1", cantidadTotal: 4, aplicados: { uid_ana: 4 } }),
    );
    repo.sembrarLinea(
      "ses_1",
      crearLinea({ categoriaId: "c2", cantidadTotal: 6, aplicados: { uid_luis: 6 } }),
    );

    renderPantalla(repo);

    expect(await screen.findByTestId("tu-aporte")).toHaveTextContent("4");
    expect(screen.getByTestId("equipo-total")).toHaveTextContent("10");
  });

  it("nunca muestra dinero (I-9/ADR-07/A-10), en ninguna de las tres dimensiones", async () => {
    const repo = new FakeConteoRepository({ uid: "uid_ana", nombre: "Ana" });
    repo.sembrarSesion(crearSesion());
    repo.sembrarArea({
      areaId: "area_bodega",
      nombre: "Bodega",
      activa: true,
      creadaEn: new Date(),
    });
    repo.sembrarArea({
      areaId: "area_anaqueles",
      nombre: "Anaqueles",
      activa: true,
      creadaEn: new Date(),
    });
    repo.sembrarLinea(
      "ses_1",
      crearLinea({
        categoriaId: "c1",
        porArea: { area_bodega: 5 },
        cantidadTotal: 5,
        aplicados: { uid_ana: 5 },
      }),
    );
    repo.sembrarLinea(
      "ses_1",
      crearLinea({
        categoriaId: "c2",
        porArea: { area_anaqueles: 20 },
        cantidadTotal: 20,
        aplicados: { uid_luis: 20 },
      }),
    );

    const { container } = renderPantalla(repo);
    await screen.findByTestId("tu-aporte");

    const select = screen.getByLabelText(/filtrar por dimensión/i);
    for (const valor of ["categoria", "area", "cajero"]) {
      fireEvent.change(select, { target: { value: valor } });
      expect(container.textContent).not.toMatch(/\$/);
    }
  });

  it('dimensión "Área": agrupa por área (resolviendo id → nombre real, issue #86) y ordena por UNIDADES, no por dinero', async () => {
    const repo = new FakeConteoRepository({ uid: "uid_ana", nombre: "Ana" });
    repo.sembrarSesion(crearSesion());
    // Ids opacos, no nombres legibles: con `porArea: { Bodega: 5 }` el test
    // pasaría igual aunque la pantalla nunca resolviera el id a un nombre
    // real (issue #86) — el id crudo YA se ve como el nombre esperado.
    repo.sembrarArea({
      areaId: "area_bodega",
      nombre: "Bodega",
      activa: true,
      creadaEn: new Date(),
    });
    repo.sembrarArea({
      areaId: "area_anaqueles",
      nombre: "Anaqueles",
      activa: true,
      creadaEn: new Date(),
    });
    // Bodega: 5 u × 100 = 500 de "valor"; Anaqueles: 20 u × 10 = 200 de
    // "valor". Por dinero Bodega gana (500 > 200); por unidades Anaqueles
    // gana (20 > 5) — órdenes opuestos, así el test distingue de verdad el
    // criterio (si coincidieran, pasaría igual ordenando por dinero).
    repo.sembrarLinea(
      "ses_1",
      crearLinea({
        categoriaId: "c1",
        porArea: { area_bodega: 5 },
        valorUnitario: 100,
        cantidadTotal: 5,
      }),
    );
    repo.sembrarLinea(
      "ses_1",
      crearLinea({
        categoriaId: "c2",
        porArea: { area_anaqueles: 20 },
        valorUnitario: 10,
        cantidadTotal: 20,
      }),
    );

    renderPantalla(repo);
    await screen.findByTestId("tu-aporte");

    fireEvent.change(screen.getByLabelText(/filtrar por dimensión/i), {
      target: { value: "area" },
    });

    const etiquetas = (await screen.findAllByText(/^(Bodega|Anaqueles)$/)).map(
      (el) => el.textContent,
    );
    expect(etiquetas).toEqual(["Anaqueles", "Bodega"]);
  });

  it('dimensión "Cajero": el propio uid se lee "Tú" y el resto "Compañero N", nunca un uid crudo', async () => {
    const repo = new FakeConteoRepository({ uid: "uid_ana", nombre: "Ana" });
    repo.sembrarSesion(crearSesion());
    repo.sembrarLinea(
      "ses_1",
      crearLinea({ categoriaId: "c1", cantidadTotal: 4, aplicados: { uid_ana: 4 } }),
    );
    repo.sembrarLinea(
      "ses_1",
      crearLinea({ categoriaId: "c2", cantidadTotal: 6, aplicados: { uid_luis: 6 } }),
    );

    const { container } = renderPantalla(repo);
    await screen.findByTestId("tu-aporte");

    fireEvent.change(screen.getByLabelText(/filtrar por dimensión/i), {
      target: { value: "cajero" },
    });

    // "Tú" también aparece en la placa de resumen (Tú/Equipo de arriba):
    // se filtra a la fila de la lista de desglose para no confundir ambos
    // usos del mismo texto.
    const filaTu = await screen.findAllByText("Tú");
    expect(filaTu.some((el) => el.closest("li"))).toBe(true);
    expect(screen.getByText("Compañero 1")).toBeInTheDocument();
    expect(container.textContent).not.toContain("uid_luis");
  });

  it("sesión borrada: mensaje explícito, sin esqueleto eterno", async () => {
    // No se siembra la sesión "ses_borrada": el fake emite `null` al
    // suscribirse, exactamente lo que produce el estado "borrada" real de
    // `abrirSesion` cuando la siembra de líneas falla a mitad (D3).
    const repo = new FakeConteoRepository({ uid: "uid_ana", nombre: "Ana" });

    renderPantalla(repo, "ses_borrada");

    expect(await screen.findByText(/este conteo ya no está disponible/i)).toBeInTheDocument();
  });

  it("sin líneas: avisa que nadie ha contado todavía", async () => {
    const repo = new FakeConteoRepository({ uid: "uid_ana", nombre: "Ana" });
    repo.sembrarSesion(crearSesion());

    renderPantalla(repo);

    expect(await screen.findByText(/nadie ha contado todavía en esta sesión/i)).toBeInTheDocument();
  });
});
