// apps/web/src/ui/ConteoScreen.tsx (doc 11 §4) — la pantalla crítica del
// sistema: sin importes, sólo unidades (I-9).
//
// F2 (plan §7) completa la cabecera (progreso + ChipEstado), la búsqueda,
// el filtro "sólo pendientes" (doc 10 §2, "la función más útil del
// dashboard"), el Deck de totales y la Hoja con teclado numérico.
import type { Auth } from "firebase/auth";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  estaPendiente,
  promedioCategoria,
  siguientePendiente,
  totalUnidadesSesion,
  type Area,
} from "@conteo/shared";
import type { ConteoRepository } from "@conteo/data";
import { datos } from "../lib/formato.js";
import { useAuthState } from "../state/useAuthState.js";
import { useConteoRepository } from "../state/repositorio-contexto.js";
import { useConexion } from "../state/useConexion.js";
import { useConsumoDatos } from "../state/useConsumoDatos.js";
import { useLineasSesion } from "../state/useLineasSesion.js";
import { useMiAporte } from "../state/useMiAporte.js";
import { usePendientes } from "../state/usePendientes.js";
import { useSesion } from "../state/useSesion.js";
import { BannerPendientes } from "./BannerPendientes.js";
import { BotonSalir } from "./BotonSalir.js";
import { FilaCategoria } from "./FilaCategoria.js";
import { HojaNuevoProducto } from "./HojaNuevoProducto.js";
import { ModalSesionCerrada } from "./ModalSesionCerrada.js";
import { BarraProgreso } from "./primitivos/BarraProgreso.js";
import { ChipEstado } from "./primitivos/ChipEstado.js";
import { Deck } from "./primitivos/Deck.js";
import { Hoja } from "./primitivos/Hoja.js";
import { Icono } from "./primitivos/Icono.js";
import { Placa } from "./primitivos/Placa.js";

/** Áreas activas del catálogo, para preseleccionar una al crear un producto
 *  (HojaNuevoProducto). Hook local, no un archivo en `state/`: un solo
 *  consumidor (esta pantalla) y ~6 líneas. */
function useAreasActivas(repo: ConteoRepository): Area[] {
  const [areas, setAreas] = useState<Area[]>([]);
  useEffect(() => repo.observarAreasActivas(setAreas), [repo]);
  return areas;
}

export interface ConteoScreenProps {
  readonly auth: Auth;
  // issue #40: sin título de una línea como las otras 3 pantallas (esta
  // cabecera ya es progreso+búsqueda), así que "Salir" no pasa por
  // CabeceraCajero — se inserta directo en la fila de búsqueda/filtro con el
  // mismo BotonSalir que usan las demás.
  readonly onSalir: () => void | Promise<void>;
}

