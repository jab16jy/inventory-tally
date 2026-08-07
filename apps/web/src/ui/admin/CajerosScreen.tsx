// apps/web/src/ui/admin/CajerosScreen.tsx (docs/plan-panel-administrador.md
// §5, fase F2) — CRUD de usuarios: crear, editar, desactivar, reactivar.
//
// Sin comprobación de correo duplicado en cliente: `crearCajero` ya la hace
// (Auth es la fuente de verdad) y `already-exists` mapea a un mensaje claro
// aquí — duplicarla en el cliente es una segunda fuente de verdad que se
// puede desincronizar de la real.
import { FirebaseError } from "firebase/app";
import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import type { Sucursal } from "@conteo/shared/models/sucursal.js";
import type { RolUsuario, Usuario } from "@conteo/shared/models/usuario.js";
import type { ActualizarCajeroPayload, CrearCajeroPayload } from "@conteo/data";
import { fecha } from "../../lib/formato.js";
import { useAdminRepository } from "../../state/admin-contexto.js";
import { Tabla, type ColumnaTabla } from "./Tabla.js";

const CAMPO =
  "w-full min-h-[var(--size-toque)] rounded-placa border border-borde bg-fondo px-3 " +
  "text-tinta placeholder:text-tenue focus:border-senal focus:outline-none";

const ROLES: readonly { readonly valor: RolUsuario; readonly etiqueta: string }[] = [
  { valor: "cajero", etiqueta: "Cajero" },
  { valor: "admin", etiqueta: "Administrador" },
];

function useUsuarios(): Usuario[] {
  const repo = useAdminRepository();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  useEffect(() => repo.observarUsuarios(setUsuarios), [repo]);
  return usuarios;
}

function useSucursalesTodas(): Sucursal[] {
  const repo = useAdminRepository();
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  useEffect(() => repo.observarSucursales(setSucursales), [repo]);
  return sucursales;
}

type EstadoFormulario =
  { readonly modo: "crear" } | { readonly modo: "editar"; readonly usuario: Usuario };

