// apps/web/src/ui/FinalizarScreen.test.tsx (F3-B, doc 11 §6, RF-16)
import { FakeConteoRepository } from "@conteo/data";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ConteoRepositoryProvider } from "../state/repositorio-contexto.js";
import { FinalizarScreen } from "./FinalizarScreen.js";

function lineaBase(
  categoriaId: string,
  etiqueta: string,
  valorUnitario: number,
  overrides: Record<string, unknown> = {},
) {
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

function renderPantalla(repo: FakeConteoRepository, sesionId = "ses_1", onSalir = vi.fn()) {
  return render(
    <MemoryRouter initialEntries={[`/conteo/${sesionId}/finalizar`]}>
      <ConteoRepositoryProvider repo={repo}>
        <Routes>
          <Route
            path="/conteo/:sesionId/finalizar"
            element={<FinalizarScreen onSalir={onSalir} />}
          />
          <Route path="/sucursales" element={<p>Pantalla de sucursales</p>} />
        </Routes>
      </ConteoRepositoryProvider>
    </MemoryRouter>,
  );
}

describe("FinalizarScreen (F3-B, doc 11 §6)", () => {
  it("resume cuántas categorías contó el cajero y cuántas le faltan", () => {
    const repo = new FakeConteoRepository({ uid: "uid_ana", nombre: "Ana Ramírez" });
    repo.sembrarLinea(
      "ses_1",
      lineaBase("cat_1000", "$1.000", 1000, { versiones: { uid_ana: 1 } }),
    );
    repo.sembrarLinea("ses_1", lineaBase("cat_2000", "$2.000", 2000));

    renderPantalla(repo);

    expect(screen.getByText(/contaste 1 categoría/i)).toBeInTheDocument();
    expect(screen.getByText(/falta 1 categoría sin contar/i)).toBeInTheDocument();
  });

  it("con escrituras pendientes > 0, el botón de confirmar queda deshabilitado (RF-16)", () => {
    const repo = new FakeConteoRepository(
      { uid: "uid_ana", nombre: "Ana Ramírez" },
      { retrasoSincronizacionMs: 10_000 },
    );
    repo.sembrarLinea("ses_1", lineaBase("cat_1000", "$1.000", 1000));
    void repo.registrarAporte({ sesionId: "ses_1", categoriaId: "cat_1000", cantidad: 3 });

    renderPantalla(repo);

    expect(screen.getByText(/enviando 1 conteo/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /esperando conexión/i })).toBeDisabled();
  });

  it("con cero pendientes, «Confirmar y salir» confirma la sincronización y sale de la sesión", async () => {
    const repo = new FakeConteoRepository({ uid: "uid_ana", nombre: "Ana Ramírez" });
    repo.sembrarLinea(
      "ses_1",
      lineaBase("cat_1000", "$1.000", 1000, { versiones: { uid_ana: 1 } }),
    );
    const espia = vi.spyOn(repo, "confirmarSincronizacion");

    renderPantalla(repo);

    expect(screen.getByText(/todo enviado/i)).toBeInTheDocument();
    const boton = screen.getByRole("button", { name: /confirmar y salir/i });
    expect(boton).toBeEnabled();

    fireEvent.click(boton);

    expect(espia).toHaveBeenCalledWith("ses_1");
    expect(await screen.findByText("Pantalla de sucursales")).toBeInTheDocument();
  });

  it("ofrece un control de salida en la cabecera, distinto de 'Confirmar y salir'", () => {
    const onSalir = vi.fn();
    renderPantalla(new FakeConteoRepository({ uid: "uid_ana", nombre: "Ana Ramírez" }), "ses_1", onSalir);

    const boton = screen.getByRole("button", { name: /^salir$/i });
    expect(screen.queryByRole("button", { name: /cerrar sesión/i })).not.toBeInTheDocument();

    fireEvent.click(boton);
    expect(onSalir).toHaveBeenCalledTimes(1);
  });

  it("si la confirmación falla, NO saca al cajero de la sesión y lo dice", async () => {
    // `confirmadoEn` es lo único que habilita al administrador a cerrar la
    // sesión (doc 11 §6). Descartar la promesa con `void` y navegar en el
    // mismo tick daba por escrito algo que pudo rechazarse — permiso, o el
    // documento de sesión ya cerrado por el admin — y el cajero se iba
    // creyendo que confirmó, sin nadie que lo pudiera notar después.
    const repo = new FakeConteoRepository({ uid: "uid_ana", nombre: "Ana Ramírez" });
    repo.sembrarLinea(
      "ses_1",
      lineaBase("cat_1000", "$1.000", 1000, { versiones: { uid_ana: 1 } }),
    );
    vi.spyOn(repo, "confirmarSincronizacion").mockRejectedValue(new Error("permission-denied"));

    renderPantalla(repo);

    fireEvent.click(screen.getByRole("button", { name: /confirmar y salir/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/no se pudo confirmar/i);
    expect(screen.queryByText("Pantalla de sucursales")).not.toBeInTheDocument();
  });

  it("issue #41: tras agotar los reintentos automáticos, ofrece un botón de reintento manual que habilita 'Confirmar y salir'", async () => {
    const repo = new FakeConteoRepository({ uid: "uid_ana", nombre: "Ana Ramírez" });
    repo.sembrarLinea("ses_1", lineaBase("cat_1000", "$1.000", 1000));
    // MAX_REINTENTOS + 1 rechazos: agota los reintentos automáticos una sola
    // vez y no deja rechazos sembrados para el reintento manual siguiente.
    repo.sembrarRechazosAporte("ses_1", "cat_1000", 4);
    void repo.registrarAporte({ sesionId: "ses_1", categoriaId: "cat_1000", cantidad: 3 });

    renderPantalla(repo);

    const botonReintentar = await screen.findByRole("button", { name: /reintentar envío/i });
    expect(screen.getByRole("button", { name: /esperando conexión/i })).toBeDisabled();

    fireEvent.click(botonReintentar);

    expect(
      await screen.findByRole("button", { name: /confirmar y salir/i }),
    ).toBeEnabled();
    expect(screen.queryByRole("button", { name: /reintentar envío/i })).not.toBeInTheDocument();
  });
});
