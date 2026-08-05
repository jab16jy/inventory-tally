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
