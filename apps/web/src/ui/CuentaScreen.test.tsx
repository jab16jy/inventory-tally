// apps/web/src/ui/CuentaScreen.test.tsx (doc 11 §2) — datos de la cuenta del
// cajero (nombre, correo, rol) y las sucursales que tiene asignadas. Pantalla
// hermana de SucursalesScreen: informa, no navega.
import { FakeConteoRepository } from "@conteo/data";
import type { Sucursal } from "@conteo/shared";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ConteoRepositoryProvider } from "../state/repositorio-contexto.js";

const onAuthStateChanged = vi.fn();

vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (...args: unknown[]) =>
    (onAuthStateChanged as (...a: unknown[]) => unknown)(...args),
}));

const { CuentaScreen } = await import("./CuentaScreen.js");

function usuarioFake(rol: "admin" | "cajero", sucursales: string[]) {
  return {
    uid: "uid_ana",
    displayName: "Ana Ramírez",
    getIdTokenResult: () => Promise.resolve({ claims: { rol, sucursales } }),
  };
}

// `currentUser.email` es una propiedad síncrona del SDK, independiente del
// listener `onAuthStateChanged` mockeado abajo — de ahí un fake aparte.
function authFake(correo: string) {
  return { currentUser: { email: correo } } as never;
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
  rol: "admin" | "cajero",
  sucursalesDelClaim: string[],
  correo = "ana@tienda.test",
  onSalir: () => void = vi.fn(),
) {
  onAuthStateChanged.mockImplementation((_auth: unknown, cb: (u: unknown) => void) => {
    cb(usuarioFake(rol, sucursalesDelClaim));
    return () => {};
  });

  return render(
    <MemoryRouter>
      <ConteoRepositoryProvider repo={repo}>
        <CuentaScreen auth={authFake(correo)} onSalir={onSalir} />
      </ConteoRepositoryProvider>
    </MemoryRouter>,
  );
}

describe("CuentaScreen (doc 11 §2)", () => {
  it("muestra el nombre, el correo, el rol y el nombre de cada sucursal asignada", async () => {
    const repo = new FakeConteoRepository();
    repo.sembrarSucursal(crearSucursal({ sucursalId: "suc_norte", nombre: "Sucursal Norte" }));
    repo.sembrarSucursal(crearSucursal({ sucursalId: "suc_sur", nombre: "Sucursal Sur" }));

    renderPantalla(repo, "cajero", ["suc_norte", "suc_sur"], "ana@tienda.test");

    // Se espera el último dato en asentarse (la lista de sucursales, que
    // depende de un segundo efecto encadenado tras resolver el claim);
    // el resto ya está en el DOM para entonces.
    expect(await screen.findByText("Sucursal Norte")).toBeInTheDocument();
    expect(screen.getByText("Sucursal Sur")).toBeInTheDocument();
    expect(screen.getByText("Ana Ramírez")).toBeInTheDocument();
    expect(screen.getByText("ana@tienda.test")).toBeInTheDocument();
    expect(screen.getByText("Cajero")).toBeInTheDocument();
    // El id no se muestra, sólo el nombre.
    expect(screen.queryByText("suc_norte")).not.toBeInTheDocument();
  });

  it("con sucursales: [] en el claim muestra el mensaje explícito de 'no asignadas'", async () => {
    renderPantalla(new FakeConteoRepository(), "cajero", []);

    expect(await screen.findByText(/no tienes sucursales asignadas/i)).toBeInTheDocument();
  });

  it("con claim rol: admin muestra 'Gerente' (etiqueta-rol.ts)", async () => {
    renderPantalla(new FakeConteoRepository(), "admin", []);

    expect(await screen.findByText("Gerente")).toBeInTheDocument();
    expect(screen.queryByText("Cajero")).not.toBeInTheDocument();
  });

  it("con claim rol: cajero muestra 'Cajero'", async () => {
    renderPantalla(new FakeConteoRepository(), "cajero", []);

    expect(await screen.findByText("Cajero")).toBeInTheDocument();
    expect(screen.queryByText("Gerente")).not.toBeInTheDocument();
  });

  it("mientras estadoAuth no ha resuelto hay esqueleto y la región viva anuncia la carga; al resolver desaparece", async () => {
    // `useAuthState` arranca en `undefined` y sólo llega al claim tras el
    // microtask de `getIdTokenResult()` — justo después de `render`, el
    // estado sigue sin resolver.
    const repo = new FakeConteoRepository();
    repo.sembrarSucursal(crearSucursal({ sucursalId: "suc_norte", nombre: "Sucursal Norte" }));

    renderPantalla(repo, "cajero", ["suc_norte"]);

    expect(screen.getAllByTestId("fila-esqueleto").length).toBeGreaterThan(0);
    expect(screen.getByText(/cargando/i)).toBeInTheDocument();

    expect(await screen.findByText("Sucursal Norte")).toBeInTheDocument();
    expect(screen.queryByTestId("fila-esqueleto")).not.toBeInTheDocument();
  });

  it("no hay enlace ni botón para navegar a una sucursal, y sigue el botón 'Salir' de la cabecera", async () => {
    const repo = new FakeConteoRepository();
    repo.sembrarSucursal(crearSucursal({ sucursalId: "suc_norte", nombre: "Sucursal Norte" }));

    renderPantalla(repo, "cajero", ["suc_norte"]);

    await screen.findByText("Sucursal Norte");
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.getByRole("button", { name: /^salir$/i })).toBeInTheDocument();
    // Sólo el botón Salir es interactivo — ninguna fila de sucursal lo es.
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });
});
