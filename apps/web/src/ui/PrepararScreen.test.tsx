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
    porArea: {},
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

  it('con un área elegida, "Empezar a contar" navega a la pantalla de conteo de esa misma sesión', async () => {
    const repo = new FakeConteoRepository();
    repo.sembrarArea({ areaId: "area_1", nombre: "Área 1", activa: true, creadaEn: new Date() });
    renderPantalla(repo, "ses_9");

    fireEvent.change(await screen.findByLabelText(/tu área/i), {
      target: { value: "area_1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /empezar a contar/i }));

    expect(await screen.findByText("Pantalla de conteo")).toBeInTheDocument();
  });

  it("issue #86 (RDD ronda 5): mientras el listener de áreas no emite, avisa que sigue cargando en vez de quedar mudo", () => {
    const repo = new FakeConteoRepository();
    // Simula el techo documentado en useAreasActivas.ts: un listener que
    // jamás llama a `onChange` (permiso revocado, o carga fría sin red ni
    // caché) — antes de este fix, el cajero sólo veía un botón deshabilitado
    // sin ninguna pista de que seguía cargando.
    repo.observarAreasActivas = () => () => {};

    renderPantalla(repo, "ses_areas_colgadas");

    expect(screen.getByText(/cargando áreas/i)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /empezar a contar/i })).toBeDisabled();
  });

  it("issue #86 (revisión de resiliencia): con el catálogo vacío, avisa y no deja entrar sin área", async () => {
    // infra/firestore.rules exige areaId.size() > 0 sin excepción: con cero
    // áreas configuradas no hay ningún valor válido que dejar pasar. La
    // pantalla debe decirlo, no fingir que "" sirve.
    renderPantalla(new FakeConteoRepository(), "ses_sin_areas");

    expect(await screen.findByRole("alert")).toHaveTextContent(/no hay áreas configuradas/i);
    expect(screen.getByRole("button", { name: /empezar a contar/i })).toBeDisabled();
  });

  it("issue #86 (Judgment Day JD-002): un área huérfana en localStorage no habilita el botón si no está en el catálogo activo", async () => {
    localStorage.setItem("areaActiva:ses_huerfana", "area_eliminada");
    const repo = new FakeConteoRepository();
    repo.sembrarArea({
      areaId: "area_activa",
      nombre: "Área Activa",
      activa: true,
      creadaEn: new Date(),
    });

    renderPantalla(repo, "ses_huerfana");

    const boton = await screen.findByRole("button", { name: /empezar a contar/i });
    expect(boton).toBeDisabled();
  });

  it("issue #86 (Judgment Day JD-002): con catálogo vacío y área huérfana en localStorage, el botón sigue deshabilitado", async () => {
    localStorage.setItem("areaActiva:ses_vacia_huerfana", "area_eliminada");
    renderPantalla(new FakeConteoRepository(), "ses_vacia_huerfana");

    expect(await screen.findByRole("alert")).toHaveTextContent(/no hay áreas configuradas/i);
    expect(screen.getByRole("button", { name: /empezar a contar/i })).toBeDisabled();
  });

  it("issue #83/ADR-23: con áreas activas, 'Empezar a contar' queda deshabilitado hasta elegir una", async () => {
    const repo = new FakeConteoRepository();
    repo.sembrarArea({
      areaId: "area_bodega",
      nombre: "Bodega",
      activa: true,
      creadaEn: new Date(),
    });

    renderPantalla(repo, "ses_area_1");

    const boton = await screen.findByRole("button", { name: /empezar a contar/i });
    expect(boton).toBeDisabled();

    fireEvent.change(await screen.findByLabelText(/tu área/i), {
      target: { value: "area_bodega" },
    });
    expect(boton).toBeEnabled();

    fireEvent.click(boton);
    expect(await screen.findByText("Pantalla de conteo")).toBeInTheDocument();
  });

  it("issue #83/ADR-23: el área elegida persiste en localStorage por sesionId", async () => {
    const repo = new FakeConteoRepository();
    repo.sembrarArea({ areaId: "area_aseo", nombre: "Aseo", activa: true, creadaEn: new Date() });

    renderPantalla(repo, "ses_area_2");
    fireEvent.change(await screen.findByLabelText(/tu área/i), {
      target: { value: "area_aseo" },
    });

    expect(localStorage.getItem("areaActiva:ses_area_2")).toBe("area_aseo");
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
