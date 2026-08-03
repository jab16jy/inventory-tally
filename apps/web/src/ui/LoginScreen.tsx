// apps/web/src/ui/LoginScreen.tsx (doc 11 §2)
import { useId, useState } from "react";

export interface LoginScreenProps {
  readonly onIniciarSesion: (correo: string, password: string) => void;
}

export function LoginScreen({ onIniciarSesion }: LoginScreenProps) {
  const [correo, setCorreo] = useState("");
  const [password, setPassword] = useState("");
  const idCorreo = useId();
  const idPassword = useId();

  return (
    <form
      onSubmit={(evento) => {
        evento.preventDefault();
        onIniciarSesion(correo, password);
      }}
    >
      <label htmlFor={idCorreo}>Correo</label>
      <input
        id={idCorreo}
        type="email"
        autoComplete="username"
        value={correo}
        onChange={(e) => setCorreo(e.target.value)}
        required
      />

      <label htmlFor={idPassword}>Contraseña</label>
      <input
        id={idPassword}
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />

      <button type="submit">Entrar</button>
    </form>
  );
}
