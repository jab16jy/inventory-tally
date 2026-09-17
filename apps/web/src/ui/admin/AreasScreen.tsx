// apps/web/src/ui/admin/AreasScreen.tsx — CRUD de áreas (agrupación de
// categorías, doc 03 §3). Crear, desactivar, eliminar (borrado real con
// guarda de participación) y reactivar — mismo criterio que
// CategoriasScreen.tsx.
import { useEffect, useId, useState, type FormEvent } from "react";
import type { Area } from "@conteo/shared/models/area.js";
import type { CategoriaValor } from "@conteo/shared/models/categoria-valor.js";
import type {
  ActualizarAreaPayload,
  ActualizarCategoriaPayload,
  CrearAreaPayload,
} from "@conteo/data";
import { useAdminRepository } from "../../state/admin-contexto.js";
import { useScrollAlAbrir } from "../../state/useScrollAlAbrir.js";
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

function useCategorias(): { categorias: CategoriaValor[]; cargando: boolean } {
  const repo = useAdminRepository();
  const [categorias, setCategorias] = useState<CategoriaValor[]>([]);
  const [cargando, setCargando] = useState(true);
  useEffect(
    () =>
      repo.observarCategorias((c) => {
        setCategorias(c);
        setCargando(false);
      }),
    [repo],
  );
  return { categorias, cargando };
}

type EstadoFormulario =
  | { readonly modo: "crear" }
  | { readonly modo: "editar"; readonly area: Area }
  | { readonly modo: "asignar"; readonly area: Area };

export interface AreasScreenProps {
  readonly onIrACategorias?: () => void;
}

