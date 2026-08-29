// apps/web/src/ui/admin/SucursalesAdminScreen.tsx (docs/plan-panel-administrador.md
// §5, fase F2) — CRUD de sucursales para el admin. NO confundir con
// `ui/SucursalesScreen.tsx`: esa es la lista del cajero (móvil, acotada por
// el claim), esta es de escritorio y ve TODAS las sucursales.
//
// Activar/desactivar reusa `actualizarSucursal` (reemplazo total, doc plan
// §3): no hay una callable aparte para el toggle, así que el botón manda los
// cuatro campos con `activa` invertido.
import { FirebaseError } from "firebase/app";
import { useEffect, useId, useState, type FormEvent } from "react";
import type { Conectividad, Sucursal } from "@conteo/shared/models/sucursal.js";
import type { ActualizarSucursalPayload, CrearSucursalPayload } from "@conteo/data";
import { useAdminRepository } from "../../state/admin-contexto.js";
import { Icono } from "../primitivos/Icono.js";
import { Spinner } from "../primitivos/Spinner.js";
import { Tabla, type ColumnaTabla } from "./Tabla.js";

const CAMPO =
  "w-full min-h-[var(--size-toque)] rounded-placa border border-borde bg-fondo px-3 " +
  "text-tinta placeholder:text-tenue focus:border-senal focus:outline-none";

const CONECTIVIDADES: readonly { readonly valor: Conectividad; readonly etiqueta: string }[] = [
  { valor: "wifi", etiqueta: "WiFi" },
  { valor: "datos", etiqueta: "Datos móviles" },
];

function useSucursales(): Sucursal[] {
  const repo = useAdminRepository();
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  useEffect(() => repo.observarSucursales(setSucursales), [repo]);
  return sucursales;
}

type EstadoFormulario =
  { readonly modo: "crear" } | { readonly modo: "editar"; readonly sucursal: Sucursal };