export function CajerosScreen() {
  const repo = useAdminRepository();
  const usuarios = useUsuarios();
  const sucursales = useSucursalesTodas();
  const nombresSucursal = useMemo(
    () => new Map(sucursales.map((s) => [s.sucursalId, s.nombre])),
    [sucursales],
  );

  const [formulario, setFormulario] = useState<EstadoFormulario | null>(null);
  const [errorFormulario, setErrorFormulario] = useState<string | null>(null);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);
  // ponytail: confirmación inline de un paso (botón → "¿Confirmar?") en vez
  // de un <dialog>: desactivar es reversible (reactivarCajero existe), así
  // que no hace falta el foco atrapado que sí se gana ModalSesionCerrada.tsx
  // para una interrupción real (craft-floor: "modal para una tarea que no
  // necesita foco protegido").
  const [confirmandoUid, setConfirmandoUid] = useState<string | null>(null);

  function abrirCreacion(): void {
    setFormulario({ modo: "crear" });
    setErrorFormulario(null);
  }

  function abrirEdicion(usuario: Usuario): void {
    setFormulario({ modo: "editar", usuario });
    setErrorFormulario(null);
  }

  function cerrarFormulario(): void {
    setFormulario(null);
    setErrorFormulario(null);
  }

  async function crear(payload: CrearCajeroPayload): Promise<void> {
    try {
      await repo.crearCajero(payload);
      cerrarFormulario();
    } catch (error) {
      if (error instanceof FirebaseError && error.code === "functions/already-exists") {
        setErrorFormulario("Ya existe un cajero con ese correo.");
      } else {
        setErrorFormulario("No se pudo crear el cajero. Intenta de nuevo.");
      }
    }
  }

  async function editar(payload: ActualizarCajeroPayload): Promise<void> {
    try {
      await repo.actualizarCajero(payload);
      cerrarFormulario();
    } catch {
      setErrorFormulario("No se pudo guardar el cajero. Intenta de nuevo.");
    }
  }

  async function desactivar(usuario: Usuario): Promise<void> {
    setErrorAccion(null);
    try {
      await repo.desactivarCajero(usuario.uid);
    } catch {
      setErrorAccion(`No se pudo desactivar a ${usuario.nombre}. Intenta de nuevo.`);
    } finally {
      // `finally` a propósito: la confirmación inline ("¿Desactivar a X?") no
      // puede quedar pegada en ningún desenlace. En éxito ya no hace falta;
      // en error el admin necesita volver al botón "Desactivar" para
      // reintentar en vez de ver los mismos "Confirmar"/"Cancelar" sin salida.
      setConfirmandoUid(null);
    }
  }

  async function reactivar(usuario: Usuario): Promise<void> {
    setErrorAccion(null);
    try {
      await repo.reactivarCajero(usuario.uid);
    } catch {
      setErrorAccion(`No se pudo reactivar a ${usuario.nombre}. Intenta de nuevo.`);
    }
  }

  const columnas: ColumnaTabla<Usuario>[] = [
    { clave: "nombre", etiqueta: "Nombre", render: (u) => u.nombre, valorOrden: (u) => u.nombre },
    { clave: "correo", etiqueta: "Correo", render: (u) => u.correo, valorOrden: (u) => u.correo },
    {
      clave: "rol",
      etiqueta: "Rol",
      render: (u) => (u.rol === "admin" ? "Administrador" : "Cajero"),
      valorOrden: (u) => u.rol,
    },
    {
      clave: "sucursales",
      etiqueta: "Sucursales",
      render: (u) =>
        u.sucursalesAsignadas.length === 0
          ? "—"
          : u.sucursalesAsignadas.map((id) => nombresSucursal.get(id) ?? id).join(", "),
    },
    {
      clave: "activo",
      etiqueta: "Activo",
      render: (u) => (u.activo ? "Sí" : "No"),
      valorOrden: (u) => (u.activo ? 1 : 0),
    },
    {
      clave: "pwaInstalada",
      etiqueta: "PWA instalada",
      render: (u) => (u.pwaInstalada ? "Sí" : "No"),
      valorOrden: (u) => (u.pwaInstalada ? 1 : 0),
    },
    {
      clave: "ultimoAcceso",
      etiqueta: "Último acceso",
      render: (u) => (u.ultimoAccesoEn ? fecha(u.ultimoAccesoEn) : "Nunca"),
      valorOrden: (u) => u.ultimoAccesoEn?.getTime() ?? 0,
    },
    {
      clave: "acciones",
      etiqueta: "Acciones",
      render: (u) => (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => abrirEdicion(u)}
            className="rounded-placa border border-borde px-2.5 py-1.5 text-micro text-tinta hover:border-senal hover:text-senal"
          >
            Editar
          </button>

          {u.activo ? (
            confirmandoUid === u.uid ? (
              <span className="inline-flex items-center gap-2">
                <span className="text-micro text-tenue">¿Desactivar a {u.nombre}?</span>
                <button
                  type="button"
                  onClick={() => void desactivar(u)}
                  className="rounded-placa border border-riesgo px-2.5 py-1.5 text-micro text-tinta hover:bg-riesgo-placa"
                >
                  Confirmar
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmandoUid(null)}
                  className="rounded-placa border border-borde px-2.5 py-1.5 text-micro text-tenue hover:text-tinta"
                >
                  Cancelar
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmandoUid(u.uid)}
                className="rounded-placa border border-borde px-2.5 py-1.5 text-micro text-tinta hover:border-riesgo hover:text-riesgo"
              >
                Desactivar
              </button>
            )
          ) : (
            <button
              type="button"
              onClick={() => void reactivar(u)}
              className="rounded-placa border border-borde px-2.5 py-1.5 text-micro text-tinta hover:border-senal hover:text-senal"
            >
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
        <h1 className="text-micro tracking-[0.18em] text-tenue uppercase">Cajeros</h1>
        <button
          type="button"
          onClick={abrirCreacion}
          className="rounded-placa bg-senal px-3 py-2 text-micro font-semibold text-fondo hover:bg-senal/85"
        >
          Nuevo cajero
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
        <FormularioCajero
          modo={formulario.modo}
          usuario={formulario.modo === "editar" ? formulario.usuario : undefined}
          sucursales={sucursales}
          error={errorFormulario}
          onCancelar={cerrarFormulario}
          onCrear={crear}
          onEditar={editar}
        />
      )}

      <Tabla
        columnas={columnas}
        filas={usuarios}
        claveFila={(u) => u.uid}
        etiqueta="Cajeros"
        vacio="No hay cajeros registrados."
      />
    </section>
  );
}

