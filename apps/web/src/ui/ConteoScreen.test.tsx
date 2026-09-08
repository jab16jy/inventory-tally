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

function renderConteoScreen(
  repo: FakeConteoRepository,
  sesionId = "ses_1",
  onSalir = vi.fn(),
  areaActiva = "area_1",
) {
  // ADR-23: sin esto, ConteoScreen redirige a /preparar por falta de área activa.
  localStorage.setItem(`areaActiva:${sesionId}`, areaActiva);
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
      porArea: {},
      cantidadTotal: 0,
      numAportantes: 0,
      versiones: {},
      actualizadaEn: new Date(),
      actualizadaPor: "",
    });

    renderConteoScreen(repo);

    fireEvent.click(screen.getByRole("button", { name: /contar \$5\.000/i }));
    fireEvent.click(screen.getByRole("button", { name: "1" }));
    fireEvent.click(screen.getByRole("button", { name: /agrupar/i }));

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
      porArea: {},
      cantidadTotal: 0,
      numAportantes: 0,
      versiones: {},
      actualizadaEn: new Date(),
      actualizadaPor: "",
    });

    renderConteoScreen(repo);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /contar \$5\.000/i }));
    fireEvent.click(screen.getByRole("button", { name: "1" }));
    fireEvent.click(screen.getByRole("button", { name: /agrupar/i }));

    const banner = await screen.findByRole("alert");
    expect(banner).toHaveTextContent(/no cierres la aplicación/i);
    // No descartable: sin botón para cerrarlo.
    expect(screen.queryByRole("button", { name: /cerrar|descartar/i })).not.toBeInTheDocument();
  });

  // D-2/D-3 (docs/diseno/etapa-3-ui.md): el <select> de "Todas las áreas" se
  // retira; el filtro deja de leer `porArea` (lo YA contado) y pasa a leer
  // `areaIds` (lo ASIGNADO por el catálogo). El interruptor "Ver todo" es la
  // válvula de escape, no una preferencia de vista.
  it("el interruptor 'Ver todo' filtra a mi área por defecto y muestra el catálogo completo al activarse, sin tocar el progreso del equipo (docs 10 §2)", async () => {
    const repo = new FakeConteoRepository({ uid: "uid_ana", nombre: "Ana Ramírez" });
    repo.sembrarLinea("ses_1", {
      categoriaId: "cat_aseo",
      valorUnitario: 5000,
      etiqueta: "$5.000",
      areaIds: ["area_aseo"],
      porArea: {},
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
      areaIds: ["area_bebidas"],
      porArea: {},
      cantidadTotal: 0,
      numAportantes: 0,
      versiones: {},
      actualizadaEn: new Date(),
      actualizadaPor: "",
    });

    renderConteoScreen(repo, "ses_1", vi.fn(), "area_aseo");

    // Por defecto sólo se ve mi área (Aseo) — Bebidas no es mía.
    expect(await screen.findByRole("button", { name: /contar \$5\.000/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /contar \$10\.000/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^ver todo$/i }));

    // Par afirmativo (AGENTS.md §2): contamos Bebidas con "Ver todo" activo —
    // si la barra derivara del filtro en vez de `lineas` completas, el
    // assert de abajo (tras volver a "mi área") daría 0/1 en vez de 1/2.
    const botonBebidas = screen.getByRole("button", { name: /contar \$10\.000/i });
    expect(botonBebidas).toBeInTheDocument();
    fireEvent.click(botonBebidas);
    fireEvent.click(screen.getByRole("button", { name: "1" }));
    fireEvent.click(screen.getByRole("button", { name: /agrupar/i }));
    expect(await screen.findByText(/tú: 1/i)).toBeInTheDocument();

    const progreso = screen.getByRole("progressbar");
    expect(progreso).toHaveAttribute("aria-valuenow", "1");
    expect(progreso).toHaveAttribute("aria-valuemax", "2");

    fireEvent.click(screen.getByRole("button", { name: /^ver todo$/i }));
    expect(screen.getByRole("button", { name: /contar \$5\.000/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /contar \$10\.000/i })).not.toBeInTheDocument();
    // El progreso del equipo no cambia al volver a "mi área".
    expect(progreso).toHaveAttribute("aria-valuenow", "1");
    expect(progreso).toHaveAttribute("aria-valuemax", "2");
  });

  // Test nuevo imprescindible (D-2, "Test nuevo imprescindible" en
  // docs/diseno/etapa-3-ui.md §4): un test que sólo comprobara la ocultación
  // pasaría también con el filtro roto — éste comprueba las DOS mitades:
  // mi área Y "sin área" por defecto, catálogo completo con "Ver todo".
  it("D-2: por defecto muestra mi área y las categorías sin área asignada; 'Ver todo' muestra el catálogo completo", async () => {
    const repo = new FakeConteoRepository({ uid: "uid_ana", nombre: "Ana Ramírez" });
    repo.sembrarLinea("ses_1", {
      categoriaId: "cat_bodega",
      valorUnitario: 1000,
      etiqueta: "$1.000",
      areaIds: ["area_bodega"],
      porArea: {},
      cantidadTotal: 0,
      numAportantes: 0,
      versiones: {},
      actualizadaEn: new Date(),
      actualizadaPor: "",
    });
    repo.sembrarLinea("ses_1", {
      categoriaId: "cat_anaqueles",
      valorUnitario: 2000,
      etiqueta: "$2.000",
      areaIds: ["area_anaqueles"],
      porArea: {},
      cantidadTotal: 0,
      numAportantes: 0,
      versiones: {},
      actualizadaEn: new Date(),
      actualizadaPor: "",
    });
    repo.sembrarLinea("ses_1", {
      categoriaId: "cat_sin_area",
      valorUnitario: 3000,
      etiqueta: "$3.000",
      porArea: {},
      cantidadTotal: 0,
      numAportantes: 0,
      versiones: {},
      actualizadaEn: new Date(),
      actualizadaPor: "",
    });

    renderConteoScreen(repo, "ses_1", vi.fn(), "area_bodega");

    expect(await screen.findByRole("button", { name: /contar \$1\.000/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /contar \$3\.000/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /contar \$2\.000/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^ver todo$/i }));

    expect(screen.getByRole("button", { name: /contar \$1\.000/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /contar \$2\.000/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /contar \$3\.000/i })).toBeInTheDocument();
  });

  // Gemelo del test D-1 en linea-sembrada.test.ts: `areaIds: []` explícito
  // debe tratarse igual que el campo ausente ("sin área"), visible por
  // defecto sin necesidad de "Ver todo".
  it("D-2: 'areaIds: []' explícito se trata igual que 'sin área' (campo ausente)", async () => {
    const repo = new FakeConteoRepository({ uid: "uid_ana", nombre: "Ana Ramírez" });
    repo.sembrarLinea("ses_1", {
      categoriaId: "cat_bodega",
      valorUnitario: 1000,
      etiqueta: "$1.000",
      areaIds: ["area_bodega"],
      porArea: {},
      cantidadTotal: 0,
      numAportantes: 0,
      versiones: {},
      actualizadaEn: new Date(),
      actualizadaPor: "",
    });
    repo.sembrarLinea("ses_1", {
      categoriaId: "cat_sin_area_explicito",
      valorUnitario: 3000,
      etiqueta: "$3.000",
      areaIds: [],
      porArea: {},
      cantidadTotal: 0,
      numAportantes: 0,
      versiones: {},
      actualizadaEn: new Date(),
      actualizadaPor: "",
    });

    renderConteoScreen(repo, "ses_1", vi.fn(), "area_bodega");

    expect(await screen.findByRole("button", { name: /contar \$1\.000/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /contar \$3\.000/i })).toBeInTheDocument();
  });

  it("D-5: muestra el área activa en la cabecera, resuelta a su nombre", async () => {
    const repo = new FakeConteoRepository({ uid: "uid_ana", nombre: "Ana Ramírez" });
    repo.sembrarArea({ areaId: "area_1", nombre: "Bodega", activa: true, creadaEn: new Date() });
    repo.sembrarLinea("ses_1", {
      categoriaId: "cat_5000",
      valorUnitario: 5000,
      etiqueta: "$5.000",
      porArea: {},
      cantidadTotal: 0,
      numAportantes: 0,
      versiones: {},
      actualizadaEn: new Date(),
      actualizadaPor: "",
    });

    renderConteoScreen(repo);

    // El nombre del área vive en un <span> hermano del texto "Área: "
    // (D-5: dos colores, uno por palabra) — un matcher de función compara
    // contra el textContent combinado en vez de un solo nodo de texto.
    expect(
      await screen.findByText((_, el) => el?.textContent === "Área: Bodega"),
    ).toBeInTheDocument();
  });

  it("D-5: si el área activa no resuelve a un nombre conocido, muestra el id crudo (sin aviso)", async () => {
    const repo = new FakeConteoRepository({ uid: "uid_ana", nombre: "Ana Ramírez" });
    repo.sembrarLinea("ses_1", {
      categoriaId: "cat_5000",
      valorUnitario: 5000,
      etiqueta: "$5.000",
      porArea: {},
      cantidadTotal: 0,
      numAportantes: 0,
      versiones: {},
      actualizadaEn: new Date(),
      actualizadaPor: "",
    });

    renderConteoScreen(repo); // areaActiva = "area_1", sin área sembrada con ese id

    expect(
      await screen.findByText((_, el) => el?.textContent === "Área: area_1"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("avisa (role=status) cuando mi área no tiene categorías asignadas, con salida a 'Ver todo'", async () => {
    const repo = new FakeConteoRepository({ uid: "uid_ana", nombre: "Ana Ramírez" });
    repo.sembrarLinea("ses_1", {
      categoriaId: "cat_bebidas",
      valorUnitario: 10000,
      etiqueta: "$10.000",
      areaIds: ["area_bebidas"],
      porArea: {},
      cantidadTotal: 0,
      numAportantes: 0,
      versiones: {},
      actualizadaEn: new Date(),
      actualizadaPor: "",
    });

    renderConteoScreen(repo, "ses_1", vi.fn(), "area_bodega"); // mi área no tiene nada asignado

    expect(await screen.findByRole("status")).toHaveTextContent(
      /no hay categorías asignadas a tu área/i,
    );
    expect(screen.queryByRole("button", { name: /contar/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^ver todo$/i }));
    expect(await screen.findByRole("button", { name: /contar \$10\.000/i })).toBeInTheDocument();
  });

  it("no confunde 'sin resultados de búsqueda' con 'área sin categorías'", async () => {
    const repo = new FakeConteoRepository({ uid: "uid_ana", nombre: "Ana Ramírez" });
    repo.sembrarLinea("ses_1", {
      categoriaId: "cat_bebidas",
      valorUnitario: 10000,
      etiqueta: "$10.000",
      areaIds: ["area_bodega"],
      porArea: {},
      cantidadTotal: 0,
      numAportantes: 0,
      versiones: {},
      actualizadaEn: new Date(),
      actualizadaPor: "",
    });

    renderConteoScreen(repo, "ses_1", vi.fn(), "area_bodega"); // mi área SÍ tiene categorías

    await screen.findByRole("button", { name: /contar \$10\.000/i });

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "no existe" } });

    // La búsqueda vacía la lista, pero el área activa sí tiene categorías:
    // no debe aparecer el aviso de "sin categorías asignadas a tu área".
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /contar/i })).not.toBeInTheDocument();
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

  // Par afirmativo de la guarda `lineasDeMiArea.length < lineas.length`
  // (D-3): con mi área ya mostrando todo el catálogo, el interruptor no
  // filtraría nada y ocuparía una fila entera en la pantalla más apretada
  // del sistema (cajero de pie, una mano, doc 11 §1).
  it("no pinta el interruptor 'Ver todo' cuando mi área ya muestra todo el catálogo", async () => {
    const repo = new FakeConteoRepository({ uid: "uid_ana", nombre: "Ana Ramírez" });
    repo.sembrarLinea("ses_1", {
      categoriaId: "cat_5000",
      valorUnitario: 5000,
      etiqueta: "$5.000",
      areaIds: ["area_1"],
      porArea: {},
      cantidadTotal: 0,
      numAportantes: 0,
      versiones: {},
      actualizadaEn: new Date(),
      actualizadaPor: "",
    });

    renderConteoScreen(repo);

    expect(await screen.findByRole("button", { name: /contar/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^ver todo$/i })).not.toBeInTheDocument();
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
