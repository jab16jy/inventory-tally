// apps/web/src/ui/FinalizarScreen.test.tsx (F3-B, doc 11 §6, RF-16)
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

const { FinalizarScreen } = await import("./FinalizarScreen.js");

function usuarioFake(rol: "admin" | "cajero") {
  return {
    uid: "u1",
    displayName: null,
    getIdTokenResult: () => Promise.resolve({ claims: { rol } }),
  };
}

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
    porArea: {},
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
            element={<FinalizarScreen auth={{} as never} onSalir={onSalir} />}
          />
          <Route path="/sucursales" element={<p>Pantalla de sucursales</p>} />
          <Route path="/admin" element={<p>Pantalla de admin</p>} />
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

  it("muestra el desglose de unidades por área, sumando categorías de distinto precio", () => {
    const repo = new FakeConteoRepository({ uid: "uid_ana", nombre: "Ana Ramírez" });
    repo.sembrarLinea(
      "ses_1",
      lineaBase("cat_1000", "$1.000", 1000, { porArea: { Aseo: 400 }, cantidadTotal: 400 }),
    );
    repo.sembrarLinea(
      "ses_1",
      lineaBase("cat_2000", "$2.000", 2000, { porArea: { Aseo: 205 }, cantidadTotal: 205 }),
    );
    repo.sembrarLinea(
      "ses_1",
      lineaBase("cat_500", "$500", 500, { porArea: { Mercancía: 1300 }, cantidadTotal: 1300 }),
    );

    renderPantalla(repo);

    expect(screen.getByText("Aseo: 605 productos")).toBeInTheDocument();
    expect(screen.getByText("Mercancía: 1300 productos")).toBeInTheDocument();
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
    renderPantalla(
      new FakeConteoRepository({ uid: "uid_ana", nombre: "Ana Ramírez" }),
      "ses_1",
      onSalir,
    );

    const boton = screen.getByRole("button", { name: /^salir$/i });
    expect(screen.queryByRole("button", { name: /cerrar sesión/i })).not.toBeInTheDocument();

    fireEvent.click(boton);
    const dialogo = screen.getByRole("dialog");
    fireEvent.click(within(dialogo).getByRole("button", { name: /^salir$/i }));
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

    expect(await screen.findByRole("button", { name: /confirmar y salir/i })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /reintentar envío/i })).not.toBeInTheDocument();
  });

  it("un admin que confirma y sale vuelve a /admin, no a /sucursales", async () => {
    onAuthStateChanged.mockImplementation((_auth: unknown, cb: (u: unknown) => void) => {
      cb(usuarioFake("admin"));
      return () => {};
    });
    const repo = new FakeConteoRepository({ uid: "uid_ana", nombre: "Ana Ramírez" });
    repo.sembrarLinea(
      "ses_1",
      lineaBase("cat_1000", "$1.000", 1000, { versiones: { uid_ana: 1 } }),
    );

    renderPantalla(repo);

    fireEvent.click(await screen.findByRole("button", { name: /confirmar y salir/i }));

    expect(await screen.findByText("Pantalla de admin")).toBeInTheDocument();
    expect(screen.queryByText("Pantalla de sucursales")).not.toBeInTheDocument();
  });

  it("un admin ve 'Volver al panel' y navega a /admin sin cerrar sesión", async () => {
    onAuthStateChanged.mockImplementation((_auth: unknown, cb: (u: unknown) => void) => {
      cb(usuarioFake("admin"));
      return () => {};
    });

    renderPantalla(new FakeConteoRepository({ uid: "uid_ana", nombre: "Ana Ramírez" }));

    fireEvent.click(await screen.findByRole("button", { name: /volver al panel/i }));

    expect(await screen.findByText("Pantalla de admin")).toBeInTheDocument();
  });

  it("un cajero normal no ve 'Volver al panel'", async () => {
    onAuthStateChanged.mockImplementation((_auth: unknown, cb: (u: unknown) => void) => {
      cb(usuarioFake("cajero"));
      return () => {};
    });

    renderPantalla(new FakeConteoRepository({ uid: "uid_ana", nombre: "Ana Ramírez" }));

    await screen.findByText(/todo enviado/i);
    expect(screen.queryByRole("button", { name: /volver al panel/i })).not.toBeInTheDocument();
  });
});
