// Pruebas de infra/firestore.rules (doc 09 §3 y §4).
//
// Criterio de aceptación del doc: "cada regla tiene al menos un test que la
// afirma y otro que la niega". Un caso negativo por sí solo pasaría también
// con las reglas en denegación total (el punto de partida de la ola O1) y no
// probaría nada; por eso cada amenaza trae su par afirmativo.
import fs from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
// D1: sólo para construir el sentinel FieldValue.increment() en el test
// afirmativo — el mismo cliente compat que ya usa @firebase/rules-unit-testing
// internamente (ver su public_types/index.d.ts).
import firebase from "firebase/compat/app";
import "firebase/compat/firestore";

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

  // Datos sembrados con las reglas desactivadas: no son el objeto bajo
  // prueba, sólo el estado sobre el que las reglas se evalúan.
  await testEnv.withSecurityRulesDisabled(async (contexto) => {
    const db = contexto.firestore();

    await db.doc("usuarios/uid_admin").set({ nombre: "Admin", rol: "admin" });
    await db.doc("usuarios/uid_ana").set({ nombre: "Ana Ramírez", rol: "cajero" });

    await db.doc("sucursales/suc_norte").set({ nombre: "Sucursal Norte", sesionAbiertaId: "ses1" });
    await db.doc("sucursales/suc_sur").set({ nombre: "Sucursal Sur", sesionAbiertaId: null });

    await db
      .doc("categoriasValor/cat_5000")
      .set({ valor: 5000, etiqueta: "$5.000", activa: true, orden: 1 });

    await db.doc("sesiones/ses1").set({
      sucursalId: "suc_norte",
      sucursalNombre: "Sucursal Norte",
      estado: "abierta",
      participantes: ["uid_ana", "uid_luis"],
      totalUnidades: 10,
    });
    await db.doc("sesiones/ses_cerrada").set({
      sucursalId: "suc_norte",
      sucursalNombre: "Sucursal Norte",
      estado: "cerrada",
      participantes: ["uid_ana"],
      totalUnidades: 10,
    });

    await db.doc("sesiones/ses1/lineas/cat_5000").set({
      categoriaId: "cat_5000",
      valorUnitario: 5000,
      etiqueta: "$5.000",
      cantidadTotal: 10,
      numAportantes: 1,
      versiones: { uid_ana: 1 },
    });
    await db.doc("sesiones/ses_cerrada/lineas/cat_5000").set({
      categoriaId: "cat_5000",
      valorUnitario: 5000,
      etiqueta: "$5.000",
      cantidadTotal: 10,
      numAportantes: 1,
      versiones: { uid_ana: 1 },
    });

    await db.doc("sesiones/ses1/lineas/cat_5000/aportes/uid_ana").set({
      uid: "uid_ana",
      nombre: "Ana Ramírez",
      cantidad: 10,
      version: 1,
    });

    await db.doc("sesiones/ses1/resumen/actual").set({ totalUnidades: 10, totalMonetario: 50000 });

    await db.doc("sesiones/ses1/sincronizacion/estado").set({
      participantes: {
        uid_ana: { confirmadoEn: null, ultimoAporteServidor: null },
        uid_luis: { confirmadoEn: null, ultimoAporteServidor: null },
      },
      actualizadoEn: null,
    });

    await db
      .doc("sucursales/suc_norte/historicos/ses1")
      .set({ sesionId: "ses1", cerradaEn: null, totalUnidades: 10, totalMonetario: 50000 });

    await db.doc("auditoria/e1").set({ tipo: "APORTE_CREADO", sesionId: "ses1" });
  });
});

const cajero = (uid: string, sucursales: string[]) =>
  testEnv.authenticatedContext(uid, { rol: "cajero", sucursales });
const admin = () => testEnv.authenticatedContext("uid_admin", { rol: "admin" });

