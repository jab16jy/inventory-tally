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
// SÓLO tipos. El sentinel de D1 NO se construye desde este import — ver
// `incremento()` más abajo (issue #47).
import type firebase from "firebase/compat/app";

/** Namespace compat que cuelga de la app viva; ver `incremento()`. */
interface NamespaceCompat {
  readonly firestore: {
    readonly FieldValue: { increment(n: number): firebase.firestore.FieldValue };
  };
}

/**
 * Sentinel `FieldValue.increment()` para el test afirmativo de D1,
 * construido desde el namespace compat de la PROPIA instancia de prueba
 * (`db.app.firebase`) y no desde un `import` de "firebase/compat/app"
 * (issue #47).
 *
 * El motivo está comprobado con sonda, no supuesto: bajo Vitest conviven dos
 * namespaces compat distintos — el que carga `@firebase/rules-unit-testing` y
 * el que resuelve un `import` de este archivo. Cada uno trae su propia clase
 * interna para el sentinel de incremento, así que el del `import` falla el
 * `instanceof` del validador de datos del cliente y `update()` lo rechaza
 * como "objeto custom" ANTES de que la escritura salga a la red: el test
 * fallaba sin que las reglas se evaluaran NUNCA, que es justo lo que venía a
 * probar. Con el namespace de la instancia viva la escritura sí llega a las
 * reglas.
 *
 * ponytail: se lee `db.app.firebase` en vez de deduplicar la resolución por
 * configuración de Vitest porque no hay dos copias de `firebase` en disco
 * (pnpm resuelve una sola) — son dos bundles autocontenidos del mismo
 * paquete, y `resolve.dedupe` no los une.
 */
function incremento(db: firebase.firestore.Firestore, n: number): firebase.firestore.FieldValue {
  const ns = (db.app as unknown as { readonly firebase: NamespaceCompat }).firebase;
  return ns.firestore.FieldValue.increment(n);
}

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
    // sucursalesAsignadas: Ana comparte suc_norte y suc_sur (ver historial más
    // abajo) — target del caso afirmativo de D6 (get compartido).
    await db
      .doc("usuarios/uid_ana")
      .set({ nombre: "Ana Ramírez", rol: "cajero", sucursalesAsignadas: ["suc_norte", "suc_sur"] });
    // Sólo suc_sur: target del caso negativo de D6 (get de otra sucursal).
    await db
      .doc("usuarios/uid_luis")
      .set({ nombre: "Luis Pérez", rol: "cajero", sucursalesAsignadas: ["suc_sur"] });

    await db.doc("sucursales/suc_norte").set({ nombre: "Sucursal Norte", sesionAbiertaId: "ses1" });
    await db.doc("sucursales/suc_sur").set({ nombre: "Sucursal Sur", sesionAbiertaId: null });

    await db
      .doc("categoriasValor/cat_5000")
      .set({ valor: 5000, etiqueta: "$5.000", activa: true, orden: 1 });

    await db.doc("areas/area_1").set({ nombre: "Charcutería", activa: true });

    await db.doc("config/app").set({ versionMinima: "1.0.0" });

    await db.doc("sesiones/ses1").set({
      sucursalId: "suc_norte",
      sucursalNombre: "Sucursal Norte",
      estado: "abierta",
      participantes: ["uid_ana", "uid_luis"],
      totalUnidades: 10,
    });
    // Historial del cajero: uid_ana participó también en una sesión de
    // suc_sur. Es la fila que, sin `where("sucursalId","in",...)`, denegaría
    // la query ENTERA cuando el claim ya no incluye suc_sur.
    await db.doc("sesiones/ses_sur").set({
      sucursalId: "suc_sur",
      sucursalNombre: "Sucursal Sur",
      estado: "cerrada",
      participantes: ["uid_ana"],
      totalUnidades: 4,
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

    await db.doc("sesiones/ses1/lineas/cat_5000/aportes/uid_ana__area_1").set({
      uid: "uid_ana",
      areaId: "area_1",
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
    // Con sucursalId (ticket #45): sirve para los casos (a)/(b) del cajero.
    // "e1" queda sin sucursalId a propósito, para el caso (c).
    await db
      .doc("auditoria/e_suc")
      .set({ tipo: "APORTE_CREADO", sesionId: "ses1", sucursalId: "suc_norte" });

    // ADR-21: las dos acciones de catálogo que un contador ejecuta desde su
    // conteo. Ambas denormalizan `sucursalId`, y ése es el único motivo por el
    // que su propio cajero puede leerlas — la regla de auditoría no cambia.
    // "e_cat_sin_suc" es el control: mismo tipo, sin el campo, sigue ilegible.
    await db.doc("auditoria/e_area").set({
      tipo: "AREA_VINCULADA",
      sesionId: "ses1",
      categoriaId: "cat_1000",
      areaId: "area_efectivo",
      sucursalId: "suc_norte",
    });
    await db.doc("auditoria/e_cat_conteo").set({
      tipo: "CATEGORIA_CREADA",
      sesionId: "ses1",
      categoriaId: "cat_nueva",
      origen: "conteo",
      sucursalId: "suc_norte",
    });
    await db
      .doc("auditoria/e_cat_sin_suc")
      .set({ tipo: "CATEGORIA_CREADA", categoriaId: "cat_admin" });
  });
});

