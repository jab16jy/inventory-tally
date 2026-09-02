// apps/web/src/ui/SucursalesScreen.test.tsx (F3-A, doc 11 §2, plan §5)
import { FakeConteoRepository } from "@conteo/data";
import type { Sucursal } from "@conteo/shared";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ConteoRepositoryProvider } from "../state/repositorio-contexto.js";

const onAuthStateChanged = vi.fn();

vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (...args: unknown[]) =>
    (onAuthStateChanged as (...a: unknown[]) => unknown)(...args),
}));

const { SucursalesScreen } = await import("./SucursalesScreen.js");

function usuarioFake(sucursales: string[]) {
  return {
    uid: "uid_ana",
    displayName: "Ana Ramírez",
    getIdTokenResult: () => Promise.resolve({ claims: { rol: "cajero", sucursales } }),
  };
}

function crearSucursal(overrides: Partial<Sucursal> = {}): Sucursal {
  return {
    sucursalId: "suc_norte",
    nombre: "Sucursal Norte",
    direccion: "Cra 43 #75-120",
    conectividad: "datos",
    activa: true,
    sesionAbiertaId: null,
    creadaEn: new Date("2026-01-15T10:00:00Z"),
    ...overrides,
  };
}

function renderPantalla(
  repo: FakeConteoRepository,
  sucursalesDelClaim: string[],
  onSalir: () => void = vi.fn(),
) {
  onAuthStateChanged.mockImplementation((_auth: unknown, cb: (u: unknown) => void) => {
    cb(usuarioFake(sucursalesDelClaim));
    return () => {};
  });

  return render(
    <MemoryRouter initialEntries={["/sucursales"]}>
      <ConteoRepositoryProvider repo={repo}>
        <Routes>
          <Route
            path="/sucursales"
            element={<SucursalesScreen auth={{} as never} onSalir={onSalir} />}
          />
          <Route path="/conteo/:sesionId/preparar" element={<p>Pantalla de preparación</p>} />
          <Route path="/conteo/:sesionId" element={<p>Pantalla de conteo</p>} />
        </Routes>
      </ConteoRepositoryProvider>
    </MemoryRouter>,
  );
}

