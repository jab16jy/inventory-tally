// F2 (docs/plan-diseno-visual-pwa.md §7): cabecera con progreso + ChipEstado,
// búsqueda, filtro "sólo pendientes", Deck de totales y Hoja con teclado
// numérico + avance automático. Archivo nuevo: los 5 de la primera ola
// (ConteoScreen.test.tsx incluido) quedan intactos como red de regresión.
import { FakeConteoRepository } from "@conteo/data";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ConteoRepositoryProvider } from "../state/repositorio-contexto.js";

vi.mock("firebase/auth", () => ({ onAuthStateChanged: vi.fn() }));

const { ConteoScreen } = await import("./ConteoScreen.js");

function lineaBase(categoriaId: string, etiqueta: string, valorUnitario: number, overrides = {}) {
  return {
    categoriaId,
    valorUnitario,
    etiqueta,
    porArea: {},
    cantidadTotal: 0,
    numAportantes: 0,
    versiones: {},
    actualizadaEn: new Date(),
    actualizadaPor: "",
    ...overrides,
  };
}

function renderConteoScreen(repo: FakeConteoRepository, sesionId = "ses_1") {
  // ADR-23: sin esto, ConteoScreen redirige a /preparar por falta de área activa.
  localStorage.setItem(`areaActiva:${sesionId}`, "area_1");
  return render(
    <MemoryRouter initialEntries={[`/conteo/${sesionId}`]}>
      <ConteoRepositoryProvider repo={repo}>
        <Routes>
          <Route
            path="/conteo/:sesionId"
            element={<ConteoScreen auth={{} as never} onSalir={() => {}} />}
          />
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

describe("ConteoScreen · Hoja con teclado numérico y conteo por tandas (ADR-24)", () => {
  it("agrupar 50 y luego 30 en la MISMA categoría deja Tú: 80", async () => {
    const repo = repoConTresCategorias();
    renderConteoScreen(repo);

    fireEvent.click(screen.getByRole("button", { name: /contar \$1\.000/i }));
    const hoja = screen.getByRole("dialog", { name: /contar \$1\.000/i });

    fireEvent.click(within(hoja).getByRole("button", { name: "5" }));
    fireEvent.click(within(hoja).getByRole("button", { name: "0" }));
    fireEvent.click(within(hoja).getByRole("button", { name: /agrupar/i }));

    expect(await screen.findByText(/tú: 50/i)).toBeInTheDocument();

    fireEvent.click(within(hoja).getByRole("button", { name: "3" }));
    fireEvent.click(within(hoja).getByRole("button", { name: "0" }));
    fireEvent.click(within(hoja).getByRole("button", { name: /agrupar/i }));

    expect(await screen.findByText(/tú: 80/i)).toBeInTheDocument();
  });

  it("agrupar NO auto-avanza de categoría: la Hoja sigue abierta sobre la misma fila", () => {
    const repo = repoConTresCategorias();
    renderConteoScreen(repo);

    fireEvent.click(screen.getByRole("button", { name: /contar \$1\.000/i }));
    const hoja = screen.getByRole("dialog", { name: /contar \$1\.000/i });

    fireEvent.click(within(hoja).getByRole("button", { name: "7" }));
    fireEvent.click(within(hoja).getByRole("button", { name: /agrupar/i }));

    // Sigue siendo el mismo diálogo, sobre la misma categoría — nunca el de
    // la siguiente pendiente ($2.000).
    expect(screen.getByRole("dialog", { name: /contar \$1\.000/i })).toBeVisible();
    expect(screen.queryByRole("dialog", { name: /contar \$2\.000/i })).not.toBeInTheDocument();
  });

  it("borrar la tanda de 50 deja Tú: 30", async () => {
    const repo = repoConTresCategorias();
    renderConteoScreen(repo);

    fireEvent.click(screen.getByRole("button", { name: /contar \$1\.000/i }));
    const hoja = screen.getByRole("dialog", { name: /contar \$1\.000/i });

    fireEvent.click(within(hoja).getByRole("button", { name: "5" }));
    fireEvent.click(within(hoja).getByRole("button", { name: "0" }));
    fireEvent.click(within(hoja).getByRole("button", { name: /agrupar/i }));
    fireEvent.click(within(hoja).getByRole("button", { name: "3" }));
    fireEvent.click(within(hoja).getByRole("button", { name: "0" }));
    fireEvent.click(within(hoja).getByRole("button", { name: /agrupar/i }));
    expect(await screen.findByText(/tú: 80/i)).toBeInTheDocument();

    fireEvent.click(within(hoja).getByRole("button", { name: "Borrar tanda de 50" }));
    fireEvent.click(within(hoja).getByRole("button", { name: /sí, borrar/i }));

    expect(await screen.findByText(/tú: 30/i)).toBeInTheDocument();
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

describe("ConteoScreen · Hoja precargada (regresión R3-001, reencuadrada por ADR-24)", () => {
  it('reabrir una categoría ya contada muestra "Tu conteo: 12" así llegue un render después de abrir', async () => {
    // La suscripción al aporte de la categoría en edición resuelve UN render
    // después de abrir la Hoja: el cajero NO puede ver "Tu conteo: 0" fijo
    // sobre una categoría donde ya había contado 12 — la intención original
    // de R3-001 (nunca ocultarle al cajero lo que ya contó) ahora vive en
    // esta línea de solo lectura, no en el display de la tanda en curso.
    const repo = new FakeConteoRepository({ uid: "uid_ana", nombre: "Ana Ramírez" });
    repo.sembrarLinea("ses_1", lineaBase("cat_5000", "$5.000", 5000));
    // areaId: "area_1" — coincide con la área activa que renderConteoScreen
    // siembra en localStorage; si no coincidieran, useMiAporte buscaría la
    // clave compuesta equivocada y este aporte "desaparecería" de la Hoja.
    await repo.registrarAporte({
      sesionId: "ses_1",
      categoriaId: "cat_5000",
      areaId: "area_1",
      cantidad: 12,
    });

    renderConteoScreen(repo);
    fireEvent.click(screen.getByRole("button", { name: /contar \$5\.000/i }));

    expect(await screen.findByText("Tu conteo: 12")).toBeInTheDocument();
    // El display de la tanda en curso arranca en 0, sin importar lo ya
    // contado — precisamente lo que ADR-24 cambia a propósito.
    expect(screen.getByTestId("hoja-valor")).toHaveTextContent("0");
  });
});
