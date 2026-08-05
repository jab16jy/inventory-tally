// apps/web/src/ui/ConteoScreen.tsx (doc 11 §4) — la pantalla crítica del
// sistema: sin importes, sólo unidades (I-9).
//
// F2 (plan §7) completa la cabecera (progreso + ChipEstado), la búsqueda,
// el filtro "sólo pendientes" (doc 10 §2, "la función más útil del
// dashboard"), el Deck de totales y la Hoja con teclado numérico.
import { useCallback, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { estaPendiente, siguientePendiente, totalUnidadesSesion } from "@conteo/shared";
import { useConteoRepository } from "../state/repositorio-contexto.js";
import { useConexion } from "../state/useConexion.js";
import { useLineasSesion } from "../state/useLineasSesion.js";
import { useMiAporte } from "../state/useMiAporte.js";
import { usePendientes } from "../state/usePendientes.js";
import { BannerPendientes } from "./BannerPendientes.js";
import { FilaCategoria } from "./FilaCategoria.js";
import { BarraProgreso } from "./primitivos/BarraProgreso.js";
import { ChipEstado } from "./primitivos/ChipEstado.js";
import { Deck } from "./primitivos/Deck.js";
import { Hoja } from "./primitivos/Hoja.js";
import { Icono } from "./primitivos/Icono.js";

export function ConteoScreen() {
  // Valor por defecto para no romper las reglas de hooks con un return
  // condicional antes de useLineasSesion/usePendientes; la ruta siempre
  // provee :sesionId cuando este componente se monta desde el router.
  const { sesionId = "" } = useParams<{ sesionId: string }>();
  const repo = useConteoRepository();
  const navigate = useNavigate();
  const uid = repo.uidActual();

  const lineas = useLineasSesion(sesionId);
  const escriturasPendientes = usePendientes(sesionId);
  const enLinea = useConexion();

  const [busqueda, setBusqueda] = useState("");
  const [soloPendientes, setSoloPendientes] = useState(false);
  const [categoriaEnEdicion, setCategoriaEnEdicion] = useState<string | null>(null);

  // "Tu aporte" del Deck: cada fila YA tiene abierto useMiAporte para sí
  // misma (FilaCategoria) y sólo REPORTA su número hacia acá (ver el
  // comentario de onCantidadPropiaCambio en FilaCategoria.tsx) — ninguna
  // suscripción nueva por categoría. El total sobrevive a que una fila se
  // oculte por el filtro/búsqueda porque, al arrancar sin filtros, todas
  // montan una vez y reportan su valor real antes de que el cajero pueda
  // ocultarlas.
  const misCantidadesRef = useRef<Map<string, number>>(new Map());
  const [tuAporteTotal, setTuAporteTotal] = useState(0);
  const manejarCantidadPropia = useCallback((categoriaId: string, cantidad: number): void => {
    const mapa = misCantidadesRef.current;
    const anterior = mapa.get(categoriaId) ?? 0;
    if (anterior === cantidad) return;
    mapa.set(categoriaId, cantidad);
    setTuAporteTotal((total) => total - anterior + cantidad);
  }, []);
  const abrirHoja = useCallback((categoriaId: string): void => {
    setCategoriaEnEdicion(categoriaId);
  }, []);

  const lineaEnEdicion = lineas.find((l) => l.categoriaId === categoriaEnEdicion) ?? null;
  // Única suscripción extra, y sólo mientras la Hoja está abierta: precarga
  // el teclado con lo que el cajero ya tenía registrado para esa categoría.
  const miAporteEnEdicion = useMiAporte(sesionId, categoriaEnEdicion ?? "");

  function confirmarDesdeHoja(cantidad: number): void {
    if (!categoriaEnEdicion) return;
    void repo.registrarAporte({ sesionId, categoriaId: categoriaEnEdicion, cantidad });
    // Avanza sola a la siguiente pendiente (plan §5) — o cierra si el
    // cajero ya terminó el catálogo.
    setCategoriaEnEdicion(siguientePendiente(lineas, uid, categoriaEnEdicion));
  }

  const total = lineas.length;
  const contadas = lineas.filter((l) => !estaPendiente(l, uid)).length;
  const equipoTotal = totalUnidadesSesion(lineas);

  const estadoSync: "sincronizado" | "pendiente" | "sin-conexion" = !enLinea
    ? "sin-conexion" // el único estado que el sistema pinta en rojo (plan §1)
    : escriturasPendientes > 0
      ? "pendiente"
      : "sincronizado";

  const consulta = busqueda.trim().toLowerCase();
  const soloDigitos = consulta.replace(/\D/g, "");
  const lineasVisibles = lineas.filter((linea) => {
    if (soloPendientes && !estaPendiente(linea, uid)) return false;
    if (!consulta) return true;
    return (
      linea.etiqueta.toLowerCase().includes(consulta) ||
      (soloDigitos !== "" && String(linea.valorUnitario).includes(soloDigitos))
    );
  });

  return (
    <section className="mx-auto flex min-h-dvh max-w-md flex-col px-3 pt-3">
      <header className="flex flex-col gap-2 pb-2">
        <div className="flex items-center justify-between gap-2">
          <BarraProgreso contadas={contadas} total={total} />
          <ChipEstado estado={estadoSync} />
        </div>

        <div className="flex items-center gap-2">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Buscar por valor o etiqueta</span>
            <Icono
              nombre="buscar"
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-tenue"
            />
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar valor…"
              className="min-h-[var(--size-toque)] w-full rounded-placa border border-borde bg-fondo py-2 pr-3 pl-9 text-tinta placeholder:text-tenue focus:border-senal focus:outline-none"
            />
          </label>

          <button
            type="button"
            aria-pressed={soloPendientes}
            onClick={() => setSoloPendientes((v) => !v)}
            className={
              "flex min-h-[var(--size-toque)] shrink-0 items-center gap-1.5 rounded-placa border px-3 text-micro font-semibold " +
              (soloPendientes ? "border-senal text-senal" : "border-borde text-tenue")
            }
          >
            <Icono nombre="filtro" className="size-4" />
            Pendientes
          </button>
        </div>
      </header>

      <BannerPendientes pendientes={escriturasPendientes} />

      <ul className="mt-1 flex flex-1 flex-col gap-2 overflow-y-auto pb-4">
        {lineasVisibles.map((linea) => (
          <FilaCategoria
            key={linea.categoriaId}
            sesionId={sesionId}
            linea={linea}
            onSeleccionar={abrirHoja}
            onCantidadPropiaCambio={manejarCantidadPropia}
          />
        ))}
      </ul>

      <Deck
        tuAporte={tuAporteTotal}
        equipo={equipoTotal}
        onFinalizar={() => navigate(`/conteo/${sesionId}/finalizar`)}
      />

      <Hoja
        abierta={lineaEnEdicion !== null}
        etiqueta={lineaEnEdicion?.etiqueta ?? ""}
        valorInicial={miAporteEnEdicion?.cantidad ?? 0}
        onConfirmar={confirmarDesdeHoja}
        onVolver={() => setCategoriaEnEdicion(null)}
      />
    </section>
  );
}
