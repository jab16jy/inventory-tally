// apps/web/src/ui/admin/CajerosScreen.test.tsx (docs/plan-panel-administrador.md
// §5, fase F2)
import { FirebaseError } from "firebase/app";
import { FakeAdminRepository } from "@conteo/data";
import type { Usuario } from "@conteo/shared/models/usuario.js";
import { fireEvent, render, screen } from "@testing-library/react";
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
});
