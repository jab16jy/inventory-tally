import { beforeEach, describe, expect, it, vi } from "vitest";
import { CantidadInvalidaError } from "@conteo/shared/errors.js";

const doc = vi.fn((...args: unknown[]) => ({ __ref: args.join("/") }));
const collection = vi.fn((...args: unknown[]) => ({ __col: args.join("/") }));
const query = vi.fn((...args: unknown[]) => ({ __query: args }));
const where = vi.fn((...args: unknown[]) => ({ __where: args }));
const orderBy = vi.fn((...args: unknown[]) => ({ __orderBy: args }));
const limit = vi.fn((...args: unknown[]) => ({ __limit: args }));
const onSnapshot = vi.fn();
const setDoc = vi.fn();
const updateDoc = vi.fn();
const getDocs = vi.fn();
const startAfter = vi.fn((...args: unknown[]) => ({ __startAfter: args }));
const increment = vi.fn((n: number) => ({ __op: "increment", n }));
const serverTimestamp = vi.fn(() => ({ __op: "serverTimestamp" }));

vi.mock("firebase/firestore", () => ({
  doc: (...args: unknown[]) => doc(...args),
  collection: (...args: unknown[]) => collection(...args),
  query: (...args: unknown[]) => query(...args),
  where: (...args: unknown[]) => where(...args),
  orderBy: (...args: unknown[]) => orderBy(...args),
  limit: (...args: unknown[]) => limit(...args),
  onSnapshot: (...args: unknown[]) => onSnapshot(...args),
  setDoc: (...args: unknown[]) => setDoc(...args),
  updateDoc: (...args: unknown[]) => updateDoc(...args),
  getDocs: (...args: unknown[]) => getDocs(...args),
  startAfter: (...args: unknown[]) => startAfter(...args),
  increment: (n: number) => increment(n),
  serverTimestamp: () => serverTimestamp(),
}));

const { FirestoreConteoRepository } = await import("./firestore-conteo-repository.js");

function deferido<T>() {
  let resolver!: (v: T) => void;
  let rechazador!: (e: unknown) => void;
  const promesa = new Promise<T>((res, rej) => {
    resolver = res;
    rechazador = rej;
  });
  return { promesa, resolver, rechazador };
}

const usuario = { obtenerUid: () => "uid_ana", obtenerNombre: () => "Ana Ramírez" };

describe("FirestoreConteoRepository.registrarAporte (doc 07 §6)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("no espera la confirmación del servidor: resuelve aunque setDoc nunca resuelva (offline no cuelga la UI)", async () => {
    setDoc.mockReturnValue(new Promise(() => {})); // nunca resuelve
    const repo = new FirestoreConteoRepository({} as never, usuario);

    await expect(
      repo.registrarAporte({ sesionId: "ses_1", categoriaId: "cat_5000", cantidad: 12 }),
    ).resolves.toBeUndefined();
  });

  it("escribe con merge:true (update semántico) y sólo las claves permitidas por la regla hasOnly", async () => {
    setDoc.mockResolvedValue(undefined);
    const repo = new FirestoreConteoRepository({} as never, usuario);

    await repo.registrarAporte({ sesionId: "ses_1", categoriaId: "cat_5000", cantidad: 12 });

    expect(setDoc).toHaveBeenCalledTimes(1);
    const [, datos, opciones] = setDoc.mock.calls[0] as [unknown, Record<string, unknown>, unknown];
    expect(Object.keys(datos).sort()).toEqual(
      ["cantidad", "dispositivoId", "nombre", "registradoEn", "uid", "version"].sort(),
    );
    expect(opciones).toEqual({ merge: true });
  });

  it("escribe version con increment(1), nunca un número literal (I-obligatoria de la regla de monotonía)", async () => {
    setDoc.mockResolvedValue(undefined);
    const repo = new FirestoreConteoRepository({} as never, usuario);

    await repo.registrarAporte({ sesionId: "ses_1", categoriaId: "cat_5000", cantidad: 12 });

    expect(increment).toHaveBeenCalledWith(1);
    const [, datos] = setDoc.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(datos.version).toEqual({ __op: "increment", n: 1 });
  });

  it("rechaza cantidades negativas antes de tocar Firestore", async () => {
    const repo = new FirestoreConteoRepository({} as never, usuario);

    await expect(
      repo.registrarAporte({ sesionId: "ses_1", categoriaId: "cat_5000", cantidad: -1 }),
    ).rejects.toBeInstanceOf(CantidadInvalidaError);
    expect(setDoc).not.toHaveBeenCalled();
  });
});

