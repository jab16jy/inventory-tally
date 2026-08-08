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

/**
 * participanteSincronizado — predicado RF-16 desde la vista del admin (doc
 * 05 §3): ¿este participante está sincronizado, para efectos de la puerta de
 * cierre? Vive en el mismo archivo que `aporteConfirmado` porque responde la
 * misma pregunta de RF-16 —¿ya llegó al servidor?— desde otro ángulo: aquél
 * es "¿MI aporte ya confirmó?" (un cajero sobre sí mismo); éste es "¿este
 * participante está al día?" (el admin sobre cualquiera), y lo usan
 * `verificarSincronizacion` (functions) y `observarSincronizacion` (data)
 * para decidir si bloquean el cierre.
 *
 * sincronizado ⟺ confirmadoEn != null && confirmadoEn >= (ultimoAporteServidor ?? 0)
 *
 * `packages/shared` no puede importar `FirebaseFirestore.Timestamp` (SDK
 * admin) ni `Timestamp` (SDK cliente) sin romper la regla de dependencia, así
 * que recibe milisegundos planos: cada llamador convierte con `.toMillis()`
 * en su propia frontera.
 */
export function participanteSincronizado(
  confirmadoEnMillis: number | null,
  ultimoAporteServidorMillis: number | null,
): boolean {
  return confirmadoEnMillis != null && confirmadoEnMillis >= (ultimoAporteServidorMillis ?? 0);
}
