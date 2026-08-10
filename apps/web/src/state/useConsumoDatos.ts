// apps/web/src/state/useConsumoDatos.ts — issue #20 item 2 (doc 11 §24, fila
// "Datos móviles": "consumo visible"). Hoy sólo existe el aviso de precarga
// con WiFi (plan-diseno-visual-pwa.md §7): el consumo DURANTE la sesión era
// un vacío silencioso, sin ninguna razón documentada para omitirlo.
//
// ponytail: estimación, no medición exacta — no hay forma de leer bytes
// reales del canal WebSocket de Firestore desde el cliente sin instrumentar
// el SDK, y el issue lo dice explícito ("no necesita ser byte-perfecto").
// Se aproxima contando cuántas líneas trae cada emisión del listener de
// `lineas` — el tráfico dominante de esta pantalla — por un tamaño medio de
// documento. Sólo sube, nunca baja: sirve para dar el orden de magnitud, no
// para auditar el plan de datos. Techo: si algún día hace falta un número
// creíble para el cajero, la vía real es medir en el Service Worker
// (`fetch`/`sync` interceptados) — mucho más trabajo del que este alcance pide.
import { useEffect, useRef, useState } from "react";
import type { LineaConteo } from "@conteo/shared";

/** Tamaño medio estimado de un documento `LineaConteo` serializado
 *  (categoriaId + etiqueta + cantidadTotal + versiones + timestamps). */
const BYTES_POR_LINEA = 220;

export function useConsumoDatos(lineas: readonly LineaConteo[]): number {
  const totalRef = useRef(0);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    totalRef.current += lineas.length * BYTES_POR_LINEA;
    setTotal(totalRef.current);
    // `lineas` se lee por closure; el efecto debe correr en CADA emisión del
    // listener (cada cambio de identidad del array), no sólo cuando cambia
    // su longitud.
  }, [lineas]);

  return total;
}
