// apps/web/src/ui/admin/CategoriasScreen.tsx (docs/plan-panel-administrador.md
// §5, fase F3/F7) — CRUD de categorías de valor (R3). Crear, desactivar,
// eliminar (borrado real con guarda de participación) y reactivar —
// invariante I-7: ninguna de las callables toca `sesiones/*/lineas`, se
// prueba en `packages/functions`, no aquí.
import { useEffect, useId, useState, type FormEvent } from "react";
import type { Area } from "@conteo/shared/models/area.js";
import type { CategoriaValor } from "@conteo/shared/models/categoria-valor.js";
import type { Sucursal } from "@conteo/shared/models/sucursal.js";
import type { ActualizarCategoriaPayload, CrearCategoriaPayload } from "@conteo/data";
import { moneda } from "../../lib/formato.js";
import { useAdminRepository } from "../../state/admin-contexto.js";
import { useScrollAlAbrir } from "../../state/useScrollAlAbrir.js";
import { Icono } from "../primitivos/Icono.js";
import { Spinner } from "../primitivos/Spinner.js";
import { Tabla, type ColumnaTabla } from "./Tabla.js";

const CAMPO =
  "w-full min-h-[var(--size-toque)] rounded-placa border border-borde bg-fondo px-3 " +
  "text-tinta placeholder:text-tenue focus:border-senal focus:outline-none";

// Mismo patrón que SucursalesAdminScreen.tsx/SesionesScreen.tsx (sin extraer
// a un hook compartido: es la convención ya usada en este repo).
function useSucursales(): Sucursal[] {
  const repo = useAdminRepository();
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  useEffect(() => repo.observarSucursales(setSucursales), [repo]);
  return sucursales;
}

// Mismo patrón que useSucursales de arriba: se necesita tanto en la tabla
// (resolver areaIds → nombres) como en el formulario (poblar los checkboxes).
// Trackea `cargando` igual que useCategorias de abajo y que el useAreas() de
// AreasScreen.tsx: sin esto, la tabla se pinta con datos ("Sin área" para
// toda fila) antes de que observarAreas resuelva (issue #52).
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

// N:M (issue #81): la columna lista los N nombres de área, o el aviso pasivo
// "Sin área" cuando `areaIds` está vacío/ausente — nunca un bloqueo.
function nombresDeAreas(categoria: CategoriaValor, areas: Area[]): string {
  const nombres = (categoria.areaIds ?? [])
    .map((id) => areas.find((a) => a.areaId === id)?.nombre)
    .filter((nombre): nombre is string => Boolean(nombre));
  return nombres.length > 0 ? nombres.join(", ") : "Sin área";
}

type EstadoFormulario =
  { readonly modo: "crear" } | { readonly modo: "editar"; readonly categoria: CategoriaValor };

