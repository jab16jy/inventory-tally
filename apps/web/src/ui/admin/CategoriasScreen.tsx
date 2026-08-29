// apps/web/src/ui/admin/CategoriasScreen.tsx (docs/plan-panel-administrador.md
// §5, fase F3) — CRUD de categorías de valor (R3). Crear + desactivar; no
// hay `reactivarCategoria` (doc plan §3), así que una categoría inactiva no
// ofrece ninguna acción — invariante I-7: ninguna de las dos callables toca
// `sesiones/*/lineas`, se prueba en `packages/functions`, no aquí.
import { useEffect, useId, useState, type FormEvent } from "react";
import type { Area } from "@conteo/shared/models/area.js";
import type { CategoriaValor } from "@conteo/shared/models/categoria-valor.js";
import type { Sucursal } from "@conteo/shared/models/sucursal.js";
import type { CrearCategoriaPayload } from "@conteo/data";
import { moneda } from "../../lib/formato.js";
import { useAdminRepository } from "../../state/admin-contexto.js";
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
// (resolver areaId → nombre) como en el formulario (poblar el <select>).
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

export function CategoriasScreen() {
  const repo = useAdminRepository();
  const { categorias, cargando: cargandoCategorias } = useCategorias();
  const { areas, cargando: cargandoAreas } = useAreas();
  const cargando = cargandoCategorias || cargandoAreas;

  const [formularioAbierto, setFormularioAbierto] = useState(false);
  const [errorFormulario, setErrorFormulario] = useState<string | null>(null);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);
  // categoriaId con desactivar en vuelo — deshabilita el botón de esa fila y
  // muestra el spinner mientras la Cloud Function responde.
  const [accionEnVueloId, setAccionEnVueloId] = useState<string | null>(null);

  async function crear(payload: CrearCategoriaPayload): Promise<void> {
    try {
      await repo.crearCategoria(payload);
      setFormularioAbierto(false);
      setErrorFormulario(null);
    } catch {
      setErrorFormulario("No se pudo crear la categoría. Intenta de nuevo.");
    }
  }

  async function desactivar(categoria: CategoriaValor): Promise<void> {
    setErrorAccion(null);
    setAccionEnVueloId(categoria.categoriaId);
    try {
      await repo.desactivarCategoria(categoria.categoriaId);
    } catch {
      setErrorAccion(`No se pudo desactivar ${categoria.etiqueta}. Intenta de nuevo.`);
    } finally {
      setAccionEnVueloId(null);
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
      render: (c) => areas.find((a) => a.areaId === c.areaId)?.nombre ?? "Sin área",
      valorOrden: (c) => areas.find((a) => a.areaId === c.areaId)?.nombre ?? "",
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
      render: (c) =>
        c.activa ? (
          <button
            type="button"
            onClick={() => void desactivar(c)}
            disabled={accionEnVueloId === c.categoriaId}
            className="inline-flex items-center gap-1.5 rounded-placa border border-borde px-2.5 py-1.5 text-micro text-tinta hover:border-riesgo hover:text-riesgo disabled:cursor-not-allowed disabled:opacity-40"
          >
            {accionEnVueloId === c.categoriaId && <Spinner className="size-3.5 shrink-0" />}
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
        <h1 className="text-micro tracking-[0.18em] text-tenue uppercase">Categorías</h1>
        <button
          type="button"
          onClick={() => {
            setFormularioAbierto(true);
            setErrorFormulario(null);
          }}
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

      {formularioAbierto && (
        <FormularioCategoria
          error={errorFormulario}
          onCancelar={() => setFormularioAbierto(false)}
          onCrear={crear}
        />
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
  readonly error: string | null;
  readonly onCancelar: () => void;
  readonly onCrear: (payload: CrearCategoriaPayload) => void | Promise<void>;
}

function FormularioCategoria({ error, onCancelar, onCrear }: FormularioCategoriaProps) {
  const sucursales = useSucursales();
  // Solo áreas activas: sembrarLineas únicamente resuelve áreas con
  // activa=true, así que ofrecer una inactiva aquí crearía una categoría
  // que se ve "con área" en esta pantalla pero cae a "Sin área" al abrir
  // la próxima sesión.
  const areas = useAreas().areas.filter((a) => a.activa);
  const [etiqueta, setEtiqueta] = useState("");
  const [valor, setValor] = useState("");
  const [orden, setOrden] = useState("");
  const [areaId, setAreaId] = useState("");
  const [sucursalesAsignadas, setSucursalesAsignadas] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);

  const idEtiqueta = useId();
  const idValor = useId();
  const idOrden = useId();
  const idArea = useId();

  // D6: la sola presencia de sucursales marcadas ES la distinción entre
  // categoría global y "nombrada" — no hay un toggle aparte de tipo.
  function alternarSucursal(sucursalId: string): void {
    setSucursalesAsignadas((actual) =>
      actual.includes(sucursalId)
        ? actual.filter((id) => id !== sucursalId)
        : [...actual, sucursalId],
    );
  }

  async function manejarEnvio(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setEnviando(true);
    try {
      await onCrear({
        etiqueta,
        valor: Number(valor),
        orden: Number(orden),
        ...(areaId && { areaId }),
        ...(sucursalesAsignadas.length > 0 && { sucursalesAsignadas }),
      });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form
      onSubmit={(evento) => void manejarEnvio(evento)}
      className="mb-6 flex flex-col gap-4 rounded-placa border border-borde bg-placa p-4"
    >
      <div className="grid grid-cols-4 gap-4">
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

        <div>
          <label htmlFor={idArea} className="mb-1.5 block text-micro text-tenue">
            Área
          </label>
          <select
            id={idArea}
            value={areaId}
            onChange={(e) => setAreaId(e.target.value)}
            className={CAMPO}
          >
            <option value="">Sin área</option>
            {areas.map((a) => (
              <option key={a.areaId} value={a.areaId}>
                {a.nombre}
              </option>
            ))}
          </select>
        </div>
      </div>

      {sucursales.length > 0 && (
        <fieldset>
          <legend className="mb-1.5 block text-micro text-tenue">
            Sucursales (ninguna marcada = categoría global, disponible en todas)
          </legend>
          <div className="flex flex-wrap gap-3">
            {sucursales.map((s) => (
              <label
                key={s.sucursalId}
                className="flex items-center gap-1.5 text-micro text-tinta"
              >
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
          Crear categoría
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