export function SucursalesAdminScreen() {
  const repo = useAdminRepository();
  const sucursales = useSucursales();

  const [formulario, setFormulario] = useState<EstadoFormulario | null>(null);
  const [errorFormulario, setErrorFormulario] = useState<string | null>(null);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  // sucursalId con activar/desactivar/abrir-conteo en vuelo — deshabilita el
  // botón de esa fila y muestra el spinner mientras la Cloud Function responde.
  const [accionEnVueloId, setAccionEnVueloId] = useState<string | null>(null);

  function abrirCreacion(): void {
    setFormulario({ modo: "crear" });
    setErrorFormulario(null);
  }

  function abrirEdicion(sucursal: Sucursal): void {
    setFormulario({ modo: "editar", sucursal });
    setErrorFormulario(null);
  }

  function cerrarFormulario(): void {
    setFormulario(null);
    setErrorFormulario(null);
  }

  async function crear(payload: CrearSucursalPayload): Promise<void> {
    try {
      await repo.crearSucursal(payload);
      cerrarFormulario();
      // El claim `sucursales` sólo lo reescribe `actualizarCajero`: crear la
      // sucursal no la hace visible para ningún cajero todavía (doc plan §6,
      // riesgo 6) — sin este aviso se reporta como un bug.
      setAviso("Sucursal creada. Ningún cajero podrá verla hasta que se le asigne en Cajeros.");
    } catch {
      setErrorFormulario("No se pudo crear la sucursal. Intenta de nuevo.");
    }
  }

  async function editar(payload: ActualizarSucursalPayload): Promise<void> {
    try {
      await repo.actualizarSucursal(payload);
      cerrarFormulario();
    } catch {
      setErrorFormulario("No se pudo guardar la sucursal. Intenta de nuevo.");
    }
  }

  async function alternarActiva(sucursal: Sucursal): Promise<void> {
    setErrorAccion(null);
    setAccionEnVueloId(sucursal.sucursalId);
    try {
      await repo.actualizarSucursal({
        sucursalId: sucursal.sucursalId,
        nombre: sucursal.nombre,
        direccion: sucursal.direccion,
        conectividad: sucursal.conectividad,
        activa: !sucursal.activa,
      });
    } catch (error) {
      // El botón ya se deshabilita cuando hay sesión abierta (ver columna
      // "acciones"); esto cubre la carrera en la que se abre una sesión
      // entre que se pintó la fila y se hizo click.
      if (error instanceof FirebaseError && error.code === "functions/failed-precondition") {
        setErrorAccion(`No se pudo desactivar ${sucursal.nombre}: tiene una sesión abierta.`);
      } else {
        setErrorAccion(`No se pudo actualizar ${sucursal.nombre}. Intenta de nuevo.`);
      }
    } finally {
      setAccionEnVueloId(null);
    }
  }

  async function abrirConteo(sucursal: Sucursal): Promise<void> {
    setErrorAccion(null);
    setAccionEnVueloId(sucursal.sucursalId);
    try {
      await repo.abrirSesion({ sucursalId: sucursal.sucursalId });
      setAviso(`Conteo abierto en ${sucursal.nombre}.`);
    } catch (error) {
      // Cubre la carrera en la que ya se abrió un conteo entre que se pintó
      // la fila y se hizo click (mismo patrón que alternarActiva).
      if (error instanceof FirebaseError && error.code === "functions/failed-precondition") {
        setErrorAccion(`Ya existe un conteo abierto en ${sucursal.nombre}.`);
      } else {
        setErrorAccion(`No se pudo abrir el conteo en ${sucursal.nombre}. Intenta de nuevo.`);
      }
    } finally {
      setAccionEnVueloId(null);
    }
  }

  const columnas: ColumnaTabla<Sucursal>[] = [
    { clave: "nombre", etiqueta: "Nombre", render: (s) => s.nombre, valorOrden: (s) => s.nombre },
    {
      clave: "direccion",
      etiqueta: "Dirección",
      render: (s) => s.direccion,
      valorOrden: (s) => s.direccion,
    },
    {
      clave: "conectividad",
      etiqueta: "Conectividad",
      render: (s) => (
        <span className="inline-flex items-center gap-1.5">
          <Icono
            nombre={s.conectividad === "wifi" ? "wifi" : "datos"}
            className="size-3.5 shrink-0"
          />
          {s.conectividad === "wifi" ? "WiFi" : "Datos móviles"}
        </span>
      ),
      valorOrden: (s) => s.conectividad,
    },
    {
      clave: "activa",
      etiqueta: "Activa",
      render: (s) => (s.activa ? "Sí" : "No"),
      valorOrden: (s) => (s.activa ? 1 : 0),
    },
    {
      clave: "sesion",
      etiqueta: "Sesión abierta",
      render: (s) => (s.sesionAbiertaId !== null ? "Sí" : "—"),
      valorOrden: (s) => (s.sesionAbiertaId !== null ? 1 : 0),
    },
    {
      clave: "acciones",
      etiqueta: "Acciones",
      render: (s) => {
        const enVuelo = accionEnVueloId === s.sucursalId;
        const bloqueaDesactivar = (s.activa && s.sesionAbiertaId !== null) || enVuelo;
        const bloqueaAbrirConteo = !s.activa || s.sesionAbiertaId !== null || enVuelo;
        const tituloAbrirConteo = !s.activa
          ? "Activa la sucursal primero"
          : s.sesionAbiertaId !== null
            ? "Ya hay un conteo abierto en esta sucursal"
            : undefined;
        return (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => abrirEdicion(s)}
              className="rounded-placa border border-borde px-2.5 py-1.5 text-micro text-tinta hover:border-senal hover:text-senal"
            >
              Editar
            </button>
            <button
              type="button"
              onClick={() => void alternarActiva(s)}
              disabled={bloqueaDesactivar}
              title={
                bloqueaDesactivar && !enVuelo ? `${s.nombre} tiene una sesión abierta` : undefined
              }
              className="inline-flex items-center gap-1.5 rounded-placa border border-borde px-2.5 py-1.5 text-micro text-tinta hover:border-senal hover:text-senal disabled:cursor-not-allowed disabled:text-tenue disabled:opacity-40 disabled:hover:border-borde disabled:hover:text-tenue"
            >
              {enVuelo && <Spinner className="size-3.5 shrink-0" />}
              {s.activa ? "Desactivar" : "Activar"}
            </button>
            <button
              type="button"
              onClick={() => void abrirConteo(s)}
              disabled={bloqueaAbrirConteo}
              title={enVuelo ? undefined : tituloAbrirConteo}
              className="inline-flex items-center gap-1.5 rounded-placa border border-borde px-2.5 py-1.5 text-micro text-tinta hover:border-senal hover:text-senal disabled:cursor-not-allowed disabled:text-tenue disabled:opacity-40 disabled:hover:border-borde disabled:hover:text-tenue"
            >
              {enVuelo && <Spinner className="size-3.5 shrink-0" />}
              Abrir conteo
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <section className="p-6">
      <header className="flex items-center justify-between pb-4">
        <h1 className="text-micro tracking-[0.18em] text-tenue uppercase">Sucursales</h1>
        <button
          type="button"
          onClick={abrirCreacion}
          className="rounded-placa bg-senal px-3 py-2 text-micro font-semibold text-fondo hover:bg-senal/85"
        >
          Nueva sucursal
        </button>
      </header>

      {aviso && (
        <p
          role="status"
          className="mb-4 flex items-center justify-between gap-3 rounded-placa border border-borde bg-placa px-3 py-2 text-micro text-tinta"
        >
          {aviso}
          <button
            type="button"
            onClick={() => setAviso(null)}
            className="shrink-0 text-tenue hover:text-tinta"
          >
            Entendido
          </button>
        </p>
      )}

      {errorAccion && (
        <p
          role="alert"
          className="mb-4 rounded-placa border border-riesgo bg-riesgo-placa px-3 py-2 text-micro text-tinta"
        >
          {errorAccion}
        </p>
      )}

      {formulario && (
        <FormularioSucursal
          modo={formulario.modo}
          sucursal={formulario.modo === "editar" ? formulario.sucursal : undefined}
          error={errorFormulario}
          onCancelar={cerrarFormulario}
          onCrear={crear}
          onEditar={editar}
        />
      )}

      <Tabla
        columnas={columnas}
        filas={sucursales}
        claveFila={(s) => s.sucursalId}
        etiqueta="Sucursales"
        vacio="No hay sucursales registradas."
      />
    </section>
  );
}

interface FormularioSucursalProps {
  readonly modo: "crear" | "editar";
  readonly sucursal?: Sucursal;
  readonly error: string | null;
  readonly onCancelar: () => void;
  readonly onCrear: (payload: CrearSucursalPayload) => void | Promise<void>;
  readonly onEditar: (payload: ActualizarSucursalPayload) => void | Promise<void>;
}

function FormularioSucursal({
  modo,
  sucursal,
  error,
  onCancelar,
  onCrear,
  onEditar,
}: FormularioSucursalProps) {
  const [nombre, setNombre] = useState(sucursal?.nombre ?? "");
  const [direccion, setDireccion] = useState(sucursal?.direccion ?? "");
  const [conectividad, setConectividad] = useState<Conectividad>(sucursal?.conectividad ?? "wifi");
  const [enviando, setEnviando] = useState(false);

  const idNombre = useId();
  const idDireccion = useId();
  const idConectividad = useId();

  async function manejarEnvio(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setEnviando(true);
    try {
      if (modo === "crear") {
        await onCrear({ nombre, direccion, conectividad });
      } else if (sucursal) {
        await onEditar({
          sucursalId: sucursal.sucursalId,
          nombre,
          direccion,
          conectividad,
          activa: sucursal.activa,
        });
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
      <div className="grid grid-cols-2 gap-4">
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

        <div>
          <label htmlFor={idDireccion} className="mb-1.5 block text-micro text-tenue">
            Dirección
          </label>
          <input
            id={idDireccion}
            value={direccion}
            onChange={(e) => setDireccion(e.target.value)}
            required
            className={CAMPO}
          />
        </div>

        <div>
          <label htmlFor={idConectividad} className="mb-1.5 block text-micro text-tenue">
            Conectividad
          </label>
          <select
            id={idConectividad}
            value={conectividad}
            onChange={(e) => setConectividad(e.target.value as Conectividad)}
            className={CAMPO}
          >
            {CONECTIVIDADES.map((c) => (
              <option key={c.valor} value={c.valor}>
                {c.etiqueta}
              </option>
            ))}
          </select>
        </div>
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
          {modo === "crear" ? "Crear sucursal" : "Guardar cambios"}
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
