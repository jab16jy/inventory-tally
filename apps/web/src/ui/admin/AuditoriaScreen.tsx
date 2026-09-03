// apps/web/src/ui/admin/AuditoriaScreen.tsx (docs/plan-panel-administrador.md
// §5, fase F3) — historial paginado de auditoría (R6). `siguienteCursor` es
// OPACO, igual que en SesionesScreen.tsx: sólo se guarda y se devuelve.
//
// ponytail: los filtros van UNO A LA VEZ (tipo | sucursalId | usuarioId |
// sesionId) — `FiltroAuditoria` ya está tipado como unión de un solo campo
// porque cada combinación exigiría su propio índice compuesto en Firestore.
// Añadir índices y un filtro combinado si el negocio pide combinarlos.
import { useEffect, useId, useMemo, useState } from "react";
import type {
  EventoAuditoria,
  TipoEventoAuditoria,
} from "@conteo/shared/models/evento-auditoria.js";
import type { Sucursal } from "@conteo/shared/models/sucursal.js";
import type { Usuario } from "@conteo/shared/models/usuario.js";
import type { FiltroAuditoria } from "@conteo/data";
import { fecha } from "../../lib/formato.js";
import { useAdminRepository } from "../../state/admin-contexto.js";
import { Tabla, type ColumnaTabla } from "./Tabla.js";
import { describirContexto, obtenerAutor, obtenerNombreSucursal } from "./auditoria-helpers.js";
import { ModalDetalleAuditoria } from "./ModalDetalleAuditoria.js";

// `Record<TipoEventoAuditoria, string>` es exhaustivo POR CONSTRUCCIÓN: a
// `tsc` le falta una rama si el catálogo crece y no se le agrega su etiqueta
// aquí — verificado añadiendo un 15º miembro temporal a TipoEventoAuditoria
// y corriendo `npm run typecheck` (falla con la propiedad faltante en este
// literal). Un `as const` con `satisfies` NO da esta garantía: `satisfies`
// no impide que el array se quede corto.
const ETIQUETAS_TIPO_EVENTO: Record<TipoEventoAuditoria, string> = {
  APORTE_CREADO: "Aporte creado",
  APORTE_MODIFICADO: "Aporte modificado",
  SESION_ABIERTA: "Sesión abierta",
  SESION_CERRADA: "Sesión cerrada",
  CIERRE_BLOQUEADO: "Cierre bloqueado",
  USUARIO_CREADO: "Usuario creado",
  USUARIO_ACTUALIZADO: "Usuario actualizado",
  USUARIO_DESACTIVADO: "Usuario desactivado",
  USUARIO_ELIMINADO: "Usuario eliminado",
  CATEGORIA_CREADA: "Categoría creada",
  CATEGORIA_ACTUALIZADA: "Categoría actualizada",
  CATEGORIA_DESACTIVADA: "Categoría desactivada",
  CATEGORIA_ELIMINADA: "Categoría eliminada",
  CATEGORIA_REACTIVADA: "Categoría reactivada",
  AREA_CREADA: "Área creada",
  AREA_ACTUALIZADA: "Área actualizada",
  AREA_DESACTIVADA: "Área desactivada",
  AREA_ELIMINADA: "Área eliminada",
  AREA_REACTIVADA: "Área reactivada",
  // Emisor histórico, retirado (ADR-22 reemplaza vincularArea por
  // reetiquetarLineaEnSesion): ya no lo emite ninguna callable, pero queda en
  // el catálogo porque auditoría es inmutable (I-5) — eventos ya escritos
  // siguen existiendo y deben poder etiquetarse al leerlos.
  AREA_VINCULADA: "Área vinculada",
  // La acción de catálogo que puede originar un CAJERO, no el admin
  // (ADR-22, supersede parcial de ADR-21): reetiquetar el área de una línea
  // cuya categoría sigue sin área fija, desde su conteo. Lleva `sucursalId`,
  // así que su propio cajero la ve en esta misma pantalla acotada a sus
  // sucursales (ticket #45).
  LINEA_REETIQUETADA: "Línea reetiquetada",
  SUCURSAL_CREADA: "Sucursal creada",
  SUCURSAL_ACTUALIZADA: "Sucursal actualizada",
  SUCURSAL_ELIMINADA: "Sucursal eliminada",
  RECONCILIACION: "Reconciliación",
  AUDITORIA_PURGADA: "Auditoría purgada",
};

// Runtime deriva del Record de arriba, nunca de un array literal aparte
// (docs/plan-panel-administrador.md §5): los tipos se borran al compilar, así
// que esto es lo único que puede iterar la unión sin arriesgarse a que un
// tipo nuevo quede invisible en el filtro.
const TIPOS_EVENTO = Object.keys(ETIQUETAS_TIPO_EVENTO) as TipoEventoAuditoria[];

