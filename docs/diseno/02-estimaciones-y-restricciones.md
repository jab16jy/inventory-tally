# 02 · Estimaciones y restricciones

[← Requisitos](01-requisitos-y-alcance.md) · [Índice](README.md) · [Siguiente: Modelo de dominio →](03-modelo-de-dominio.md)

---

## 1. Parámetros del escenario

Actualizados con la frecuencia real de conteo confirmada en la fase de requisitos.

| Parámetro                        |              Valor estimado | Valor de estrés (×5) |
| -------------------------------- | --------------------------: | -------------------: |
| Sucursales                       |                           5 |                   25 |
| Cajeros activos                  |                          20 |                  100 |
| Cajeros simultáneos por sucursal |                           4 |                   10 |
| Categorías de valor              |                          60 |                  200 |
| **Conteos por sucursal al mes**  | **1,5 (quincenal/mensual)** |                    6 |
| Correcciones por línea contada   |                           2 |                    4 |
| Duración de una sesión de conteo |                       2–4 h |                  6 h |

> **Cambio clave respecto a la v1**, que asumía conteo semanal (4/mes). El volumen baja
> a un tercio — pero la concentración sube: todas las escrituras de una sucursal ocurren
> dentro de una ventana de 2 a 4 horas, no repartidas en el mes.

---

## 2. Volumen de escritura

Una **línea de aporte** = (sesión × categoría × cajero).

```
Aportes por sesión         = 60 categorías × 4 cajeros              = 240 documentos
Escrituras por sesión      = 240 × 3 versiones (alta + 2 correcciones) = 720
Sesiones por mes           = 5 sucursales × 1,5                     = 7,5
Escrituras de cliente/mes  = 720 × 7,5                              ≈ 5.400
```

Cada escritura dispara un trigger con **3 escrituras derivadas** (línea, marca del
resumen, evento de auditoría):

```
Escrituras derivadas/mes   = 5.400 × 3                              ≈ 16.200
TOTAL escrituras/mes                                                ≈ 21.600
```

### Lo que importa no es el promedio mensual, es el pico

```
Escrituras en una sesión   = 720 cliente + 2.160 derivadas          = 2.880
Ventana de la sesión       = 3 horas                                = 10.800 s
Tasa media durante el pico = 2.880 / 10.800                         ≈ 0,27 escrituras/s
Día con 2 sucursales contando                                       ≈ 5.760 escrituras
```

| Cuota de Firestore    | Uso en el peor día |     Margen |
| --------------------- | -----------------: | ---------: |
| 20.000 escrituras/día |              5.760 | 71 % libre |
| 50.000 lecturas/día   |            < 3.000 | 94 % libre |

**Conclusión:** el plan gratuito Spark sostiene incluso el peor día. El plan Blaze sigue
siendo necesario por Cloud Functions, con costo prácticamente nulo a este volumen.

---

## 3. Volumen de lectura y el diseño que lo mantiene bajo

| Pantalla                       |                Diseño ingenuo |     Diseño adoptado | Ahorro |
| ------------------------------ | ----------------------------: | ------------------: | -----: |
| Conteo (cajero)                |            240 docs de aporte |    60 docs de línea |     4× |
| Dashboard operativo del cajero |                      240 docs | 60 docs ya en caché |      — |
| Dashboard analítico del admin  | 240 docs + cálculo en cliente | **1 doc `resumen`** |   240× |
| Comparativo de 5 sucursales    |                    1.200 docs | 5 docs `historicos` |   240× |
| Auditoría                      |            colección completa |   25 docs paginados |      — |

Justificación completa en [10 · Análisis y dashboards](10-analisis-y-dashboards.md).

---

## 4. Presupuesto de datos móviles

Requisito nuevo (RNF-10): en algunas sucursales el cajero usa su plan personal.

| Concepto                                     | Primera carga (PWA) |    Carga posterior |
| -------------------------------------------- | ------------------: | -----------------: |
| Descarga de la app (bundle Vite, comprimido) |             ~400 KB | 0 (service worker) |
| Catálogo + sesión al iniciar                 |              ~40 KB |             ~40 KB |
| Escuchas durante 3 h de conteo               |             ~600 KB |            ~600 KB |
| Escrituras de aportes                        |             ~150 KB |            ~150 KB |
| **Total por sesión (sin primera carga)**     |        **≈ 0,8 MB** |       **≈ 0,8 MB** |

