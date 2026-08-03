// obtenerIdDispositivo — id estable por navegador para el campo `dispositivoId`
// del aporte (doc 04 §3), sólo para diagnóstico de sincronización.
const CLAVE_ALMACENAMIENTO = "conteo:dispositivoId";

// Caché en memoria: cubre el proceso completo (tests en Node, o el tiempo
// entre el primer render y que localStorage esté disponible) sin exigir
// almacenamiento persistente para que la id sea estable dentro de una sesión.
let idEnMemoria: string | undefined;

export function obtenerIdDispositivo(): string {
  if (typeof localStorage === "undefined") {
    return (idEnMemoria ??= crypto.randomUUID());
  }
  const existente = localStorage.getItem(CLAVE_ALMACENAMIENTO);
  if (existente) return existente;

  const nuevo = crypto.randomUUID();
  localStorage.setItem(CLAVE_ALMACENAMIENTO, nuevo);
  return nuevo;
}
