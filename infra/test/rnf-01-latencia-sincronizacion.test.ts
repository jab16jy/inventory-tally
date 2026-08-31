/**
 * Mide RNF-01 (doc 01 §4): "cambio visible en otro dispositivo en < 3 s con
 * red estable". Nunca se había medido — ver issue #62 y
 * docs/diseno/13-decisiones-adr.md#adr-18 (decisión: test automatizado con
 * dos clientes contra el emulador, no smoke manual).
 *
 * Reutiliza el patrón de conexión de infra/test/reglas.test.ts
 * (@firebase/rules-unit-testing + infra/firestore.rules reales) en vez de
 * inventar uno nuevo: dos cajeros DISTINTOS de la MISMA sucursal, porque la
 * regla de lectura de aportes (infra/firestore.rules:71) permite a
 * cualquier cajero con esa sucursal en su claim leer cualquier aporte de la
 * sesión — es la forma real en que "otro dispositivo" ve el cambio, sin
 * depender del trigger de agregación (ADR-03/ADR-10, que ya declara su
 * propia frescura de 30 s y no es lo que RNF-01 mide).
 *
 * El cliente A escribe con la MISMA forma de documento que
 * `FirestoreConteoRepository.registrarAporte`
 * (packages/data/src/firebase/firestore-conteo-repository.ts:217-239) sobre
 * `sesiones/{sesionId}/lineas/{categoriaId}/aportes/{uid}`; el cliente B
 * cronometra su propio `onSnapshot` sobre ese mismo documento — el mismo
 * mecanismo que usa `observarMiAporte`/`observarLineas` en producción.
 *
 * No se instancia `FirestoreConteoRepository` directamente porque espera el
 * SDK modular (`firebase/firestore` + `initializeApp`), mientras que el
 * patrón de conexión ya establecido en este repo para el emulador
 * (`@firebase/rules-unit-testing`) entrega clientes del SDK compat. Se
 * prefirió reutilizar el patrón existente (instrucción explícita del
 * ticket) antes que introducir una segunda forma de conectar al emulador
 * sólo para este test.
 */
import fs from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
// SÓLO tipos, mismo motivo que infra/test/reglas.test.ts (issue #47): no
// construir nada desde este import, sólo tipar las referencias compat.
import type firebase from "firebase/compat/app";
import { resumenLatencias } from "./percentiles.js";

type DocRef = firebase.firestore.DocumentReference<firebase.firestore.DocumentData>;

const ITERACIONES = 8;
const UMBRAL_MS = 3000; // RNF-01

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "demo-conteo-eficiente",
    firestore: {
      rules: fs.readFileSync("infra/firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  // Seed con reglas desactivadas (igual que reglas.test.ts): no es el
  // objeto bajo prueba, sólo el estado sobre el que se mide.
  await testEnv.withSecurityRulesDisabled(async (contexto) => {
    const db = contexto.firestore();
    await db.doc("sesiones/ses1").set({
      sucursalId: "suc_norte",
      sucursalNombre: "Sucursal Norte",
      estado: "abierta",
      participantes: ["uid_ana", "uid_luis"],
      totalUnidades: 0,
    });
    await db.doc("sesiones/ses1/lineas/cat_5000").set({
      categoriaId: "cat_5000",
      valorUnitario: 5000,
      etiqueta: "$5.000",
      cantidadTotal: 0,
      numAportantes: 0,
      versiones: {},
    });
  });
});

const cajero = (uid: string) =>
  testEnv.authenticatedContext(uid, { rol: "cajero", sucursales: ["suc_norte"] });

/**
 * Escribe una ronda desde `refEscritura` (cliente A) con `cantidad`/`version`
 * nuevos y cronometra cuánto tarda `refLectura` (cliente B, dispositivo
 * distinto) en recibir ESE valor exacto por `onSnapshot` — ignora snapshots
 * de rondas anteriores (caché local, estado inicial "no existe").
 */
function medirUnaRonda(refEscritura: DocRef, refLectura: DocRef, cantidad: number): Promise<number> {
  return new Promise((resolve, reject) => {
    let inicio = 0;
    // rechazar() cierra el listener antes de propagar el error — sin esto,
    // cualquier ruta de error (write rechazado o el propio onSnapshot fallando)
    // deja un listener de Firestore activo sin cancelar (hallado por revisión
    // de resiliencia).
    const rechazar = (error: unknown): void => {
      unsub();
      reject(error);
    };
    const unsub = refLectura.onSnapshot((snap) => {
      if (!snap.exists) return;
      if (snap.data()?.cantidad !== cantidad) return;
      const duracionMs = performance.now() - inicio;
      unsub();
      resolve(duracionMs);
    }, rechazar);

    inicio = performance.now();
    // Mismo shape mínimo que exige infra/firestore.rules:77-94: uid, cantidad,
    // version (create arranca en 1, update exige version estrictamente mayor).
    refEscritura.set({ uid: "uid_ana", cantidad, version: cantidad }, { merge: true }).catch(rechazar);
  });
}

describe("RNF-01 · latencia de sincronización entre dos dispositivos (issue #62)", () => {
  it(
    `propaga un aporte real de un cajero a otro dispositivo (p95 < ${UMBRAL_MS} ms)`,
    async () => {
      const clienteA = cajero("uid_ana").firestore();
      const clienteB = cajero("uid_luis").firestore();
      const refEscritura = clienteA.doc(
        "sesiones/ses1/lineas/cat_5000/aportes/uid_ana",
      ) as unknown as DocRef;
      const refLectura = clienteB.doc(
        "sesiones/ses1/lineas/cat_5000/aportes/uid_ana",
      ) as unknown as DocRef;

      const muestras: number[] = [];
      for (let i = 0; i < ITERACIONES; i++) {
        muestras.push(await medirUnaRonda(refEscritura, refLectura, i + 1));
      }

      const resumen = resumenLatencias(muestras);
      // Entregable central del ticket #62: la cifra real, no sólo un
      // pass/fail silencioso (issue: "registrar el resultado real").
      console.log(
        `RNF-01 · latencia onSnapshot emulador (n=${ITERACIONES}): ` +
          `promedio=${resumen.promedio.toFixed(1)}ms p50=${resumen.p50.toFixed(1)}ms ` +
          `p95=${resumen.p95.toFixed(1)}ms max=${resumen.maximo.toFixed(1)}ms`,
      );

      expect(resumen.p95).toBeLessThan(UMBRAL_MS);
    },
    // ponytail: 90s de margen de test (no del umbral RNF-01, que sigue en
    // UMBRAL_MS=3000) porque el emulador arranca en frío en CI (runner
    // compartido) y las 8 rondas secuenciales agotaban los 30s originales
    // sin completar ni una. Subir si vuelve a agotarse.
    90_000,
  );
});
