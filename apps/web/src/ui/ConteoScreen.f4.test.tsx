// F4-A1 (docs/plan-diseno-visual-pwa.md §5, estados 4 y 8): sesión cerrada
// por el admin (modal bloqueante) y confirmación suave sobre cantidad
// absurda. Archivo nuevo: los tests de F0-F2 quedan intactos como red de
// regresión (mismo criterio que ConteoScreen.f2.test.tsx).
import { FakeConteoRepository } from "@conteo/data";
import type { SesionConteo } from "@conteo/shared";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { ConteoRepositoryProvider } from "../state/repositorio-contexto.js";
import { ConteoScreen } from "./ConteoScreen.js";

function lineaBase(categoriaId: string, etiqueta: string, valorUnitario: number, overrides = {}) {
  return {
    categoriaId,
    valorUnitario,
    etiqueta,
    cantidadTotal: 0,
    numAportantes: 0,
    versiones: {},
    actualizadaEn: new Date(),
    actualizadaPor: "",
    ...overrides,
  };
}

function sesionBase(overrides: Partial<SesionConteo> = {}): SesionConteo {
  return {
    sesionId: "ses_1",
    sucursalId: "suc_norte",
    sucursalNombre: "Sucursal Norte",
    estado: "abierta",
    abiertaEn: new Date(),
    abiertaPor: "uid_admin",
    cerradaEn: null,
    cerradaPor: null,
    participantes: [],
    totalUnidades: 0,
    sesionCorregidaId: null,
    ...overrides,
  };
}

function renderConteoScreen(repo: FakeConteoRepository, sesionId = "ses_1") {
  return render(
    <MemoryRouter initialEntries={[`/conteo/${sesionId}`]}>
      <ConteoRepositoryProvider repo={repo}>
        <Routes>
          <Route path="/conteo/:sesionId" element={<ConteoScreen />} />
          <Route path="/sucursales" element={<p>Sucursales — próximamente</p>} />
        </Routes>
      </ConteoRepositoryProvider>
    </MemoryRouter>,
  );
}

describe("ConteoScreen · sesión cerrada por el admin (F4-A1, doc 11 §5)", () => {
  it("mientras la sesión sigue abierta, no aparece el modal bloqueante", () => {
    const repo = new FakeConteoRepository({ uid: "uid_ana", nombre: "Ana Ramírez" });
    repo.sembrarSesion(sesionBase());
    renderConteoScreen(repo);

    expect(screen.queryByText(/cerró esta sesión/i)).not.toBeVisible();
  });

  it("cuando el admin cierra la sesión a mitad de conteo, aparece un modal bloqueante con Salir (nunca Cerrar)", () => {
    const repo = new FakeConteoRepository({ uid: "uid_ana", nombre: "Ana Ramírez" });
    repo.sembrarSesion(sesionBase());
    renderConteoScreen(repo);

    act(() => {
      repo.sembrarSesion(sesionBase({ estado: "cerrada", cerradaPor: "uid_admin" }));
    });

    expect(screen.getByText(/cerró esta sesión/i)).toBeVisible();
    expect(screen.getByRole("button", { name: /salir/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /cerrar|descartar/i })).not.toBeInTheDocument();
  });

  it('tocar "Salir" navega fuera de la pantalla de conteo', () => {
    const repo = new FakeConteoRepository({ uid: "uid_ana", nombre: "Ana Ramírez" });
    repo.sembrarSesion(sesionBase({ estado: "cerrada" }));
    renderConteoScreen(repo);

    fireEvent.click(screen.getByRole("button", { name: /salir/i }));

    expect(screen.getByText(/sucursales — próximamente/i)).toBeInTheDocument();
  });

  it("con la sesión cerrada, los +/- de fila NO pueden seguir registrando aportes", () => {
    // El modal bloqueante no es la garantía. La inercia de un <dialog>
    // nativo detiene la interacción del usuario, pero no cubre la ventana
    // entre que el admin cierra la sesión y que el listener lo emite, y una
    // escritura optimista se le aplicaría al cajero en local aunque el
    // servidor la rechace después. La versión anterior de este test tocaba
    // "Sumar" con el modal abierto y exigía que APARECIERA el banner de
    // pendientes — es decir, exigía que la escritura entrara.
    const repo = new FakeConteoRepository(
      { uid: "uid_ana", nombre: "Ana Ramírez" },
      { retrasoSincronizacionMs: 10_000 },
    );
    repo.sembrarSesion(sesionBase({ estado: "cerrada" }));
    repo.sembrarLinea("ses_1", lineaBase("cat_5000", "$5.000", 5000));
    renderConteoScreen(repo);

    expect(screen.queryByRole("button", { name: /sumar \$5\.000/i })).not.toBeInTheDocument();
  });

  it("nunca coexisten dos role=alert: el banner de pendientes y el modal no chocan (restricción dura)", () => {
    // Las escrituras pendientes se siembran ANTES de que la sesión se
    // cierre —por el repositorio, no por la UI—, que es el orden real: el
    // cajero contaba, el admin cerró, y quedan envíos en vuelo. Así el
    // banner existe de verdad y la aserción mide lo que dice medir, sin
    // depender de que una escritura prohibida se cuele.
    const repo = new FakeConteoRepository(
      { uid: "uid_ana", nombre: "Ana Ramírez" },
      { retrasoSincronizacionMs: 10_000 },
    );
    repo.sembrarLinea("ses_1", lineaBase("cat_5000", "$5.000", 5000));
    void repo.registrarAporte({ sesionId: "ses_1", categoriaId: "cat_5000", cantidad: 3 });
    repo.sembrarSesion(sesionBase({ estado: "cerrada" }));
    renderConteoScreen(repo);

    expect(screen.getByRole("button", { name: /salir/i })).toBeInTheDocument();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });
});