export function CategoriasScreen() {
  const repo = useAdminRepository();
  const { categorias, cargando: cargandoCategorias } = useCategorias();
  const { areas, cargando: cargandoAreas } = useAreas();
  const cargando = cargandoCategorias || cargandoAreas;

  const [formulario, setFormulario] = useState<EstadoFormulario | null>(null);
  const [errorFormulario, setErrorFormulario] = useState<string | null>(null);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);
  // categoriaId + tipo de acción en vuelo — deshabilita el botón de esa fila
  // y muestra el spinner sólo en el botón que la disparó mientras la Cloud
  // Function responde (activa/eliminar/reactivar comparten fila).
  const [accionEnVuelo, setAccionEnVuelo] = useState<{
    id: string;
    tipo: "desactivar" | "eliminar" | "reactivar";
  } | null>(null);
  // Eliminar es IRREVERSIBLE (borrado real, sin `reactivarCategoria` que lo
  // deshaga si ya se ejecutó) — a diferencia de desactivar, exige confirmar
  // en un segundo clic con advertencia explícita, mismo criterio que
  // CajerosScreen.tsx para eliminarCajero.
  const [confirmandoEliminarId, setConfirmandoEliminarId] = useState<string | null>(null);
  const formularioRef = useScrollAlAbrir<HTMLDivElement>(formulario !== null);

  function abrirCreacion(): void {
    setFormulario({ modo: "crear" });
    setErrorFormulario(null);
  }

  function abrirEdicion(categoria: CategoriaValor): void {
    setFormulario({ modo: "editar", categoria });
    setErrorFormulario(null);
  }

  function cerrarFormulario(): void {
    setFormulario(null);
    setErrorFormulario(null);
  }

  async function crear(payload: CrearCategoriaPayload): Promise<void> {
    try {
      await repo.crearCategoria(payload);
      cerrarFormulario();
    } catch {
      setErrorFormulario("No se pudo crear la categoría. Intenta de nuevo.");
    }
  }

  async function editar(payload: ActualizarCategoriaPayload): Promise<void> {
    try {
      await repo.actualizarCategoria(payload);
      cerrarFormulario();
    } catch {
      setErrorFormulario("No se pudo guardar la categoría. Intenta de nuevo.");
    }
  }

  async function desactivar(categoria: CategoriaValor): Promise<void> {
    setErrorAccion(null);
    setAccionEnVuelo({ id: categoria.categoriaId, tipo: "desactivar" });
    try {
      await repo.desactivarCategoria(categoria.categoriaId);
    } catch {
      setErrorAccion(`No se pudo desactivar ${categoria.etiqueta}. Intenta de nuevo.`);
    } finally {
      setAccionEnVuelo(null);
    }
  }

  // El servidor ya trae el conteo humano en el mensaje de la guarda (ej. "No
  // se puede eliminar: usada en 3 conteos."): se muestra tal cual, no se
  // reformatea (a diferencia de desactivar, que no tiene guarda de negocio).
  async function eliminar(categoria: CategoriaValor): Promise<void> {
    setErrorAccion(null);
    setAccionEnVuelo({ id: categoria.categoriaId, tipo: "eliminar" });
    try {
      await repo.eliminarCategoria(categoria.categoriaId);
    } catch (error) {
      setErrorAccion(
        error instanceof Error
          ? error.message
          : `No se pudo eliminar ${categoria.etiqueta}. Intenta de nuevo.`,
      );
    } finally {
      setAccionEnVuelo(null);
      setConfirmandoEliminarId(null);
    }
  }

  async function reactivar(categoria: CategoriaValor): Promise<void> {
    setErrorAccion(null);
    setAccionEnVuelo({ id: categoria.categoriaId, tipo: "reactivar" });
    try {
      await repo.reactivarCategoria(categoria.categoriaId);
    } catch {
      setErrorAccion(`No se pudo reactivar ${categoria.etiqueta}. Intenta de nuevo.`);
    } finally {
      setAccionEnVuelo(null);
    }
  }

  const columnas: ColumnaTabla<CategoriaValor>[] = [
    {
      clave: "etiqueta",
      etiqueta: "Etiqueta",
      render: (c) => c.etiqueta,
      valorOrden: (c) => c.etiqueta,
    },
    {
      clave: "valor",
      etiqueta: "Valor",
      render: (c) => moneda(c.valor),
      valorOrden: (c) => c.valor,
      alinearDerecha: true,
    },
    { clave: "orden", etiqueta: "Orden", render: (c) => c.orden, valorOrden: (c) => c.orden },
    {
      clave: "area",
      etiqueta: "Área",
      render: (c) => nombresDeAreas(c, areas),
      valorOrden: (c) => nombresDeAreas(c, areas),
    },
    {
      clave: "activa",
      etiqueta: "Activa",
      render: (c) => (c.activa ? "Sí" : "No"),
      valorOrden: (c) => (c.activa ? 1 : 0),
    },
    {
      clave: "acciones",
      etiqueta: "Acciones",
      render: (c) => (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => abrirEdicion(c)}
            className="rounded-placa border border-borde px-2.5 py-1.5 text-micro text-tinta hover:border-senal hover:text-senal"
          >
            Editar
          </button>
          {c.activa ? (
            <>
              <button
                type="button"
                onClick={() => void desactivar(c)}
                disabled={accionEnVuelo?.id === c.categoriaId}
                className="inline-flex items-center gap-1.5 rounded-placa border border-borde px-2.5 py-1.5 text-micro text-tinta hover:border-riesgo hover:text-riesgo disabled:cursor-not-allowed disabled:opacity-40"
              >
                {accionEnVuelo?.id === c.categoriaId && accionEnVuelo.tipo === "desactivar" && (
                  <Spinner className="size-3.5 shrink-0" />
                )}
                Desactivar
              </button>
              {confirmandoEliminarId === c.categoriaId ? (
                <span className="inline-flex items-center gap-2">
                  <span className="text-micro text-tenue">
                    ¿Eliminar {c.etiqueta} permanentemente? No se puede deshacer.
                  </span>
                  <button
                    type="button"
                    onClick={() => void eliminar(c)}
                    disabled={accionEnVuelo?.id === c.categoriaId}
                    className="inline-flex items-center gap-1.5 rounded-placa border border-riesgo px-2.5 py-1.5 text-micro text-tinta hover:bg-riesgo-placa disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {accionEnVuelo?.id === c.categoriaId && accionEnVuelo.tipo === "eliminar" && (
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
                  onClick={() => setConfirmandoEliminarId(c.categoriaId)}
                  disabled={accionEnVuelo?.id === c.categoriaId}
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
              onClick={() => void reactivar(c)}
              disabled={accionEnVuelo?.id === c.categoriaId}
              className="inline-flex items-center gap-1.5 rounded-placa border border-borde px-2.5 py-1.5 text-micro text-tinta hover:border-senal hover:text-senal disabled:cursor-not-allowed disabled:opacity-40"
            >
              {accionEnVuelo?.id === c.categoriaId && accionEnVuelo.tipo === "reactivar" && (
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
        <h1 className="text-micro tracking-[0.18em] text-tenue uppercase">Categorías</h1>
        <button
          type="button"
          onClick={abrirCreacion}
          className="rounded-placa bg-senal px-3 py-2 text-micro font-semibold text-fondo hover:bg-senal/85"
        >
          Nueva categoría
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
          <FormularioCategoria
            modo={formulario.modo}
            categoria={formulario.modo === "editar" ? formulario.categoria : undefined}
            error={errorFormulario}
            onCancelar={cerrarFormulario}
            onCrear={crear}
            onEditar={editar}
          />
        </div>
      )}

      <Tabla
        columnas={columnas}
        filas={categorias}
        claveFila={(c) => c.categoriaId}
        etiqueta="Categorías"
        vacio="No hay categorías registradas."
        cargando={cargando}
      />
    </section>
  );
}

interface FormularioCategoriaProps {
  readonly modo: "crear" | "editar";
  readonly categoria?: CategoriaValor;
  readonly error: string | null;
  readonly onCancelar: () => void;
  readonly onCrear: (payload: CrearCategoriaPayload) => void | Promise<void>;
  readonly onEditar: (payload: ActualizarCategoriaPayload) => void | Promise<void>;
}

function FormularioCategoria({
  modo,
  categoria,
  error,
  onCancelar,
  onCrear,
  onEditar,
}: FormularioCategoriaProps) {
  const sucursales = useSucursales();
  // Solo áreas activas: sembrarLineas únicamente resuelve áreas con
  // activa=true, así que ofrecer una inactiva aquí crearía una categoría
  // que se ve "con área" en esta pantalla pero cae a "Sin área" al abrir
  // la próxima sesión.
  const areas = useAreas().areas.filter((a) => a.activa);
  const [etiqueta, setEtiqueta] = useState(categoria?.etiqueta ?? "");
  const [valor, setValor] = useState(categoria ? String(categoria.valor) : "");
  const [orden, setOrden] = useState(categoria ? String(categoria.orden) : "");
  const [areaIds, setAreaIds] = useState<string[]>(
    categoria?.areaIds ? [...categoria.areaIds] : [],
  );
  const [sucursalesAsignadas, setSucursalesAsignadas] = useState<string[]>(
    categoria?.sucursalesAsignadas ? [...categoria.sucursalesAsignadas] : [],
  );
  const [enviando, setEnviando] = useState(false);

  const idEtiqueta = useId();
  const idValor = useId();
  const idOrden = useId();

  // D6: la sola presencia de sucursales marcadas ES la distinción entre
  // categoría global y "nombrada" — no hay un toggle aparte de tipo.
  function alternarSucursal(sucursalId: string): void {
    setSucursalesAsignadas((actual) =>
      actual.includes(sucursalId)
        ? actual.filter((id) => id !== sucursalId)
        : [...actual, sucursalId],
    );
  }

  // N:M (issue #81): mismo patrón de checkbox múltiple que alternarSucursal.
  function alternarArea(areaId: string): void {
    setAreaIds((actual) =>
      actual.includes(areaId) ? actual.filter((id) => id !== areaId) : [...actual, areaId],
    );
  }

  async function manejarEnvio(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setEnviando(true);
    try {
      const campos = {
        etiqueta,
        valor: Number(valor),
        orden: Number(orden),
        ...(areaIds.length > 0 && { areaIds }),
        ...(sucursalesAsignadas.length > 0 && { sucursalesAsignadas }),
      };
      if (modo === "crear") {
        await onCrear(campos);
      } else if (categoria) {
        await onEditar({ categoriaId: categoria.categoriaId, ...campos });
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
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label htmlFor={idEtiqueta} className="mb-1.5 block text-micro text-tenue">
            Etiqueta
          </label>
          <input
            id={idEtiqueta}
            value={etiqueta}
            onChange={(e) => setEtiqueta(e.target.value)}
            required
            className={CAMPO}
          />
        </div>

        <div>
          <label htmlFor={idValor} className="mb-1.5 block text-micro text-tenue">
            Valor
          </label>
          <input
            id={idValor}
            type="number"
            min={0}
            step={1}
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            required
            className={CAMPO}
          />
        </div>

        <div>
          <label htmlFor={idOrden} className="mb-1.5 block text-micro text-tenue">
            Orden
          </label>
          <input
            id={idOrden}
            type="number"
            min={0}
            step={1}
            value={orden}
            onChange={(e) => setOrden(e.target.value)}
            required
            className={CAMPO}
          />
        </div>
      </div>

      {areas.length > 0 && (
        <fieldset>
          <legend className="mb-1.5 block text-micro text-tenue">
            Áreas (ninguna marcada = sin área, aviso pasivo en la tabla)
          </legend>
          <div className="flex flex-wrap gap-3">
            {areas.map((a) => (
              <label key={a.areaId} className="flex items-center gap-1.5 text-micro text-tinta">
                <input
                  type="checkbox"
                  checked={areaIds.includes(a.areaId)}
                  onChange={() => alternarArea(a.areaId)}
                />
                {a.nombre}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {sucursales.length > 0 && (
        <fieldset>
          <legend className="mb-1.5 block text-micro text-tenue">
            Sucursales (ninguna marcada = categoría global, disponible en todas)
          </legend>
          <div className="flex flex-wrap gap-3">
            {sucursales.map((s) => (
              <label key={s.sucursalId} className="flex items-center gap-1.5 text-micro text-tinta">
                <input
                  type="checkbox"
                  checked={sucursalesAsignadas.includes(s.sucursalId)}
                  onChange={() => alternarSucursal(s.sucursalId)}
                />
                {s.nombre}
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
          disabled={enviando}
          className={
            "inline-flex items-center gap-1.5 rounded-placa px-4 py-2 text-micro font-semibold transition-colors duration-150 ease-out " +
            (enviando ? "bg-senal/40 text-fondo/70" : "bg-senal text-fondo hover:bg-senal/85")
          }
        >
          {enviando && <Spinner className="size-3.5 shrink-0" />}
          {modo === "crear" ? "Crear categoría" : "Guardar cambios"}
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