Dentro de RNF-10 (< 1,5 MB). La única carga significativa es la inicial de la PWA, que
se mitiga pidiendo al cajero abrir la app **con WiFi antes de bajar a bodega**
([11 · UX](11-ux-y-navegacion.md)).

---

## 5. Tamaño de los datos a un año

| Documento         | Tamaño | Cantidad/año |       Total |
| ----------------- | -----: | -----------: | ----------: |
| `usuarios`        |  400 B |           20 |        8 KB |
| `sucursales`      |  300 B |            5 |      1,5 KB |
| `categoriasValor` |  250 B |           60 |       15 KB |
| `sesiones`        |  600 B |           90 |       54 KB |
| `lineas`          |  350 B |        5.400 |      1,9 MB |
| `aportes`         |  300 B |       21.600 |      6,5 MB |
| `auditoria`       |  500 B |       64.800 |       32 MB |
| **Total**         |        |              | **≈ 41 MB** |

Cuota gratuita: 1 GiB. A un año se usa ~4 %. Con retención de 12 meses de auditoría, el
sistema se estabiliza cerca de ese valor sin crecer indefinidamente.

---

## 6. Restricciones técnicas que condicionan el diseño

| Límite                              | Impacto                                       | Decisión de diseño                                                            |
| ----------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------- |
| **~1 escritura/s por documento**    | El `resumen` sería punto caliente             | Marca `dirty` + recálculo agrupado cada 30 s ([ADR-10](13-decisiones-adr.md)) |
| **1 MiB por documento**             | Mapa `porCategoria` en `resumen`              | 200 categorías ≈ 24 KB. Holgado                                               |
| **500 operaciones por transacción** | Siembra y cierre de sesión con 200 líneas     | Lotes de 400 documentos                                                       |
| **Sin `GROUP BY`**                  | Métricas del análisis                         | Agregados precalculados por trigger                                           |
| **10 valores en `in`**              | Filtro por sucursales asignadas               | Máximo 10 sucursales por cajero                                               |
| **Sin joins**                       | Auditoría necesita nombres                    | Denormalización dentro del evento                                             |
| **Índices compuestos obligatorios** | Consultas de auditoría                        | Declarados en `firestore.indexes.json`                                        |
| **Cold start de Functions (1–3 s)** | Primer aporte de la jornada                   | UI optimista: el aporte propio se ve al instante                              |
| **Persistencia web menos duradera** | Aportes en cola en la PWA                     | RF-16: verificación de sincronización al cerrar ([06](06-plataforma-web.md))  |
| **Caché web ~40 MB por defecto**    | No limitante: los datos por sesión son < 1 MB | Sin acción                                                                    |

---

## 7. Política de retención

| Colección                          | Retención            | Mecanismo                                        |
| ---------------------------------- | -------------------- | ------------------------------------------------ |
| `auditoria`                        | 12 meses en caliente | `purgarAuditoria` (cron mensual) purga; el archivo histórico es la exportación diaria de [12 §5](12-despliegue-y-entornos.md) |
| `aportes` de sesiones cerradas     | 6 meses              | Se conserva el snapshot agregado                 |
| `sesiones` cerradas + `historicos` | Indefinido           | Registro de negocio; ocupan poco                 |

---

## 8. Presupuesto de rendimiento en el cliente

| Métrica                          |                                                        Objetivo | Cómo se logra                                                                                   |
| -------------------------------- | --------------------------------------------------------------: | ----------------------------------------------------------------------------------------------- |
| Render de 200 categorías         |                                                   < 20 ms/frame | Lista virtualizada + memoización por fila                                                       |
| Reconstrucción por cambio remoto |                                           sólo la fila afectada | Hook con selector por categoría + `React.memo` en la fila ([07](07-monorepo-y-arquitectura.md)) |
| Arranque en frío                 | < 5 s en 4G (primera carga) · < 3 s con service worker caliente | Precarga por service worker (`vite-plugin-pwa`)                                                 |
| Tamaño de descarga               |                                      Bundle < 500 KB comprimido | Code-splitting y tree-shaking de Vite                                                           |

---

[← Requisitos](01-requisitos-y-alcance.md) · [Índice](README.md) · [Siguiente: Modelo de dominio →](03-modelo-de-dominio.md)
