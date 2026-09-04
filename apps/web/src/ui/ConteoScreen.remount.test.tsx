// apps/web/src/ui/ConteoScreen.remount.test.tsx (F3-B) — seguimiento
// pendiente de F2: "al navegar entre dos sesiones distintas, el componente
// se reutiliza y arrastra estado de la sesión anterior".
//
// La ruta es la misma (`/conteo/:sesionId`) en ambas sesiones, así que
// react-router-dom NO desmonta `ConteoScreen` al cambiar sólo el parámetro
// — reutiliza la instancia existente (es el comportamiento documentado de
// React Router, no un bug de la librería). El estado LOCAL de la pantalla
// (búsqueda, filtro, Hoja en edición, "tu aporte" acumulado) vive en
// `useState`/`useRef` dentro de `ConteoScreen` y nada en el árbol depende de
// `sesionId` para resetearlo, así que sobrevive al cambio de sesión.
import { FakeConteoRepository } from "@conteo/data";
import { fireEvent, render, screen } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ConteoRepositoryProvider } from "../state/repositorio-contexto.js";

vi.mock("firebase/auth", () => ({ onAuthStateChanged: vi.fn() }));

const { ConteoScreenPorSesion } = await import("./ConteoScreen.js");

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

function repoConDosSesiones(): FakeConteoRepository {
  const repo = new FakeConteoRepository({ uid: "uid_ana", nombre: "Ana Ramírez" });
  repo.sembrarLinea("ses_a", lineaBase("cat_1000", "$1.000", 1000));
  repo.sembrarLinea("ses_b", lineaBase("cat_2000", "$2.000", 2000));
  return repo;
}

// Arnés mínimo que reproduce lo único que importa del router real
// (router.tsx): la MISMA ruta `/conteo/:sesionId` montada dos veces con un
// `:sesionId` distinto, alcanzada por navegación de cliente (un <Link>, no
// un remount completo de `<MemoryRouter>`).
function renderConDosSesiones() {
  // ADR-23: sin esto, ConteoScreen redirige a /preparar por falta de área
  // activa — no hay ruta /preparar definida en este arnés mínimo.
  localStorage.setItem("areaActiva:ses_a", "area_1");
  localStorage.setItem("areaActiva:ses_b", "area_1");
  return render(
    <MemoryRouter initialEntries={["/conteo/ses_a"]}>
      <ConteoRepositoryProvider repo={repoConDosSesiones()}>
        <Link to="/conteo/ses_b">Ir a sesión B</Link>
        <Routes>
          <Route
            path="/conteo/:sesionId"
            element={<ConteoScreenPorSesion auth={{} as never} onSalir={() => {}} />}
          />
        </Routes>
      </ConteoRepositoryProvider>
    </MemoryRouter>,
  );
}

describe("ConteoScreen · remontaje por :sesionId (F3-B)", () => {
  it("cambiar de sesión limpia la búsqueda de la sesión anterior en vez de arrastrarla", async () => {
    renderConDosSesiones();

    const busqueda = await screen.findByPlaceholderText(/buscar valor/i);
    fireEvent.change(busqueda, { target: { value: "1.000" } });
    expect(busqueda).toHaveValue("1.000");

    fireEvent.click(screen.getByRole("link", { name: /ir a sesión b/i }));

    // La categoría de la sesión B ($2.000) no matchea el texto de búsqueda
    // que quedó de la sesión A ("1.000"): si el estado se arrastra, esta
    // fila queda oculta pese a no haber ningún filtro activo de verdad para
    // el cajero que acaba de entrar a esta sesión.
    expect(await screen.findByRole("button", { name: /contar \$2\.000/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/buscar valor/i)).toHaveValue("");
  });
});
