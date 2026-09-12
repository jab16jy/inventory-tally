// apps/web/src/ui/primitivos/Hoja.tsx
//
// Bottom sheet sobre <dialog> nativo (plan §3: Radix/Headless no se paga
// para dos overlays, y <dialog> ya da foco atrapado, Escape y backdrop
// gratis). Sube desde el borde inferior sobre el deck, sin cubrir la
// pantalla completa: la fila que se edita sigue visible arriba (plan §5).
//
// La Hoja con teclado numérico es el ÚNICO camino de captura (ADR-24, doc 11
// §4). "Volver", nunca "Cerrar": la pantalla de conteo no puede tener un botón
// cuyo nombre accesible matchee /cerrar|descartar/i.
//
// ADR-24 (conteo por tandas): el cajero teclea una tanda, toca "Agrupar", y
// la Hoja NO se cierra — el display vuelve a "0" listo para la siguiente
// tanda de la MISMA categoría. Cada tanda agrupada queda en `partidas` y se
// lista arriba del teclado con su propia papelera.
//
// F4-A1 (doc 10 §10, "cantidad absurda por dedo torpe") añade la
// confirmación SUAVE cuando lo tecleado supera 10× el promedio de la
// categoría: en vez de un segundo <dialog> (rompería el foco atrapado del
// primero y arriesgaría un role="alert" de más, restricción dura de
// ConteoScreen.test.tsx), es una segunda VISTA dentro del mismo diálogo —
// el teclado se reemplaza por el mensaje y dos botones, sin abrir nada
// nuevo. "Corregir", nunca "Cancelar", porque no cancela el conteo: sólo
// vuelve al teclado con lo ya tecleado intacto. ADR-24 reusa la misma vista
// para pedir confirmación antes de borrar una tanda — `confirmacion` es una
// unión discriminada porque las dos situaciones nunca coexisten y cada una
// necesita su propio texto y su propia acción de "Sí, …".
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { cantidadEsAbsurda, type Partida } from "@conteo/shared";
import { Icono } from "./Icono.js";

export interface HojaProps {
  readonly abierta: boolean;
  /** Etiqueta de la categoría en edición, p. ej. "$5.000". */
  readonly etiqueta: string;
  /** Lo que el cajero ya tiene registrado para esta categoría (0 si nada).
   *  Ya NO precarga el display (ver más abajo): se pinta aparte, en la línea
   *  de solo lectura "Tu conteo: N". */
  readonly valorInicial: number;
  /** Tandas ya agrupadas para la categoría en edición (ADR-24); se listan
   *  arriba del teclado, cada una con su papelera. */
  readonly partidas: readonly Partida[];
  /**
   * Promedio de unidades por aportante en la categoría en edición (0 = sin
   * aportantes todavía, o prop omitida). Prop OPCIONAL con default 0 a
   * propósito: así ningún test anterior a F4-A1 que monta `<Hoja>` sin esta
   * prop cambia de comportamiento — "sin promedio" sigue siendo "nunca
   * absurdo", igual que antes de que este prop existiera.
   */
  readonly promedioCategoria?: number;
  /** Agrupa la tanda tecleada: sube `cantidad` y agrega una `Partida` al
   *  ledger. La Hoja NO se cierra tras esto — es el corazón de la feature. */
  readonly onAgrupar: (cantidad: number) => void;
  /** Manda una tanda a la papelera (ADR-24 / Issue #91). */
  readonly onBorrarPartida: (partida: Partida) => void;
  readonly onVolver: () => void;
}

const TECLAS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "borrar", "0", "guardar"] as const;

/** Vista de confirmación suave: nunca coexisten "cantidad absurda" y "borrar
 *  tanda" — son dos motivos distintos para la MISMA segunda vista dentro del
 *  diálogo (ver el comentario de cabecera). */
type Confirmacion =
  { readonly tipo: "absurda" } | { readonly tipo: "borrar"; readonly partida: Partida };