describe("A-1 · líneas de sólo lectura para el cliente", () => {
  it("un cajero NO puede escribir lineas/{categoriaId}", async () => {
    await assertFails(
      cajero("uid_ana", ["suc_norte"])
        .firestore()
        .doc("sesiones/ses1/lineas/cat_5000")
        .update({ cantidadTotal: 99999 }),
    );
  });

  it("un cajero SÍ puede leer las líneas de su sucursal", async () => {
    await assertSucceeds(
      cajero("uid_ana", ["suc_norte"]).firestore().doc("sesiones/ses1/lineas/cat_5000").get(),
    );
  });

  it("un cajero SÍ puede leer el catálogo de categorías", async () => {
    await assertSucceeds(
      cajero("uid_ana", ["suc_norte"]).firestore().doc("categoriasValor/cat_5000").get(),
    );
  });
});

describe("A-3 · aportes fuera de la sucursal asignada", () => {
  it("un cajero NO puede escribir un aporte en una sucursal fuera de sus claims", async () => {
    await assertFails(
      cajero("uid_ana", ["suc_sur"])
        .firestore()
        .doc("sesiones/ses1/lineas/cat_5000/aportes/uid_ana")
        .set({ uid: "uid_ana", cantidad: 5 }),
    );
  });

  it("un cajero SÍ escribe su propio aporte en su sucursal con la sesión abierta", async () => {
    await assertSucceeds(
      cajero("uid_ana", ["suc_norte"])
        .firestore()
        .doc("sesiones/ses1/lineas/cat_5000/aportes/uid_ana")
        .set({ uid: "uid_ana", cantidad: 12, version: 2 }), // seed trae version:1
    );
  });
});

describe("A-4 · escritura sobre una sesión cerrada", () => {
  it("nadie escribe aportes con la sesión cerrada", async () => {
    await assertFails(
      cajero("uid_ana", ["suc_norte"])
        .firestore()
        .doc("sesiones/ses_cerrada/lineas/cat_5000/aportes/uid_ana")
        .set({ uid: "uid_ana", cantidad: 5 }),
    );
  });
});

describe("A-5 · usuarios de sólo lectura (sin auto-ascenso)", () => {
  it("un cajero NO puede escribir su propio doc usuarios/{uid}", async () => {
    await assertFails(
      cajero("uid_ana", ["suc_norte"]).firestore().doc("usuarios/uid_ana").update({ rol: "admin" }),
    );
  });

  it("un cajero SÍ puede leer su propio doc usuarios/{uid}", async () => {
    await assertSucceeds(
      cajero("uid_ana", ["suc_norte"]).firestore().doc("usuarios/uid_ana").get(),
    );
  });
});

describe("A-7 · validación de cantidad (enteros 0..100000)", () => {
  it("rechaza cantidad negativa", async () => {
    await assertFails(
      cajero("uid_ana", ["suc_norte"])
        .firestore()
        .doc("sesiones/ses1/lineas/cat_5000/aportes/uid_ana")
        .set({ uid: "uid_ana", cantidad: -1 }),
    );
  });

  it("rechaza cantidad no entera", async () => {
    await assertFails(
      cajero("uid_ana", ["suc_norte"])
        .firestore()
        .doc("sesiones/ses1/lineas/cat_5000/aportes/uid_ana")
        .set({ uid: "uid_ana", cantidad: 3.5 }),
    );
  });

  it("rechaza cantidad mayor a 100000", async () => {
    await assertFails(
      cajero("uid_ana", ["suc_norte"])
        .firestore()
        .doc("sesiones/ses1/lineas/cat_5000/aportes/uid_ana")
        .set({ uid: "uid_ana", cantidad: 100001 }),
    );
  });

  it("acepta cantidad entera dentro del rango", async () => {
    await assertSucceeds(
      cajero("uid_ana", ["suc_norte"])
        .firestore()
        .doc("sesiones/ses1/lineas/cat_5000/aportes/uid_ana")
        .set({ uid: "uid_ana", cantidad: 100000, version: 2 }), // seed trae version:1
    );
  });
});

