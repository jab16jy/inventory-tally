import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LoginScreen } from "./LoginScreen.js";

describe("LoginScreen", () => {
  it("llama a onIniciarSesion con el correo y la contraseña ingresados", () => {
    const onIniciarSesion = vi.fn();
    render(<LoginScreen onIniciarSesion={onIniciarSesion} />);

    fireEvent.change(screen.getByLabelText(/correo/i), { target: { value: "ana@negocio.com" } });
    fireEvent.change(screen.getByLabelText(/contraseña/i), { target: { value: "clave1234" } });
    fireEvent.click(screen.getByRole("button", { name: /entrar/i }));

    expect(onIniciarSesion).toHaveBeenCalledWith("ana@negocio.com", "clave1234");
  });
});
