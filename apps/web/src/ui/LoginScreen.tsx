// apps/web/src/ui/LoginScreen.tsx (doc 11 §2)
import { useId, useState, type FormEvent } from "react";

export interface LoginScreenProps {
  /** Devolver la promesa es opcional: sin ella no hay error inline ni estado
   *  de carga, pero el formulario sigue funcionando. */
  readonly onIniciarSesion: (correo: string, password: string) => void | Promise<void>;
}

const CAMPO =
  "w-full min-h-[var(--size-toque)] rounded-placa border border-borde bg-fondo px-3 " +
  "text-tinta placeholder:text-tenue focus:border-senal focus:outline-none";

export function LoginScreen({ onIniciarSesion }: LoginScreenProps) {
  const [correo, setCorreo] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const idCorreo = useId();
  const idPassword = useId();

  async function manejarEnvio(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await onIniciarSesion(correo, password);
    } catch {
      // El detalle del error de Firebase no le sirve a un cajero de pie en
      // una bodega, y distinguir "usuario no existe" de "clave incorrecta"
      // filtra qué correos están registrados (doc 09).
      setError("Correo o contraseña incorrectos. Revísalos e intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-8">
      <div className="border border-borde bg-placa rounded-placa p-5">
        <p className="text-micro tracking-[0.18em] text-tenue uppercase">Conteo de inventario</p>
        <h1 className="mt-1 mb-5 text-numeral leading-none font-semibold text-tinta">Entrar</h1>

        {/* SIN `noValidate`: `required` + type="email" ya bloquean el submit
            en blanco desde el navegador. Ponerlo dejaba pasar el formulario
            vacío hasta Firebase, que respondía con el genérico "correo o
            contraseña incorrectos" — un mensaje falso, porque lo que faltan
            son datos, y una petición gastada donde hay mala señal. */}
        <form onSubmit={(evento) => void manejarEnvio(evento)}>
          <label htmlFor={idCorreo} className="mb-1.5 block text-micro text-tenue">
            Correo
          </label>
          <input
            id={idCorreo}
            type="email"
            autoComplete="username"
            inputMode="email"
            autoCapitalize="none"
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
            required
            className={CAMPO}
          />

          <label htmlFor={idPassword} className="mt-4 mb-1.5 block text-micro text-tenue">
            Contraseña
          </label>
          <input
            id={idPassword}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className={CAMPO}
          />

          {/* Inline y junto al formulario, nunca en un modal: el cajero tiene
              que ver el error y los campos a la vez para corregirlos. */}
          {error && (
            <p
              role="alert"
              className="mt-4 border border-riesgo bg-riesgo-placa rounded-placa px-3 py-2 text-micro text-tinta"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={enviando}
            className={
              "mt-5 min-h-[var(--size-toque)] w-full rounded-placa font-semibold " +
              "transition-colors duration-150 ease-out " +
              (enviando ? "bg-senal/40 text-fondo/70" : "bg-senal text-fondo active:bg-senal/85")
            }
          >
            {enviando ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </div>
    </main>
  );
}