export function AreasScreen({ onIrACategorias }: AreasScreenProps = {}) {
  const repo = useAdminRepository();
  const { areas, cargando } = useAreas();
  const { categorias, cargando: cargandoCategorias } = useCategorias();

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
  const formularioRef = useScrollAlAbrir<HTMLDivElement>(formulario !== null);

  function abrirCreacion(): void {
    setFormulario({ modo: "crear" });
    setErrorFormulario(null);
  }

  function abrirEdicion(area: Area): void {
    setFormulario({ modo: "editar", area });
    setErrorFormulario(null);
  }

  function abrirAsignacion(area: Area): void {
    setFormulario({ modo: "asignar", area });
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
      clave: "categorias",
      etiqueta: "Categorías",
      render: (a) => {
        const conteo = categorias.filter((c) => c.activa && c.areaIds?.includes(a.areaId)).length;
        return conteo === 0 ? <span className="text-tenue">0</span> : conteo;
      },
      valorOrden: (a) => categorias.filter((c) => c.activa && c.areaIds?.includes(a.areaId)).length,
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
            onClick={() => abrirAsignacion(a)}
            aria-label={`Asignar categorías a ${a.nombre}`}
            className="rounded-placa border border-borde px-2.5 py-1.5 text-micro text-tinta hover:border-senal hover:text-senal"
          >
            Asignar
          </button>
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

  const categoriasSinArea = categorias.filter(
    (c) => c.activa && (!c.areaIds || c.areaIds.length === 0),
  );

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
        <div ref={formularioRef}>
          {formulario.modo === "asignar" ? (
            <FormularioAsignacion
              area={formulario.area}
              categorias={categorias}
              cargandoCategorias={cargandoCategorias}
              onCancelar={cerrarFormulario}
              onExito={cerrarFormulario}
            />
          ) : (
            <FormularioArea
              modo={formulario.modo}
              area={formulario.modo === "editar" ? formulario.area : undefined}
              error={errorFormulario}
              onCancelar={cerrarFormulario}
              onCrear={crear}
              onEditar={editar}
            />
          )}
        </div>
      )}

      {categoriasSinArea.length > 0 && (
        <div
          role="status"
          className="mb-4 flex items-center justify-between gap-2 rounded-placa border border-borde bg-placa px-3 py-2 text-micro text-tenue"
        >
          <span>
            {categoriasSinArea.length} categorías sin área. Se ven en todas las áreas mientras
            tanto.
          </span>
          {onIrACategorias && (
            <button
              type="button"
              onClick={onIrACategorias}
              className="shrink-0 rounded-placa border border-borde px-2.5 py-1 text-micro text-tinta hover:border-senal hover:text-senal"
            >
              Ver categorías
            </button>
          )}
        </div>
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

interface FormularioAsignacionProps {
  readonly area: Area;
  readonly categorias: readonly CategoriaValor[];
  readonly cargandoCategorias: boolean;
  readonly onCancelar: () => void;
  readonly onExito: () => void;
}

function FormularioAsignacion({
  area,
  categorias,
  cargandoCategorias,
  onCancelar,
  onExito,
}: FormularioAsignacionProps) {
  const repo = useAdminRepository();
  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(() => {
    return new Set(
      categorias.filter((c) => c.areaIds?.includes(area.areaId)).map((c) => c.categoriaId),
    );
  });
  const [busqueda, setBusqueda] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categoriasActivas = categorias.filter((c) => c.activa);

  function alternarCategoria(categoriaId: string): void {
    setSeleccionadas((prev) => {
      const next = new Set(prev);
      if (next.has(categoriaId)) {
        next.delete(categoriaId);
      } else {
        next.add(categoriaId);
      }
      return next;
    });
  }

  function marcarTodas(): void {
    setSeleccionadas(new Set(categoriasActivas.map((c) => c.categoriaId)));
  }

  function desmarcarTodas(): void {
    setSeleccionadas(new Set());
  }

  async function manejarEnvio(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setGuardando(true);
    setError(null);

    try {
      const pendientes = categoriasActivas.filter((c) => {
        const tieneArea = Boolean(c.areaIds?.includes(area.areaId));
        const debeTener = seleccionadas.has(c.categoriaId);
        return tieneArea !== debeTener;
      });

      let guardadas = 0;
      for (const cat of pendientes) {
        // Preserva campos vivos de observarCategorias para mitigar pisado por concurrencia (D-11)
        const catViva = categorias.find((c) => c.categoriaId === cat.categoriaId) ?? cat;
        const debeTener = seleccionadas.has(catViva.categoriaId);
        const areaIdsActuales = catViva.areaIds ?? [];
        const nuevosAreaIds = debeTener
          ? [...new Set([...areaIdsActuales, area.areaId])]
          : areaIdsActuales.filter((id) => id !== area.areaId);

        const payload: ActualizarCategoriaPayload = {
          categoriaId: catViva.categoriaId,
          etiqueta: catViva.etiqueta,
          valor: catViva.valor,
          orden: catViva.orden,
          ...(nuevosAreaIds.length > 0 ? { areaIds: nuevosAreaIds } : {}),
          ...(catViva.sucursalesAsignadas && catViva.sucursalesAsignadas.length > 0
            ? { sucursalesAsignadas: catViva.sucursalesAsignadas }
            : {}),
        };

        try {
          await repo.actualizarCategoria(payload);
          guardadas++;
        } catch {
          if (guardadas > 0) {
            setError(
              `Se guardaron ${guardadas} de ${pendientes.length} categorías. Vuelve a intentar con las que faltaron.`,
            );
          } else {
            setError("No se pudo guardar la asignación. Intenta de nuevo.");
          }
          return;
        }
      }

      onExito();
    } finally {
      setGuardando(false);
    }
  }

  const consulta = busqueda.trim().toLowerCase();
  const categoriasVisibles = consulta
    ? categoriasActivas.filter((c) => c.etiqueta.toLowerCase().includes(consulta))
    : categoriasActivas;

  return (
    <form
      onSubmit={(evento) => void manejarEnvio(evento)}
      className="mb-6 flex flex-col gap-4 rounded-placa border border-borde bg-placa p-4"
    >
      <header className="flex items-center justify-between">
        <h2 className="text-micro font-semibold text-tinta">Categorías de {area.nombre}</h2>
      </header>

      {cargandoCategorias ? (
        <div className="flex items-center gap-2 text-micro text-tenue">
          <Spinner className="size-3.5 shrink-0" /> Cargando categorías…
        </div>
      ) : categoriasActivas.length === 0 ? (
        <p className="text-micro text-tenue">No hay categorías activas todavía.</p>
      ) : (
        <fieldset>
          <legend className="mb-1.5 block text-micro text-tenue">Categorías activas</legend>

          {categoriasActivas.length > 20 && (
            <label className="relative mb-3 block">
              <span className="sr-only">Buscar categoría</span>
              <Icono
                nombre="buscar"
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-tenue"
              />
              <input
                type="search"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar categoría…"
                className="min-h-[var(--size-toque)] w-full rounded-placa border border-borde bg-fondo py-2 pr-3 pl-9 text-tinta placeholder:text-tenue focus:border-senal focus:outline-none"
              />
            </label>
          )}

          <div className="mb-2 flex items-center gap-3 text-micro">
            <button
              type="button"
              onClick={marcarTodas}
              disabled={guardando}
              className="text-tenue hover:text-tinta disabled:opacity-40"
            >
              Marcar todas
            </button>
            <span className="text-borde" aria-hidden="true">
              ·
            </span>
            <button
              type="button"
              onClick={desmarcarTodas}
              disabled={guardando}
              className="text-tenue hover:text-tinta disabled:opacity-40"
            >
              Desmarcar todas
            </button>
          </div>

          <div className="flex flex-wrap gap-3">
            {categoriasVisibles.map((cat) => (
              <label
                key={cat.categoriaId}
                className="flex items-center gap-1.5 text-micro text-tinta"
              >
                <input
                  type="checkbox"
                  checked={seleccionadas.has(cat.categoriaId)}
                  onChange={() => alternarCategoria(cat.categoriaId)}
                  disabled={guardando}
                />
                {cat.etiqueta}
              </label>
            ))}
          </div>
        </fieldset>
      )}

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
          disabled={guardando}
          className={
            "inline-flex items-center gap-1.5 rounded-placa px-4 py-2 text-micro font-semibold transition-colors duration-150 ease-out " +
            (guardando ? "bg-senal/40 text-fondo/70" : "bg-senal text-fondo hover:bg-senal/85")
          }
        >
          {guardando && <Spinner className="size-3.5 shrink-0" />}
          Guardar asignación
        </button>
        <button
          type="button"
          onClick={onCancelar}
          disabled={guardando}
          className="rounded-placa border border-borde px-4 py-2 text-micro text-tenue hover:text-tinta disabled:opacity-40"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
