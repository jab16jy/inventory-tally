// F2 (docs/plan-diseno-visual-pwa.md §7): cabecera con progreso + ChipEstado,
// búsqueda, filtro "sólo pendientes", Deck de totales y Hoja con teclado
// numérico + avance automático. Archivo nuevo: los 5 de la primera ola
// (ConteoScreen.test.tsx incluido) quedan intactos como red de regresión.
import { FakeConteoRepository } from "@conteo/data";
import { fireEvent, render, screen, within } from "@testing-library/react";
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

function renderConteoScreen(repo: FakeConteoRepository, sesionId = "ses_1") {
  return render(
    <MemoryRouter initialEntries={[`/conteo/${sesionId}`]}>
      <ConteoRepositoryProvider repo={repo}>
        <Routes>
          <Route path="/conteo/:sesionId" element={<ConteoScreen onSalir={() => {}} />} />
        </Routes>
      </ConteoRepositoryProvider>
    </MemoryRouter>,
  );
}

function repoConTresCategorias(): FakeConteoRepository {
  const repo = new FakeConteoRepository({ uid: "uid_ana", nombre: "Ana Ramírez" });
  repo.sembrarLinea("ses_1", lineaBase("cat_1000", "$1.000", 1000));
  repo.sembrarLinea("ses_1", lineaBase("cat_2000", "$2.000", 2000));
  repo.sembrarLinea(
    "ses_1",
    lineaBase("cat_5000", "$5.000", 5000, { versiones: { uid_ana: 1 }, cantidadTotal: 12 }),
  );
  return repo;
}

describe("ConteoScreen · cabecera (F2)", () => {
  it("el progreso cuenta sólo lo que el uid actual ya tiene versión propia", () => {
    renderConteoScreen(repoConTresCategorias());
    expect(screen.getByText("1/3")).toBeInTheDocument();
  });

  it("sin pendientes de escritura y en línea, el chip dice Sincronizado", () => {
    renderConteoScreen(repoConTresCategorias());
    expect(screen.getByText(/sincronizado/i)).toBeInTheDocument();
  });
});

describe("ConteoScreen · búsqueda (F2)", () => {
  it("filtra filas por etiqueta o por valor numérico", () => {
    renderConteoScreen(repoConTresCategorias());

    fireEvent.change(screen.getByPlaceholderText(/buscar/i), { target: { value: "2.000" } });

    expect(screen.getByRole("button", { name: /contar \$2\.000/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /contar \$1\.000/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /contar \$5\.000/i })).not.toBeInTheDocument();
  });
});

describe('ConteoScreen · filtro "sólo pendientes" (F2, doc 10 §2)', () => {
  it("oculta las categorías que el cajero actual ya contó", () => {
    renderConteoScreen(repoConTresCategorias());

    fireEvent.click(screen.getByRole("button", { name: /pendientes/i }));

    expect(screen.getByRole("button", { name: /contar \$1\.000/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /contar \$2\.000/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /contar \$5\.000/i })).not.toBeInTheDocument();
  });
});

describe("ConteoScreen · Hoja con teclado numérico y avance automático (F2, plan §5)", () => {
  it("tocar la fila abre la Hoja, guardar registra el aporte y avanza a la siguiente pendiente", async () => {
    const repo = repoConTresCategorias();
    renderConteoScreen(repo);

    fireEvent.click(screen.getByRole("button", { name: /contar \$1\.000/i }));

    const hoja1 = screen.getByRole("dialog", { name: /contar \$1\.000/i });
    fireEvent.click(within(hoja1).getByRole("button", { name: "7" }));
    fireEvent.click(within(hoja1).getByRole("button", { name: /guardar/i }));

    // Avanza sola a la siguiente categoría pendiente ($2.000, la única que
    // queda sin contar), sin que el cajero tenga que volver a tocar la fila.
    const hoja2 = await screen.findByRole("dialog", { name: /contar \$2\.000/i });
    expect(hoja2).toBeInTheDocument();

    expect(await screen.findByText(/tú: 7/i)).toBeInTheDocument();
  });

  it('el botón para cerrar la Hoja es "Volver", nunca "Cerrar" (restricción de la pantalla)', () => {
    renderConteoScreen(repoConTresCategorias());
    fireEvent.click(screen.getByRole("button", { name: /contar \$1\.000/i }));

    expect(screen.queryByRole("button", { name: /cerrar|descartar/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /volver/i })).toBeInTheDocument();
  });
});

describe("ConteoScreen · Deck (F2)", () => {
  it("muestra el botón Finalizar conteo y el total del equipo ya agregado", () => {
    renderConteoScreen(repoConTresCategorias());
    expect(screen.getByRole("button", { name: /finalizar conteo/i })).toBeInTheDocument();
    expect(screen.getByText(/12 u/i)).toBeInTheDocument();
  });
});

const PATRON_CONSUMO_DATOS = /^\d+([.,]\d+)? (KB|MB)$/;

describe("ConteoScreen · consumo de datos (issue #20 item 2, doc 11 §24)", () => {
  it("muestra un indicador de consumo de datos, visible junto al estado de sincronización", () => {
    renderConteoScreen(repoConTresCategorias());
    expect(screen.getByText(PATRON_CONSUMO_DATOS)).toBeInTheDocument();
  });

  it("el consumo estimado crece cuando llega una nueva emisión de líneas", () => {
    renderConteoScreen(repoConTresCategorias());
    const textoInicial = screen.getByText(PATRON_CONSUMO_DATOS).textContent;

    fireEvent.click(screen.getByRole("button", { name: /sumar \$1\.000/i }));

    const textoFinal = screen.getByText(PATRON_CONSUMO_DATOS).textContent;
    expect(textoFinal).not.toBe(textoInicial);
  });
});

describe("ConteoScreen · Hoja precargada (regresión R3-001)", () => {
  it("reabrir una categoría ya contada precarga la cantidad real, no cero", async () => {
    // La suscripción al aporte de la categoría en edición resuelve UN render
    // después de abrir la Hoja. Si el reset del teclado sólo mira la
    // etiqueta, adopta el 0 del primer render y nunca relee el valor real:
    // el cajero ve 0 sobre una categoría donde ya había contado 12, y si
    // teclea encima pisa su propio conteo.
    const repo = new FakeConteoRepository({ uid: "uid_ana", nombre: "Ana Ramírez" });
    repo.sembrarLinea("ses_1", lineaBase("cat_5000", "$5.000", 5000));
    await repo.registrarAporte({ sesionId: "ses_1", categoriaId: "cat_5000", cantidad: 12 });

    renderConteoScreen(repo);
    fireEvent.click(screen.getByRole("button", { name: /contar \$5\.000/i }));

    expect(await screen.findByTestId("hoja-valor")).toHaveTextContent("12");
  });
});
