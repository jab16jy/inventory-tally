// apps/web/src/ui/PrepararScreen.test.tsx (F3-B, doc 11 §3, plan §5)
import { FakeConteoRepository } from "@conteo/data";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ConteoRepositoryProvider } from "../state/repositorio-contexto.js";

const onAuthStateChanged = vi.fn();

vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (...args: unknown[]) =>
    (onAuthStateChanged as (...a: unknown[]) => unknown)(...args),
}));

const { PrepararScreen } = await import("./PrepararScreen.js");

function usuarioFake(rol: "admin" | "cajero") {
  return {
    uid: "u1",
    displayName: null,
    getIdTokenResult: () => Promise.resolve({ claims: { rol } }),
  };
}

function lineaBase(categoriaId: string, etiqueta: string, valorUnitario: number) {
  return {
    categoriaId,
    valorUnitario,
    etiqueta,
    area: "Aseo",
    cantidadTotal: 0,
    numAportantes: 0,
    versiones: {},
    actualizadaEn: new Date(),
    actualizadaPor: "",
  };
}

function renderPantalla(repo: FakeConteoRepository, sesionId = "ses_1", onSalir = vi.fn()) {
  return render(
    <MemoryRouter initialEntries={[`/conteo/${sesionId}/preparar`]}>
      <ConteoRepositoryProvider repo={repo}>
        <Routes>
          <Route
            path="/conteo/:sesionId/preparar"
            element={<PrepararScreen auth={{} as never} onSalir={onSalir} />}
          />
          <Route path="/conteo/:sesionId" element={<p>Pantalla de conteo</p>} />
          <Route path="/admin" element={<p>Pantalla de admin</p>} />
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

  it("ofrece un control de salida visible que no se llama 'Cerrar sesión'", () => {
    const onSalir = vi.fn();
    renderPantalla(new FakeConteoRepository(), "ses_1", onSalir);

    const boton = screen.getByRole("button", { name: /^salir$/i });
    expect(screen.queryByRole("button", { name: /cerrar sesión/i })).not.toBeInTheDocument();

    fireEvent.click(boton);
    const dialogo = screen.getByRole("dialog");
    fireEvent.click(within(dialogo).getByRole("button", { name: /^salir$/i }));
    expect(onSalir).toHaveBeenCalledTimes(1);
  });

  it("un admin ve 'Volver al panel' y navega a /admin sin cerrar sesión", async () => {
    onAuthStateChanged.mockImplementation((_auth: unknown, cb: (u: unknown) => void) => {
      cb(usuarioFake("admin"));
      return () => {};
    });

    renderPantalla(new FakeConteoRepository());

    fireEvent.click(await screen.findByRole("button", { name: /volver al panel/i }));

    expect(await screen.findByText("Pantalla de admin")).toBeInTheDocument();
  });

  it("un cajero normal no ve 'Volver al panel'", async () => {
    onAuthStateChanged.mockImplementation((_auth: unknown, cb: (u: unknown) => void) => {
      cb(usuarioFake("cajero"));
      return () => {};
    });

    renderPantalla(new FakeConteoRepository());

    await screen.findByText(/catálogo/i);
    expect(screen.queryByRole("button", { name: /volver al panel/i })).not.toBeInTheDocument();
  });
});
