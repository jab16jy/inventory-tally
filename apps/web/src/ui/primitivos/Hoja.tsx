// apps/web/src/ui/primitivos/Hoja.tsx
//
// Bottom sheet sobre <dialog> nativo (plan §3: Radix/Headless no se paga
// para dos overlays, y <dialog> ya da foco atrapado, Escape y backdrop
// gratis). Sube desde el borde inferior sobre el deck, sin cubrir la
// pantalla completa: la fila que se edita sigue visible arriba (plan §5).
//
// El teclado numérico es el camino PRINCIPAL de captura; el stepper −/+ de
// la fila es el alternativo (doc 11 §158-166). "Volver", nunca "Cerrar": la
// pantalla de conteo no puede tener un botón cuyo nombre accesible matchee
// /cerrar|descartar/i.
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";

export interface HojaProps {
  readonly abierta: boolean;
  /** Etiqueta de la categoría en edición, p. ej. "$5.000". */
  readonly etiqueta: string;
  /** Lo que el cajero ya tiene registrado para esta categoría (0 si nada). */
  readonly valorInicial: number;
  readonly onConfirmar: (cantidad: number) => void;
  readonly onVolver: () => void;
}

const TECLAS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "borrar", "0", "guardar"] as const;

export function Hoja({ abierta, etiqueta, valorInicial, onConfirmar, onVolver }: HojaProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [valor, setValor] = useState(String(valorInicial));
  // Primer dígito tras abrir REEMPLAZA el valor precargado en vez de
  // acumularse sobre él (mismo patrón que "seleccionar todo al enfocar" de
  // un input numérico nativo) — sin esto, tocar "3" sobre un valor
  // precargado de 12 escribe 123 en vez de reemplazarlo por 3.
  const [tocado, setTocado] = useState(false);

  // Se resetea cada vez que cambia LA CATEGORÍA (etiqueta), no en cada
  // render: es lo que deja al cajero seguir editando sus propios dígitos sin
  // que el valor salte de vuelta al inicial mientras escribe.
  useEffect(() => {
    setValor(String(valorInicial));
    setTocado(false);
    // Deliberadamente sólo depende de `etiqueta` (identifica la categoría):
    // `valorInicial` sólo debe releerse al cambiar de categoría, nunca en
    // cada render mientras el cajero sigue escribiendo sus propios dígitos.
  }, [etiqueta]);

  // …pero el valor real llega UN RENDER DESPUÉS de abrir: quien nos monta se
  // suscribe al aporte de la categoría en edición, y esa suscripción todavía
  // no ha resuelto en el render del toque. Con sólo el efecto de arriba, la
  // Hoja adoptaba el 0 de ese primer render y no volvía a mirar: el cajero
  // veía 0 sobre una categoría donde ya había contado, y teclear encima
  // pisaba su propio conteo.
  //
  // Mientras no haya tecleado, adoptamos el valor que vaya llegando; en
  // cuanto toca una tecla, `tocado` congela lo suyo y nada se lo pisa.
  useEffect(() => {
    if (!tocado) setValor(String(valorInicial));
  }, [valorInicial, tocado]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (abierta && !dialog.open) dialog.showModal();
    if (!abierta && dialog.open) dialog.close();
  }, [abierta]);

  function tecla(t: (typeof TECLAS)[number]): void {
    if (t === "borrar") {
      setTocado(true);
      setValor((v) => (v.length <= 1 ? "0" : v.slice(0, -1)));
      return;
    }
    if (t === "guardar") {
      onConfirmar(Number(valor));
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
        <button type="button" onClick={onVolver} className="text-micro text-tenue underline">
          Volver
        </button>
      </div>

      <p
        data-numeral
        data-testid="hoja-valor"
        className="text-center text-numeral font-semibold text-senal"
      >
        {valor}
      </p>

      <div className="grid grid-cols-3 gap-2">
        {TECLAS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => tecla(t)}
            aria-label={t === "borrar" ? "Borrar" : t === "guardar" ? "Guardar" : t}
            className={clsx(
              "min-h-[var(--size-toque)] rounded-placa border text-medio font-semibold",
              t === "guardar"
                ? "border-senal bg-senal text-fondo"
                : "border-borde text-tinta active:border-senal active:bg-fondo",
            )}
          >
            {t === "borrar" ? "Borrar" : t === "guardar" ? "Guardar" : t}
          </button>
        ))}
      </div>
    </dialog>
  );
}