const cajero = (uid: string, sucursales: string[]) =>
  testEnv.authenticatedContext(uid, { rol: "cajero", sucursales });
const admin = () => testEnv.authenticatedContext("uid_admin", { rol: "admin" });
const adminSucursal = (uid: string, sucursales: string[]) =>
  testEnv.authenticatedContext(uid, { rol: "admin_sucursal", sucursales });

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

  it("un cajero NO puede escribir areas/{areaId}", async () => {
    await assertFails(
      cajero("uid_ana", ["suc_norte"]).firestore().doc("areas/area_1").update({ activa: false }),
    );
  });

  it("un cajero SÍ puede leer el catálogo de áreas", async () => {
    await assertSucceeds(cajero("uid_ana", ["suc_norte"]).firestore().doc("areas/area_1").get());
  });
});

describe("A-3 · aportes fuera de la sucursal asignada", () => {
  it("un cajero NO puede escribir un aporte en una sucursal fuera de sus claims", async () => {
    await assertFails(
      cajero("uid_ana", ["suc_sur"])
        .firestore()
        .doc("sesiones/ses1/lineas/cat_5000/aportes/uid_ana__area_1")
        .set({ uid: "uid_ana", areaId: "area_1", cantidad: 5, version: 1 }),
    );
  });

  it("un cajero SÍ escribe su propio aporte en su sucursal con la sesión abierta", async () => {
    await assertSucceeds(
      cajero("uid_ana", ["suc_norte"])
        .firestore()
        .doc("sesiones/ses1/lineas/cat_5000/aportes/uid_ana__area_1")
        .set({ uid: "uid_ana", areaId: "area_1", cantidad: 12, version: 2 }), // seed trae version:1
    );
  });
});

describe("A-4 · escritura sobre una sesión cerrada", () => {
  it("nadie escribe aportes con la sesión cerrada", async () => {
    await assertFails(
      cajero("uid_ana", ["suc_norte"])
        .firestore()
        .doc("sesiones/ses_cerrada/lineas/cat_5000/aportes/uid_ana__area_1")
        .set({ uid: "uid_ana", areaId: "area_1", cantidad: 5, version: 1 }),
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
        .doc("sesiones/ses1/lineas/cat_5000/aportes/uid_ana__area_1")
        .set({ uid: "uid_ana", areaId: "area_1", cantidad: -1, version: 2 }),
    );
  });

  it("rechaza cantidad no entera", async () => {
    await assertFails(
      cajero("uid_ana", ["suc_norte"])
        .firestore()
        .doc("sesiones/ses1/lineas/cat_5000/aportes/uid_ana__area_1")
        .set({ uid: "uid_ana", areaId: "area_1", cantidad: 3.5, version: 2 }),
    );
  });

  it("rechaza cantidad mayor a 100000", async () => {
    await assertFails(
      cajero("uid_ana", ["suc_norte"])
        .firestore()
        .doc("sesiones/ses1/lineas/cat_5000/aportes/uid_ana__area_1")
        .set({ uid: "uid_ana", areaId: "area_1", cantidad: 100001, version: 2 }),
    );
  });

  it("acepta cantidad entera dentro del rango", async () => {
    await assertSucceeds(
      cajero("uid_ana", ["suc_norte"])
        .firestore()
        .doc("sesiones/ses1/lineas/cat_5000/aportes/uid_ana__area_1")
        .set({ uid: "uid_ana", areaId: "area_1", cantidad: 100000, version: 2 }), // seed trae version:1
    );
  });
});

