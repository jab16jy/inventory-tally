// apps/web/src/ui/BloqueoVersionMinima.test.tsx — issue #12: D3/D4/D5. La
// lógica de fetch/comparación de useVersionMinima se prueba por separado en
// useVersionMinima.test.ts (con versión inyectable) — acá sólo se prueba el
// wiring de sesión/UI, mockeando el hook directamente.
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const onAuthStateChanged = vi.fn();
const useVersionMinima = vi.fn();

vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (...args: unknown[]) =>
    (onAuthStateChanged as (...a: unknown[]) => unknown)(...args),
}));
vi.mock("../lib/firebase.js", () => ({ auth: {}, db: {} }));
vi.mock("../state/useVersionMinima.js", () => ({
  useVersionMinima: (...args: unknown[]) =>
    (useVersionMinima as (...a: unknown[]) => unknown)(...args),
}));

const { BloqueoVersionMinima } = await import("./BloqueoVersionMinima.js");

function sinSesion() {
  onAuthStateChanged.mockImplementation((_auth: unknown, cb: (u: unknown) => void) => {
    cb(null);
    return () => {};
  });
}

function conSesion() {
  onAuthStateChanged.mockImplementation((_auth: unknown, cb: (u: unknown) => void) => {
    cb({
      uid: "uid_ana",
      displayName: "Ana Ramírez",
      getIdTokenResult: () => Promise.resolve({ claims: {} }),
    });
    return () => {};
  });
}

describe("BloqueoVersionMinima (issue #12)", () => {
  it("sin sesión: renderiza children sin activar el chequeo de versión (permission-denied evitado)", () => {
    sinSesion();
    useVersionMinima.mockReturnValue({ bloqueado: false, cargando: false });
    render(
      <BloqueoVersionMinima>
        <p>App</p>
      </BloqueoVersionMinima>,
    );

    expect(screen.getByText("App")).toBeInTheDocument();
    expect(useVersionMinima.mock.calls[0]?.[0]).toBe(false);
  });

  it("con sesión y bloqueado=true: pantalla completa de bloqueo, no children (D3)", async () => {
    conSesion();
    useVersionMinima.mockReturnValue({ bloqueado: true, cargando: false });
    render(
      <BloqueoVersionMinima>
        <p>App</p>
      </BloqueoVersionMinima>,
    );

    // useAuthState resuelve la sesión de forma async (getIdTokenResult()).
    await waitFor(() => expect(screen.queryByText("App")).not.toBeInTheDocument());
    expect(screen.getByText(/ya no es compatible/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /actualizar/i })).toBeInTheDocument();
  });

  it("con sesión y cargando=true: no muestra children todavía (D5)", async () => {
    conSesion();
    useVersionMinima.mockReturnValue({ bloqueado: false, cargando: true });
    render(
      <BloqueoVersionMinima>
        <p>App</p>
      </BloqueoVersionMinima>,
    );

    await waitFor(() => expect(useVersionMinima.mock.calls.some((c) => c[0] === true)).toBe(true));
    expect(screen.queryByText("App")).not.toBeInTheDocument();
  });

  it("con sesión y bloqueado=false: renderiza children", async () => {
    conSesion();
    useVersionMinima.mockReturnValue({ bloqueado: false, cargando: false });
    render(
      <BloqueoVersionMinima>
        <p>App</p>
      </BloqueoVersionMinima>,
    );

    await waitFor(() => expect(useVersionMinima.mock.calls.some((c) => c[0] === true)).toBe(true));
    expect(screen.getByText("App")).toBeInTheDocument();
  });
});
