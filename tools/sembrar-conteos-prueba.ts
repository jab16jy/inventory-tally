/**
 * sembrar-conteos-prueba.ts — siembra 5 sucursales nuevas (6 en total, junto
 * con `suc_norte`) y 20 conteos (`sesiones`) YA CERRADOS, repartidos entre
 * las 6, cada uno con 3 líneas ($1.000, $2.000, $5.000 — cat_1000/2000/5000
 * de sembrar-datos-prueba.ts) y su `resumen`/`historicos` derivados, igual
 * que escribiría `cerrarSesionImpl` (packages/functions/src/callables/
 * cerrar-sesion.ts) — sin pasar por el trigger `onAporteEscrito` real,
 * porque para ver la UI poblada no hace falta reproducir cada aporte
 * individual, sólo el estado final que esa cadena de escrituras produce.
 *
 * Cada sesión queda marcada con `abiertaPor`/`cerradaPor` = MARCADOR para
 * que borrar-conteos-prueba.ts la encuentre por query, sin manifiesto aparte.
 *
 * Uso:
 *   GOOGLE_APPLICATION_CREDENTIALS=<service-account.json> \
 *   node --experimental-strip-types tools/sembrar-conteos-prueba.ts <proyecto>
 */
import { randomUUID } from "node:crypto";
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { CAJEROS } from "./datos-prueba.ts";
import {
  AREA_POR_CATEGORIA,
  CATEGORIAS_CONTEO,
  MARCADOR,
  NUM_CONTEOS,
  SUCURSALES_NUEVAS,
  TODAS_SUCURSALES_CONTEO,
} from "./datos-conteos-prueba.ts";

const [, , proyecto] = process.argv;

if (!proyecto) {
  console.error("Uso: node --experimental-strip-types tools/sembrar-conteos-prueba.ts <proyecto>");
  process.exit(1);
}

initializeApp({ credential: applicationDefault(), projectId: proyecto });
const auth = getAuth();
const db = getFirestore();

function generarSesionId(sucursalId: string, fecha: Date): string {
  const partes = [
    fecha.getUTCFullYear(),
    String(fecha.getUTCMonth() + 1).padStart(2, "0"),
    String(fecha.getUTCDate()).padStart(2, "0"),
  ].join("");
  return `ses_${partes}_${sucursalId}_${randomUUID().slice(0, 8)}`;
}

function entero(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/**
 * Reparte `total` unidades entre `n` participantes de forma que la suma sea
 * EXACTAMENTE `total` — el resto se distribuye de a una unidad entre los
 * primeros, igual que el método del mayor resto de `distribuirRedondeo`.
 *
 * El invariante importa: el trigger real escribe `cantidadTotal` y `aplicados`
 * en la misma transacción, así que en producción siempre cuadran. Si el
 * seeder los dejara descuadrados, el desglose por cajero mostraría una fila
 * "Sin atribuir" que no existe en datos reales.
 *
 * ponytail: sin test — `tools/` no tiene runner (sólo `typecheck`) y montar
 * vitest aquí para una función de siembra sería andamiaje. Techo: si `tools/`
 * gana lógica propia de verdad, se le monta vitest y ésta es la primera que
 * lo estrena.
 */
function repartir(total: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(total / n);
  const resto = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < resto ? 1 : 0));
}

async function sembrarSucursalesNuevas(): Promise<void> {
  const lote = db.batch();
  for (const sucursal of SUCURSALES_NUEVAS) {
    lote.set(db.doc(`sucursales/${sucursal.id}`), {
      nombre: sucursal.nombre,
      direccion: sucursal.direccion,
      conectividad: "datos",
      activa: true,
      sesionAbiertaId: null,
      creadaEn: new Date(),
    });
  }
  await lote.commit();
}

async function uidsParticipantes(): Promise<string[]> {
  const uids: string[] = [];
  for (const { correo } of CAJEROS) {
    try {
      uids.push((await auth.getUserByEmail(correo)).uid);
    } catch {
      // Si aún no se corrió sembrar-datos-prueba.ts, la sesión queda sin
      // participantes reales — sigue siendo válida para ver la UI.
    }
  }
  return uids;
}