describe("SucursalesScreen (F3-A)", () => {
  it("lista las sucursales del claim, cada una con su marca de conectividad", async () => {
    const repo = new FakeConteoRepository();
    repo.sembrarSucursal(
      crearSucursal({ sucursalId: "suc_norte", nombre: "Sucursal Norte", conectividad: "datos" }),
    );
    repo.sembrarSucursal(
      crearSucursal({ sucursalId: "suc_sur", nombre: "Sucursal Sur", conectividad: "wifi" }),
    );

    renderPantalla(repo, ["suc_norte", "suc_sur"]);

    expect(await screen.findByText("Sucursal Norte")).toBeInTheDocument();
    expect(screen.getByText("Sucursal Sur")).toBeInTheDocument();
    expect(screen.getByText(/datos móviles/i)).toBeInTheDocument();
    expect(screen.getByText(/wifi/i)).toBeInTheDocument();
  });

  it("tocar una sucursal con sesión abierta entra por /preparar, no directo al conteo", async () => {
    // El grafo de navegación de docs/diseno/11-ux-y-navegacion.md §2 es
    // `SUC --> PREP`: la preparación no es una pantalla opcional colgada al
    // lado, es el paso que precede al conteo. El uso es MENSUAL (PRODUCT.md),
    // así que nadie recuerda cómo va el flujo y saltárselo deja al cajero
    // frente a una lista de categorías sin contexto. Saltar a
    // `/conteo/:sesionId` dejaba además la ruta `/preparar` sin un solo
    // consumidor — pantalla muerta, el error que ya costó cuatro primitivos
    // en F1.
    const repo = new FakeConteoRepository();
    repo.sembrarSucursal(
      crearSucursal({ sucursalId: "suc_norte", sesionAbiertaId: "ses_20260802_norte_01" }),
    );

    renderPantalla(repo, ["suc_norte"]);

    const boton = await screen.findByRole("button", { name: /sucursal norte/i });
    fireEvent.click(boton);

    expect(await screen.findByText("Pantalla de preparación")).toBeInTheDocument();
    expect(screen.queryByText("Pantalla de conteo")).not.toBeInTheDocument();
  });

  it("una sucursal sin sesión abierta no es tocable y lo comunica en vez de dejar un botón muerto", async () => {
    const repo = new FakeConteoRepository();
    repo.sembrarSucursal(crearSucursal({ sucursalId: "suc_norte", sesionAbiertaId: null }));

    renderPantalla(repo, ["suc_norte"]);

    const boton = await screen.findByRole("button", { name: /sucursal norte/i });
    expect(boton).toBeDisabled();
    expect(screen.getByText(/sin sesión/i)).toBeInTheDocument();

    fireEvent.click(boton);
    expect(screen.queryByText("Pantalla de conteo")).not.toBeInTheDocument();
  });

  it("no afirma 'no tienes sucursales' mientras el claim aún no ha resuelto", async () => {
    // `useAuthState` arranca en `undefined` y sólo llega al claim tras el
    // microtask de `getIdTokenResult()`. En esa ventana `sucursales` es []
    // por ausencia de datos, no por ausencia de asignación: anunciar el
    // vacío ahí es afirmar algo falso en CADA carga de la pantalla.
    const repo = new FakeConteoRepository();
    repo.sembrarSucursal(crearSucursal({ sucursalId: "suc_norte" }));

    renderPantalla(repo, ["suc_norte"]);

    expect(screen.queryByText(/no tienes sucursales/i)).not.toBeInTheDocument();
    expect(await screen.findByText("Sucursal Norte")).toBeInTheDocument();
  });

  it("anuncia el vacío sólo cuando el claim resolvió y de verdad no hay ninguna", async () => {
    renderPantalla(new FakeConteoRepository(), []);

    expect(await screen.findByText(/no tienes sucursales/i)).toBeInTheDocument();
  });

  it("con máximo 10 sucursales (contracts/crear-cajero.schema) renderiza las 10 sin romper", async () => {
    const repo = new FakeConteoRepository();
    const ids = Array.from({ length: 10 }, (_, i) => `suc_${i}`);
    for (const id of ids) {
      repo.sembrarSucursal(crearSucursal({ sucursalId: id, nombre: `Sucursal ${id}` }));
    }

    renderPantalla(repo, ids);

    // Nombre accesible con prefijo "Sucursal …": distingue las filas del
    // nuevo botón "Salir" de la cabecera (issue #40), que también cuenta
    // como <button> pero está siempre presente, incluso antes de que las
    // sucursales terminen de cargar.
    const filasSucursal = await screen.findAllByRole("button", { name: /^sucursal /i });
    expect(filasSucursal).toHaveLength(10);
  });

  it("ofrece un control de salida visible que no se llama 'Cerrar sesión'", async () => {
    const onSalir = vi.fn();
    const repo = new FakeConteoRepository();
    repo.sembrarSucursal(crearSucursal({ sucursalId: "suc_norte" }));

    renderPantalla(repo, ["suc_norte"], onSalir);

    const boton = await screen.findByRole("button", { name: /^salir$/i });
    expect(screen.queryByRole("button", { name: /cerrar sesión/i })).not.toBeInTheDocument();

    fireEvent.click(boton);
    const dialogo = screen.getByRole("dialog");
    fireEvent.click(within(dialogo).getByRole("button", { name: /^salir$/i }));
    expect(onSalir).toHaveBeenCalledTimes(1);
  });

  it("F4-B: con el claim resuelto y IDs, pero los snapshots de sucursal aún en vuelo, pinta un esqueleto en vez de nada", async () => {
    // El hueco que el comentario de SucursalesScreen.tsx documentaba sin
    // construir: `estadoAuth` ya resolvió con IDs (por eso no aparece "No
    // tienes sucursales asignadas"), pero ningún doc de Sucursal se sembró
    // todavía, así que `sucursales` se queda en [] — la misma ventana que en
    // producción cubren los N listeners de `observarSucursales` mientras
    // Firestore no ha emitido su primer snapshot.
    const repo = new FakeConteoRepository();

    renderPantalla(repo, ["suc_norte", "suc_sur"]);

    expect(await screen.findAllByTestId("fila-esqueleto")).toHaveLength(2);
    expect(screen.queryByText(/no tienes sucursales/i)).not.toBeInTheDocument();
    // El esqueleto no tiene filas tocables — sólo el botón "Salir" de la
    // cabecera es interactivo mientras carga.
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: /^salir$/i })).toBeInTheDocument();
  });

  it("F4-B: el esqueleto desaparece en cuanto llegan las sucursales reales", async () => {
    const repo = new FakeConteoRepository();
    repo.sembrarSucursal(crearSucursal({ sucursalId: "suc_norte", nombre: "Sucursal Norte" }));

    renderPantalla(repo, ["suc_norte"]);

    expect(await screen.findByText("Sucursal Norte")).toBeInTheDocument();
    expect(screen.queryByTestId("fila-esqueleto")).not.toBeInTheDocument();
  });

  it("ya no lleva el enlace de pie a 'Mis conteos': lo reemplaza la barra de pestañas", async () => {
    // El enlace del pie era un salto SIN VUELTA (MisConteosScreen no tenía
    // cómo regresar). Ahora "Mis conteos" es una pestaña de `LayoutCajero`,
    // que vive fuera de esta pantalla — duplicarlo aquí daría dos caminos al
    // mismo destino, uno de ellos sin retorno.
    const repo = new FakeConteoRepository();
    repo.sembrarSucursal(crearSucursal({ sucursalId: "suc_norte", nombre: "Sucursal Norte" }));

    renderPantalla(repo, ["suc_norte"]);

    expect(await screen.findByText("Sucursal Norte")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /mis conteos/i })).not.toBeInTheDocument();
  });
});
