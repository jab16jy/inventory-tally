// infra/test/aporte-repositorio-real.test.ts
//
// Red que faltó en las 4 rondas de revisión de la ola de áreas (issue #83,
// Judgment Day etapa 2): ningún test ejecutaba jamás el
// FirestoreConteoRepository REAL contra el emulador de Firestore con
// infra/firestore.rules reales cargadas.
// - firestore-conteo-repository.test.ts stubea setDoc/doc del SDK modular:
//   nunca evalúa una regla real.
// - reglas.test.ts prueba las reglas a mano, replicando el shape esperado a
//   mano: nunca llama al método real del repositorio.
// Este test cierra esa costura: instancia la clase real, con el SDK modular
// real (firebase/firestore), autenticada de verdad contra el emulador de
// Auth. infra/firestore.rules lee `request.auth.token`, que sale de un ID
// token real — `ProveedorUsuarioActual` sólo aporta uid/nombre para el
// CONTENIDO del documento (doc 07 §6), nunca para la identidad de la
// conexión. Por eso `test:rules` arranca `--only firestore,auth`, no sólo
// firestore.
import { randomUUID } from "node:crypto";
import { getApps as appsAdmin, initializeApp as inicializarAppAdmin } from "firebase-admin/app";
import {
  getFirestore as firestoreAdmin,
  type DocumentReference,
  type DocumentSnapshot,
} from "firebase-admin/firestore";
import { deleteApp, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInWithCustomToken } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { FirestoreConteoRepository } from "@conteo/data";

if (appsAdmin().length === 0) {
  inicializarAppAdmin({ projectId: "demo-conteo-eficiente" });
}
const dbAdmin = firestoreAdmin();

let clienteApp: FirebaseApp;

beforeAll(async () => {
  clienteApp = initializeApp(
    { projectId: "demo-conteo-eficiente", apiKey: "demo-api-key" },
    "cliente-aporte-real",
  );
  connectFirestoreEmulator(getFirestore(clienteApp), "127.0.0.1", 8080);
  connectAuthEmulator(getAuth(clienteApp), "http://127.0.0.1:9099");

  // signInWithCustomToken mezcla los "developer claims" del segundo
  // argumento de createCustomToken dentro del ID token resultante — igual
  // que setCustomUserClaims, pero sin depender de que el usuario ya exista
  // en el emulador de Auth (lo crea al vuelo en el primer intercambio).
  const { getAuth: authAdmin } = await import("firebase-admin/auth");
  const token = await authAdmin().createCustomToken("uid_ana_real", {
    rol: "cajero",
    sucursales: ["suc_norte"],
  });
  await signInWithCustomToken(getAuth(clienteApp), token);
});

afterAll(() => deleteApp(clienteApp));

const sesionesCreadas: string[] = [];

afterEach(async () => {
  const pendientes = sesionesCreadas.splice(0);
  await Promise.all(pendientes.map((id) => dbAdmin.recursiveDelete(dbAdmin.doc(`sesiones/${id}`))));
});

/** El repositorio real dispara `setDoc` sin esperar (doc 07 §6, offline-first):
 *  hay que sondear el emulador hasta que la escritura confirme, no asumir
 *  que ya está ahí al volver de `registrarAporte`. */
async function esperarDoc(ref: DocumentReference): Promise<DocumentSnapshot> {
  for (let intento = 0; intento < 60; intento++) {
    const snap = await ref.get();
    if (snap.exists) return snap;
    await new Promise((resolver) => setTimeout(resolver, 100));
  }
  throw new Error(`${ref.path} nunca apareció (issue #83: ¿sigue faltando areaId?)`);
}

describe("FirestoreConteoRepository.registrarAporte · repositorio real contra emulador con reglas reales (issue #83)", () => {
  it("escribe la clave compuesta {uid}__{areaId} que infra/firestore.rules exige", async () => {
    const sesionId = `ses_${randomUUID()}`;
    sesionesCreadas.push(sesionId);
    await dbAdmin.doc(`sesiones/${sesionId}`).set({
      sucursalId: "suc_norte",
      sucursalNombre: "Sucursal Norte",
      estado: "abierta",
      participantes: [],
      totalUnidades: 0,
    });
    await dbAdmin.doc(`sesiones/${sesionId}/lineas/cat_1`).set({
      categoriaId: "cat_1",
      valorUnitario: 1000,
      etiqueta: "Prueba",
      porArea: {},
      cantidadTotal: 0,
      numAportantes: 0,
      versiones: {},
    });

    const repo = new FirestoreConteoRepository(
      getFirestore(clienteApp),
      { obtenerUid: () => "uid_ana_real", obtenerNombre: () => "Ana Real" },
      getFunctions(clienteApp),
    );

    await repo.registrarAporte({
      sesionId,
      categoriaId: "cat_1",
      areaId: "area_1",
      cantidad: 3,
    });

    const ref = dbAdmin.doc(`sesiones/${sesionId}/lineas/cat_1/aportes/uid_ana_real__area_1`);
    const snap = await esperarDoc(ref);
    expect(snap.data()?.areaId).toBe("area_1");
    expect(snap.data()?.cantidad).toBe(3);
  }, 15_000);
});