describe("FirestoreConteoRepository.confirmarSincronizacion (RF-16)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("SÍ espera la confirmación del servidor (a diferencia de registrarAporte)", async () => {
    const { promesa, resolver } = deferido<void>();
    updateDoc.mockReturnValue(promesa);
    const repo = new FirestoreConteoRepository({} as never, usuario);

    let resuelto = false;
    const enCurso = repo.confirmarSincronizacion("ses_1").then(() => {
      resuelto = true;
    });

    await Promise.resolve();
    expect(resuelto).toBe(false);
    resolver(undefined);
    await enCurso;
    expect(resuelto).toBe(true);
  });

  it("actualiza sólo la entrada del propio uid, con updateDoc (nunca reemplaza el documento)", async () => {
    updateDoc.mockResolvedValue(undefined);
    const repo = new FirestoreConteoRepository({} as never, usuario);

    await repo.confirmarSincronizacion("ses_1");

    expect(updateDoc).toHaveBeenCalledTimes(1);
    const [, datos] = updateDoc.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(Object.keys(datos).sort()).toEqual(
      ["actualizadoEn", "participantes.uid_ana.confirmadoEn"].sort(),
    );
  });
});

describe("FirestoreConteoRepository.uidActual", () => {
  it("delega en el proveedor de usuario actual (nunca importa firebase/auth aquí)", () => {
    const repo = new FirestoreConteoRepository({} as never, usuario);
    expect(repo.uidActual()).toBe("uid_ana");
  });
});

describe("FirestoreConteoRepository.observarSesion (F4-A1, doc 11 §5)", () => {
  beforeEach(() => vi.clearAllMocks());

  function snapSesion(existe: boolean, datos?: Record<string, unknown>) {
    return { exists: () => existe, data: () => datos };
  }

  it("suscribe a doc(sesiones/{sesionId}) y mapea con sesionConteoDesdeDoc", () => {
    let callback: ((snap: unknown) => void) | undefined;
    onSnapshot.mockImplementation((_ref: unknown, cb: (snap: unknown) => void) => {
      callback = cb;
      return vi.fn();
    });
    const repo = new FirestoreConteoRepository({} as never, usuario);
    const recibidas: Array<{ sesionId: string; estado: string } | null> = [];

    repo.observarSesion("ses_1", (s) => recibidas.push(s as never));
    expect(doc).toHaveBeenCalledWith({}, "sesiones", "ses_1");

    callback?.(
      snapSesion(true, {
        sucursalId: "suc_norte",
        sucursalNombre: "Sucursal Norte",
        estado: "cerrada",
        abiertaEn: { toDate: () => new Date("2026-08-02T08:00:00Z") },
        abiertaPor: "uid_admin",
        cerradaEn: { toDate: () => new Date("2026-08-02T11:30:00Z") },
        cerradaPor: "uid_admin",
        participantes: ["uid_ana"],
        totalUnidades: 0,
        sesionCorregidaId: null,
      }),
    );

    expect(recibidas.at(-1)).toEqual(
      expect.objectContaining({ sesionId: "ses_1", estado: "cerrada" }),
    );
  });

  it("emite null cuando el documento de sesión no existe", () => {
    let callback: ((snap: unknown) => void) | undefined;
    onSnapshot.mockImplementation((_ref: unknown, cb: (snap: unknown) => void) => {
      callback = cb;
      return vi.fn();
    });
    const repo = new FirestoreConteoRepository({} as never, usuario);
    const recibidas: Array<unknown | null> = [];

    repo.observarSesion("ses_inexistente", (s) => recibidas.push(s));
    callback?.(snapSesion(false));

    expect(recibidas.at(-1)).toBeNull();
  });
});

