// apps/web/src/ui/ConteoScreen.tsx (doc 11 §4) — la pantalla crítica del
// sistema. El cajero ve precio y subtotal de SU propia línea (D-6, ADR-23);
// lo que sigue fuera es el consolidado de sesión que ADR-07 protege.
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
  quitarPartida,
  totalUnidadesSesion,
} from "@conteo/shared";
import { datos } from "../lib/formato.js";
import { useAreaActiva } from "../state/useAreaActiva.js";
import { useAreasActivas } from "../state/useAreasActivas.js";
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
  // Área activa obligatoria (ADR-23): se elige en PrepararScreen y queda en
  // localStorage por sesionId.
  const [areaActiva] = useAreaActiva(sesionId);

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
  // D-3 (docs/diseno/etapa-3-ui.md): interruptor "Ver todo", no un <select>
  // — con el área activa obligatoria ya no hay una dimensión libre que
  // elegir, sólo "lo mío" y "todo".
  const [verTodo, setVerTodo] = useState(false);
  const [categoriaEnEdicion, setCategoriaEnEdicion] = useState<string | null>(null);
  const [nuevoProductoAbierta, setNuevoProductoAbierta] = useState(false);
  const [areasActivas] = useAreasActivas(repo);
  // issue #86 (revisión de resiliencia): un `areaId` vacío NUNCA es una
  // escritura válida — infra/firestore.rules exige `areaId.size() > 0` sin
  // excepción, ni siquiera con el catálogo vacío — así que dejar pasar sin
  // redirigir atrapa al cajero en un "No se pudo enviar" que jamás se
  // resuelve solo. Siempre que falte área activa se manda de vuelta a
  // PrepararScreen, que ahora es quien decide qué mostrar (selector o el
  // aviso de catálogo vacío) — no se distingue el caso aquí. `areasActivas`
  // no hace falta como dependencia: sólo importa `areaActiva`.
  useEffect(() => {
    if (!areaActiva) {
      navigate(`/conteo/${sesionId}/preparar`, { replace: true });
    }
  }, [areaActiva, sesionId, navigate]);

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
  const miAporteEnEdicion = useMiAporte(sesionId, categoriaEnEdicion ?? "", areaActiva);
  // Estado 8 del plan (§5, doc 10 §10): 0 cuando no hay línea en edición o
  // todavía nadie aportó — `cantidadEsAbsurda` (dentro de Hoja) ya trata ese
  // 0 como "nunca absurdo", sin cálculo aparte aquí.
  const promedioEnEdicion = lineaEnEdicion ? promedioCategoria(lineaEnEdicion) : 0;

  // `agrupar` y `borrarTanda` SUMAN Y RESTAN sobre `miAporteEnEdicion`, que
  // llega un render DESPUÉS de escribir, y el repositorio escribe `cantidad` y
  // `partidas` como valores planos (no `increment`/`arrayUnion`, que sí usa
  // `version`). Dos escrituras seguidas antes del eco leerían el mismo
  // snapshot viejo y la segunda pisaría la tanda de la primera: un conteo
  // perdido en silencio, que es justo lo que AGENTS.md §1 prohíbe simplificar.
  //
  // Contención: `version` sube en CADA escritura (el fake la incrementa, el
  // repositorio real usa `increment(1)`), así que sirve de acuse genérico para
  // agrupar y para borrar por igual. Mientras la versión no supere a la que
  // había al escribir, la Hoja queda bloqueada y lo tecleado se conserva.
  //
  // ponytail: contención, no la cura. La cura de raíz es que el cliente mande
  // un DELTA y el backend sume con `FieldValue.increment` + `arrayUnion`, como
  // ya hace con `version` — eso elimina la lectura previa en vez de esperarla,
  // y de paso arregla dos dispositivos del mismo cajero, que esto no cubre.
  // Exige cambiar `RegistrarAporteInput` en packages/data, fuera de este
  // candidato.
  const [versionAlEscribir, setVersionAlEscribir] = useState<number | null>(null);
  const versionVista = miAporteEnEdicion?.version ?? 0;
  const esperandoEco = versionAlEscribir !== null && versionVista <= versionAlEscribir;

  useEffect(() => {
    setVersionAlEscribir(null);
  }, [categoriaEnEdicion]);

  // ADR-24: agrupar una tanda SUMA sobre lo que el cajero ya tenía —nunca
  // reemplaza `cantidad`— y agrega la tanda al ledger `partidas`. A
  // diferencia de la vieja `confirmarDesdeHoja`, NO avanza a la siguiente
  // pendiente: quedarse en la misma categoría para la próxima tanda es el
  // requisito central de la feature (el cajero cuenta 50, agrupa, cuenta 30
  // más, agrupa de nuevo, sin volver a tocar la fila).
  function agrupar(cantidad: number): void {
    if (!categoriaEnEdicion) return;
    if (esperandoEco) return;
    setVersionAlEscribir(versionVista);
    // El modal bloqueante NO es la garantía: la inercia del <dialog> nativo
    // sólo detiene la INTERACCIÓN del usuario, y aun así deja una ventana
    // real entre que el admin cierra la sesión y que el listener lo emite.
    // La integridad del dato la sostiene esta comprobación, no la capa de
    // pintura. Las reglas de Firestore son la última red; ésta evita la
    // escritura optimista que el cajero vería aplicada en local.
    if (sesionCerrada) return;
    void repo.registrarAporte({
      sesionId,
      categoriaId: categoriaEnEdicion,
      areaId: areaActiva,
      cantidad: (miAporteEnEdicion?.cantidad ?? 0) + cantidad,
      partidas: [...(miAporteEnEdicion?.partidas ?? []), { id: crypto.randomUUID(), cantidad }],
    });
  }

  // Borra UNA tanda del ledger (ADR-24, papelera): `quitarPartida` calcula
  // cuánto restar de `cantidad` — nunca la cantidad de la tanda a ciegas, por
  // si algún día dos tandas comparten id (ver el docstring de la función en
  // calculadora.ts). Misma guarda de sesión cerrada que `agrupar`, y por la
  // misma razón: el modal no es la garantía de integridad.
  function borrarTanda(id: string): void {
    if (!categoriaEnEdicion) return;
    if (sesionCerrada) return;
    if (esperandoEco) return;
    setVersionAlEscribir(versionVista);
    const { partidas, restado } = quitarPartida(miAporteEnEdicion?.partidas ?? [], id);
    void repo.registrarAporte({
      sesionId,
      categoriaId: categoriaEnEdicion,
      areaId: areaActiva,
      // El clamp NO es decorativo y la invariante `suma(partidas) <= cantidad`
      // NO está garantizada: el stepper −/+ de `FilaCategoria` escribe
      // `cantidad` sin tocar `partidas`, así que bajarlo a mano puede dejar
      // `cantidad` por DEBAJO de la suma del ledger. En ese estado borrar una
      // tanda restaría de más, y el clamp evita una cantidad negativa —
      // enmascarando el desfase, no reconciliándolo: "Tu conteo" puede leer 0
      // con tandas todavía listadas en la papelera.
      // ponytail: se acota el daño, no se reconcilia. La reconciliación real
      // es que el stepper mantenga también el ledger, o que desaparezca ahora
      // que la calculadora agrupa — decisión de UX que no entra acá.
      cantidad: Math.max(0, (miAporteEnEdicion?.cantidad ?? 0) - restado),
      partidas,
    });
  }

  // Cierra la Hoja sólo tras confirmar la escritura (no en un `finally`):
  // si `crearCategoriaEnSesion` rechaza, HojaNuevoProducto se queda abierta
  // mostrando el error y el nombre tecleado sigue ahí para reintentar.
  async function crearProducto(etiqueta: string, areaId?: string, valor?: number): Promise<void> {
    await repo.crearCategoriaEnSesion({ sesionId, etiqueta, areaId, valor });
    setNuevoProductoAbierta(false);
  }

  const total = lineas.length;
  const contadas = lineas.filter((l) => !estaPendiente(l, uid, areaActiva)).length;
  const equipoTotal = totalUnidadesSesion(lineas);

  const estadoSync: "sincronizado" | "pendiente" | "sin-conexion" = !enLinea
    ? "sin-conexion" // el único estado que el sistema pinta en rojo (plan §1)
    : escriturasPendientes > 0
      ? "pendiente"
      : "sincronizado";

  // D-2 (docs/diseno/etapa-3-ui.md): "mi área" son las líneas cuyo `areaIds`
  // incluye la activa, MÁS las que no tienen área asignada — "sin área"
  // avisa, nunca bloquea (grilling Q, ADR-23), así que esconderla la
  // volvería invisible para todos los contadores a la vez. `areaIds` sale
  // de la línea (denormalizado al sembrar, D-1): cero lecturas nuevas.
  // ponytail: filtro de VISTA únicamente — `contadas`/`total` de arriba
  // (BarraProgreso, progreso del EQUIPO, doc 10 §2) y `siguientePendiente`
  // (línea ~150) siguen leyendo `lineas` completas, nunca `lineasVisibles`;
  // este filtro no los toca.
  const lineasDeMiArea = lineas.filter(
    (linea) => !linea.areaIds || linea.areaIds.length === 0 || linea.areaIds.includes(areaActiva),
  );
  // Guarda de visibilidad del interruptor (D-3): sólo se pinta si de verdad
  // hay algo que ocultar.
  const mostrarInterruptorVerTodo = lineasDeMiArea.length < lineas.length;

  const consulta = busqueda.trim().toLowerCase();
  const soloDigitos = consulta.replace(/\D/g, "");
  const lineasVisibles = (verTodo ? lineas : lineasDeMiArea).filter((linea) => {
    if (soloPendientes && !estaPendiente(linea, uid, areaActiva)) return false;
    if (!consulta) return true;
    return (
      linea.etiqueta.toLowerCase().includes(consulta) ||
      (soloDigitos !== "" && String(linea.valorUnitario).includes(soloDigitos))
    );
  });
  // D-5: nombre resuelto contra `useAreasActivas` (ya consumido más arriba
  // para "+ Producto"); fallback al id crudo si no resuelve — sin aviso,
  // PrepararScreen ya redirige y explica cuando falta área (ver el efecto
  // de arriba).
  const nombreAreaActiva = areasActivas.find((a) => a.areaId === areaActiva)?.nombre ?? areaActiva;

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

        {/* Fila propia (D-5/D-3, docs/diseno/etapa-3-ui.md): no cabe
            apretada junto a búsqueda+Pendientes+Salir sin bajar del objetivo
            táctil mínimo (--size-toque). El área activa vive aquí SIEMPRE
            (nunca escondida en un dropdown); el interruptor "Ver todo" sólo
            cuando de verdad oculta algo; "+ Producto" (ADR-21) no depende
            del número de áreas, sólo de que la sesión siga abierta. */}
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-micro">
            <span className="text-tenue">Área: </span>
            <span className="text-tinta">{nombreAreaActiva}</span>
          </span>

          {mostrarInterruptorVerTodo && (
            <button
              type="button"
              aria-pressed={verTodo}
              onClick={() => setVerTodo((v) => !v)}
              className={
                "flex min-h-[var(--size-toque)] shrink-0 items-center gap-1.5 rounded-placa border px-3 text-micro font-semibold " +
                (verTodo ? "border-senal text-senal" : "border-borde text-tenue")
              }
            >
              <Icono nombre="filtro" className="size-4" />
              Ver todo
            </button>
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
      ) : !sesionCerrada && !verTodo && lineasDeMiArea.length === 0 && lineas.length > 0 ? (
        // Aviso de área vacía (docs/diseno/etapa-3-ui.md §3.1): el modo de
        // fallo que #84 nombra — si el admin llenó mal `areaIds`, hay
        // producto físicamente presente que no aparece. role="status", NUNCA
        // "alert": no es un error, es una vista vacía recuperable, y
        // DESIGN.md §Don'ts sólo permite un role="alert" a la vez (lo tiene
        // BannerPendientes).
        //
        // Se compara contra `lineasDeMiArea` (antes de búsqueda/"sólo
        // pendientes"), no contra `lineasVisibles`: si el área SÍ tiene
        // categorías pero una búsqueda o el filtro de pendientes vació la
        // lista, el diagnóstico correcto es "no hay resultados", no "tu área
        // está vacía" — y "Ver todo" no arregla una búsqueda obsoleta.
        <p role="status" className="mt-5 text-base text-tenue">
          No hay categorías asignadas a tu área. Usa &quot;Ver todo&quot; para ver el catálogo
          completo.
        </p>
      ) : (
        <ul className="mt-1 flex flex-1 flex-col gap-2 overflow-y-auto pb-4">
          {(sesionCerrada ? [] : lineasVisibles).map((linea) => (
            <FilaCategoria
              key={linea.categoriaId}
              sesionId={sesionId}
              areaId={areaActiva}
              linea={linea}
              onSeleccionar={abrirHoja}
              onCantidadPropiaCambio={manejarCantidadPropia}
              mostrarOtrasAreas={verTodo}
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
        partidas={miAporteEnEdicion?.partidas ?? []}
        esperandoEco={esperandoEco}
        promedioCategoria={promedioEnEdicion}
        onAgrupar={agrupar}
        onBorrarPartida={borrarTanda}
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
