// apps/web/src/ui/admin/SesionesScreen.tsx (docs/plan-panel-administrador.md
// §5, fase F3) — historial paginado de sesiones (R4). `siguienteCursor` es
// OPACO (doc admin-repository.ts): sólo se guarda en estado y se devuelve
// tal cual al repositorio, nunca se inspecciona ni se decodifica.
import { useEffect, useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { EstadoSesion, SesionConteo } from "@conteo/shared/models/sesion-conteo.js";
import type { Sucursal } from "@conteo/shared/models/sucursal.js";
import type { FiltroSesiones } from "@conteo/data";
import { fecha, numero } from "../../lib/formato.js";
import { useAdminRepository } from "../../state/admin-contexto.js";
import { Tabla, type ColumnaTabla } from "./Tabla.js";

const ESTADOS: readonly { readonly valor: EstadoSesion; readonly etiqueta: string }[] = [
  { valor: "abierta", etiqueta: "Abierta" },
  { valor: "cerrada", etiqueta: "Cerrada" },
];

function construirFiltro(sucursalId: string, estado: string): FiltroSesiones {
  return {
    ...(sucursalId && { sucursalId }),
    ...(estado && { estado: estado as EstadoSesion }),
  };
}

function useSucursales(): Sucursal[] {
  const repo = useAdminRepository();
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  useEffect(() => repo.observarSucursales(setSucursales), [repo]);
  return sucursales;
}

function useSesionesPaginadas(sucursalId: string, estado: string) {
  const repo = useAdminRepository();
  const [sesiones, setSesiones] = useState<SesionConteo[]>([]);
  const [siguienteCursor, setSiguienteCursor] = useState<unknown | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError(null);
    repo
      .listarSesiones(construirFiltro(sucursalId, estado))
      .then((pagina) => {
        if (cancelado) return;
        setSesiones([...pagina.items]);
        setSiguienteCursor(pagina.siguienteCursor);
        setCargando(false);
      })
      .catch(() => {
        // Sin esto el rechazo (sin índice en producción, regla que deniega,
        // sin red) deja `cargando` en `true` para siempre: el esqueleto se
        // queda pintado, y el rechazo sale como unhandled rejection.
        if (cancelado) return;
        setCargando(false);
        setError("No se pudieron cargar las sesiones. Intenta de nuevo.");
      });
    return () => {
      cancelado = true;
    };
  }, [repo, sucursalId, estado]);

  async function cargarMas(): Promise<void> {
    setError(null);
    try {
      const pagina = await repo.listarSesiones(
        construirFiltro(sucursalId, estado),
        siguienteCursor,
      );
      setSesiones((actual) => [...actual, ...pagina.items]);
      setSiguienteCursor(pagina.siguienteCursor);
    } catch {
      setError("No se pudieron cargar más sesiones. Intenta de nuevo.");
    }
  }

  return { sesiones, siguienteCursor, cargando, error, cargarMas };
}

export function SesionesScreen() {
  const sucursales = useSucursales();
  const [sucursalId, setSucursalId] = useState("");
  const [estado, setEstado] = useState("");
  const { sesiones, siguienteCursor, cargando, error, cargarMas } = useSesionesPaginadas(
    sucursalId,
    estado,
  );
  const navigate = useNavigate();

  const idSucursal = useId();
  const idEstado = useId();

  const columnas: ColumnaTabla<SesionConteo>[] = [
    {
      clave: "sucursal",
      etiqueta: "Sucursal",
      render: (s) => s.sucursalNombre,
      valorOrden: (s) => s.sucursalNombre,
    },
    {
      clave: "estado",
      etiqueta: "Estado",
      render: (s) => (s.estado === "abierta" ? "Abierta" : "Cerrada"),
      valorOrden: (s) => s.estado,
    },
    {
      clave: "abierta",
      etiqueta: "Abierta",
      render: (s) => fecha(s.abiertaEn),
      valorOrden: (s) => s.abiertaEn.getTime(),
    },
    {
      clave: "cerrada",
      etiqueta: "Cerrada",
      render: (s) => (s.cerradaEn ? fecha(s.cerradaEn) : "—"),
      valorOrden: (s) => s.cerradaEn?.getTime() ?? 0,
    },
    {
      clave: "unidades",
      etiqueta: "Unidades",
      render: (s) => numero(s.totalUnidades),
      valorOrden: (s) => s.totalUnidades,
      alinearDerecha: true,
    },
    {
      clave: "participantes",
      etiqueta: "Participantes",
      render: (s) => numero(s.participantes.length),
      valorOrden: (s) => s.participantes.length,
      alinearDerecha: true,
    },
    {
      clave: "acciones",
      etiqueta: "Acciones",
      render: (s) => (
        // Entrada al análisis (F5): navega, no calcula nada aquí. Es la
        // única acción para llegar al dashboard desde el historial —
        // PanelScreen sólo cubre sesiones ABIERTAS.
        <button
          type="button"
          onClick={() => navigate(`/admin/sesiones/${s.sesionId}/analisis`)}
          aria-label={`Análisis — ${s.sucursalNombre}`}
          className="shrink-0 rounded-placa border border-borde px-3 py-2 text-micro font-semibold text-tinta transition-colors duration-150 ease-out hover:border-senal hover:text-senal"
        >
          Análisis →
        </button>
      ),
    },
  ];

  return (
    <section className="p-6">
      <header className="pb-4">
        <h1 className="text-micro tracking-[0.18em] text-tenue uppercase">Sesiones</h1>
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
          <label htmlFor={idSucursal} className="mb-1.5 block text-micro text-tenue">
            Sucursal
          </label>
          <select
            id={idSucursal}
            value={sucursalId}
            onChange={(e) => setSucursalId(e.target.value)}
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

        <div>
          <label htmlFor={idEstado} className="mb-1.5 block text-micro text-tenue">
            Estado
          </label>
          <select
            id={idEstado}
            value={estado}
            onChange={(e) => setEstado(e.target.value)}
            className="min-h-[var(--size-toque)] rounded-placa border border-borde bg-fondo px-3 text-tinta focus:border-senal focus:outline-none"
          >
            <option value="">Todos</option>
            {ESTADOS.map((e) => (
              <option key={e.valor} value={e.valor}>
                {e.etiqueta}
              </option>
            ))}
          </select>
        </div>
      </div>

      <Tabla
        columnas={columnas}
        filas={sesiones}
        claveFila={(s) => s.sesionId}
        etiqueta="Sesiones"
        vacio="No hay sesiones que coincidan con el filtro."
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
    </section>
  );
}
