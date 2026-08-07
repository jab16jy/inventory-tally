import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EstadoSincronizacion } from "../repositories/admin-repository.js";

const collection = vi.fn((...args: unknown[]) => ({ __col: args.join("/") }));
const doc = vi.fn((...args: unknown[]) => ({ __ref: args.join("/") }));
const getDoc = vi.fn();
const getDocs = vi.fn();
const limit = vi.fn((...args: unknown[]) => ({ __limit: args }));
const onSnapshot = vi.fn();
const orderBy = vi.fn((...args: unknown[]) => ({ __orderBy: args }));
const query = vi.fn((...args: unknown[]) => ({ __query: args }));
const startAfter = vi.fn((...args: unknown[]) => ({ __startAfter: args }));
const where = vi.fn((...args: unknown[]) => ({ __where: args }));

vi.mock("firebase/firestore", () => ({
  collection: (...args: unknown[]) => collection(...args),
  doc: (...args: unknown[]) => doc(...args),
  getDoc: (...args: unknown[]) => getDoc(...args),
  getDocs: (...args: unknown[]) => getDocs(...args),
  limit: (...args: unknown[]) => limit(...args),
  onSnapshot: (...args: unknown[]) => onSnapshot(...args),
  orderBy: (...args: unknown[]) => orderBy(...args),
  query: (...args: unknown[]) => query(...args),
  startAfter: (...args: unknown[]) => startAfter(...args),
  where: (...args: unknown[]) => where(...args),
}));

const httpsCallable = vi.fn();

vi.mock("firebase/functions", () => ({
  httpsCallable: (...args: unknown[]) => httpsCallable(...args),
}));

const { FirestoreAdminRepository } = await import("./firestore-admin-repository.js");

/** Espera a que se asienten las microtareas pendientes (Promise.all + .then
 *  encadenados dentro de observarSincronizacion) sin depender de su número
 *  exacto: un macrotask (setTimeout real) sólo corre después de vaciar la
 *  cola de microtareas. */
function esperarAsentamiento(): Promise<void> {
  return new Promise((resolver) => setTimeout(resolver, 0));
}

describe("FirestoreAdminRepository.ultimoHistoricoPorSucursal (fan-out N+1 deliberado, doc plan §4)", () => {
  beforeEach(() => vi.clearAllMocks());

  function snapHistorico(data: Record<string, unknown>) {
    return { docs: [{ data: () => data }] };
  }
  function snapVacio() {
    return { docs: [] };
  }
  function historicoFalso(sesionId: string) {
    return {
      sesionId,
      cerradaEn: { toDate: () => new Date("2026-08-01T00:00:00Z") },
      totalUnidades: 10,
      totalMonetario: 50000,
      porCategoria: {},
    };
  }

  it("consulta UNA vez por sucursal, nunca un collectionGroup", async () => {
    getDocs
      .mockResolvedValueOnce(snapHistorico(historicoFalso("ses_a")))
      .mockResolvedValueOnce(snapVacio())
      .mockResolvedValueOnce(snapHistorico(historicoFalso("ses_c")));
    const repo = new FirestoreAdminRepository({} as never, {} as never);

    await repo.ultimoHistoricoPorSucursal(["suc_a", "suc_b", "suc_c"]);

    expect(getDocs).toHaveBeenCalledTimes(3);
    expect(collection).toHaveBeenCalledWith({}, "sucursales", "suc_a", "historicos");
    expect(collection).toHaveBeenCalledWith({}, "sucursales", "suc_b", "historicos");
    expect(collection).toHaveBeenCalledWith({}, "sucursales", "suc_c", "historicos");
  });

  it("una sucursal sin históricos mapea a null en el Map, no se omite de las claves", async () => {
    getDocs.mockResolvedValueOnce(snapHistorico(historicoFalso("ses_a"))).mockResolvedValueOnce(snapVacio());
    const repo = new FirestoreAdminRepository({} as never, {} as never);

    const historicos = await repo.ultimoHistoricoPorSucursal(["suc_a", "suc_b"]);

    expect(historicos.size).toBe(2);
    expect(historicos.get("suc_a")?.sesionId).toBe("ses_a");
    expect(historicos.has("suc_b")).toBe(true);
    expect(historicos.get("suc_b")).toBeNull();
  });
});