interface FormularioCajeroProps {
  readonly modo: "crear" | "editar";
  readonly usuario?: Usuario;
  readonly sucursales: readonly Sucursal[];
  readonly error: string | null;
  readonly onCancelar: () => void;
  readonly onCrear: (payload: CrearCajeroPayload) => void | Promise<void>;
  readonly onEditar: (payload: ActualizarCajeroPayload) => void | Promise<void>;
}

function FormularioCajero({
  modo,
  usuario,
  sucursales,
  error,
  onCancelar,
  onCrear,
  onEditar,
}: FormularioCajeroProps) {
  const [nombre, setNombre] = useState(usuario?.nombre ?? "");
  const [correo, setCorreo] = useState(usuario?.correo ?? "");
  const [passwordTemporal, setPasswordTemporal] = useState("");
  const [rol, setRol] = useState<RolUsuario>(usuario?.rol ?? "cajero");
  const [sucursalesAsignadas, setSucursalesAsignadas] = useState<string[]>([
    ...(usuario?.sucursalesAsignadas ?? []),
  ]);
  const [enviando, setEnviando] = useState(false);

  const idNombre = useId();
  const idCorreo = useId();
  const idPassword = useId();
  const idRol = useId();

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
      if (modo === "crear") {
        await onCrear({ nombre, correo, passwordTemporal, rol, sucursalesAsignadas });
      } else if (usuario) {
        await onEditar({ uid: usuario.uid, nombre, rol, sucursalesAsignadas });
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

        {modo === "crear" && (
          <div>
            <label htmlFor={idCorreo} className="mb-1.5 block text-micro text-tenue">
              Correo
            </label>
            <input
              id={idCorreo}
              type="email"
              autoComplete="username"
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              required
              className={CAMPO}
            />
          </div>
        )}

        <div>
          <label htmlFor={idRol} className="mb-1.5 block text-micro text-tenue">
            Rol
          </label>
          <select
            id={idRol}
            value={rol}
            onChange={(e) => setRol(e.target.value as RolUsuario)}
            className={CAMPO}
          >
            {ROLES.map((r) => (
              <option key={r.valor} value={r.valor}>
                {r.etiqueta}
              </option>
            ))}
          </select>
        </div>

        {modo === "crear" && (
          <div>
            <label htmlFor={idPassword} className="mb-1.5 block text-micro text-tenue">
              Contraseña temporal
            </label>
            <input
              id={idPassword}
              type="password"
              autoComplete="new-password"
              value={passwordTemporal}
              onChange={(e) => setPasswordTemporal(e.target.value)}
              required
              minLength={8}
              pattern=".*\d.*"
              className={CAMPO}
            />
            <p className="mt-1 text-micro text-tenue">
              Mínimo 8 caracteres, con al menos un número.
            </p>
          </div>
        )}
      </div>

      <fieldset>
        <legend className="mb-1.5 text-micro text-tenue">Sucursales asignadas</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {sucursales.map((s) => {
            const idCheckbox = `cajero-sucursal-${s.sucursalId}`;
            return (
              <label
                key={s.sucursalId}
                htmlFor={idCheckbox}
                className="flex items-center gap-1.5 text-base text-tinta"
              >
                <input
                  id={idCheckbox}
                  type="checkbox"
                  checked={sucursalesAsignadas.includes(s.sucursalId)}
                  onChange={() => alternarSucursal(s.sucursalId)}
                />
                {s.nombre}
              </label>
            );
          })}
        </div>
      </fieldset>

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
          {modo === "crear" ? "Crear cajero" : "Guardar cambios"}
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