describe("D1 · version obligatoria y monótona en aportes", () => {
  it("rechaza version repetida en update (guardia de idempotencia controlada por el cliente)", async () => {
    await assertFails(
      cajero("uid_ana", ["suc_norte"])
        .firestore()
        .doc("sesiones/ses1/lineas/cat_5000/aportes/uid_ana__area_1")
        .set({ uid: "uid_ana", areaId: "area_1", cantidad: 50, version: 1 }), // seed ya tiene version:1
    );
  });

  it("rechaza version no entera", async () => {
    await assertFails(
      cajero("uid_ana", ["suc_norte"])
        .firestore()
        .doc("sesiones/ses1/lineas/cat_5000/aportes/uid_ana__area_1")
        .set({ uid: "uid_ana", areaId: "area_1", cantidad: 50, version: 1.5 }),
    );
  });

  it("acepta el incremento correcto vía FieldValue.increment con update() (las reglas ven el valor ya calculado)", async () => {
    // Comprobado con test de bisección (no es una suposición): las reglas
    // resuelven increment() al valor ya calculado con update()/set({merge:true}),
    // pero un set() de reemplazo total del documento produce "evaluation
    // error" al comparar ese campo — sin relación con el resto de la regla.
    // Por eso este test usa update(); el cliente debe escribir version con
    // update() o set({merge:true}), nunca con un set() de reemplazo total.
    const db = cajero("uid_ana", ["suc_norte"]).firestore();
    await assertSucceeds(
      db
        .doc("sesiones/ses1/lineas/cat_5000/aportes/uid_ana__area_1")
        .update({ cantidad: 50, version: incremento(db, 1) }),
    );
  });
});