export function ConteoScreen({ auth, onSalir }: ConteoScreenProps) {
  // Mismo criterio que PrepararScreen/FinalizarScreen: un admin que entró a
  // contar desde /admin no tiene forma de volver salvo cerrar sesión.
  const esAdmin = useAuthState(auth)?.esAdmin ?? false;
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
  // issue #20 item 2 (doc 11 §24, "Datos móviles" · "consumo visible"):
  // estimación, no medida exacta — ver el docstring de useConsumoDatos.ts.
  const bytesConsumidos = useConsumoDatos(lineas);
  // Estado 4 del plan (§5, doc 11 §5): "estado != 'abierta'" es la condición
  // exacta de la fila de la tabla de estados. Exige `estado === "existe"`, así
  // que el modal NO se muestra mientras el listener no ha resuelto ni cuando
  // el documento no está — sólo cuando de verdad SABEMOS que la sesión existe
  // y ya no está abierta.
  const sesion = useSesion(sesionId);
  const sesionCerrada = sesion.estado === "existe" && sesion.sesion.estado !== "abierta";
  // Sesión borrada: `abrirSesion` la elimina si la siembra de líneas falla a
  // mitad, para dejar la sucursal reintentable (su compensación D3).
  //
  // NO se navega fuera ni se abre el modal bloqueante al detectarlo, aunque
  // el primer borrador de este arreglo hacía lo primero. Firestore emite un
  // snapshot con `exists: false` para un documento que NO está en la caché
  // local cuando el dispositivo está sin conexión, y esta app es
  // offline-first sobre bodegas con datos móviles (PRODUCT.md): expulsar al
  // cajero de su conteo por tener la caché fría es mucho peor que el hueco
  // que este estado viene a cerrar. Lo único que cambia es que aquí NO se
  // promete contenido con un esqueleto — no va a llegar nada.
  const sesionBorrada = sesion.estado === "borrada";
  // Una sesión abierta sin líneas significa "vienen en camino", no "está
  // vacía". Ojo con la razón, porque NO es la garantía atómica que da el
  // claim en `/sucursales`: `abrirSesion`
  // (packages/functions/src/callables/abrir-sesion.ts) siembra las líneas
  // en lotes de 400 y FUERA de la transacción de apertura — su propio
  // comentario D3 lo dice. O sea que la ventana con cero líneas es todavía
  // más ancha de lo que sería con un solo batch: cubre tanto "el listener
  // de observarLineas no ha emitido su primer snapshot" como "la siembra
  // sigue corriendo en el servidor". El esqueleto es lo honesto en ambas.
  // Antes de esto la lista pintaba vacía sin indicio de que algo viene:
  // 0/0 en la barra de progreso, deck en cero, ningún hueco visible.
  //
  // El esqueleto promete que algo viene, así que sólo se pinta donde eso es
  // cierto: mientras el listener de sesión no ha resuelto, y con la sesión
  // abierta y sin líneas todavía. Con la sesión BORRADA no se pinta —no va a
  // llegar nada nunca, y ahí un esqueleto animado es peor que la lista vacía
  // que había antes de F4-B, porque la lista vacía no afirma nada. Poder
  // separar esos casos es justamente lo que `EstadoSesion` vino a resolver:
  // antes ambos eran `null`.
  //
  // ponytail: queda un caso sin acotar — una sesión abierta cuyo catálogo se
  // sembró con CERO categorías activas es indistinguible desde el cliente de
  // una cuyas líneas siguen llegando, así que ahí el esqueleto no termina. Es
  // configuración del servidor, no un fallo de esta pantalla, y el cliente no
  // recibe ninguna señal que las separe. Ruta de escalamiento: que la sesión
  // lleve el número de líneas esperadas —`abrirSesion` ya lo conoce al
  // sembrar— y comparar contra él en vez de contra cero.
  const cargandoLineas = !sesionBorrada && !sesionCerrada && lineas.length === 0;

  const [busqueda, setBusqueda] = useState("");
  const [soloPendientes, setSoloPendientes] = useState(false);
  const [areaFiltro, setAreaFiltro] = useState("");
  const [categoriaEnEdicion, setCategoriaEnEdicion] = useState<string | null>(null);
  const [nuevoProductoAbierta, setNuevoProductoAbierta] = useState(false);
  const areasActivas = useAreasActivas(repo);

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
  // Estado 8 del plan (§5, doc 10 §10): 0 cuando no hay línea en edición o
  // todavía nadie aportó — `cantidadEsAbsurda` (dentro de Hoja) ya trata ese
  // 0 como "nunca absurdo", sin cálculo aparte aquí.
  const promedioEnEdicion = lineaEnEdicion ? promedioCategoria(lineaEnEdicion) : 0;

  function confirmarDesdeHoja(cantidad: number): void {
    if (!categoriaEnEdicion) return;
    // El modal bloqueante NO es la garantía: la inercia del <dialog> nativo
    // sólo detiene la INTERACCIÓN del usuario, y aun así deja una ventana
    // real entre que el admin cierra la sesión y que el listener lo emite.
    // La integridad del dato la sostiene esta comprobación, no la capa de
    // pintura. Las reglas de Firestore son la última red; ésta evita la
    // escritura optimista que el cajero vería aplicada en local.
    if (sesionCerrada) return;
    void repo.registrarAporte({ sesionId, categoriaId: categoriaEnEdicion, cantidad });
    // Avanza sola a la siguiente pendiente (plan §5) — o cierra si el
    // cajero ya terminó el catálogo.
    setCategoriaEnEdicion(siguientePendiente(lineas, uid, categoriaEnEdicion));
  }

  // Cierra la Hoja sólo tras confirmar la escritura (no en un `finally`):
  // si `crearCategoriaEnSesion` rechaza, HojaNuevoProducto se queda abierta
  // mostrando el error y el nombre tecleado sigue ahí para reintentar.
  async function crearProducto(etiqueta: string, areaId?: string): Promise<void> {
    await repo.crearCategoriaEnSesion({ sesionId, etiqueta, areaId });
    setNuevoProductoAbierta(false);
  }

  const total = lineas.length;
  const contadas = lineas.filter((l) => !estaPendiente(l, uid)).length;
  const equipoTotal = totalUnidadesSesion(lineas);

  const estadoSync: "sincronizado" | "pendiente" | "sin-conexion" = !enLinea
    ? "sin-conexion" // el único estado que el sistema pinta en rojo (plan §1)
    : escriturasPendientes > 0
      ? "pendiente"
      : "sincronizado";

  // Opciones del selector: cero lecturas nuevas, salen de `lineas` ya
  // suscritas. ponytail: filtro de VISTA únicamente — `contadas`/`total`
  // de arriba (BarraProgreso, progreso del EQUIPO, doc 10 §2) y
  // `siguientePendiente` (línea ~150) siguen leyendo `lineas` completas,
  // nunca `lineasVisibles`; este filtro no los toca.
  const areas = [...new Set(lineas.flatMap((l) => Object.keys(l.porArea ?? {})))].sort();

  const consulta = busqueda.trim().toLowerCase();
  const soloDigitos = consulta.replace(/\D/g, "");
  const lineasVisibles = lineas.filter((linea) => {
    if (areaFiltro && !(linea.porArea && linea.porArea[areaFiltro])) return false;
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
          <div className="flex shrink-0 items-center gap-2">
            {/* Consumo de datos estimado de la sesión — issue #20 item 2. */}
            <span className="flex items-center gap-1 text-micro text-tenue">
              <Icono nombre="datos" className="size-3.5 shrink-0" aria-hidden="true" />
              <span aria-label={`Datos consumidos en la sesión: ${datos(bytesConsumidos)}`}>
                {datos(bytesConsumidos)}
              </span>
            </span>
            <ChipEstado estado={estadoSync} />
          </div>
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

          {esAdmin && (
            <button
              type="button"
              onClick={() => navigate("/admin")}
              className="shrink-0 text-micro text-tenue hover:text-tinta"
            >
              Volver al panel
            </button>
          )}
          <BotonSalir onSalir={onSalir} />
        </div>

        {/* Fila propia: no cabe apretada junto a búsqueda+Pendientes+Salir
            sin bajar del objetivo táctil mínimo (--size-toque). Con menos de
            dos áreas el selector no filtraría nada, pero "+ Producto"
            (ADR-21) no depende del número de áreas, sólo de que la sesión
            siga abierta. */}
        {(areas.length > 1 || !sesionCerrada) && (
          <div className="flex items-center gap-2">
            {areas.length > 1 && (
              <label className="relative min-w-0 flex-1">
                <span className="sr-only">Filtrar por área</span>
                <select
                  value={areaFiltro}
                  onChange={(e) => setAreaFiltro(e.target.value)}
                  className="min-h-[var(--size-toque)] w-full rounded-placa border border-borde bg-fondo px-3 text-tinta focus:border-senal focus:outline-none"
                >
                  <option value="">Todas las áreas</option>
                  {areas.map((area) => (
                    <option key={area} value={area}>
                      {area}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {!sesionCerrada && (
              <button
                type="button"
                onClick={() => setNuevoProductoAbierta(true)}
                className="min-h-[var(--size-toque)] shrink-0 rounded-placa border border-borde px-3 text-micro font-semibold text-tenue"
              >
                + Producto
              </button>
            )}
          </div>
        )}
      </header>

      {/* Con la sesión cerrada NO se montan las filas. Los +/- que escriben
          viven dentro de FilaCategoria y llaman al repositorio ellos mismos,
          así que taparlos con el modal no es una garantía de integridad: la
          inercia del <dialog> detiene la interacción del usuario, pero no
          cubre la ventana entre que el admin cierra la sesión y que el
          listener lo emite. Desmontar es lo único que quita el acceso a la
          escritura desde aquí sin tocar FilaCategoria, y además es honesto:
          esas filas ya no son accionables. Se descartó `<fieldset disabled>`
          —la vía nativa, y la primera que se probó— porque su propagación a
          los controles descendientes no es observable en el entorno de
          test: quedaba un arreglo sin red de regresión. */}
      {cargandoLineas ? (
        // Esqueleto con la forma final de la fila real (plan §5, F4): nunca
        // un spinner. Cuenta fija (no hay de dónde sacar el total real
        // todavía, a diferencia de `/sucursales` con sus IDs del claim) —
        // sólo comunica "esto viene en camino", no cuántas categorías habrá.
        <ul aria-hidden="true" className="mt-1 flex flex-1 flex-col gap-2 overflow-y-auto pb-4">
          {[0, 1, 2, 3, 4].map((i) => (
            <li key={i} className="list-none" data-testid="fila-esqueleto">
              <Placa className="py-2.5">
                <div className="flex items-center gap-2">
                  <div className="flex min-w-0 flex-1 flex-col gap-2 py-1">
                    <span className="h-[2rem] w-24 animate-pulse rounded-placa bg-placa-alta" />
                    <span className="h-3 w-32 animate-pulse rounded-placa bg-placa-alta" />
                  </div>
                  <span className="size-[var(--size-toque)] shrink-0 animate-pulse rounded-placa bg-placa-alta" />
                </div>
              </Placa>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="mt-1 flex flex-1 flex-col gap-2 overflow-y-auto pb-4">
          {(sesionCerrada ? [] : lineasVisibles).map((linea) => (
            <FilaCategoria
              key={linea.categoriaId}
              sesionId={sesionId}
              linea={linea}
              onSeleccionar={abrirHoja}
              onCantidadPropiaCambio={manejarCantidadPropia}
            />
          ))}
        </ul>
      )}

      {/* issue #44: el banner de pendientes vive junto al Deck, no arriba de
          la lista — así no compite por el mismo espacio fijo que "siempre
          bajo el pulgar" reserva para "Finalizar conteo" (Deck.tsx:6-7). Un
          solo contenedor sticky evita que los dos se disputen el borde
          inferior real de la pantalla. */}
      <div className="sticky bottom-0">
        <BannerPendientes pendientes={escriturasPendientes} />
        <Deck
          tuAporte={tuAporteTotal}
          equipo={equipoTotal}
          onFinalizar={() => navigate(`/conteo/${sesionId}/finalizar`)}
        />
      </div>

      <Hoja
        abierta={lineaEnEdicion !== null}
        etiqueta={lineaEnEdicion?.etiqueta ?? ""}
        valorInicial={miAporteEnEdicion?.cantidad ?? 0}
        promedioCategoria={promedioEnEdicion}
        onConfirmar={confirmarDesdeHoja}
        onVolver={() => setCategoriaEnEdicion(null)}
      />

      <HojaNuevoProducto
        abierta={nuevoProductoAbierta}
        areas={areasActivas}
        onCrear={crearProducto}
        onVolver={() => setNuevoProductoAbierta(false)}
      />

      {/* Se monta SIEMPRE (como Hoja arriba) y decide su propia visibilidad
          por `abierta`: si en cambio condicionáramos el montaje a
          `sesionCerrada`, perderíamos el primer render en el que
          `useSesion` todavía no ha resuelto nada, sin ganar nada a cambio —
          el <dialog> cerrado no pinta nada. Va DESPUÉS de la Hoja a
          propósito: si el admin cierra la sesión con la Hoja abierta, este
          showModal() se invoca más tarde y por eso queda encima en el top
          layer nativo (orden de invocación, no de DOM). */}
      <ModalSesionCerrada abierta={sesionCerrada} onSalir={() => navigate("/sucursales")} />
    </section>
  );
}

/**
 * Envoltorio que usa `router.tsx` para montar `ConteoScreen` (F3-B,
 * seguimiento pendiente de F2). React Router reutiliza la MISMA instancia
 * de `ConteoScreen` cuando sólo cambia `:sesionId` dentro de la misma ruta
 * — es el comportamiento normal de reconciliación de React, no un bug de la
 * librería — así que el estado local de la pantalla (búsqueda, filtro
 * "sólo pendientes", categoría en edición de la Hoja, "tu aporte"
 * acumulado) sobrevivía al cambio de sesión sin que nada lo reseteara
 * (`ConteoScreen.remount.test.tsx`).
 *
 * `key={sesionId}` en el punto donde el PADRE crea el elemento es lo único
 * que fuerza el remount: React usa `(tipo, key)` para decidir si reutiliza
 * o desecha la instancia en esa posición del árbol. Ponerlo dentro del
 * propio `<section>` que `ConteoScreen` retorna no sirve — el key sólo
 * cuenta para quien CREA el elemento, no para el componente que lo contiene
 * (error real cometido y corregido durante esta ola).
 */
export function ConteoScreenPorSesion({ auth, onSalir }: ConteoScreenProps) {
  const { sesionId } = useParams<{ sesionId: string }>();
  return <ConteoScreen key={sesionId} auth={auth} onSalir={onSalir} />;
}
