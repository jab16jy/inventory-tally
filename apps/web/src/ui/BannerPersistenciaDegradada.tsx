// apps/web/src/ui/BannerPersistenciaDegradada.tsx
//
// Convierte el warning silencioso del SDK ("Falling back to memory cache")
// en estado visible: sin esto, el cajero cuenta creyendo que hay
// persistencia offline y sus aportes se pierden al cerrar la pestaña sin
// red (ver src/lib/persistencia-monitor.ts).
import type { MonitorPersistencia } from "../lib/persistencia-monitor.js";
import { usePersistenciaDegradada } from "../state/usePersistenciaDegradada.js";

interface BannerPersistenciaDegradadaProps {
  readonly monitor: MonitorPersistencia;
}

export function BannerPersistenciaDegradada({ monitor }: BannerPersistenciaDegradadaProps) {
  const degradada = usePersistenciaDegradada(monitor);
  if (!degradada) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="border-b border-riesgo bg-riesgo-placa px-3 py-2.5 text-base text-tinta"
    >
      <strong className="font-semibold text-riesgo">Sin guardado sin conexión.</strong> Este
      dispositivo no pudo guardar el conteo sin conexión. Mantén la app abierta y con señal hasta
      terminar, o tus conteos podrían perderse.
    </div>
  );
}
