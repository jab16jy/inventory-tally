import type { Aporte } from "../models/aporte.js";
import type { LineaConteo } from "../models/linea-conteo.js";

/**
 * ¿El servidor ya agregó MI aporte a la línea? (doc 05 §3, RF-16)
 *
 * Es la única pregunta que de verdad angustia al cajero, y se responde sin
 * pedirle nada nuevo al repositorio: `aporte.version` la escribe este
 * dispositivo —y el listener la ve al instante desde la caché local de
 * Firestore, con o sin red—, mientras que `linea.versiones[uid]` sólo la
 * escribe el trigger `onAporteEscrito` DESPUÉS de agregar en el servidor.
 * Que la segunda alcance a la primera es, literalmente, la confirmación.
 *
 * Se compara con `>=` y no con `===` porque el mismo cajero puede haber
 * empujado la línea más adelante desde otro dispositivo: lo que este
 * teléfono escribió está agregado igual.
 */
export function aporteConfirmado(linea: LineaConteo, aporte: Aporte | null): boolean {
  if (!aporte) return false;
  return (linea.versiones[aporte.uid] ?? 0) >= aporte.version;
}
