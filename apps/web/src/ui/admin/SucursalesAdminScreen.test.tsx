// apps/web/src/ui/admin/SucursalesAdminScreen.test.tsx
// (docs/plan-panel-administrador.md §5, fase F2)
import { FakeAdminRepository } from "@conteo/data";
import type { Sucursal } from "@conteo/shared/models/sucursal.js";
import { FirebaseError } from "firebase/app";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdminRepositoryProvider } from "../../state/admin-contexto.js";
import { SucursalesAdminScreen } from "./SucursalesAdminScreen.js";

function sucursalBase(overrides: Partial<Sucursal> = {}): Sucursal {
  return {
    sucursalId: "suc_norte",
    nombre: "Sucursal Norte",
    direccion: "Calle 10 # 5-20",
    conectividad: "wifi",
    activa: true,
    sesionAbiertaId: null,
    creadaEn: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function renderPantalla(repo: FakeAdminRepository) {
  return render(
    <AdminRepositoryProvider repo={repo}>
      <SucursalesAdminScreen />
    </AdminRepositoryProvider>,
  );
}

describe("SucursalesAdminScreen (F2)", () => {
  it("muestra el icono de conectividad wifi o datos", () => {
    const repo = new FakeAdminRepository();
    repo.sembrarSucursal(
      sucursalBase({ sucursalId: "suc_norte", nombre: "Norte", conectividad: "wifi" }),
    );
    repo.sembrarSucursal(
      sucursalBase({ sucursalId: "suc_sur", nombre: "Sur", conectividad: "datos" }),
    );

    renderPantalla(repo);

    expect(screen.getByText("WiFi")).toBeInTheDocument();
    expect(screen.getByText("Datos móviles")).toBeInTheDocument();
  });

  it("indica qué sucursales tienen sesión abierta", () => {
    const repo = new FakeAdminRepository();
    repo.sembrarSucursal(
      sucursalBase({ sucursalId: "suc_norte", nombre: "Norte", sesionAbiertaId: "ses_norte" }),
    );
    repo.sembrarSucursal(
      sucursalBase({ sucursalId: "suc_sur", nombre: "Sur", sesionAbiertaId: null }),
    );

    renderPantalla(repo);

    // Columna "Sesión abierta" — 5ª celda (nombre, dirección, conectividad,
    // activa, sesión). Se consulta por posición y no con `toHaveTextContent`
    // sobre la fila completa porque la columna "Activa" también imprime "Sí"
    // para ambas filas (ambas están activas por defecto) y ensuciaría la
    // aserción.
    const celdaNorte = within(screen.getByText("Norte").closest("tr")!).getAllByRole("cell")[4];
    const celdaSur = within(screen.getByText("Sur").closest("tr")!).getAllByRole("cell")[4];
    expect(celdaNorte).toHaveTextContent("Sí");
    expect(celdaSur).not.toHaveTextContent("Sí");
  });

  it("deshabilita desactivar si hay sesión abierta", () => {
    const repo = new FakeAdminRepository();
    repo.sembrarSucursal(
      sucursalBase({ sucursalId: "suc_norte", nombre: "Norte", sesionAbiertaId: "ses_norte" }),
    );
    repo.sembrarSucursal(
      sucursalBase({ sucursalId: "suc_sur", nombre: "Sur", sesionAbiertaId: null }),
    );

    renderPantalla(repo);

    const filaNorte = screen.getByText("Norte").closest("tr")!;
    const filaSur = screen.getByText("Sur").closest("tr")!;
    expect(within(filaNorte).getByRole("button", { name: /desactivar/i })).toBeDisabled();
    expect(within(filaSur).getByRole("button", { name: /desactivar/i })).toBeEnabled();
  });

  it("avisa que ningún cajero ve la sucursal nueva hasta asignarla", async () => {
    const repo = new FakeAdminRepository();

    renderPantalla(repo);

    fireEvent.click(screen.getByRole("button", { name: /nueva sucursal/i }));
    fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: "Sucursal Sur" } });
    fireEvent.change(screen.getByLabelText(/dirección/i), { target: { value: "Cra 8 # 12-4" } });
    fireEvent.click(screen.getByRole("button", { name: /crear sucursal/i }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      /ningún cajero podrá verla hasta que se le asigne en cajeros/i,
    );
    expect(repo.llamadas).toEqual([
      {
        metodo: "crearSucursal",
        payload: { nombre: "Sucursal Sur", direccion: "Cra 8 # 12-4", conectividad: "wifi" },
      },
    ]);
  });

  it("abre un conteo al hacer click en Abrir conteo", async () => {
    const repo = new FakeAdminRepository();
    repo.sembrarSucursal(
      sucursalBase({ sucursalId: "suc_norte", nombre: "Norte", sesionAbiertaId: null }),
    );

    renderPantalla(repo);

    const fila = screen.getByText("Norte").closest("tr")!;
    const boton = within(fila).getByRole("button", { name: /abrir conteo/i });
    expect(boton).toBeEnabled();

    fireEvent.click(boton);

    expect(await screen.findByRole("status")).toHaveTextContent(/conteo abierto en norte/i);
    expect(repo.llamadas).toEqual([{ metodo: "abrirSesion", payload: { sucursalId: "suc_norte" } }]);
  });

  it("deshabilita Abrir conteo si la sucursal está inactiva", () => {
    const repo = new FakeAdminRepository();
    repo.sembrarSucursal(
      sucursalBase({ sucursalId: "suc_norte", nombre: "Norte", activa: false, sesionAbiertaId: null }),
    );

    renderPantalla(repo);

    const fila = screen.getByText("Norte").closest("tr")!;
    expect(within(fila).getByRole("button", { name: /abrir conteo/i })).toBeDisabled();
  });

  it("deshabilita Abrir conteo si ya hay una sesión abierta", () => {
    const repo = new FakeAdminRepository();
    repo.sembrarSucursal(
      sucursalBase({ sucursalId: "suc_norte", nombre: "Norte", sesionAbiertaId: "ses_norte" }),
    );

    renderPantalla(repo);

    const fila = screen.getByText("Norte").closest("tr")!;
    expect(within(fila).getByRole("button", { name: /abrir conteo/i })).toBeDisabled();
  });

  it("muestra un error específico si ya se abrió un conteo por otra vía", async () => {
    const repo = new FakeAdminRepository();
    repo.sembrarSucursal(
      sucursalBase({ sucursalId: "suc_norte", nombre: "Norte", sesionAbiertaId: null }),
    );
    repo.abrirSesion = vi
      .fn()
      .mockRejectedValue(new FirebaseError("functions/failed-precondition", "ya hay sesión"));

    renderPantalla(repo);

    const fila = screen.getByText("Norte").closest("tr")!;
    fireEvent.click(within(fila).getByRole("button", { name: /abrir conteo/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /ya existe un conteo abierto en norte/i,
    );
  });
});
