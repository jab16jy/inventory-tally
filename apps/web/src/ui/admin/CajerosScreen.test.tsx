// apps/web/src/ui/admin/CajerosScreen.test.tsx (docs/plan-panel-administrador.md
// §5, fase F2)
import { FirebaseError } from "firebase/app";
import { FakeAdminRepository } from "@conteo/data";
import type { Usuario } from "@conteo/shared/models/usuario.js";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { fecha } from "../../lib/formato.js";
import { AdminRepositoryProvider } from "../../state/admin-contexto.js";
import { CajerosScreen } from "./CajerosScreen.js";

function usuarioBase(overrides: Partial<Usuario> = {}): Usuario {
  return {
    uid: "uid_ana",
    nombre: "Ana",
    correo: "ana@negocio.com",
    rol: "cajero",
    sucursalesAsignadas: [],
    activo: true,
    creadoEn: new Date("2026-01-01T00:00:00Z"),
    creadoPor: "uid_admin",
    ...overrides,
  };
}

function renderPantalla(repo: FakeAdminRepository) {
  return render(
    <AdminRepositoryProvider repo={repo}>
      <CajerosScreen />
    </AdminRepositoryProvider>,
  );
}

// El `rol` real llega por `useOutletContext` (D7): sólo un padre con
// `<Outlet context={{ rol }} />` lo expone, igual que `PanelAdmin` en
// producción (router.tsx).
function renderPantallaConRol(repo: FakeAdminRepository, rol: string) {
  return render(
    <MemoryRouter initialEntries={["/admin/cajeros"]}>
      <Routes>
        <Route path="/admin" element={<Outlet context={{ rol }} />}>
          <Route
            path="cajeros"
            element={
              <AdminRepositoryProvider repo={repo}>
                <CajerosScreen />
              </AdminRepositoryProvider>
            }
          />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("CajerosScreen (F2)", () => {
  it("muestra pwaInstalada y ultimoAccesoEn por cajero", () => {
    const repo = new FakeAdminRepository();
    const ultimoAcceso = new Date("2026-08-01T15:30:00Z");
    repo.sembrarUsuario(usuarioBase({ pwaInstalada: true, ultimoAccesoEn: ultimoAcceso }));
    repo.sembrarUsuario(
      usuarioBase({
        uid: "uid_beto",
        nombre: "Beto",
        correo: "beto@negocio.com",
        pwaInstalada: false,
      }),
    );

    renderPantalla(repo);

    // Ana: PWA instalada + fecha real de acceso.
    expect(screen.getByText(fecha(ultimoAcceso))).toBeInTheDocument();
    // Beto: sin PWA y sin acceso todavía.
    expect(screen.getByText("Nunca")).toBeInTheDocument();
  });

  it("pide confirmación antes de desactivar", () => {
    const repo = new FakeAdminRepository();
    repo.sembrarUsuario(usuarioBase());

    renderPantalla(repo);

    fireEvent.click(screen.getByRole("button", { name: /^desactivar$/i }));

    // Todavía no se llamó al repositorio: sólo se pidió confirmación.
    expect(repo.llamadas).toHaveLength(0);
    expect(screen.getByText(/¿desactivar a ana\?/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /confirmar/i }));

    expect(repo.llamadas).toEqual([{ metodo: "desactivarCajero", payload: { uid: "uid_ana" } }]);
  });

  it("ofrece reactivar sólo a los inactivos", () => {
    const repo = new FakeAdminRepository();
    repo.sembrarUsuario(usuarioBase({ uid: "uid_activo", nombre: "Activa", activo: true }));
    repo.sembrarUsuario(usuarioBase({ uid: "uid_inactivo", nombre: "Inactivo", activo: false }));

    renderPantalla(repo);

    expect(screen.getAllByRole("button", { name: /^reactivar$/i })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /^desactivar$/i })).toHaveLength(1);
  });

  it("muestra el mensaje del servidor cuando el correo ya existe", async () => {
    const repo = new FakeAdminRepository();
    repo.crearCajero = vi
      .fn()
      .mockRejectedValue(new FirebaseError("functions/already-exists", "ya existe"));

    renderPantalla(repo);

    fireEvent.click(screen.getByRole("button", { name: /nuevo cajero/i }));
    fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: "Carlos" } });
    fireEvent.change(screen.getByLabelText(/correo/i), { target: { value: "carlos@negocio.com" } });
    fireEvent.change(screen.getByLabelText(/contraseña temporal/i), {
      target: { value: "clave1234" },
    });
    fireEvent.click(screen.getByRole("button", { name: /crear cajero/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /ya existe un cajero con ese correo/i,
    );
  });

  it("muestra un error cuando falla desactivar al cajero", async () => {
    const repo = new FakeAdminRepository();
    repo.sembrarUsuario(usuarioBase());
    repo.desactivarCajero = vi.fn().mockRejectedValue(new Error("network"));

    renderPantalla(repo);

    fireEvent.click(screen.getByRole("button", { name: /^desactivar$/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirmar/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /no se pudo desactivar a ana\. intenta de nuevo\./i,
    );
  });

  it("cierra la confirmación cuando falla desactivar", async () => {
    const repo = new FakeAdminRepository();
    repo.sembrarUsuario(usuarioBase());
    repo.desactivarCajero = vi.fn().mockRejectedValue(new Error("network"));

    renderPantalla(repo);

    fireEvent.click(screen.getByRole("button", { name: /^desactivar$/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirmar/i }));

    await screen.findByRole("alert");

    // La confirmación inline ("¿Desactivar a Ana?" / Confirmar / Cancelar) no
    // debe quedar pegada en pantalla: el admin tiene que poder reintentar.
    expect(screen.queryByText(/¿desactivar a ana\?/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^desactivar$/i })).toBeInTheDocument();
  });

  it("muestra un error cuando falla reactivar al cajero", async () => {
    const repo = new FakeAdminRepository();
    repo.sembrarUsuario(usuarioBase({ activo: false }));
    repo.reactivarCajero = vi.fn().mockRejectedValue(new Error("network"));

    renderPantalla(repo);

    fireEvent.click(screen.getByRole("button", { name: /^reactivar$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /no se pudo reactivar a ana\. intenta de nuevo\./i,
    );
  });

  it("deshabilita Confirmar y muestra el spinner mientras desactivar está en vuelo", () => {
    const repo = new FakeAdminRepository();
    repo.sembrarUsuario(usuarioBase());
    repo.desactivarCajero = vi.fn(() => new Promise<never>(() => {}));

    renderPantalla(repo);

    fireEvent.click(screen.getByRole("button", { name: /^desactivar$/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirmar/i }));

    const boton = screen.getByRole("button", { name: /confirmar/i });
    expect(boton).toBeDisabled();
    expect(boton.querySelector("svg")).toHaveClass("animate-spin");
  });

  it("deshabilita Reactivar y muestra el spinner mientras reactivar está en vuelo", () => {
    const repo = new FakeAdminRepository();
    repo.sembrarUsuario(usuarioBase({ activo: false }));
    repo.reactivarCajero = vi.fn(() => new Promise<never>(() => {}));

    renderPantalla(repo);

    fireEvent.click(screen.getByRole("button", { name: /^reactivar$/i }));

    const boton = screen.getByRole("button", { name: /^reactivar$/i });
    expect(boton).toBeDisabled();
    expect(boton.querySelector("svg")).toHaveClass("animate-spin");
  });

  it("pide confirmación con aviso de irreversibilidad antes de eliminar", () => {
    const repo = new FakeAdminRepository();
    repo.sembrarUsuario(usuarioBase());

    renderPantalla(repo);

    fireEvent.click(screen.getByRole("button", { name: /^eliminar$/i }));

    // Todavía no se llamó al repositorio: sólo se pidió confirmación.
    expect(repo.llamadas).toHaveLength(0);
    expect(
      screen.getByText(/¿eliminar a ana permanentemente\? no se puede deshacer\./i),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /confirmar/i }));

    expect(repo.llamadas).toEqual([{ metodo: "eliminarCajero", payload: { uid: "uid_ana" } }]);
  });

  it("muestra el mensaje de la guarda del servidor tal cual cuando falla eliminar", async () => {
    const repo = new FakeAdminRepository();
    repo.sembrarUsuario(usuarioBase());
    repo.eliminarCajero = vi
      .fn()
      .mockRejectedValue(new Error("No se puede eliminar: participó en 2 conteos."));

    renderPantalla(repo);

    fireEvent.click(screen.getByRole("button", { name: /^eliminar$/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirmar/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se puede eliminar: participó en 2 conteos.",
    );
  });

  it("cierra la confirmación cuando falla eliminar", async () => {
    const repo = new FakeAdminRepository();
    repo.sembrarUsuario(usuarioBase());
    repo.eliminarCajero = vi.fn().mockRejectedValue(new Error("network"));

    renderPantalla(repo);

    fireEvent.click(screen.getByRole("button", { name: /^eliminar$/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirmar/i }));

    await screen.findByRole("alert");

    expect(screen.queryByText(/¿eliminar a ana permanentemente/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^eliminar$/i })).toBeInTheDocument();
  });

  it("deshabilita Confirmar y muestra el spinner mientras eliminar está en vuelo", () => {
    const repo = new FakeAdminRepository();
    repo.sembrarUsuario(usuarioBase());
    repo.eliminarCajero = vi.fn(() => new Promise<never>(() => {}));

    renderPantalla(repo);

    fireEvent.click(screen.getByRole("button", { name: /^eliminar$/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirmar/i }));

    const boton = screen.getByRole("button", { name: /confirmar/i });
    expect(boton).toBeDisabled();
    expect(boton.querySelector("svg")).toHaveClass("animate-spin");
  });
});