describe("FirestoreConteoRepository.observarSucursales (doc 04 §3 — decisión: N listeners de documento, no query 'in')", () => {
  beforeEach(() => vi.clearAllMocks());

  function snapDoc(existe: boolean, datos?: Record<string, unknown>) {
    return {
      exists: () => existe,
      data: () => datos,
    };
  }

  it("con sucursalIds vacío emite [] una sola vez, sin abrir ningún listener, y el unsubscribe es no-op", () => {
    const repo = new FirestoreConteoRepository({} as never, usuario);
    const recibidas: unknown[][] = [];

    const unsub = repo.observarSucursales([], (s) => recibidas.push(s));

    expect(recibidas).toEqual([[]]);
    expect(onSnapshot).not.toHaveBeenCalled();
    expect(() => unsub()).not.toThrow();
  });

  it("emite parcialmente en cada snapshot individual (no espera a los N), ordenado por nombre con desempate por id", () => {
    const callbacks: Array<(snap: unknown) => void> = [];
    onSnapshot.mockImplementation((_ref: unknown, cb: (snap: unknown) => void) => {
      callbacks.push(cb);
      return vi.fn();
    });
    const repo = new FirestoreConteoRepository({} as never, usuario);
    const recibidas: Array<{ sucursalId: string; nombre: string }[]> = [];

    repo.observarSucursales(["suc_b", "suc_a"], (s) => recibidas.push(s));
    expect(onSnapshot).toHaveBeenCalledTimes(2);

    // Sólo respondió el segundo listener (suc_a) primero — orden de llegada
    // real, no el orden del array de entrada.
    callbacks[1]!(
      snapDoc(true, {
        nombre: "Sucursal Alameda",
        direccion: "Cll 1",
        conectividad: "wifi",
        activa: true,
        sesionAbiertaId: null,
        creadaEn: { toDate: () => new Date("2026-01-15T10:00:00Z") },
      }),
    );
    expect(recibidas.at(-1)).toEqual([
      expect.objectContaining({ sucursalId: "suc_a", nombre: "Sucursal Alameda" }),
    ]);

    callbacks[0]!(
      snapDoc(true, {
        nombre: "Sucursal Bosque",
        direccion: "Cll 2",
        conectividad: "datos",
        activa: true,
        sesionAbiertaId: null,
        creadaEn: { toDate: () => new Date("2026-01-15T10:00:00Z") },
      }),
    );
    expect(recibidas.at(-1)?.map((s) => s.sucursalId)).toEqual(["suc_a", "suc_b"]);
  });

  it("un ID inexistente (!snap.exists()) se omite del array sin romper la emisión", () => {
    const callbacks: Array<(snap: unknown) => void> = [];
    onSnapshot.mockImplementation((_ref: unknown, cb: (snap: unknown) => void) => {
      callbacks.push(cb);
      return vi.fn();
    });
    const repo = new FirestoreConteoRepository({} as never, usuario);
    const recibidas: Array<{ sucursalId: string }[]> = [];

    repo.observarSucursales(["suc_borrada"], (s) => recibidas.push(s));
    callbacks[0]!(snapDoc(false));

    expect(recibidas.at(-1)).toEqual([]);
  });

  it("el Unsubscribe devuelto cancela TODOS los listeners de documento", () => {
    const unsubsIndividuales = [vi.fn(), vi.fn(), vi.fn()];
    let i = 0;
    onSnapshot.mockImplementation(() => unsubsIndividuales[i++]);
    const repo = new FirestoreConteoRepository({} as never, usuario);

    const unsub = repo.observarSucursales(["suc_a", "suc_b", "suc_c"], () => {});
    unsub();

    for (const u of unsubsIndividuales) expect(u).toHaveBeenCalledTimes(1);
  });
});

