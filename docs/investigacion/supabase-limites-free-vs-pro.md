# Supabase — límites free vs. Pro para migración desde Firebase

Fecha: 2026-08-13 · Propósito: evaluar migración Firebase → Supabase para el Sistema de
Inventario. Fuentes: exclusivamente [supabase.com/docs](https://supabase.com/docs) y
[supabase.com/pricing](https://supabase.com/pricing) (documentación oficial).

**Patrón de uso evaluado.** 3 sucursales (tenants), ~6 sesiones de conteo al mes
(quincenales, con huecos de inactividad de ~2 semanas entre sesiones), hasta ~4 cajeros
concurrentes por sesión, gasto proyectado actual USD 0.

---

## 1. Pausado de proyectos free por inactividad

**Respuesta directa.** El plan Free pausa un proyecto tras **7 días** (una semana) sin
actividad suficiente. La restauración es **manual** (un clic en el dashboard), **no hay
pérdida de datos**, y la única forma de evitarlo en el plan Free es generar actividad
periódica; para eliminar el pausado por completo hace falta pasar a **Pro**.

**Detalle.**

- Umbral de inactividad: "A Free plan project is considered inactive if it does not
  receive sufficient user database activity over the past week"
  ([Supabase Docs — Project Pausing](https://supabase.com/docs/guides/platform/free-project-pausing)).
  La página de precios lo confirma en cifra redonda: "Free projects are paused after 1 week
  of inactivity" ([Supabase — Pricing](https://supabase.com/pricing)).
- Restauración: manual desde el dashboard — "Open the Supabase Dashboard, select the
  organization, followed by the paused project, click Resume project and confirm"
  ([Supabase Docs — Project Pausing](https://supabase.com/docs/guides/platform/free-project-pausing)).
  No existe restauración automática.
- Pérdida de datos: ninguna mientras el proyecto siga dentro de la ventana de restauración
  — "The project will return to its previous state, including data and configurations"
  ([Supabase Docs — Project Pausing](https://supabase.com/docs/guides/platform/free-project-pausing)).
  La ventana para restaurar un proyecto pausado es de **1 año** desde el pausado; pasado ese
  plazo ya no se puede restaurar vía Studio y sólo queda descargar el backup
  ([Supabase Docs — Project Pausing](https://supabase.com/docs/guides/platform/free-project-pausing)).
- Evitar el pausado en Free: no hay un interruptor de configuración; sólo generar
  actividad real (abrir el proyecto desde el dashboard o hacer llamadas a la API/base de
  datos) mantiene el proyecto activo
  ([Supabase Docs — Project Pausing](https://supabase.com/docs/guides/platform/free-project-pausing)).
- En Pro el pausado por inactividad no existe: "Paid projects cannot be paused and are not
  subject to pausing for inactivity"
  ([Supabase Docs — Project Pausing](https://supabase.com/docs/guides/platform/free-project-pausing);
  confirmado en [Supabase — Pricing](https://supabase.com/pricing), fila "Pausing": Free =
  "After 1 week of inactivity", Pro = "Never").

---

## 2. Límite de conexiones concurrentes de Realtime

**Respuesta directa.** Free: **200** conexiones concurrentes. Pro: **500** conexiones
concurrentes incluidas (ampliable a USD 10 por cada 1000 adicionales).

**Detalle.** Tabla de límites de Realtime
([Supabase Docs — Realtime Limits](https://supabase.com/docs/guides/realtime/limits)):

| Métrica                       | Free    | Pro       |
| ------------------------------ | ------- | --------- |
| Conexiones concurrentes         | 200     | 500       |
| Mensajes por segundo            | 100     | 500       |
| Canales por conexión            | 100     | 100       |
| Tamaño de payload de broadcast  | 256 KB  | 3 000 KB  |
| Joins de canal por segundo      | 100     | 500       |

El plan Pro puede ampliarse con el add-on "Peak connections" a USD 10 por cada 1000
conexiones adicionales sobre las 500 incluidas
([Supabase — Pricing](https://supabase.com/pricing)).

Para el patrón de uso (≤4 cajeros concurrentes por sesión, 3 sucursales ⇒ ≤12
conexiones simultáneas en el peor caso), ambos planes están muy por debajo del límite.

---

## 3. Límites de Edge Functions en el plan free

**Respuesta directa.** Free incluye **500 000 invocaciones/mes**. El límite de duración de
respuesta (wall-clock) es **150 s** en Free (400 s en planes pagos para llamadas en
background), con un tope de **CPU time de 2 s** por request y **256 MB** de memoria en
ambos planes. Los cold starts son del orden de decenas de milisegundos según el blog
técnico de Supabase, aunque la documentación de arquitectura solo garantiza "milliseconds"
sin cifra exacta.

**Detalle.**

- Invocaciones incluidas: Free = 500 000, Pro = 2 000 000 (luego USD 2 por millón
  adicional) ([Supabase — Pricing](https://supabase.com/pricing)).
- Duración de respuesta / wall-clock: "Wall Clock Duration" Free = 150 s, planes pagos =
  400 s (para invocaciones en background); "Request idle timeout" = 150 s en ambos planes;
  "Maximum CPU Time" = 2 s por request en ambos planes; "Maximum Memory" = 256 MB en ambos
  planes ([Supabase Docs — Functions Limits](https://supabase.com/docs/guides/functions/limits)).
- Cold start: la documentación de arquitectura solo afirma que las ejecuciones iniciales
  son rápidas ("milliseconds") gracias al formato ESZip y al runtime mínimo de Deno, sin
  dar una cifra concreta ni distinguir free/Pro
  ([Supabase Docs — Functions Architecture](https://supabase.com/docs/guides/functions/architecture)).
  No se encontró en la documentación oficial (`/docs` o `/pricing`) una cifra numérica de
  cold-start latency verificable como fuente primaria — cualquier número específico (p. ej.
  "42 ms") circula en blogs/anuncios y no se cita aquí por no cumplir el requisito de fuente
  primaria verificada en `/docs` o `/pricing`.

Para ~6 sesiones/mes de conteo, el volumen de invocaciones proyectado está órdenes de
magnitud por debajo de las 500 000 incluidas en Free.

---

## 4. Límites de la base de datos Postgres en el plan free

**Respuesta directa.** Free: **500 MB** de tamaño de base de datos, **5 GB** de egress y
**5 GB** de egress cacheado por mes, **60** conexiones directas máximas y **200** clientes
de pooler máximos (cómputo "Nano"). Sin límite de filas por tabla — Postgres/Supabase no
documentan un tope de número de filas, solo de tamaño en disco.

**Detalle.**

- Tamaño de base de datos: Free = 500 MB; al superarlo el proyecto entra en modo
  solo-lectura — "Free Plan projects enter read-only mode when your database size exceeds
  500 MB", con errores tipo `cannot execute INSERT in a read-only transaction`
  ([Supabase Docs — Database Size](https://supabase.com/docs/guides/platform/database-size)).
  Pro incluye 8 GB (luego USD 0.125/GB)
  ([Supabase — Pricing](https://supabase.com/pricing)).
- Egress/bandwidth: Free = 5 GB egress + 5 GB egress cacheado por mes; Pro = 250 GB egress
  (luego USD 0.09/GB) + 250 GB egress cacheado (luego USD 0.03/GB)
  ([Supabase — Pricing](https://supabase.com/pricing)).
- Filas: no se encontró ningún límite de número de filas en la documentación oficial. El
  único límite relacionado con "filas" es el **default de 1000 filas por respuesta de la
  API REST/PostgREST**, que es configurable por request (`.limit()` / header `Range`) y no
  un tope de almacenamiento
  ([Supabase Docs — JavaScript `limit()`](https://supabase.com/docs/reference/javascript/limit)).
  Confirmado: la guía de tamaño de base de datos solo habla de límite en MB/GB, nunca de
  cantidad de filas ([Supabase Docs — Database Size](https://supabase.com/docs/guides/platform/database-size)).
- Conexiones directas/pooled: el cómputo por defecto del plan Free es **Nano**, con **60**
  conexiones directas máximas y **200** clientes de pooler (Supavisor) máximos
  ([Supabase Docs — Compute and Disk](https://supabase.com/docs/guides/platform/compute-and-disk)).
  El tamaño de pool de backend hacia Postgres es configurable pero no puede superar el
  límite de conexiones directas del cómputo asignado
  ([Supabase Docs — Connecting to Postgres](https://supabase.com/docs/guides/database/connecting-to-postgres)).

Con hasta 4 cajeros concurrentes por sesión y 3 sucursales, el uso de conexiones proyectado
es mínimo frente a las 60 directas / 200 pooled de Free. El tamaño de datos de un sistema
de conteo de inventario (3 sucursales, 6 sesiones/mes) previsiblemente se mantiene muy por
debajo de 500 MB durante mucho tiempo.

---

## 5. ¿Es el pausado por inactividad un problema real para este patrón de uso?

**Respuesta directa: sí, es un problema práctico real, y sí, hace falta Pro específicamente
para evitarlo — no porque el resto de límites de Free se agoten (no se agotan), sino porque
la ventana de inactividad (**7 días**) es más corta que los huecos de inactividad del
patrón de uso (**~14 días** entre sesiones quincenales).**

**Justificación.**

- El umbral documentado de pausado es de 7 días sin actividad suficiente
  ([Supabase Docs — Project Pausing](https://supabase.com/docs/guides/platform/free-project-pausing);
  [Supabase — Pricing](https://supabase.com/pricing)).
- El patrón de uso descrito son sesiones de conteo quincenales, es decir huecos de ~14 días
  entre ráfagas de actividad. 14 días > 7 días: en el escenario normal (sin tráfico externo
  entre sesiones) el proyecto se pausaría antes de la siguiente sesión de conteo.
- No se encontró en la documentación oficial ningún cambio reciente de política que
  elimine o relaje el pausado en Free, ni una condición documentada bajo la cual Free
  evite el pausado por sí solo. El único cambio documentado es sobre la **ventana de
  restauración** de un proyecto ya pausado (ampliada a 1 año), no sobre el umbral de 7 días
  que dispara el pausado
  ([Supabase Docs — Project Pausing](https://supabase.com/docs/guides/platform/free-project-pausing)).
- La única mitigación documentada para Free es generar actividad real de forma periódica
  (visitar el dashboard o emitir requests/consultas) antes de que se cumplan los 7 días
  ([Supabase Docs — Project Pausing](https://supabase.com/docs/guides/platform/free-project-pausing)).
  Esto es un workaround operativo (p. ej. un cron externo), no una garantía de la
  plataforma, y añade una dependencia externa frágil para un sistema que hoy apunta a
  gasto USD 0.
- El resto de límites de Free (Realtime 200 conexiones, Edge Functions 500 000
  invocaciones/mes, DB 500 MB / 5 GB egress, 60 conexiones directas) sobran ampliamente
  para 3 sucursales × ~4 cajeros × 6 sesiones/mes — no son el factor decisivo.

---

## Recomendación

**Free tier no es suficiente para este patrón de uso si se depende de que el proyecto esté
disponible en cada sesión de conteo quincenal sin intervención manual previa: los huecos
de inactividad de ~14 días superan el umbral de pausado de 7 días documentado por
Supabase, por lo que el proyecto se pausaría entre sesiones y exigiría restaurarlo a mano
(o mantener un mecanismo externo de "ping" para evitarlo) antes de cada conteo — Pro
(USD 25/mes) es la única vía documentada que elimina el pausado por completo, ya que "paid
projects cannot be paused and are not subject to pausing for inactivity"
([Supabase Docs — Project Pausing](https://supabase.com/docs/guides/platform/free-project-pausing)).**
