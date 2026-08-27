import { FakeConteoRepository } from "@conteo/data";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ConteoRepositoryProvider } from "../state/repositorio-contexto.js";
import { ConteoScreen } from "./ConteoScreen.js";

function renderConteoScreen(repo: FakeConteoRepository, sesionId = "ses_1", onSalir = vi.fn()) {
  return render(
    <MemoryRouter initialEntries={[`/conteo/${sesionId}`]}>
      <ConteoRepositoryProvider repo={repo}>
        <Routes>
          <Route path="/conteo/:sesionId" element={<ConteoScreen onSalir={onSalir} />} />
        </Routes>
      </ConteoRepositoryProvider>
    </MemoryRouter>,
  );
}

describe("ConteoScreen (doc 11 §4)", () => {
  it("registrar un aporte actualiza la fila (Tú y Equipo)", async () => {
    const repo = new FakeConteoRepository({ uid: "uid_ana", nombre: "Ana Ramírez" });
    repo.sembrarLinea("ses_1", {
      categoriaId: "cat_5000",
      valorUnitario: 5000,
      etiqueta: "$5.000",
      cantidadTotal: 0,
      numAportantes: 0,
      versiones: {},
      actualizadaEn: new Date(),
      actualizadaPor: "",
    });

    renderConteoScreen(repo);

    const botonMas = screen.getByRole("button", { name: /sumar \$5\.000/i });
    fireEvent.click(botonMas);

    expect(await screen.findByText(/tú: 1/i)).toBeInTheDocument();
    expect(await screen.findByText(/equipo: 1/i)).toBeInTheDocument();
  });

  it("con escrituras pendientes > 0 aparece un banner no descartable (RF-16)", async () => {
    const repo = new FakeConteoRepository(
      { uid: "uid_ana", nombre: "Ana Ramírez" },
      { retrasoSincronizacionMs: 10_000 },
    );
    repo.sembrarLinea("ses_1", {
      categoriaId: "cat_5000",
      valorUnitario: 5000,
      etiqueta: "$5.000",
      cantidadTotal: 0,
      numAportantes: 0,
      versiones: {},
      actualizadaEn: new Date(),
      actualizadaPor: "",
    });

    renderConteoScreen(repo);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /sumar \$5\.000/i }));

    const banner = await screen.findByRole("alert");
    expect(banner).toHaveTextContent(/no cierres la aplicación/i);
    // No descartable: sin botón para cerrarlo.
    expect(screen.queryByRole("button", { name: /cerrar|descartar/i })).not.toBeInTheDocument();
  });

  it("ofrece un control de salida (issue #40), sin romper la restricción de /cerrar|descartar/i", () => {
    const onSalir = vi.fn();
    renderConteoScreen(new FakeConteoRepository(), "ses_1", onSalir);

    const boton = screen.getByRole("button", { name: /^salir$/i });
    expect(screen.queryByRole("button", { name: /cerrar|descartar/i })).not.toBeInTheDocument();

    fireEvent.click(boton);
    expect(onSalir).toHaveBeenCalledTimes(1);
  });
});