async function sembrarConteo(sucursalId: string, uids: string[], diasAtras: number): Promise<void> {
  const fecha = new Date();
  fecha.setUTCDate(fecha.getUTCDate() - diasAtras);
  const sesionId = generarSesionId(sucursalId, fecha);
  const sucursalNombre =
    SUCURSALES_NUEVAS.find((s) => s.id === sucursalId)?.nombre ?? "Sucursal Norte";

  const lineas = CATEGORIAS_CONTEO.map((categoriaId) => {
    const valorUnitario = Number(categoriaId.replace("cat_", ""));
    return {
      categoriaId,
      valorUnitario,
      etiqueta: `$${valorUnitario.toLocaleString("es-CO")}`,
      cantidadTotal: entero(3, 50),
    };
  });

  const totalUnidades = lineas.reduce((total, l) => total + l.cantidadTotal, 0);
  const totalMonetario = lineas.reduce((total, l) => total + l.cantidadTotal * l.valorUnitario, 0);
  const porCategoria = Object.fromEntries(
    lineas.map((l) => [
      l.categoriaId,
      {
        cantidad: l.cantidadTotal,
        subtotal: l.cantidadTotal * l.valorUnitario,
        actualizadaEn: fecha,
      },
    ]),
  );
  const ordenadas = [...lineas].sort((a, b) => b.cantidadTotal - a.cantidadTotal);
  const mayor = ordenadas[0]!;
  const menor = ordenadas[ordenadas.length - 1]!;
  const categoriaMayor = {
    categoriaId: mayor.categoriaId,
    etiqueta: mayor.etiqueta,
    cantidad: mayor.cantidadTotal,
  };
  const categoriaMenor = {
    categoriaId: menor.categoriaId,
    etiqueta: menor.etiqueta,
    cantidad: menor.cantidadTotal,
  };

  const lote = db.batch();

  lote.set(db.doc(`sesiones/${sesionId}`), {
    sucursalId,
    sucursalNombre,
    estado: "cerrada",
    abiertaEn: fecha,
    abiertaPor: MARCADOR,
    cerradaEn: fecha,
    cerradaPor: MARCADOR,
    participantes: uids,
    totalUnidades,
    sesionCorregidaId: null,
    forzado: false,
    sinConfirmarAlCerrar: [],
  });

  for (const linea of lineas) {
    // `aplicados` es la atribución por persona que lee el desglose por cajero
    // del análisis de sesión — el mismo campo que escribe `onAporteEscrito`.
    // Sin él, la dimensión "Cajero" saldría vacía con datos sembrados; sin
    // `area`, la dimensión "Área" agruparía todo bajo una clave ausente.
    const porUid = repartir(linea.cantidadTotal, uids.length);
    lote.set(db.doc(`sesiones/${sesionId}/lineas/${linea.categoriaId}`), {
      categoriaId: linea.categoriaId,
      valorUnitario: linea.valorUnitario,
      etiqueta: linea.etiqueta,
      area: AREA_POR_CATEGORIA[linea.categoriaId] ?? "Sin área",
      cantidadTotal: linea.cantidadTotal,
      numAportantes: uids.length || 1,
      versiones: Object.fromEntries(uids.map((uid) => [uid, 1])),
      aplicados: Object.fromEntries(uids.map((uid, i) => [uid, porUid[i]!])),
      actualizadaEn: fecha,
      actualizadaPor: uids[0] ?? MARCADOR,
    });
  }

  lote.set(db.doc(`sesiones/${sesionId}/resumen/actual`), {
    totalUnidades,
    totalMonetario,
    numCategoriasConConteo: lineas.length,
    categoriaMayor,
    categoriaMenor,
    porCategoria,
    recalculadoEn: fecha,
    dirty: false,
  });

  lote.set(db.doc(`sucursales/${sucursalId}/historicos/${sesionId}`), {
    sesionId,
    cerradaEn: fecha,
    totalUnidades,
    totalMonetario,
    porCategoria,
  });

  await lote.commit();
}

async function sembrar(): Promise<void> {
  await sembrarSucursalesNuevas();
  const uids = await uidsParticipantes();

  for (let i = 0; i < NUM_CONTEOS; i++) {
    const sucursalId = TODAS_SUCURSALES_CONTEO[i % TODAS_SUCURSALES_CONTEO.length]!;
    await sembrarConteo(sucursalId, uids, i);
  }

  console.log(
    `Sembrados en ${proyecto}: ${SUCURSALES_NUEVAS.length} sucursales nuevas (6 en total con suc_norte), ${NUM_CONTEOS} conteos cerrados.`,
  );
}

await sembrar();
