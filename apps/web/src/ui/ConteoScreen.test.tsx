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

const { ConteoScreen } = await import("./ConteoScreen.js");

function usuarioFake(rol: "admin" | "cajero") {
  return {
    uid: "u1",
    displayName: null,
    getIdTokenResult: () => Promise.resolve({ claims: { rol } }),
  };
}

function renderConteoScreen(repo: FakeConteoRepository, sesionId = "ses_1", onSalir = vi.fn()) {
  return render(
    <MemoryRouter initialEntries={[`/conteo/${sesionId}`]}>
      <ConteoRepositoryProvider repo={repo}>
        <Routes>
          <Route
            path="/conteo/:sesionId"
            element={<ConteoScreen auth={{} as never} onSalir={onSalir} />}
          />
          <Route path="/admin" element={<p>Pantalla de admin</p>} />
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
      area: "Aseo",
      areaFijaPorAdmin: false,
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
      area: "Aseo",
      areaFijaPorAdmin: false,
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

  it("el selector de área filtra las categorías visibles sin tocar el progreso del equipo (docs 10 §2)", async () => {
    const repo = new FakeConteoRepository({ uid: "uid_ana", nombre: "Ana Ramírez" });
    repo.sembrarLinea("ses_1", {
      categoriaId: "cat_aseo",
      valorUnitario: 5000,
      etiqueta: "$5.000",
      area: "Aseo",
      areaFijaPorAdmin: false,
      cantidadTotal: 0,
      numAportantes: 0,
      versiones: {},
      actualizadaEn: new Date(),
      actualizadaPor: "",
    });
    repo.sembrarLinea("ses_1", {
      categoriaId: "cat_bebidas",
      valorUnitario: 10000,
      etiqueta: "$10.000",
      area: "Bebidas",
      areaFijaPorAdmin: false,
      cantidadTotal: 0,
      numAportantes: 0,
      versiones: {},
      actualizadaEn: new Date(),
      actualizadaPor: "",
    });

    renderConteoScreen(repo);

    // Par afirmativo (AGENTS.md §2): contamos Bebidas antes de filtrar —
    // si la barra derivara del filtro en vez de "lineas" completas, el
    // assert de abajo (tras filtrar a Aseo) daría 0/1 en vez de 1/2.
    fireEvent.click(screen.getByRole("button", { name: /sumar \$10\.000/i }));
    expect(await screen.findByText(/tú: 1/i)).toBeInTheDocument();

    const progreso = screen.getByRole("progressbar");
    expect(progreso).toHaveAttribute("aria-valuenow", "1");
    expect(progreso).toHaveAttribute("aria-valuemax", "2");

    fireEvent.change(screen.getByRole("combobox", { name: /área/i }), {
      target: { value: "Aseo" },
    });
    expect(screen.getByRole("button", { name: /sumar \$5\.000/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /sumar \$10\.000/i })).not.toBeInTheDocument();
    // El progreso del equipo no cambia al filtrar por área.
    expect(progreso).toHaveAttribute("aria-valuenow", "1");
    expect(progreso).toHaveAttribute("aria-valuemax", "2");

    fireEvent.change(screen.getByRole("combobox", { name: /área/i }), {
      target: { value: "" },
    });
    expect(screen.getByRole("button", { name: /sumar \$5\.000/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sumar \$10\.000/i })).toBeInTheDocument();
  });

  it("ofrece un control de salida (issue #40), sin romper la restricción de /cerrar|descartar/i", () => {
    const onSalir = vi.fn();
    renderConteoScreen(new FakeConteoRepository(), "ses_1", onSalir);

    const boton = screen.getByRole("button", { name: /^salir$/i });
    expect(screen.queryByRole("button", { name: /cerrar|descartar/i })).not.toBeInTheDocument();

    fireEvent.click(boton);
    const dialogo = screen.getByRole("dialog");
    fireEvent.click(within(dialogo).getByRole("button", { name: /^salir$/i }));
    expect(onSalir).toHaveBeenCalledTimes(1);
  });

  // Par afirmativo de la guarda `areas.length > 1`: con una sola área el
  // selector no filtraría nada y ocuparía una fila entera en la pantalla más
  // apretada del sistema (cajero de pie, una mano, doc 11 §1).
  it("no pinta el selector de área cuando sólo hay un área", async () => {
    const repo = new FakeConteoRepository({ uid: "uid_ana", nombre: "Ana Ramírez" });
    repo.sembrarLinea("ses_1", {
      categoriaId: "cat_5000",
      valorUnitario: 5000,
      etiqueta: "$5.000",
      area: "Aseo",
      areaFijaPorAdmin: false,
      cantidadTotal: 0,
      numAportantes: 0,
      versiones: {},
      actualizadaEn: new Date(),
      actualizadaPor: "",
    });

    renderConteoScreen(repo);

    expect(await screen.findByRole("button", { name: /sumar/i })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /área/i })).not.toBeInTheDocument();
  });

  it("un admin ve 'Volver al panel' y navega a /admin sin cerrar sesión", async () => {
    onAuthStateChanged.mockImplementation((_auth: unknown, cb: (u: unknown) => void) => {
      cb(usuarioFake("admin"));
      return () => {};
    });

    renderConteoScreen(new FakeConteoRepository());

    fireEvent.click(await screen.findByRole("button", { name: /volver al panel/i }));

    expect(await screen.findByText("Pantalla de admin")).toBeInTheDocument();
  });

  it("un cajero normal no ve 'Volver al panel'", async () => {
    onAuthStateChanged.mockImplementation((_auth: unknown, cb: (u: unknown) => void) => {
      cb(usuarioFake("cajero"));
      return () => {};
    });

    renderConteoScreen(new FakeConteoRepository());

    expect(await screen.findByRole("button", { name: /^salir$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /volver al panel/i })).not.toBeInTheDocument();
  });
});
