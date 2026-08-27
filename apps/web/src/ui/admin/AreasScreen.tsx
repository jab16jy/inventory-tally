// apps/web/src/ui/admin/AreasScreen.tsx — CRUD de áreas (agrupación de
// categorías, doc 03 §3). Crear + desactivar; no hay `reactivarArea`, mismo
// criterio que CategoriasScreen.tsx: una vez inactiva no ofrece acción.
import { useEffect, useId, useState, type FormEvent } from "react";
import type { Area } from "@conteo/shared/models/area.js";
import type { CrearAreaPayload } from "@conteo/data";
import { useAdminRepository } from "../../state/admin-contexto.js";
import { Tabla, type ColumnaTabla } from "./Tabla.js";

const CAMPO =
  "w-full min-h-[var(--size-toque)] rounded-placa border border-borde bg-fondo px-3 " +
  "text-tinta placeholder:text-tenue focus:border-senal focus:outline-none";

// Mismo patrón que CategoriasScreen.tsx (sin extraer a un hook compartido:
// es la convención ya usada en este repo).
function useAreas(): { areas: Area[]; cargando: boolean } {
  const repo = useAdminRepository();
  const [areas, setAreas] = useState<Area[]>([]);
  const [cargando, setCargando] = useState(true);
  useEffect(
    () =>
      repo.observarAreas((a) => {
        setAreas(a);
        setCargando(false);
      }),
    [repo],
  );
  return { areas, cargando };
}

export function AreasScreen() {
  const repo = useAdminRepository();
  const { areas, cargando } = useAreas();

  const [formularioAbierto, setFormularioAbierto] = useState(false);
  const [errorFormulario, setErrorFormulario] = useState<string | null>(null);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);

  async function crear(payload: CrearAreaPayload): Promise<void> {
    try {
      await repo.crearArea(payload);
      setFormularioAbierto(false);
      setErrorFormulario(null);
    } catch {
      setErrorFormulario("No se pudo crear el área. Intenta de nuevo.");
    }
  }

  async function desactivar(area: Area): Promise<void> {
    setErrorAccion(null);
    try {
      await repo.desactivarArea(area.areaId);
    } catch {
      setErrorAccion(`No se pudo desactivar ${area.nombre}. Intenta de nuevo.`);
    }
  }

  const columnas: ColumnaTabla<Area>[] = [
    {
      clave: "nombre",
      etiqueta: "Nombre",
      render: (a) => a.nombre,
      valorOrden: (a) => a.nombre,
    },
    {
      clave: "activa",
      etiqueta: "Activa",
      render: (a) => (a.activa ? "Sí" : "No"),
      valorOrden: (a) => (a.activa ? 1 : 0),
    },
    {
      clave: "acciones",
      etiqueta: "Acciones",
      render: (a) =>
        a.activa ? (
          <button
            type="button"
            onClick={() => void desactivar(a)}
            className="rounded-placa border border-borde px-2.5 py-1.5 text-micro text-tinta hover:border-riesgo hover:text-riesgo"
          >
            Desactivar
          </button>
        ) : (
          "—"
        ),
    },
  ];

  return (
    <section className="p-6">
      <header className="flex items-center justify-between pb-4">
        <h1 className="text-micro tracking-[0.18em] text-tenue uppercase">Áreas</h1>
        <button
          type="button"
          onClick={() => {
            setFormularioAbierto(true);
            setErrorFormulario(null);
          }}
          className="rounded-placa bg-senal px-3 py-2 text-micro font-semibold text-fondo hover:bg-senal/85"
        >
          Nueva área
        </button>
      </header>

      {errorAccion && (
        <p
          role="alert"
          className="mb-4 rounded-placa border border-riesgo bg-riesgo-placa px-3 py-2 text-micro text-tinta"
        >
          {errorAccion}
        </p>
      )}

      {formularioAbierto && (
        <FormularioArea
          error={errorFormulario}
          onCancelar={() => setFormularioAbierto(false)}
          onCrear={crear}
        />
      )}

      <Tabla
        columnas={columnas}
        filas={areas}
        claveFila={(a) => a.areaId}
        etiqueta="Áreas"
        vacio="No hay áreas registradas."
        cargando={cargando}
      />
    </section>
  );
}

interface FormularioAreaProps {
  readonly error: string | null;
  readonly onCancelar: () => void;
  readonly onCrear: (payload: CrearAreaPayload) => void | Promise<void>;
}

function FormularioArea({ error, onCancelar, onCrear }: FormularioAreaProps) {
  const [nombre, setNombre] = useState("");
  const [enviando, setEnviando] = useState(false);

  const idNombre = useId();

  async function manejarEnvio(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setEnviando(true);
    try {
      await onCrear({ nombre });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form
      onSubmit={(evento) => void manejarEnvio(evento)}
      className="mb-6 flex flex-col gap-4 rounded-placa border border-borde bg-placa p-4"
    >
      <div>
        <label htmlFor={idNombre} className="mb-1.5 block text-micro text-tenue">
          Nombre
        </label>
        <input
          id={idNombre}
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          required
          className={CAMPO}
        />
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-placa border border-riesgo bg-riesgo-placa px-3 py-2 text-micro text-tinta"
        >
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={enviando}
          className={
            "rounded-placa px-4 py-2 text-micro font-semibold transition-colors duration-150 ease-out " +
            (enviando ? "bg-senal/40 text-fondo/70" : "bg-senal text-fondo hover:bg-senal/85")
          }
        >
          Crear área
        </button>
        <button
          type="button"
          onClick={onCancelar}
          className="rounded-placa border border-borde px-4 py-2 text-micro text-tenue hover:text-tinta"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