describe("FirestoreConteoRepository.observarEscriturasPendientes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sube al registrar y baja cuando el setDoc en segundo plano se asienta", async () => {
    const { promesa, resolver } = deferido<void>();
    setDoc.mockReturnValue(promesa);
    const repo = new FirestoreConteoRepository({} as never, usuario);

    const valores: number[] = [];
    repo.observarEscriturasPendientes("ses_1", (n) => valores.push(n));
    expect(valores.at(-1)).toBe(0);

    await repo.registrarAporte({ sesionId: "ses_1", categoriaId: "cat_5000", cantidad: 12 });
    expect(valores.at(-1)).toBe(1);

    resolver(undefined);
    await promesa;
    await Promise.resolve(); // deja correr el .finally() interno
    expect(valores.at(-1)).toBe(0);
  });

  it("cuando el servidor RECHAZA la escritura (p.ej. permission-denied), el aporte NO cuenta como sincronizado: el pendiente sigue visible", async () => {
    const { promesa, rechazador } = deferido<void>();
    setDoc.mockReturnValue(promesa);
    const repo = new FirestoreConteoRepository({} as never, usuario);

    const valores: number[] = [];
    repo.observarEscriturasPendientes("ses_1", (n) => valores.push(n));

    await repo.registrarAporte({ sesionId: "ses_1", categoriaId: "cat_5000", cantidad: 12 });
    expect(valores.at(-1)).toBe(1);

    rechazador(Object.assign(new Error("permission-denied"), { code: "permission-denied" }));
    await promesa.catch(() => {});
    await Promise.resolve();

    // Un rechazo del servidor no se reintenta solo: el aporte se perdió.
    // El contador NO debe volver a 0 (eso apagaría el banner "no cierres
    // la aplicación" como si se hubiera sincronizado).
    expect(valores.at(-1)).toBe(1);
  });
});

describe("FirestoreConteoRepository.listarAuditoria (ticket #45)", () => {
  beforeEach(() => vi.clearAllMocks());

  function snapEvento(id: string, datos: Record<string, unknown>) {
    return { id, data: () => datos };
  }

  it("con sucursalIds vacío devuelve página vacía sin tocar Firestore", async () => {
    const repo = new FirestoreConteoRepository({} as never, usuario);

    const pagina = await repo.listarAuditoria([]);

    expect(pagina).toEqual({ items: [], siguienteCursor: null });
    expect(getDocs).not.toHaveBeenCalled();
    expect(where).not.toHaveBeenCalled();
  });

  it("construye la query con where('sucursalId','in',sucursalIds) — NUNCA una lectura de colección sin acotar", async () => {
    getDocs.mockResolvedValue({ docs: [] });
    const repo = new FirestoreConteoRepository({} as never, usuario);

    await repo.listarAuditoria(["suc_norte", "suc_sur"]);

    expect(where).toHaveBeenCalledWith("sucursalId", "in", ["suc_norte", "suc_sur"]);
    expect(collection).toHaveBeenCalledWith({}, "auditoria");
  });

  it("mapea los docs con eventoAuditoriaDesdeDoc y da siguienteCursor null bajo el tamaño de página", async () => {
    getDocs.mockResolvedValue({
      docs: [
        snapEvento("e1", {
          tipo: "APORTE_CREADO",
          sesionId: "ses1",
          sucursalId: "suc_norte",
          ocurridoEn: { toDate: () => new Date("2026-01-01T00:00:00Z") },
        }),
      ],
    });
    const repo = new FirestoreConteoRepository({} as never, usuario);

    const pagina = await repo.listarAuditoria(["suc_norte"]);

    expect(pagina.items).toEqual([
      expect.objectContaining({ eventoId: "e1", tipo: "APORTE_CREADO", sucursalId: "suc_norte" }),
    ]);
    expect(pagina.siguienteCursor).toBeNull();
  });

  it("con cursor, encadena la página siguiente vía startAfter", async () => {
    getDocs.mockResolvedValue({ docs: [] });
    const repo = new FirestoreConteoRepository({} as never, usuario);
    const cursor = { __doc: "e1" };

    await repo.listarAuditoria(["suc_norte"], cursor);

    expect(startAfter).toHaveBeenCalledWith(cursor);
  });
});