describe("FirestoreAdminRepository.listarSesiones / listarAuditoria (cursor opaco, doc plan §4)", () => {
  beforeEach(() => vi.clearAllMocks());

  function docsFalsos(n: number) {
    return Array.from({ length: n }, (_, i) => ({
      id: `id_${i}`,
      data: () => ({
        sucursalId: "suc_a",
        sucursalNombre: "Norte",
        estado: "abierta",
        abiertaEn: { toDate: () => new Date("2026-08-02T08:00:00Z") },
        abiertaPor: "uid_admin",
        cerradaEn: null,
        cerradaPor: null,
        participantes: [],
        totalUnidades: 0,
        sesionCorregidaId: null,
      }),
    }));
  }

  it("listarSesiones aplica el filtro recibido con where, y ordena por abiertaEn desc", async () => {
    getDocs.mockResolvedValue({ docs: docsFalsos(3) });
    const repo = new FirestoreAdminRepository({} as never, {} as never);

    await repo.listarSesiones({ sucursalId: "suc_a", estado: "abierta" });

    expect(where).toHaveBeenCalledWith("sucursalId", "==", "suc_a");
    expect(where).toHaveBeenCalledWith("estado", "==", "abierta");
    expect(orderBy).toHaveBeenCalledWith("abiertaEn", "desc");
  });

  it("listarAuditoria sin filtro no llama a where; con filtro, lo aplica sobre el campo pedido", async () => {
    getDocs.mockResolvedValue({ docs: [] });
    const repo = new FirestoreAdminRepository({} as never, {} as never);

    await repo.listarAuditoria(null);
    expect(where).not.toHaveBeenCalled();

    await repo.listarAuditoria({ campo: "sucursalId", valor: "suc_a" });
    expect(where).toHaveBeenCalledWith("sucursalId", "==", "suc_a");
  });

  it("siguienteCursor es null cuando la página no llena el límite (última página)", async () => {
    getDocs.mockResolvedValue({ docs: docsFalsos(3) });
    const repo = new FirestoreAdminRepository({} as never, {} as never);

    const pagina = await repo.listarSesiones({});

    expect(pagina.siguienteCursor).toBeNull();
  });

  it("siguienteCursor NO es null cuando la página llena el límite (hay más)", async () => {
    const llena = docsFalsos(20);
    getDocs.mockResolvedValue({ docs: llena });
    const repo = new FirestoreAdminRepository({} as never, {} as never);

    const pagina = await repo.listarSesiones({});

    expect(pagina.siguienteCursor).toBe(llena.at(-1));
  });

  it("el cursor devuelto se reinyecta como startAfter en la siguiente llamada", async () => {
    const llena = docsFalsos(20);
    getDocs.mockResolvedValueOnce({ docs: llena }).mockResolvedValueOnce({ docs: [] });
    const repo = new FirestoreAdminRepository({} as never, {} as never);

    const primera = await repo.listarSesiones({});
    await repo.listarSesiones({}, primera.siguienteCursor);

    expect(startAfter).toHaveBeenCalledWith(primera.siguienteCursor);
  });
});

describe("FirestoreAdminRepository.observarSincronizacion (predicado RF-16, mirror de packages/functions/src/lib/sincronizacion.ts:67-68)", () => {
  beforeEach(() => vi.clearAllMocks());

  async function emitirYCapturar(
    participantes: Record<string, unknown>,
  ): Promise<EstadoSincronizacion[]> {
    let callback: ((snap: unknown) => void) | undefined;
    onSnapshot.mockImplementation((_ref: unknown, cb: (snap: unknown) => void) => {
      callback = cb;
      return vi.fn();
    });
    getDoc.mockResolvedValue({ data: () => ({ nombre: "Ana Ramírez" }) });

    const repo = new FirestoreAdminRepository({} as never, {} as never);
    const recibidos: EstadoSincronizacion[] = [];
    repo.observarSincronizacion("ses_1", (e) => recibidos.push(e));

    callback?.({ data: () => ({ participantes }) });
    await esperarAsentamiento();
    return recibidos;
  }

  it("confirmadoEn null → no sincronizado", async () => {
    const recibidos = await emitirYCapturar({
      uid_ana: { confirmadoEn: null, ultimoAporteServidor: null },
    });

    expect(recibidos.at(-1)?.participantes[0]).toEqual({
      uid: "uid_ana",
      nombre: "Ana Ramírez",
      sincronizado: false,
    });
  });

  it("confirmadoEn anterior al último aporte del servidor → no sincronizado (confirmación obsoleta)", async () => {
    const recibidos = await emitirYCapturar({
      uid_ana: {
        confirmadoEn: { toMillis: () => 1000 },
        ultimoAporteServidor: { toMillis: () => 2000 },
      },
    });

    expect(recibidos.at(-1)?.participantes[0]?.sincronizado).toBe(false);
  });

  it("confirmadoEn igual o posterior al último aporte del servidor → sincronizado", async () => {
    const recibidos = await emitirYCapturar({
      uid_ana: {
        confirmadoEn: { toMillis: () => 2000 },
        ultimoAporteServidor: { toMillis: () => 2000 },
      },
    });

    expect(recibidos.at(-1)?.participantes[0]?.sincronizado).toBe(true);
  });
});

describe("FirestoreAdminRepository.cerrarSesion (routing de escrituras vía httpsCallable)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("llama a httpsCallable('cerrarSesion') y pasa el payload sin modificarlo, incluido forzar", async () => {
    const llamada = vi.fn().mockResolvedValue({ data: { sesionId: "ses_1" } });
    httpsCallable.mockReturnValue(llamada);
    const functions = {} as never;
    const repo = new FirestoreAdminRepository({} as never, functions);

    const resultado = await repo.cerrarSesion({ sesionId: "ses_1", forzar: true });

    expect(httpsCallable).toHaveBeenCalledWith(functions, "cerrarSesion");
    expect(llamada).toHaveBeenCalledWith({ sesionId: "ses_1", forzar: true });
    expect(resultado).toEqual({ sesionId: "ses_1" });
  });
});
