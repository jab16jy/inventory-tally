// apps/web/src/ui/MisConteosScreen.test.tsx — historial del cajero.
import { FakeConteoRepository } from "@conteo/data";
import type { SesionConteo } from "@conteo/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ConteoRepositoryProvider } from "../state/repositorio-contexto.js";

const onAuthStateChanged = vi.fn();

vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (...args: unknown[]) =>
    (onAuthStateChanged as (...a: unknown[]) => unknown)(...args),
}));

const { MisConteosScreen } = await import("./MisConteosScreen.js");

function usuarioFake(sucursales: string[]) {
  return {
    uid: "uid_ana",
    displayName: "Ana Ramírez",
    getIdTokenResult: () => Promise.resolve({ claims: { rol: "cajero", sucursales } }),
  };
}

function crearSesion(overrides: Partial<SesionConteo> = {}): SesionConteo {
  return {
    sesionId: "ses_20260802_norte_01",
    sucursalId: "suc_norte",
    sucursalNombre: "Sucursal Norte",
    estado: "cerrada",
    abiertaEn: new Date("2026-08-02T13:00:00Z"),
    abiertaPor: "uid_admin",
    cerradaEn: new Date("2026-08-02T15:00:00Z"),
    cerradaPor: "uid_admin",
    participantes: ["uid_ana"],
    totalUnidades: 1234,
    sesionCorregidaId: null,
    ...overrides,
  };
}

function renderPantalla(repo: FakeConteoRepository, sucursalesDelClaim = ["suc_norte"]) {
  onAuthStateChanged.mockImplementation((_auth: unknown, cb: (u: unknown) => void) => {
    cb(usuarioFake(sucursalesDelClaim));
    return () => {};
  });

  return render(
    <MemoryRouter initialEntries={["/mis-conteos"]}>
      <ConteoRepositoryProvider repo={repo}>
        <MisConteosScreen auth={{} as never} onSalir={vi.fn()} />
      </ConteoRepositoryProvider>
    </MemoryRouter>,
  );
}

describe("MisConteosScreen", () => {
  it("lista las sesiones en las que participó, con estado y fecha", async () => {
    const repo = new FakeConteoRepository({ uid: "uid_ana", nombre: "Ana Ramírez" });
    repo.sembrarSesion(crearSesion({ sesionId: "ses_1", sucursalNombre: "Sucursal Norte" }));
    repo.sembrarSesion(
      crearSesion({
        sesionId: "ses_2",
        sucursalNombre: "Sucursal Sur",
        sucursalId: "suc_sur",
        estado: "abierta",
        abiertaEn: new Date("2026-08-05T13:00:00Z"),
      }),
    );

    renderPantalla(repo, ["suc_norte", "suc_sur"]);

    // La más reciente primero.
    expect(await screen.findByText("Sucursal Sur")).toBeInTheDocument();
    expect(screen.getByText("Sucursal Norte")).toBeInTheDocument();
    expect(screen.getByText("Abierta")).toBeInTheDocument();
    expect(screen.getByText("Cerrada")).toBeInTheDocument();
  });

  it("deja explícito que el número de unidades es el TOTAL de la sesión, no lo que contó el cajero", async () => {
    const repo = new FakeConteoRepository({ uid: "uid_ana", nombre: "Ana Ramírez" });
    repo.sembrarSesion(crearSesion({ totalUnidades: 1234 }));

    renderPantalla(repo);

    expect(await screen.findByText(/1\.234 u · total de la sesión/i)).toBeInTheDocument();
  });

  it("no lista sesiones de una sucursal que ya no está en el claim", async () => {
    const repo = new FakeConteoRepository({ uid: "uid_ana", nombre: "Ana Ramírez" });
    repo.sembrarSesion(
      crearSesion({ sesionId: "ses_sur", sucursalId: "suc_sur", sucursalNombre: "Sucursal Sur" }),
    );

    renderPantalla(repo, ["suc_norte"]);

    expect(
      await screen.findByText(/todavía no participaste en ningún conteo/i),
    ).toBeInTheDocument();
    expect(screen.queryByText("Sucursal Sur")).not.toBeInTheDocument();
  });

  it("muestra el estado vacío cuando el cajero nunca participó", async () => {
    const repo = new FakeConteoRepository({ uid: "uid_ana", nombre: "Ana Ramírez" });

    renderPantalla(repo);

    expect(
      await screen.findByText(/todavía no participaste en ningún conteo/i),
    ).toBeInTheDocument();
  });

  it("ofrece 'Cargar más' cuando hay página siguiente y la encadena", async () => {
    const repo = new FakeConteoRepository({ uid: "uid_ana", nombre: "Ana Ramírez" });
    for (let i = 0; i < 21; i++) {
      repo.sembrarSesion(
        crearSesion({
          sesionId: `ses_${String(i).padStart(2, "0")}`,
          sucursalNombre: `Sucursal ${String(i).padStart(2, "0")}`,
          abiertaEn: new Date(Date.UTC(2026, 0, 1 + i)),
        }),
      );
    }

    renderPantalla(repo);

    // La página 1 trae las 20 más recientes: la 00 es la más antigua y queda fuera.
    expect(await screen.findByText("Sucursal 20")).toBeInTheDocument();
    expect(screen.queryByText("Sucursal 00")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /cargar más/i }));

    expect(await screen.findByText("Sucursal 00")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /cargar más/i })).not.toBeInTheDocument();
  });

  it("ante un rechazo avisa con role=alert y retira el esqueleto", async () => {
    const repo = new FakeConteoRepository({ uid: "uid_ana", nombre: "Ana Ramírez" });
    repo.listarMisSesiones = vi.fn().mockRejectedValue(new Error("network"));

    renderPantalla(repo);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /no se pudieron cargar tus conteos\. intenta de nuevo\./i,
    );
    // El defecto real que cubre el `.catch()`: sin él `cargando` se queda en
    // `true` para siempre y el esqueleto no se va nunca, aunque el alert sí
    // aparezca.
    expect(screen.queryByTestId("fila-esqueleto")).not.toBeInTheDocument();
  });
});
