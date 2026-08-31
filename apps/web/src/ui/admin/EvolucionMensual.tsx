// apps/web/src/ui/admin/EvolucionMensual.tsx (docs/diseno/10-analisis-y-dashboards.md
// §5-6) — evolución mensual del valor total por sesión cerrada. Mismo molde
// que Dona.tsx: SVG `aria-hidden` + equivalente accesible en paralelo con los
// MISMOS valores en texto — la dualidad es la convención de accesibilidad
// del repo para gráficas, no un adorno. La curva en sí (matemática de
// coordenadas, círculo por punto) vive en Sparkline.tsx — no se duplica aquí.
//
// `historicos` llega en orden `cerradaEn desc` (la consulta de
// `historicosRecientesPorSucursal`): se invierte aquí para que el eje X sea
// cronológico, lectura natural izquierda→derecha de una serie temporal.
//
// Rediseño (rama rediseno-analisis-sesion): se descartó un tooltip por punto
// (ver historial de la rama) porque es aritméticamente imposible en móvil —
// docs/diseno/11 §314 exige objetivos táctiles ≥48px, y con
// LIMITE_SERIE_POR_DEFECTO=12 puntos en 280px cada columna mide ~23px; 12
// columnas de 48px necesitarían 576px contra los ~272px útiles de un
// teléfono de 320px. En su lugar: un único botón «Ver valores» que revela la
// lista completa. La <ul> está SIEMPRE en el DOM y SIEMPRE en el árbol de
// accesibilidad — colapsada usa `sr-only`, nunca `hidden`/`display:none`; el
// botón sólo controla si se VE, no si existe. No lo "optimices" añadiendo
// `hidden`: el contrato de Sparkline.tsx exige un equivalente accesible en
// texto permanente, y ocultarlo del árbol de accesibilidad lo rompería.
import { useId, useState } from "react";
import type { Historico } from "@conteo/shared/models/historico.js";
import { fecha, moneda } from "../../lib/formato.js";
import { Sparkline } from "./Sparkline.js";

export interface EvolucionMensualProps {
  readonly historicos: readonly Historico[]; // orden cerradaEn desc, como llega del repositorio
  readonly etiqueta: string;
}

const ANCHO = 280;
const ALTO = 64;
const PAD = 6;
const RADIO_PUNTO = 3;

export function EvolucionMensual({ historicos, etiqueta }: EvolucionMensualProps) {
  const [abierta, setAbierta] = useState(false);
  // `useId` y no una cadena fija (misma convención que AreasScreen y
  // AuditoriaScreen): dos instancias en la misma página compartirían el id y
  // dejarían `aria-controls` apuntando al `<ul>` equivocado.
  const idLista = useId();

  if (historicos.length === 0) {
    return (
      <figure aria-label={etiqueta}>
        <p className="mt-3 text-micro text-tenue">Sin cierres anteriores para comparar.</p>
      </figure>
    );
  }

  const serie = [...historicos].reverse();

  return (
    <figure aria-label={etiqueta} className="flex flex-col gap-3">
      {/* w-full con tope de 280px: fluido en una card angosta (320px) sin
          desbordar ni superar el ancho que el SVG llega a dibujar. */}
      <Sparkline
        valores={serie.map((h) => h.totalMonetario)}
        ancho={ANCHO}
        alto={ALTO}
        pad={PAD}
        radioPunto={RADIO_PUNTO}
        className="h-16 w-full max-w-[280px]"
      />

      <button
        type="button"
        aria-expanded={abierta}
        aria-controls={idLista}
        onClick={() => setAbierta(!abierta)}
        className="min-h-[var(--size-toque)] w-fit rounded-placa border border-borde px-3 text-micro text-tinta focus-visible:bg-placa-alta"
      >
        {abierta ? "Ocultar valores" : "Ver valores"}
      </button>

      {/* Equivalente accesible del SVG aria-hidden: permanece en el DOM y en
          el árbol de accesibilidad tanto colapsada como desplegada — sólo
          cambia si se ve. */}
      <ul id={idLista} className={`flex flex-col gap-1 ${abierta ? "" : "sr-only"}`}>
        {serie.map((h) => (
          <li key={h.sesionId} className="flex items-center gap-2 text-micro">
            <span className="text-tenue">{fecha(h.cerradaEn)}</span>
            <span className="text-tinta">{moneda(h.totalMonetario)}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