describe("ConteoScreen · confirmación suave sobre cantidad absurda (F4-A1, doc 10 §10)", () => {
  it("una cantidad que supera 10× el promedio de la categoría no se guarda sin confirmar", () => {
    const repo = new FakeConteoRepository({ uid: "uid_ana", nombre: "Ana Ramírez" });
    // Promedio de la categoría: 40 / 4 = 10. 10× = 100.
    repo.sembrarLinea(
      "ses_1",
      lineaBase("cat_5000", "$5.000", 5000, { cantidadTotal: 40, numAportantes: 4 }),
    );
    renderConteoScreen(repo);

    fireEvent.click(screen.getByRole("button", { name: /contar \$5\.000/i }));
    const hoja = screen.getByRole("dialog", { name: /contar \$5\.000/i });
    for (const digito of ["5", "0", "0"]) {
      fireEvent.click(within(hoja).getByRole("button", { name: digito }));
    }
    fireEvent.click(within(hoja).getByRole("button", { name: /guardar/i }));

    expect(within(hoja).getByText(/mucho más que el promedio/i)).toBeInTheDocument();
    expect(screen.queryByText(/tú: 500/i)).not.toBeInTheDocument();
  });

  it('confirmar con "Sí, guardar" sí registra la cantidad', () => {
    const repo = new FakeConteoRepository({ uid: "uid_ana", nombre: "Ana Ramírez" });
    repo.sembrarLinea(
      "ses_1",
      lineaBase("cat_5000", "$5.000", 5000, { cantidadTotal: 40, numAportantes: 4 }),
    );
    renderConteoScreen(repo);

    fireEvent.click(screen.getByRole("button", { name: /contar \$5\.000/i }));
    const hoja = screen.getByRole("dialog", { name: /contar \$5\.000/i });
    for (const digito of ["5", "0", "0"]) {
      fireEvent.click(within(hoja).getByRole("button", { name: digito }));
    }
    fireEvent.click(within(hoja).getByRole("button", { name: /guardar/i }));
    fireEvent.click(within(hoja).getByRole("button", { name: /sí, guardar/i }));

    expect(screen.getByText(/tú: 500/i)).toBeInTheDocument();
  });

  it("una categoría sin aportantes previos no tiene promedio con qué comparar: cualquier cantidad se guarda directo", () => {
    const repo = new FakeConteoRepository({ uid: "uid_ana", nombre: "Ana Ramírez" });
    repo.sembrarLinea("ses_1", lineaBase("cat_5000", "$5.000", 5000));
    renderConteoScreen(repo);

    fireEvent.click(screen.getByRole("button", { name: /contar \$5\.000/i }));
    const hoja = screen.getByRole("dialog", { name: /contar \$5\.000/i });
    for (const digito of ["9", "9", "9"]) {
      fireEvent.click(within(hoja).getByRole("button", { name: digito }));
    }
    fireEvent.click(within(hoja).getByRole("button", { name: /guardar/i }));

    expect(screen.getByText(/tú: 999/i)).toBeInTheDocument();
  });
});
