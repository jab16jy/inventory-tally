// apps/web/src/ui/primitivos/ChipEstado.tsx
//
// El chip de sincronización de la cabecera. Usa el mismo eje de relleno que
// LA FIRMA de Placa (sólido = a salvo, hueco = en tránsito) más el único
// rojo del sistema para el tercer estado — nunca verde (plan §1, "por qué
// ámbar, y por qué no hay verde"): "sin conexión" es el que de verdad
// angustia, porque mientras dure no hay forma de confirmar nada nuevo con
// el servidor.
import clsx from "clsx";

const CONFIG = {
  sincronizado: {
    texto: "Sincronizado",
    punto: "bg-senal",
    borde: "border-senal",
    tinta: "text-tinta",
  },
  pendiente: {
    texto: "Sincronizando",
    punto: "border border-senal",
    borde: "border-senal-hueco",
    tinta: "text-tenue",
  },
  "sin-conexion": {
    texto: "Sin conexión",
    punto: "bg-riesgo",
    borde: "border-riesgo",
    tinta: "text-tinta",
  },
} as const;

export interface ChipEstadoProps {
  readonly estado: keyof typeof CONFIG;
}

export function ChipEstado({ estado }: ChipEstadoProps) {
  const cfg = CONFIG[estado];
  return (
    <span
      // Región viva discreta (F4-B, doc 11 §9): "Sincronizado" ⇄ "Sin
      // conexión" es justo el cambio que más le importa al cajero y hoy
      // sólo lo comunicaba el color, que no llega a un lector de pantalla.
      // `polite`, nunca `assertive`: ese nivel está reservado a
      // BannerPendientes (riesgo real de pérdida de datos), y un cambio de
      // chip no puede competir por esa misma urgencia.
      aria-live="polite"
      className={clsx(
        "inline-flex shrink-0 items-center gap-1.5 rounded-placa border px-2 py-1 text-micro",
        cfg.borde,
        cfg.tinta,
      )}
    >
      <span aria-hidden="true" className={clsx("size-2 shrink-0 rounded-full", cfg.punto)} />
      {cfg.texto}
    </span>
  );
}
