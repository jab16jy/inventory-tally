// Estados que doc 11 §2 pide y que la primera ola no implementó: error
// inline y carga. Van en un archivo aparte a propósito — los cinco archivos
// de test que ya existían son la red de regresión del rediseño visual y
// tienen que quedar byte a byte iguales.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LoginScreen } from "./LoginScreen.js";

function entrar(correo = "ana@negocio.com", password = "clave1234") {
  fireEvent.change(screen.getByLabelText(/correo/i), { target: { value: correo } });
  fireEvent.change(screen.getByLabelText(/contraseña/i), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: /entrar/i }));
}

describe("LoginScreen · estados (doc 11 §2)", () => {
  it("muestra el error del servidor junto al formulario, no en un modal", async () => {
    render(
      <LoginScreen onIniciarSesion={() => Promise.reject(new Error("credenciales inválidas"))} />,
    );

    entrar();

    const aviso = await screen.findByRole("alert");
    expect(aviso).toHaveTextContent(/correo o contraseña/i);
  });

  it("deshabilita el botón mientras la petición está en vuelo", async () => {
    // El escenario real es una bodega con mala señal: sin esto el cajero
    // toca "Entrar" tres veces y dispara tres intentos de autenticación.
    let resolver!: () => void;
    render(
      <LoginScreen
        onIniciarSesion={() =>
          new Promise<void>((res) => {
            resolver = res;
          })
        }
      />,
    );

    entrar();

    const boton = screen.getByRole("button", { name: /entrando/i });
    expect(boton).toBeDisabled();

    resolver();
    await waitFor(() => expect(screen.getByRole("button", { name: /entrar/i })).toBeEnabled());
  });

  it("un intento nuevo limpia el error del intento anterior", async () => {
    const onIniciarSesion = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("nope"))
      .mockResolvedValueOnce(undefined);

    render(<LoginScreen onIniciarSesion={onIniciarSesion} />);

    entrar();
    expect(await screen.findByRole("alert")).toBeInTheDocument();

    entrar();
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it("no llama al servidor con los campos vacíos", () => {
    // Sin la validación nativa del navegador, un submit en blanco viajaba
    // hasta Firebase y volvía como "correo o contraseña incorrectos", que es
    // mentira: lo que pasa es que faltan datos. Además gasta una petición en
    // una bodega con mala señal.
    const onIniciarSesion = vi.fn();
    render(<LoginScreen onIniciarSesion={onIniciarSesion} />);

    fireEvent.click(screen.getByRole("button", { name: /entrar/i }));

    expect(onIniciarSesion).not.toHaveBeenCalled();
  });

  it("sigue funcionando si el manejador es síncrono y no devuelve promesa", async () => {
    // El router actual pasa un callback que devuelve void; el rediseño no
    // puede obligar a todos los llamadores a devolver una promesa.
    const onIniciarSesion = vi.fn();
    render(<LoginScreen onIniciarSesion={onIniciarSesion} />);

    entrar();

    expect(onIniciarSesion).toHaveBeenCalledWith("ana@negocio.com", "clave1234");
    await waitFor(() => expect(screen.getByRole("button", { name: /entrar/i })).toBeEnabled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