describe("ADR-24 · ledger de partidas en aportes", () => {
  it("un cajero SÍ escribe sus propias partidas con la sesión abierta", async () => {
    await assertSucceeds(
      cajero("uid_ana", ["suc_norte"])
        .firestore()
        .doc("sesiones/ses1/lineas/cat_5000/aportes/uid_ana__area_1")
        .set({
          uid: "uid_ana",
          areaId: "area_1",
          cantidad: 80,
          version: 2,
          partidas: [
            { id: "p1", cantidad: 50 },
            { id: "p2", cantidad: 30 },
          ],
        }),
    );
  });

  it("un cajero NO puede escribir partidas en el aporte de OTRO uid", async () => {
    await assertFails(
      cajero("uid_ana", ["suc_norte"])
        .firestore()
        .doc("sesiones/ses1/lineas/cat_5000/aportes/uid_luis__area_1")
        .set({
          uid: "uid_luis",
          areaId: "area_1",
          cantidad: 50,
          version: 1,
          partidas: [{ id: "p1", cantidad: 50 }],
        }),
    );
  });

  it("nadie puede tocar partidas con la sesión CERRADA", async () => {
    await assertFails(
      cajero("uid_ana", ["suc_norte"])
        .firestore()
        .doc("sesiones/ses_cerrada/lineas/cat_5000/aportes/uid_ana__area_1")
        .set({
          uid: "uid_ana",
          areaId: "area_1",
          cantidad: 50,
          version: 1,
          partidas: [{ id: "p1", cantidad: 50 }],
        }),
    );
  });

  it("un cajero SÍ escribe partidas con la sesión abierta (par afirmativo de la sesión cerrada)", async () => {
    await assertSucceeds(
      cajero("uid_ana", ["suc_norte"])
        .firestore()
        .doc("sesiones/ses1/lineas/cat_5000/aportes/uid_ana__area_1")
        .set({
          uid: "uid_ana",
          areaId: "area_1",
          cantidad: 50,
          version: 2,
          partidas: [{ id: "p1", cantidad: 50 }],
        }),
    );
  });

  // R3-001 del review de ADR-24: los dos negativos de arriba (otro uid, sesión
  // cerrada) ya son denegados por `claveAporte == miUid() + '__' + areaId` y
  // por `sesionAbierta(sesionId)`, ambas PREEXISTENTES. Seguirían en verde
  // aunque la guarda nueva de `partidas` no existiera, así que no prueban esa
  // guarda. Estos dos aíslan `partidas is list`: mismo uid, sesión abierta,
  // todo lo demás válido, y lo único roto es el tipo del campo.
  it("rechaza partidas que no es una lista (string)", async () => {
    await assertFails(
      cajero("uid_ana", ["suc_norte"])
        .firestore()
        .doc("sesiones/ses1/lineas/cat_5000/aportes/uid_ana__area_1")
        .set({
          uid: "uid_ana",
          areaId: "area_1",
          cantidad: 50,
          version: 2,
          partidas: "p1",
        }),
    );
  });

  it("rechaza partidas que no es una lista (objeto)", async () => {
    await assertFails(
      cajero("uid_ana", ["suc_norte"])
        .firestore()
        .doc("sesiones/ses1/lineas/cat_5000/aportes/uid_ana__area_1")
        .set({
          uid: "uid_ana",
          areaId: "area_1",
          cantidad: 50,
          version: 2,
          partidas: { id: "p1", cantidad: 50 },
        }),
    );
  });

  it("rechaza un array de 201 partidas", async () => {
    const partidas = Array.from({ length: 201 }, (_, i) => ({ id: `p${i}`, cantidad: 1 }));
    await assertFails(
      cajero("uid_ana", ["suc_norte"])
        .firestore()
        .doc("sesiones/ses1/lineas/cat_5000/aportes/uid_ana__area_1")
        .set({ uid: "uid_ana", areaId: "area_1", cantidad: 201, version: 2, partidas }),
    );
  });

  it("acepta un array de 200 partidas", async () => {
    const partidas = Array.from({ length: 200 }, (_, i) => ({ id: `p${i}`, cantidad: 1 }));
    await assertSucceeds(
      cajero("uid_ana", ["suc_norte"])
        .firestore()
        .doc("sesiones/ses1/lineas/cat_5000/aportes/uid_ana__area_1")
        .set({ uid: "uid_ana", areaId: "area_1", cantidad: 200, version: 2, partidas }),
    );
  });
});