type CampoFiltro = "" | "tipo" | "sucursalId" | "usuarioId" | "sesionId";

const CAMPOS: readonly { readonly valor: CampoFiltro; readonly etiqueta: string }[] = [
  { valor: "", etiqueta: "Ninguno" },
  { valor: "tipo", etiqueta: "Tipo" },
  { valor: "sucursalId", etiqueta: "Sucursal" },
  { valor: "usuarioId", etiqueta: "Usuario" },
  { valor: "sesionId", etiqueta: "Sesión" },
];

function construirFiltro(campo: CampoFiltro, valor: string): FiltroAuditoria {
  if (!campo || !valor) return null;
  if (campo === "tipo") return { campo: "tipo", valor: valor as TipoEventoAuditoria };
  return { campo, valor };
}

function useUsuarios(): Usuario[] {
  const repo = useAdminRepository();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  useEffect(() => repo.observarUsuarios(setUsuarios), [repo]);
  return usuarios;
}

function useSucursales(): Sucursal[] {
  const repo = useAdminRepository();
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  useEffect(() => repo.observarSucursales(setSucursales), [repo]);
  return sucursales;
}

function useAuditoriaPaginada(campo: CampoFiltro, valor: string) {
  const repo = useAdminRepository();
  const [eventos, setEventos] = useState<EventoAuditoria[]>([]);
  const [siguienteCursor, setSiguienteCursor] = useState<unknown | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError(null);
    repo
      .listarAuditoria(construirFiltro(campo, valor))
      .then((pagina) => {
        if (cancelado) return;
        setEventos([...pagina.items]);
        setSiguienteCursor(pagina.siguienteCursor);
        setCargando(false);
      })
      .catch(() => {
        // Mismo hueco que SesionesScreen.tsx: sin `.catch()` un rechazo deja
        // `cargando` en `true` para siempre (esqueleto permanente) y sale
        // como unhandled rejection.
        if (cancelado) return;
        setCargando(false);
        setError("No se pudieron cargar los eventos de auditoría. Intenta de nuevo.");
      });
    return () => {
      cancelado = true;
    };
  }, [repo, campo, valor]);

  async function cargarMas(): Promise<void> {
    setError(null);
    try {
      const pagina = await repo.listarAuditoria(construirFiltro(campo, valor), siguienteCursor);
      setEventos((actual) => [...actual, ...pagina.items]);
      setSiguienteCursor(pagina.siguienteCursor);
    } catch {
      setError("No se pudieron cargar más eventos. Intenta de nuevo.");
    }
  }

  return { eventos, siguienteCursor, cargando, error, cargarMas };
}