describe("CajerosScreen · opción de rol acotada (S5c, anti-escalada)", () => {
  it("ofrece sólo 'Cajero' a admin_sucursal (afirmativo)", () => {
    const repo = new FakeAdminRepository();
    renderPantallaConRol(repo, "admin_sucursal");

    fireEvent.click(screen.getByRole("button", { name: /nuevo cajero/i }));

    const opciones = screen.getAllByRole("option", { name: /.+/ });
    expect(opciones).toHaveLength(1);
    expect(opciones[0]).toHaveTextContent("Cajero");
  });

  it("NO ofrece 'Administrador' a admin_sucursal (negativo)", () => {
    const repo = new FakeAdminRepository();
    renderPantallaConRol(repo, "admin_sucursal");

    fireEvent.click(screen.getByRole("button", { name: /nuevo cajero/i }));

    expect(screen.queryByRole("option", { name: /administrador/i })).not.toBeInTheDocument();
  });

  it("mantiene ambas opciones de rol para Gerente (regresión)", () => {
    const repo = new FakeAdminRepository();
    renderPantallaConRol(repo, "admin");

    fireEvent.click(screen.getByRole("button", { name: /nuevo cajero/i }));

    expect(screen.getAllByRole("option")).toHaveLength(2);
    expect(screen.getByRole("option", { name: /administrador/i })).toBeInTheDocument();
  });

  it("mantiene ambas opciones de rol sin contexto de Outlet (regresión, uso directo)", () => {
    const repo = new FakeAdminRepository();
    renderPantalla(repo);

    fireEvent.click(screen.getByRole("button", { name: /nuevo cajero/i }));

    expect(screen.getAllByRole("option")).toHaveLength(2);
  });
});
