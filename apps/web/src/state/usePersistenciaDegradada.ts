// apps/web/src/state/usePersistenciaDegradada.ts
import { useEffect, useState } from "react";
import type { MonitorPersistencia } from "../lib/persistencia-monitor.js";

export function usePersistenciaDegradada(monitor: MonitorPersistencia): boolean {
  const [degradada, setDegradada] = useState(monitor.estaDegradada());

  useEffect(() => monitor.subscribe(setDegradada), [monitor]);

  return degradada;
}