export function AuditoriaScreen() {
  const [campo, setCampo] = useState<CampoFiltro>("");
  const [valor, setValor] = useState("");
  const [eventoSeleccionado, setEventoSeleccionado] = useState<EventoAuditoria | null>(null);

  const usuarios = useUsuarios();
  const sucursales = useSucursales();

  const usuariosMap = useMemo(() => new Map(usuarios.map((u) => [u.uid, u])), [usuarios]);
  const sucursalesMap = useMemo(
    () => new Map(sucursales.map((s) => [s.sucursalId, s])),
    [sucursales],
  );

  const { eventos, siguienteCursor, cargando, error, cargarMas } = useAuditoriaPaginada(
    campo,
    valor,
  );

  const idCampo = useId();
  const idValor = useId();

  const columnas: ColumnaTabla<EventoAuditoria>[] = [
    {
      clave: "ocurrido",
      etiqueta: "Ocurrido",
      render: (e) => fecha(e.ocurridoEn),
      valorOrden: (e) => e.ocurridoEn.getTime(),
    },
    {
      clave: "tipo",
      etiqueta: "Evento",
      render: (e) => ETIQUETAS_TIPO_EVENTO[e.tipo],
      valorOrden: (e) => ETIQUETAS_TIPO_EVENTO[e.tipo],
    },
    {
      clave: "autor",
      etiqueta: "Autor",
      render: (e) => {
        const autor = obtenerAutor(e, usuariosMap);
        return (
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-tinta">{autor.nombre}</span>
            {autor.rol && (
              <span className="rounded-placa border border-borde bg-placa px-1.5 py-0.5 text-micro text-tenue">
                {autor.rol}
              </span>
            )}
          </div>
        );
      },
      valorOrden: (e) => obtenerAutor(e, usuariosMap).nombre,
    },
    {
      clave: "sucursal",
      etiqueta: "Sucursal",
      render: (e) => obtenerNombreSucursal(e, sucursalesMap),
      valorOrden: (e) => obtenerNombreSucursal(e, sucursalesMap),
    },
    {
      clave: "contexto",
      etiqueta: "Contexto",
      render: (e) => <span className="text-micro text-tenue">{describirContexto(e)}</span>,
    },
    {
      clave: "acciones",
      etiqueta: "Acciones",
      render: (e) => (
        <button
          type="button"
          onClick={() => setEventoSeleccionado(e)}
          aria-label={`Detalle de evento ${e.eventoId}`}
          className="rounded-placa border border-borde px-2.5 py-1 text-micro font-semibold text-tinta transition-colors duration-150 ease-out hover:border-senal hover:text-senal"
        >
          Detalle →
        </button>
      ),
      alinearDerecha: true,
    },
  ];

  return (
    <section className="p-6">
      <header className="pb-4">
        <h1 className="text-micro tracking-[0.18em] text-tenue uppercase">Auditoría</h1>
      </header>

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-placa border border-riesgo bg-riesgo-placa px-3 py-2 text-micro text-tinta"
        >
          {error}
        </p>
      )}

      <div className="mb-4 flex gap-4">
        <div>
          <label htmlFor={idCampo} className="mb-1.5 block text-micro text-tenue">
            Filtrar por
          </label>
          <select
            id={idCampo}
            value={campo}
            onChange={(e) => {
              setCampo(e.target.value as CampoFiltro);
              setValor("");
            }}
            className="min-h-[var(--size-toque)] rounded-placa border border-borde bg-fondo px-3 text-tinta focus:border-senal focus:outline-none"
          >
            {CAMPOS.map((c) => (
              <option key={c.valor} value={c.valor}>
                {c.etiqueta}
              </option>
            ))}
          </select>
        </div>

        {campo === "tipo" && (
          <div>
            <label htmlFor={idValor} className="mb-1.5 block text-micro text-tenue">
              Tipo
            </label>
            <select
              id={idValor}
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              className="min-h-[var(--size-toque)] rounded-placa border border-borde bg-fondo px-3 text-tinta focus:border-senal focus:outline-none"
            >
              <option value="">Selecciona…</option>
              {TIPOS_EVENTO.map((t) => (
                <option key={t} value={t}>
                  {ETIQUETAS_TIPO_EVENTO[t]}
                </option>
              ))}
            </select>
          </div>
        )}

        {campo === "sucursalId" && (
          <div>
            <label htmlFor={idValor} className="mb-1.5 block text-micro text-tenue">
              Sucursal
            </label>
            <select
              id={idValor}
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              className="min-h-[var(--size-toque)] rounded-placa border border-borde bg-fondo px-3 text-tinta focus:border-senal focus:outline-none"
            >
              <option value="">Todas</option>
              {sucursales.map((s) => (
                <option key={s.sucursalId} value={s.sucursalId}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </div>
        )}

        {campo === "usuarioId" && (
          <div>
            <label htmlFor={idValor} className="mb-1.5 block text-micro text-tenue">
              Usuario
            </label>
            <select
              id={idValor}
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              className="min-h-[var(--size-toque)] rounded-placa border border-borde bg-fondo px-3 text-tinta focus:border-senal focus:outline-none"
            >
              <option value="">Todos</option>
              {usuarios.map((u) => (
                <option key={u.uid} value={u.uid}>
                  {u.nombre}
                </option>
              ))}
            </select>
          </div>
        )}

        {campo === "sesionId" && (
          <div>
            <label htmlFor={idValor} className="mb-1.5 block text-micro text-tenue">
              Sesión
            </label>
            <input
              id={idValor}
              value={valor}
              placeholder="ID de sesión"
              onChange={(e) => setValor(e.target.value)}
              className="min-h-[var(--size-toque)] rounded-placa border border-borde bg-fondo px-3 text-tinta focus:border-senal focus:outline-none"
            />
          </div>
        )}
      </div>

      <Tabla
        columnas={columnas}
        filas={eventos}
        claveFila={(e) => e.eventoId}
        etiqueta="Auditoría"
        vacio="No hay eventos que coincidan con el filtro."
        cargando={cargando}
      />

      {siguienteCursor !== null && (
        <button
          type="button"
          onClick={() => void cargarMas()}
          className="mt-4 rounded-placa border border-borde px-4 py-2 text-micro text-tinta hover:border-senal hover:text-senal"
        >
          Cargar más
        </button>
      )}

      <ModalDetalleAuditoria
        evento={eventoSeleccionado}
        onCerrar={() => setEventoSeleccionado(null)}
        usuariosMap={usuariosMap}
        sucursalesMap={sucursalesMap}
      />
    </section>
  );
}
