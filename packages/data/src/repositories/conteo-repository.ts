// packages/data/src/repositories/conteo-repository.ts (doc 07 §6)
// Import por submódulo, no por el barrel `@conteo/shared`: el barrel
// re-exporta `Config` (config/entorno.ts), que exige el ambient
// `ImportMeta.env` de Vite — innecesario aquí y fuera del alcance de esta
// ola tocar `packages/shared` para exponerlo en este programa de TS.
import type { Aporte } from "@conteo/shared/models/aporte.js";
import type { LineaConteo } from "@conteo/shared/models/linea-conteo.js";
import type { SesionConteo } from "@conteo/shared/models/sesion-conteo.js";

export type Unsubscribe = () => void;

export interface RegistrarAporteInput {
  readonly sesionId: string;
  readonly categoriaId: string;
  readonly cantidad: number;
}

export interface ConteoRepository {
  observarLineas(sesionId: string, onChange: (lineas: LineaConteo[]) => void): Unsubscribe;

  observarMiAporte(
    sesionId: string,
    categoriaId: string,
    onChange: (aporte: Aporte | null) => void,
  ): Unsubscribe;

  observarSesionAbierta(
    sucursalId: string,
    onChange: (sesion: SesionConteo | null) => void,
  ): Unsubscribe;

  /** Registra o corrige el aporte propio. NUNCA escribe totales. */
  registrarAporte(input: RegistrarAporteInput): Promise<void>;

  /** Marca al usuario como sincronizado (RF-16). Sólo si no hay pendientes. */
  confirmarSincronizacion(sesionId: string): Promise<void>;

  /** Escrituras aún no confirmadas por el servidor. */
  observarEscriturasPendientes(sesionId: string, onChange: (n: number) => void): Unsubscribe;
}
