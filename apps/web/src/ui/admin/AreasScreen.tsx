// apps/web/src/ui/admin/AreasScreen.tsx — CRUD de áreas (agrupación de
// categorías, doc 03 §3). Crear, desactivar, eliminar (borrado real con
// guarda de participación) y reactivar — mismo criterio que
// CategoriasScreen.tsx.
import { useEffect, useId, useState, type FormEvent } from "react";
import type { Area } from "@conteo/shared/models/area.js";
import type { ActualizarAreaPayload, CrearAreaPayload } from "@conteo/data";
import { useAdminRepository } from "../../state/admin-contexto.js";
import { Icono } from "../primitivos/Icono.js";
import { Spinner } from "../primitivos/Spinner.js";
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

type EstadoFormulario = { readonly modo: "crear" } | { readonly modo: "editar"; readonly area: Area };

export function AreasScreen() {
  const repo = useAdminRepository();
  const { areas, cargando } = useAreas();

  const [formulario, setFormulario] = useState<EstadoFormulario | null>(null);
  const [errorFormulario, setErrorFormulario] = useState<string | null>(null);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);
  // areaId + tipo de acción en vuelo — deshabilita el botón de esa fila y
  // muestra el spinner sólo en el botón que la disparó mientras la Cloud
  // Function responde (activa/eliminar/reactivar comparten fila).
  const [accionEnVuelo, setAccionEnVuelo] = useState<{
    id: string;
    tipo: "desactivar" | "eliminar" | "reactivar";
  } | null>(null);
  // Eliminar es IRREVERSIBLE (borrado real, sin `reactivarArea` que lo
  // deshaga si ya se ejecutó) — a diferencia de desactivar, exige confirmar
  // en un segundo clic con advertencia explícita, mismo criterio que
  // CajerosScreen.tsx para eliminarCajero.
  const [confirmandoEliminarId, setConfirmandoEliminarId] = useState<string | null>(null);

  function abrirCreacion(): void {
    setFormulario({ modo: "crear" });
    setErrorFormulario(null);
  }

  function abrirEdicion(area: Area): void {
    setFormulario({ modo: "editar", area });
    setErrorFormulario(null);
  }

  function cerrarFormulario(): void {
    setFormulario(null);
    setErrorFormulario(null);
  }

  async function crear(payload: CrearAreaPayload): Promise<void> {
    try {
      await repo.crearArea(payload);
      cerrarFormulario();
    } catch {
      setErrorFormulario("No se pudo crear el área. Intenta de nuevo.");
    }
  }

  async function editar(payload: ActualizarAreaPayload): Promise<void> {
    try {
      await repo.actualizarArea(payload);
      cerrarFormulario();
    } catch {
      setErrorFormulario("No se pudo guardar el área. Intenta de nuevo.");
    }
  }

  async function desactivar(area: Area): Promise<void> {
    setErrorAccion(null);
    setAccionEnVuelo({ id: area.areaId, tipo: "desactivar" });
    try {
      await repo.desactivarArea(area.areaId);
    } catch {
      setErrorAccion(`No se pudo desactivar ${area.nombre}. Intenta de nuevo.`);
    } finally {
      setAccionEnVuelo(null);
    }
  }

  // El servidor ya trae el conteo humano en el mensaje de la guarda (ej. "No
  // se puede eliminar: usada en 3 categorías."): se muestra tal cual, no se
  // reformatea (a diferencia de desactivar, que no tiene guarda de negocio).
  async function eliminar(area: Area): Promise<void> {
    setErrorAccion(null);
    setAccionEnVuelo({ id: area.areaId, tipo: "eliminar" });
    try {
      await repo.eliminarArea(area.areaId);
    } catch (error) {
      setErrorAccion(
        error instanceof Error
          ? error.message
          : `No se pudo eliminar ${area.nombre}. Intenta de nuevo.`,
      );
    } finally {
      setAccionEnVuelo(null);
      setConfirmandoEliminarId(null);
    }
  }

  async function reactivar(area: Area): Promise<void> {
    setErrorAccion(null);
    setAccionEnVuelo({ id: area.areaId, tipo: "reactivar" });
    try {
      await repo.reactivarArea(area.areaId);
    } catch {
      setErrorAccion(`No se pudo reactivar ${area.nombre}. Intenta de nuevo.`);
    } finally {
      setAccionEnVuelo(null);
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
      render: (a) => (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => abrirEdicion(a)}
            className="rounded-placa border border-borde px-2.5 py-1.5 text-micro text-tinta hover:border-senal hover:text-senal"
          >
            Editar
          </button>
          {a.activa ? (
            <>
              <button
                type="button"
                onClick={() => void desactivar(a)}
                disabled={accionEnVuelo?.id === a.areaId}
                className="inline-flex items-center gap-1.5 rounded-placa border border-borde px-2.5 py-1.5 text-micro text-tinta hover:border-riesgo hover:text-riesgo disabled:cursor-not-allowed disabled:opacity-40"
              >
                {accionEnVuelo?.id === a.areaId && accionEnVuelo.tipo === "desactivar" && (
                  <Spinner className="size-3.5 shrink-0" />
                )}
                Desactivar
              </button>
              {confirmandoEliminarId === a.areaId ? (
                <span className="inline-flex items-center gap-2">
                  <span className="text-micro text-tenue">
                    ¿Eliminar {a.nombre} permanentemente? No se puede deshacer.
                  </span>
                  <button
                    type="button"
                    onClick={() => void eliminar(a)}
                    disabled={accionEnVuelo?.id === a.areaId}
                    className="inline-flex items-center gap-1.5 rounded-placa border border-riesgo px-2.5 py-1.5 text-micro text-tinta hover:bg-riesgo-placa disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {accionEnVuelo?.id === a.areaId && accionEnVuelo.tipo === "eliminar" && (
                      <Spinner className="size-3.5 shrink-0" />
                    )}
                    Confirmar
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmandoEliminarId(null)}
                    className="rounded-placa border border-borde px-2.5 py-1.5 text-micro text-tenue hover:text-tinta"
                  >
                    Cancelar
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmandoEliminarId(a.areaId)}
                  disabled={accionEnVuelo?.id === a.areaId}
                  className="inline-flex items-center gap-1.5 rounded-placa border border-borde px-2.5 py-1.5 text-micro text-tinta hover:border-riesgo hover:text-riesgo disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Icono nombre="papelera" className="size-3.5 shrink-0" />
                  Eliminar
                </button>
              )}
            </>
          ) : (
            <button
              type="button"
              onClick={() => void reactivar(a)}
              disabled={accionEnVuelo?.id === a.areaId}
              className="inline-flex items-center gap-1.5 rounded-placa border border-borde px-2.5 py-1.5 text-micro text-tinta hover:border-senal hover:text-senal disabled:cursor-not-allowed disabled:opacity-40"
            >
              {accionEnVuelo?.id === a.areaId && accionEnVuelo.tipo === "reactivar" && (
                <Spinner className="size-3.5 shrink-0" />
              )}
              Reactivar
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <section className="p-6">
      <header className="flex items-center justify-between pb-4">
        <h1 className="text-micro tracking-[0.18em] text-tenue uppercase">Áreas</h1>
        <button
          type="button"
          onClick={abrirCreacion}
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

      {formulario && (
        <FormularioArea
          modo={formulario.modo}
          area={formulario.modo === "editar" ? formulario.area : undefined}
          error={errorFormulario}
          onCancelar={cerrarFormulario}
          onCrear={crear}
          onEditar={editar}
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
  readonly modo: "crear" | "editar";
  readonly area?: Area;
  readonly error: string | null;
  readonly onCancelar: () => void;
  readonly onCrear: (payload: CrearAreaPayload) => void | Promise<void>;
  readonly onEditar: (payload: ActualizarAreaPayload) => void | Promise<void>;
}

function FormularioArea({ modo, area, error, onCancelar, onCrear, onEditar }: FormularioAreaProps) {
  const [nombre, setNombre] = useState(area?.nombre ?? "");
  const [enviando, setEnviando] = useState(false);

  const idNombre = useId();

  async function manejarEnvio(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setEnviando(true);
    try {
      if (modo === "crear") {
        await onCrear({ nombre });
      } else if (area) {
        await onEditar({ areaId: area.areaId, nombre });
      }
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
            "inline-flex items-center gap-1.5 rounded-placa px-4 py-2 text-micro font-semibold transition-colors duration-150 ease-out " +
            (enviando ? "bg-senal/40 text-fondo/70" : "bg-senal text-fondo hover:bg-senal/85")
          }
        >
          {enviando && <Spinner className="size-3.5 shrink-0" />}
          {modo === "crear" ? "Crear área" : "Guardar cambios"}
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
