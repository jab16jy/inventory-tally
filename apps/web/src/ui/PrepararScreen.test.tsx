// apps/web/src/ui/PrepararScreen.test.tsx (F3-B, doc 11 §3, plan §5)
import { FakeConteoRepository } from "@conteo/data";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { ConteoRepositoryProvider } from "../state/repositorio-contexto.js";
import { PrepararScreen } from "./PrepararScreen.js";

function lineaBase(categoriaId: string, etiqueta: string, valorUnitario: number) {
  return {
    categoriaId,
    valorUnitario,
    etiqueta,
    cantidadTotal: 0,
    numAportantes: 0,
    versiones: {},
    actualizadaEn: new Date(),
    actualizadaPor: "",
  };
}

function renderPantalla(repo: FakeConteoRepository, sesionId = "ses_1") {
  return render(
    <MemoryRouter initialEntries={[`/conteo/${sesionId}/preparar`]}>
      <ConteoRepositoryProvider repo={repo}>
        <Routes>
          <Route path="/conteo/:sesionId/preparar" element={<PrepararScreen />} />
          <Route path="/conteo/:sesionId" element={<p>Pantalla de conteo</p>} />
        </Routes>
      </ConteoRepositoryProvider>
    </MemoryRouter>,
  );
}

describe("PrepararScreen (F3-B, doc 11 §3)", () => {
  it("muestra el catálogo cargado con el número real de categorías de la sesión", async () => {
    const repo = new FakeConteoRepository();
    repo.sembrarLinea("ses_1", lineaBase("cat_1000", "$1.000", 1000));
    repo.sembrarLinea("ses_1", lineaBase("cat_2000", "$2.000", 2000));

    renderPantalla(repo);

    expect(await screen.findByText(/catálogo cargado \(2 categorías\)/i)).toBeInTheDocument();
  });

  it('lista los cuatro pasos de "Cómo funciona" (doc 11 §3)', () => {
    renderPantalla(new FakeConteoRepository());

    const pasos = screen.getByRole("list", { name: /cómo funciona/i });
    expect(pasos).toHaveTextContent(/elige un valor de la lista/i);
    expect(pasos).toHaveTextContent(/cuántas unidades contaste tú/i);
    expect(pasos).toHaveTextContent(/suma lo de todo el equipo/i);
    expect(pasos).toHaveTextContent(/pulsa.*finalizar/i);
  });

  it('"Empezar a contar" navega a la pantalla de conteo de esa misma sesión', async () => {
    renderPantalla(new FakeConteoRepository(), "ses_9");

    fireEvent.click(screen.getByRole("button", { name: /empezar a contar/i }));

    expect(await screen.findByText("Pantalla de conteo")).toBeInTheDocument();
  });
});
