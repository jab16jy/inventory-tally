/**
 * sembrar-grilla-categorias.ts — crea la grilla de categorías de valor en un
 * proyecto REAL de Firebase (dev o prod), fuera del emulador. El panel crea
 * de a una por formulario; esto es para poblar el catálogo entero de un
 * negocio nuevo.
 *
 * Uso (con una service account real descargada desde la consola de Firebase
 * o `gcloud auth application-default login`):
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
 *   node --experimental-strip-types tools/sembrar-grilla-categorias.ts <proyecto> [desde] [hasta] [paso]
 *
 * Por defecto: $1.000 → $20.000 de $500 en $500 (39 categorías).
 *
 * Las categorías nacen GLOBALES: sin `sucursalesAsignadas` (las ve toda
 * sucursal, D4/D6) y sin `areaIds` (las ve todo contador, D-2 — una línea sin
 * área nunca se oculta). Asignar área o sucursal es trabajo del panel después.
 *
 * Idempotente: el id es `cat_{valor}` (misma convención que tools/seed.ts) y
 * las que ya existen se dejan INTACTAS, no se reescriben — si alguien les
 * asignó áreas desde el panel, volver a correr esto no se las borra.
 *
 * Escribe con el Admin SDK, así que no pasa por la callable `crearCategoria`
 * y NO deja eventos `CATEGORIA_CREADA` en auditoría. Es deliberado: es una
 * carga inicial de catálogo, no una operación de negocio de un admin.
 */
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const LIMITE_LOTE = 400; // el batch de Firestore corta en 500 operaciones

const [, , proyecto, desdeArg, hastaArg, pasoArg] = process.argv;

if (!proyecto) {
  console.error(
    "Uso: node --experimental-strip-types tools/sembrar-grilla-categorias.ts <proyecto> [desde] [hasta] [paso]",
  );
  process.exit(1);
}

/** Frontera de confianza: un argumento mal tecleado aquí escribe basura en el
 *  catálogo de producción, así que se valida antes de tocar Firestore. */
function enteroPositivo(valor: string | undefined, porDefecto: number, nombre: string): number {
  if (valor === undefined) return porDefecto;
  const n = Number(valor);
  if (!Number.isInteger(n) || n <= 0) {
    console.error(`${nombre} tiene que ser un entero positivo, no "${valor}".`);
    process.exit(1);
  }
  return n;
}

const desde = enteroPositivo(desdeArg, 1000, "desde");
const hasta = enteroPositivo(hastaArg, 20000, "hasta");
const paso = enteroPositivo(pasoArg, 500, "paso");

if (hasta < desde) {
  console.error(`"hasta" (${hasta}) no puede ser menor que "desde" (${desde}).`);
  process.exit(1);
}

const valores: number[] = [];
for (let valor = desde; valor <= hasta; valor += paso) valores.push(valor);

if (valores.length > LIMITE_LOTE) {
  console.error(
    `El rango pedido son ${valores.length} categorías y este script escribe en un solo lote (máximo ${LIMITE_LOTE}). Acota el rango o sube el paso.`,
  );
  process.exit(1);
}

initializeApp({ credential: applicationDefault(), projectId: proyecto });
const db = getFirestore();

async function sembrar(): Promise<void> {
  const refs = valores.map((valor) => db.doc(`categoriasValor/cat_${valor}`));
  const existentes = await db.getAll(...refs);

  const lote = db.batch();
  let creadas = 0;
  valores.forEach((valor, indice) => {
    // `getAll` devuelve un snapshot por posición, en el mismo orden que `refs`.
    if (existentes[indice]!.exists) return;
    lote.set(refs[indice]!, {
      valor,
      etiqueta: `$${valor.toLocaleString("es-CO")}`,
      activa: true,
      orden: indice + 1,
      creadaEn: FieldValue.serverTimestamp(),
    });
    creadas++;
  });

  if (creadas > 0) await lote.commit();

  console.log(
    `Grilla $${desde.toLocaleString("es-CO")} → $${hasta.toLocaleString("es-CO")} de $${paso.toLocaleString("es-CO")} en $${paso.toLocaleString("es-CO")} sobre ${proyecto}:`,
  );
  console.log(`  Creadas:      ${creadas}`);
  console.log(`  Ya existían:  ${valores.length - creadas}`);
  console.log(
    "Una sesión YA abierta no las ve (invariante I-7): sólo las siembra la próxima apertura.",
  );
}

await sembrar();