describe("ADR-23 · claveAporte y areaId en aportes", () => {
  it("rechaza si claveAporte no coincide con miUid() + '__' + areaId", async () => {
    await assertFails(
      cajero("uid_ana", ["suc_norte"])
        .firestore()
        .doc("sesiones/ses1/lineas/cat_5000/aportes/uid_ana__area_otra")
        .set({ uid: "uid_ana", areaId: "area_1", cantidad: 5, version: 1 }),
    );
  });

  it("rechaza si areaId está vacío", async () => {
    await assertFails(
      cajero("uid_ana", ["suc_norte"])
        .firestore()
        .doc("sesiones/ses1/lineas/cat_5000/aportes/uid_ana__")
        .set({ uid: "uid_ana", areaId: "", cantidad: 5, version: 1 }),
    );
  });

  it("rechaza si incluye campos no permitidos en hasOnly", async () => {
    await assertFails(
      cajero("uid_ana", ["suc_norte"])
        .firestore()
        .doc("sesiones/ses1/lineas/cat_5000/aportes/uid_ana__area_1")
        .set({ uid: "uid_ana", areaId: "area_1", cantidad: 5, version: 2, campoExtra: 123 }),
    );
  });

  it("un cajero SÍ puede aportar a dos áreas distintas de la misma línea (ADR-23)", async () => {
    await assertSucceeds(
      cajero("uid_ana", ["suc_norte"])
        .firestore()
        .doc("sesiones/ses1/lineas/cat_5000/aportes/uid_ana__area_cocina")
        .set({ uid: "uid_ana", areaId: "area_cocina", cantidad: 8, version: 1 }),
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

describe("config/app · bloqueo por versión mínima", () => {
  it("un cajero SÍ puede leer config/app", async () => {
    await assertSucceeds(cajero("uid_ana", ["suc_norte"]).firestore().doc("config/app").get());
  });

  it("un cajero NO puede escribir config/app", async () => {
    await assertFails(
      cajero("uid_ana", ["suc_norte"])
        .firestore()
        .doc("config/app")
        .update({ versionMinima: "2.0.0" }),
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

  it("un cajero no puede leer la auditoría con una query SIN acotar por sucursalId", async () => {
    // Firestore no puede demostrar que TODOS los resultados posibles de una
    // query sin `where` cumplirían la regla, así que rechaza la query
    // entera — sigue denegado tras el ticket #45, no es el mismo escenario
    // que las queries acotadas de abajo.
    await assertFails(cajero("uid_ana", ["suc_norte"]).firestore().collection("auditoria").get());
  });

  it("ticket #45 · un cajero SÍ lee, con la query acotada, un evento de su propia sucursal", async () => {
    await assertSucceeds(
      cajero("uid_ana", ["suc_norte"])
        .firestore()
        .collection("auditoria")
        .where("sucursalId", "in", ["suc_norte"])
        .get(),
    );
  });

  it("ticket #45 · un cajero NO lee, ni acotando la query, un evento de una sucursal que no tiene asignada", async () => {
    await assertFails(
      cajero("uid_ana", ["suc_sur"])
        .firestore()
        .collection("auditoria")
        .where("sucursalId", "in", ["suc_norte"])
        .get(),
    );
  });

  it("ticket #45 · un evento sin sucursalId sigue ilegible para el cajero, ni con get() directo", async () => {
    // "e1" (sembrado en beforeEach) no tiene sucursalId: es uno de los 6
    // tipos que no lo llevan. `tieneSucursal(resource.data.sucursalId)`
    // evalúa `undefined in token.sucursales`, que nunca es true — un get()
    // directo (no una query de colección) prueba la regla contra ESTE
    // documento en concreto, no sólo lo que un `where` deja pasar.
    await assertFails(cajero("uid_ana", ["suc_norte"]).firestore().doc("auditoria/e1").get());
  });

  // ── ADR-21 · el contador lee la auditoría de sus propias acciones ──
  // `infra/firestore.rules` NO cambia en este cambio. Lo que cambia es el
  // ALCANCE de una regla que ya existía: `esCajero() && tieneSucursal(
  // resource.data.sucursalId)` cubre cualquier evento que denormalice
  // `sucursalId`, y los dos eventos nuevos lo denormalizan. Doc 09 §4 exige
  // un test que afirme y otro que niegue por regla; el alcance nuevo necesita
  // su propio par, aunque el texto de la regla siga idéntico.

  it("ADR-21 · un cajero SÍ lee un AREA_VINCULADA de su propia sucursal", async () => {
    await assertSucceeds(
      cajero("uid_ana", ["suc_norte"]).firestore().doc("auditoria/e_area").get(),
    );
  });

  it("ADR-21 · un cajero NO lee un AREA_VINCULADA de una sucursal que no tiene asignada", async () => {
    // Par negativo del anterior: sin él, el afirmativo pasaría igual con la
    // regla degradada a `esCajero()` a secas.
    await assertFails(cajero("uid_luis", ["suc_sur"]).firestore().doc("auditoria/e_area").get());
  });

  it("ADR-21 · un cajero SÍ lee el CATEGORIA_CREADA que originó su propio conteo", async () => {
    await assertSucceeds(
      cajero("uid_ana", ["suc_norte"]).firestore().doc("auditoria/e_cat_conteo").get(),
    );
  });

  it("ADR-21 · un CATEGORIA_CREADA SIN sucursalId sigue ilegible para el cajero", async () => {
    // El control que demuestra de dónde viene el permiso: mismo tipo de
    // evento, misma sucursal en el claim, pero sin el campo denormalizado. Si
    // esto pasara, la lectura no vendría de `sucursalId` sino de que la regla
    // se aflojó — que es justo lo que este cambio NO hace. Es también el
    // estado de los CATEGORIA_CREADA que origina el admin desde el panel.
    await assertFails(
      cajero("uid_ana", ["suc_norte"]).firestore().doc("auditoria/e_cat_sin_suc").get(),
    );
  });
});

describe("historial del cajero · sesiones acotadas por participantes + sucursalId", () => {
  it("un cajero NO puede listar sesiones con una query acotada SÓLO por participantes", async () => {
    // El fallo que sólo aparecería en producción: `array-contains` demuestra
    // "participé", pero no demuestra `tieneSucursal(...)` para TODO resultado
    // posible, así que Firestore rechaza la query entera.
    await assertFails(
      cajero("uid_ana", ["suc_norte"])
        .firestore()
        .collection("sesiones")
        .where("participantes", "array-contains", "uid_ana")
        .get(),
    );
  });

  it("un cajero SÍ lista sus sesiones con array-contains + in sobre las sucursales de su claim", async () => {
    await assertSucceeds(
      cajero("uid_ana", ["suc_norte"])
        .firestore()
        .collection("sesiones")
        .where("participantes", "array-contains", "uid_ana")
        .where("sucursalId", "in", ["suc_norte"])
        .get(),
    );
  });

  it("un cajero SÍ lista sus sesiones de VARIAS sucursales cuando todas están en el claim", async () => {
    await assertSucceeds(
      cajero("uid_ana", ["suc_norte", "suc_sur"])
        .firestore()
        .collection("sesiones")
        .where("participantes", "array-contains", "uid_ana")
        .where("sucursalId", "in", ["suc_norte", "suc_sur"])
        .get(),
    );
  });

  it("un cajero NO lista sesiones de una sucursal fuera de su claim, ni acotando la query", async () => {
    // Reasignación vía `actualizarCajero`: uid_ana participó en ses_sur pero
    // ya no tiene suc_sur asignada. La query se deniega entera.
    await assertFails(
      cajero("uid_ana", ["suc_norte"])
        .firestore()
        .collection("sesiones")
        .where("participantes", "array-contains", "uid_ana")
        .where("sucursalId", "in", ["suc_norte", "suc_sur"])
        .get(),
    );
  });
});

// D6 (design.md) · alcance de lectura de admin_sucursal: historicos, resumen,
// auditoria y usuarios sólo dentro de la única sucursal del claim. Nunca
// cajero (D6 excluye explícitamente el rol cajero de puedeVerSucursal).
describe("D6 · admin_sucursal — alcance de lectura (S1)", () => {
  describe("usuarios · get y list", () => {
    it("RED · máxima fuga: admin_sucursal NO puede listar usuarios sin filtro", async () => {
      await assertFails(
        adminSucursal("uid_gerente_norte", ["suc_norte"]).firestore().collection("usuarios").get(),
      );
    });

    it("admin_sucursal SÍ lista usuarios filtrando por su propia sucursal", async () => {
      await assertSucceeds(
        adminSucursal("uid_gerente_norte", ["suc_norte"])
          .firestore()
          .collection("usuarios")
          .where("sucursalesAsignadas", "array-contains", "suc_norte")
          .get(),
      );
    });

    it("admin_sucursal NO lista usuarios filtrando por otra sucursal", async () => {
      await assertFails(
        adminSucursal("uid_gerente_norte", ["suc_norte"])
          .firestore()
          .collection("usuarios")
          .where("sucursalesAsignadas", "array-contains", "suc_sur")
          .get(),
      );
    });

    it("admin_sucursal SÍ obtiene un usuario que comparte su sucursal", async () => {
      await assertSucceeds(
        adminSucursal("uid_gerente_norte", ["suc_norte"]).firestore().doc("usuarios/uid_ana").get(),
      );
    });

    it("admin_sucursal NO obtiene un usuario de otra sucursal únicamente", async () => {
      await assertFails(
        adminSucursal("uid_gerente_norte", ["suc_norte"])
          .firestore()
          .doc("usuarios/uid_luis")
          .get(),
      );
    });

    it("Gerente sigue listando y leyendo cualquier usuario (regresión)", async () => {
      await assertSucceeds(admin().firestore().collection("usuarios").get());
      await assertSucceeds(admin().firestore().doc("usuarios/uid_luis").get());
    });

    it("cajero sigue sin poder listar usuarios (regresión)", async () => {
      await assertFails(cajero("uid_ana", ["suc_norte"]).firestore().collection("usuarios").get());
    });
  });

  describe("historicos y resumen (monetario)", () => {
    it("admin_sucursal SÍ lee historicos de su propia sucursal", async () => {
      await assertSucceeds(
        adminSucursal("uid_gerente_norte", ["suc_norte"])
          .firestore()
          .doc("sucursales/suc_norte/historicos/ses1")
          .get(),
      );
    });

    it("admin_sucursal NO lee historicos de otra sucursal", async () => {
      await assertFails(
        adminSucursal("uid_gerente_norte", ["suc_norte"])
          .firestore()
          .doc("sucursales/suc_sur/historicos/ses1")
          .get(),
      );
    });

    it("admin_sucursal SÍ lee el resumen de una sesión de su sucursal", async () => {
      await assertSucceeds(
        adminSucursal("uid_gerente_norte", ["suc_norte"])
          .firestore()
          .doc("sesiones/ses1/resumen/actual")
          .get(),
      );
    });

    it("admin_sucursal NO lee el resumen de una sesión de otra sucursal", async () => {
      await assertFails(
        adminSucursal("uid_gerente_norte", ["suc_norte"])
          .firestore()
          .doc("sesiones/ses_sur/resumen/actual")
          .get(),
      );
    });
  });

  describe("auditoría", () => {
    it("admin_sucursal SÍ lee un evento de auditoría de su propia sucursal", async () => {
      await assertSucceeds(
        adminSucursal("uid_gerente_norte", ["suc_norte"]).firestore().doc("auditoria/e_suc").get(),
      );
    });

    it("admin_sucursal SÍ lista la auditoría filtrando por su propia sucursal", async () => {
      await assertSucceeds(
        adminSucursal("uid_gerente_norte", ["suc_norte"])
          .firestore()
          .collection("auditoria")
          .where("sucursalId", "==", "suc_norte")
          .get(),
      );
    });

    it("admin_sucursal NO lee un evento de auditoría de otra sucursal", async () => {
      await assertFails(
        adminSucursal("uid_gerente_sur", ["suc_sur"]).firestore().doc("auditoria/e_suc").get(),
      );
    });
  });

  describe("claim malformado (0 o 2+ sucursales) — falla cerrado", () => {
    it("0 sucursales: NO lee nada acotado por puedeVerSucursal", async () => {
      await assertFails(
        adminSucursal("uid_x", []).firestore().doc("sucursales/suc_norte/historicos/ses1").get(),
      );
    });

    it("2+ sucursales: NO lee nada acotado, aunque incluya la sucursal objetivo", async () => {
      await assertFails(
        adminSucursal("uid_y", ["suc_norte", "suc_sur"])
          .firestore()
          .doc("sucursales/suc_norte/historicos/ses1")
          .get(),
      );
    });
  });
});