describe("D1 · version obligatoria y monótona en aportes", () => {
  it("rechaza version repetida en update (guardia de idempotencia controlada por el cliente)", async () => {
    await assertFails(
      cajero("uid_ana", ["suc_norte"])
        .firestore()
        .doc("sesiones/ses1/lineas/cat_5000/aportes/uid_ana")
        .set({ uid: "uid_ana", cantidad: 50, version: 1 }), // seed ya tiene version:1
    );
  });

  it("rechaza version no entera", async () => {
    await assertFails(
      cajero("uid_ana", ["suc_norte"])
        .firestore()
        .doc("sesiones/ses1/lineas/cat_5000/aportes/uid_ana")
        .set({ uid: "uid_ana", cantidad: 50, version: 1.5 }),
    );
  });

  it("acepta el incremento correcto vía FieldValue.increment con update() (las reglas ven el valor ya calculado)", async () => {
    // Comprobado con test de bisección (no es una suposición): las reglas
    // resuelven increment() al valor ya calculado con update()/set({merge:true}),
    // pero un set() de reemplazo total del documento produce "evaluation
    // error" al comparar ese campo — sin relación con el resto de la regla.
    // Por eso este test usa update(); el cliente debe escribir version con
    // update() o set({merge:true}), nunca con un set() de reemplazo total.
    await assertSucceeds(
      cajero("uid_ana", ["suc_norte"])
        .firestore()
        .doc("sesiones/ses1/lineas/cat_5000/aportes/uid_ana")
        .update({ cantidad: 50, version: firebase.firestore.FieldValue.increment(1) }),
    );
  });
});

describe("A-10 · datos monetarios sólo para admin", () => {
  it("un cajero NO puede leer resumen/actual", async () => {
    await assertFails(
      cajero("uid_ana", ["suc_norte"]).firestore().doc("sesiones/ses1/resumen/actual").get(),
    );
  });

  it("un cajero NO puede leer historicos/{sesionId}", async () => {
    await assertFails(
      cajero("uid_ana", ["suc_norte"])
        .firestore()
        .doc("sucursales/suc_norte/historicos/ses1")
        .get(),
    );
  });

  it("un admin SÍ puede leer resumen/actual", async () => {
    await assertSucceeds(admin().firestore().doc("sesiones/ses1/resumen/actual").get());
  });

  it("un admin SÍ puede leer historicos/{sesionId}", async () => {
    await assertSucceeds(admin().firestore().doc("sucursales/suc_norte/historicos/ses1").get());
  });
});

describe("A-11 · sincronización acotada a la propia entrada", () => {
  it("un cajero NO puede confirmar la entrada de otro cajero", async () => {
    await assertFails(
      cajero("uid_ana", ["suc_norte"])
        .firestore()
        .doc("sesiones/ses1/sincronizacion/estado")
        .update({ "participantes.uid_luis.confirmadoEn": new Date() }),
    );
  });

  it("un cajero NO puede tocar otro campo de su propia entrada", async () => {
    await assertFails(
      cajero("uid_ana", ["suc_norte"])
        .firestore()
        .doc("sesiones/ses1/sincronizacion/estado")
        .update({ "participantes.uid_ana.ultimoAporteServidor": new Date() }),
    );
  });

  it("un cajero SÍ confirma su propia entrada", async () => {
    await assertSucceeds(
      cajero("uid_ana", ["suc_norte"])
        .firestore()
        .doc("sesiones/ses1/sincronizacion/estado")
        .update({
          "participantes.uid_ana.confirmadoEn": new Date(),
          actualizadoEn: new Date(),
        }),
    );
  });
});

describe("A-2 · auditoría inmutable", () => {
  it("un cajero no puede crear un evento de auditoría", async () => {
    await assertFails(
      cajero("uid_ana", ["suc_norte"])
        .firestore()
        .doc("auditoria/e2")
        .set({ tipo: "APORTE_CREADO", sesionId: "ses1" }),
    );
  });

  it("un admin no puede crear un evento de auditoría desde el cliente", async () => {
    await assertFails(
      admin().firestore().doc("auditoria/e2").set({ tipo: "APORTE_CREADO", sesionId: "ses1" }),
    );
  });

  it("es inmutable incluso para el admin: no se puede borrar", async () => {
    await assertFails(admin().firestore().doc("auditoria/e1").delete());
  });

  it("un admin SÍ puede leer la auditoría", async () => {
    await assertSucceeds(admin().firestore().collection("auditoria").get());
  });

  it("un cajero no puede leer la auditoría", async () => {
    await assertFails(cajero("uid_ana", ["suc_norte"]).firestore().collection("auditoria").get());
  });
});