export function Hoja({
  abierta,
  etiqueta,
  valorInicial,
  partidas,
  promedioCategoria = 0,
  onAgrupar,
  onBorrarPartida,
  onVolver,
}: HojaProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  // Gesto de backdrop: true si el toque EMPEZÓ fuera del rect propio del
  // <dialog> (ver comentario del onClick más abajo).
  const gestoFueraRef = useRef(false);
  // El display arranca en "0" para cada tanda nueva — nunca precarga
  // `valorInicial` (ADR-24): "cuánto ya conté" y "cuánto llevo tecleado de
  // esta tanda" son dos números distintos, y fusionarlos es justo el bug que
  // esta feature reemplaza. Lo ya contado se lee aparte, en la línea de solo
  // lectura de abajo.
  const [valor, setValor] = useState("0");
  const [tocado, setTocado] = useState(false);
  const [confirmacion, setConfirmacion] = useState<Confirmacion | null>(null);

  // Se resetea cada vez que cambia LA CATEGORÍA (etiqueta), no en cada
  // render: si dependiera de `valorInicial` completo, cada aporte que llega
  // del servidor reiniciaría la tanda que el cajero está tecleando ahora
  // mismo.
  useEffect(() => {
    setValor("0");
    setTocado(false);
    setConfirmacion(null);
  }, [etiqueta]);

  // R3-001, reencuadrada por ADR-24: la versión anterior de esta pantalla
  // precargaba el display con `valorInicial`, y ese valor real llega UN
  // RENDER DESPUÉS de abrir — quien monta la Hoja se suscribe al aporte de
  // la categoría en edición, y esa suscripción todavía no ha resuelto en el
  // render del toque. La intención original — nunca ocultarle al cajero lo
  // que ya contó — se conserva, pero ya no exige sincronizar estado local
  // con una prop que llega tarde: "Tu conteo: {valorInicial}" lee la prop
  // DIRECTO en cada render, así que en cuanto la suscripción resuelve el
  // texto se actualiza solo, sin useEffect ni estado propio que pueda
  // desincronizarse. Por eso el efecto que antes adoptaba `valorInicial`
  // mientras `!tocado` ya no existe: no queda nada que sincronizar.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (abierta && !dialog.open) dialog.showModal();
    if (!abierta && dialog.open) dialog.close();
  }, [abierta]);

  function agruparTanda(): void {
    // Defensa en profundidad, igual que la guarda de sesión cerrada de
    // ConteoScreen: el botón ya está deshabilitado en 0, pero esta ruta
    // también la alcanza "Sí, guardar" de la confirmación suave.
    if (Number(valor) <= 0) return;
    onAgrupar(Number(valor));
    setValor("0");
    setTocado(false);
    setConfirmacion(null);
  }

  function tecla(t: (typeof TECLAS)[number]): void {
    if (t === "borrar") {
      setTocado(true);
      setValor((v) => (v.length <= 1 ? "0" : v.slice(0, -1)));
      return;
    }
    if (t === "guardar") {
      const cantidad = Number(valor);
      if (cantidadEsAbsurda(cantidad, promedioCategoria)) {
        setConfirmacion({ tipo: "absurda" });
        return;
      }
      agruparTanda();
      return;
    }
    setValor((v) => {
      if (!tocado) return t;
      // Tope de 6 dígitos: ninguna categoría real llega a un millón de
      // unidades, y evita que un toque repetido desborde el ancho de la Hoja.
      return (v === "0" ? t : v + t).slice(0, 6);
    });
    setTocado(true);
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onVolver}
      onCancel={onVolver}
      // Cierre por backdrop (toque fuera): `e.target === e.currentTarget`
      // también es cierto para un toque sobre el PADDING del propio <dialog>
      // (p-4 pb-[...] más abajo) — ese padding es superficie del elemento,
      // no de un hijo, así que ningún hijo lo cubre y el toque llega al
      // <dialog> igual que el backdrop real. Bug de campo: "agrupo y se
      // cierra la calculadora" (ver hoja-cierre.spec.ts). La geometría
      // distingue los dos casos: el backdrop cae FUERA del rect propio del
      // <dialog>, el padding cae DENTRO. onPointerDown mide dónde EMPIEZA el
      // gesto; onClick exige que también TERMINE fuera, así un
      // arrastre que cruza el borde no cierra a mitad de camino. Se
      // mantiene `e.target === e.currentTarget`: un click activado por
      // teclado reporta clientX/clientY = 0, que geométricamente cae
      // "fuera" del rect. Duplicado en HojaNuevoProducto.tsx (mismo
      // <dialog>, mismo padding).
      onPointerDown={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        gestoFueraRef.current =
          e.target === e.currentTarget &&
          (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom);
      }}
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const fuera =
          e.target === e.currentTarget &&
          (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom);
        if (gestoFueraRef.current && fuera) onVolver();
        gestoFueraRef.current = false;
      }}
      aria-label={`Contar ${etiqueta}`}
      className={clsx(
        // `top-auto` es lo que de verdad hace que suba "dentro del deck" en
        // vez de cubrir la pantalla entera (plan §5): la hoja UA de
        // `dialog:modal` trae `inset: 0` (los cuatro lados), y con top Y
        // bottom en 0 a la vez el navegador estira la caja a la altura
        // completa del viewport aunque `height` sea `fit-content` — hay que
        // anular ese `top` explícitamente para que la altura vuelva a
        // depender del contenido y la fila de arriba quede visible.
        "fixed inset-x-0 top-auto bottom-0 m-0 w-full max-w-md rounded-t-placa border-t border-borde",
        "bg-placa-alta p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop:bg-fondo/70",
        "open:flex open:flex-col open:gap-3",
      )}
    >
      <div className="flex items-center justify-between">
        <p className="text-medio font-semibold text-tinta">{etiqueta}</p>
        {/* Botón secundario de verdad (objetivo táctil --size-toque), no texto
            subrayado: con guantes y poca luz el enlace no se ve tocable. El
            nombre accesible sigue siendo "Volver", nunca "Cerrar" (DESIGN.md,
            restricción de ConteoScreen.test.tsx). */}
        <button
          type="button"
          onClick={onVolver}
          className="min-h-[var(--size-toque)] shrink-0 rounded-placa border border-borde px-3 text-micro font-semibold text-tenue active:border-senal active:text-tinta"
        >
          Volver
        </button>
      </div>

      {/* Lo ya contado en tandas previas (ver el comentario de R3-001 más
          arriba). Con la eliminación del stepper (issue #90, ADR-24),
          `Aporte.cantidad === suma(partidas)` en todo momento. */}
      <p data-numeral className="text-micro text-tenue">
        Tu conteo: {valorInicial}
      </p>

      <p
        data-numeral
        data-testid="hoja-valor"
        className="text-center text-numeral font-semibold text-senal"
      >
        {valor}
      </p>

      {confirmacion ? (
        // role="status" (nunca "alert"): ConteoScreen.test.tsx exige que la
        // pantalla de conteo nunca tenga más de un role="alert" a la vez, y
        // ese rol ya está reservado a los banners de riesgo real de pérdida
        // de datos (BannerPendientes). Esto es una confirmación SUAVE — el
        // cajero pudo contar bien, o de verdad quiere borrar la tanda — no
        // una alerta; mismo criterio que el bloque "Enviando…" de
        // FinalizarScreen.tsx.
        <div role="status" aria-live="polite" className="flex flex-col gap-3">
          <p className="text-base text-tinta">
            {confirmacion.tipo === "absurda"
              ? `${valor} es mucho más que el promedio de esta categoría (≈${Math.round(
                  promedioCategoria,
                )} por persona). Si contaste bien, guarda igual.`
              : `¿Borrar la tanda de ${confirmacion.partida.cantidad}?`}
          </p>
          <div className="flex gap-2">
            {/* autoFocus porque el botón que tenía el foco se DESMONTA al
                cambiar de vista: sin esto el foco cae al <body> y quien
                navega por teclado tiene que rebuscar dónde quedó dentro del
                diálogo. Aterriza en "Corregir" y no en la acción que
                confirma, a propósito: el foco por defecto no debe estar
                sobre una acción irreversible (borrar) ni sobre la que
                confirma un número sospechoso. */}
            <button
              type="button"
              autoFocus
              onClick={() => setConfirmacion(null)}
              className="min-h-[var(--size-toque)] flex-1 rounded-placa border border-borde text-medio font-semibold text-tinta active:border-senal active:bg-fondo"
            >
              Corregir
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirmacion.tipo === "absurda") {
                  agruparTanda();
                } else {
                  onBorrarPartida(confirmacion.partida);
                  setConfirmacion(null);
                }
              }}
              className="min-h-[var(--size-toque)] flex-1 rounded-placa border border-senal bg-senal text-medio font-semibold text-fondo"
            >
              {confirmacion.tipo === "absurda" ? "Sí, guardar" : "Sí, borrar"}
            </button>
          </div>
        </div>
      ) : (
        <>
          {partidas.length > 0 && (
            <ul className="flex flex-col gap-1">
              {partidas.map((partida) => (
                <li
                  key={partida.id}
                  className="flex items-center justify-between rounded-placa border border-borde bg-fondo px-3 py-2"
                >
                  <span data-numeral className="text-base text-tinta">
                    {partida.cantidad}
                  </span>
                  <button
                    type="button"
                    onClick={() => setConfirmacion({ tipo: "borrar", partida })}
                    aria-label={`Borrar tanda de ${partida.cantidad}`}
                    className="inline-flex items-center justify-center rounded-placa border border-borde p-2 text-tenue active:border-riesgo active:text-riesgo disabled:opacity-50"
                  >
                    <Icono nombre="papelera" className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="grid grid-cols-3 gap-2">
            {TECLAS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => tecla(t)}
                disabled={t === "guardar" && Number(valor) <= 0}
                aria-label={t === "borrar" ? "Borrar dígito" : t === "guardar" ? "Agrupar" : t}
                className={clsx(
                  "min-h-[var(--size-toque)] rounded-placa border text-medio font-semibold",
                  t === "guardar"
                    ? "border-senal bg-senal text-fondo disabled:border-borde disabled:bg-transparent disabled:text-tenue"
                    : "border-borde text-tinta active:border-senal active:bg-fondo",
                )}
              >
                {t === "borrar" ? "Borrar dígito" : t === "guardar" ? "Agrupar" : t}
              </button>
            ))}
          </div>
        </>
      )}
    </dialog>
  );
}
