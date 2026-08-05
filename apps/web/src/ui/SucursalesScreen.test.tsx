// apps/web/src/ui/SucursalesScreen.test.tsx (F3-A, doc 11 §2, plan §5)
import { FakeConteoRepository } from "@conteo/data";
import type { Sucursal } from "@conteo/shared";
import { fireEvent, render, screen } from "@testing-library/react";
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

function renderPantalla(repo: FakeConteoRepository, sucursalesDelClaim: string[]) {
  onAuthStateChanged.mockImplementation((_auth: unknown, cb: (u: unknown) => void) => {
    cb(usuarioFake(sucursalesDelClaim));
    return () => {};
  });

  return render(
    <MemoryRouter initialEntries={["/sucursales"]}>
      <ConteoRepositoryProvider repo={repo}>
        <Routes>
          <Route path="/sucursales" element={<SucursalesScreen auth={{} as never} />} />
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

  it("tocar una sucursal con sesión abierta navega a /conteo/:sesionId", async () => {
    const repo = new FakeConteoRepository();
    repo.sembrarSucursal(
      crearSucursal({ sucursalId: "suc_norte", sesionAbiertaId: "ses_20260802_norte_01" }),
    );

    renderPantalla(repo, ["suc_norte"]);

    const boton = await screen.findByRole("button", { name: /sucursal norte/i });
    fireEvent.click(boton);

    expect(await screen.findByText("Pantalla de conteo")).toBeInTheDocument();
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

    expect(await screen.findAllByRole("button")).toHaveLength(10);
  });
});
