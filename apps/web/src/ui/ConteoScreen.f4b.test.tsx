// F4-B (docs/plan-diseno-visual-pwa.md §5, "Carga: skeleton con la forma
// final, nunca un spinner"): mientras la sesión sigue abierta y las líneas
// del catálogo todavía no llegaron —el mismo hueco que ya cubría
// SucursalesScreen para sus sucursales—, la lista de categorías pintaba
// vacía (0/0, sin filas, sin ningún indicio de que algo viene en camino).
// OJO con la razón, porque la primera versión de este comentario decía lo
// contrario: `abrirSesion` (packages/functions/src/callables/abrir-sesion.ts)
// NO siembra las líneas en el mismo batch que crea la sesión. Las siembra en
// lotes de 400 y FUERA de la transacción de apertura — su propio comentario
// D3 lo dice. No hay garantía atómica aquí, a diferencia de lo que en
// `/sucursales` sí da el claim de auth. Por eso el esqueleto exige que la
// sesión EXISTA: sin ese requisito prometía contenido también cuando la
// sesión se había borrado y nunca iba a llegar nada.
// Archivo nuevo: los tests de F0-F4-A1 quedan intactos como red de
// regresión (mismo criterio que los demás `ConteoScreen.*.test.tsx`).
import { FakeConteoRepository } from "@conteo/data";
import type { SesionConteo } from "@conteo/shared";
import { render, screen } from "@testing-library/react";
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

function sesionBase(overrides: Partial<SesionConteo> = {}): SesionConteo {
  return {
    sesionId: "ses_1",
    sucursalId: "suc_norte",
    sucursalNombre: "Sucursal Norte",
    estado: "abierta",
    abiertaEn: new Date(),
    abiertaPor: "uid_admin",
    cerradaEn: null,
    cerradaPor: null,
    participantes: [],
    totalUnidades: 0,
    sesionCorregidaId: null,
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

describe("ConteoScreen · esqueleto de carga (F4-B)", () => {
  it("con la sesión abierta y sin líneas todavía, pinta filas de esqueleto en vez de una lista vacía", () => {
    const repo = new FakeConteoRepository({ uid: "uid_ana", nombre: "Ana Ramírez" });
    repo.sembrarSesion(sesionBase());

    renderConteoScreen(repo);

    expect(screen.getAllByTestId("fila-esqueleto").length).toBeGreaterThan(0);
  });

  it("en cuanto llegan líneas reales, el esqueleto desaparece y se ven las filas de verdad", () => {
    const repo = new FakeConteoRepository({ uid: "uid_ana", nombre: "Ana Ramírez" });
    repo.sembrarSesion(sesionBase());
    repo.sembrarLinea("ses_1", lineaBase("cat_5000", "$5.000", 5000));

    renderConteoScreen(repo);

    expect(screen.queryByTestId("fila-esqueleto")).not.toBeInTheDocument();
    expect(screen.getByText("$5.000")).toBeInTheDocument();
  });

  it("con la sesión BORRADA no promete contenido: no va a llegar nada", () => {
    // Ojo con el título, porque el primero que tuvo este test decía "el
    // esqueleto exige que la sesión exista" y describía la condición más
    // estricta de lo que es: el esqueleto TAMBIÉN se pinta mientras el
    // listener no ha resuelto (el caso de abajo). Lo que lo apaga es
    // saber que la sesión ya no está.
    //
    // `abrirSesion` borra la sesión si la siembra de líneas falla a mitad
    // (su compensación D3, para dejar la sucursal reintentable). Ahí no va
    // a llegar nada NUNCA, y un esqueleto animado prometiéndolo es peor que
    // la lista vacía que había antes de F4-B: la lista vacía no afirma nada.
    const repo = new FakeConteoRepository({ uid: "uid_ana", nombre: "Ana Ramírez" });

    renderConteoScreen(repo);

    expect(screen.queryByTestId("fila-esqueleto")).not.toBeInTheDocument();
  });

  it("mientras el listener de sesión no ha resuelto, SÍ pinta esqueleto: es la ventana honesta", () => {
    // La razón entera del estado de tres casos. `FakeConteoRepository` no
    // sirve aquí: su `observarSesion` responde SÍNCRONAMENTE al
    // suscribirse, así que nunca deja ver la ventana previa al primer
    // snapshot que un listener real de Firestore sí produce. Este doble
    // responde por las líneas y se queda callado sobre la sesión.
    const repo = new FakeConteoRepository({ uid: "uid_ana", nombre: "Ana Ramírez" });
    repo.sembrarSesion(sesionBase());
    const repoSesionLenta = Object.assign(Object.create(Object.getPrototypeOf(repo)), repo, {
      observarSesion: () => () => {},
    }) as FakeConteoRepository;

    renderConteoScreen(repoSesionLenta);

    expect(screen.getAllByTestId("fila-esqueleto").length).toBeGreaterThan(0);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("con la sesión cerrada, no pinta esqueleto detrás del modal bloqueante", () => {
    const repo = new FakeConteoRepository({ uid: "uid_ana", nombre: "Ana Ramírez" });
    repo.sembrarSesion(sesionBase({ estado: "cerrada" }));

    renderConteoScreen(repo);

    expect(screen.queryByTestId("fila-esqueleto")).not.toBeInTheDocument();
  });
});

describe("ConteoScreen · 200 categorías (F4-B, smoke — NO es el perfil de RNF-05)", () => {
  // El plan §8 pide un perfil con React DevTools Profiler en un iPhone real
  // (< 20 ms/frame) — no hay navegador real ni dispositivo en este entorno,
  // y jsdom no tiene pipeline de layout ni de pintado: `content-visibility:
  // auto` (FilaCategoria.tsx) no hace nada aquí, así que un tiempo medido en
  // jsdom NO es una medida sustituta de ms/frame y no se reporta como tal
  // (ver informe final). Lo único honesto y verificable en este entorno es
  // estructural: que 200 categorías montan sin excepción y que cada una
  // conserva su propia suscripción (`useMiAporte` dentro de `FilaCategoria`,
  // DESIGN.md §Don't) en vez de degenerar en un cálculo que dependa de las
  // 200 a la vez — un smoke test contra una regresión O(n²) real, no un
  // benchmark.
  it("monta y cuenta 200 líneas sin excepción, cada una con su propia fila", () => {
    const repo = new FakeConteoRepository({ uid: "uid_ana", nombre: "Ana Ramírez" });
    repo.sembrarSesion(sesionBase());
    for (let i = 0; i < 200; i++) {
      repo.sembrarLinea("ses_1", lineaBase(`cat_${i}`, `$${i}`, i));
    }

    renderConteoScreen(repo);

    expect(screen.getByText(/0\/200/)).toBeInTheDocument();
    expect(screen.getAllByTestId("mi-cantidad")).toHaveLength(200);
  });
});
