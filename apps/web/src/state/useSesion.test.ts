// apps/web/src/state/useSesion.test.ts
//
// El hook distingue TRES estados donde antes había dos valores. `null` servía
// a la vez para "el listener todavía no ha emitido nada" y para "el documento
// no existe", y esa ambigüedad produjo dos defectos reales que la revisión
// encontró por separado: la pantalla de conteo mostraba un esqueleto
// prometiendo líneas que nunca iban a llegar cuando la sesión se había
// borrado, y al exigir que la sesión existiera para taparlo, dejaba la
// pantalla en blanco durante la carga normal. Ninguno de los dos se puede
// arreglar sin separar los estados aquí.
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { createElement } from "react";
import { FakeConteoRepository } from "@conteo/data";
import type { SesionConteo } from "@conteo/shared";
import { describe, expect, it } from "vitest";
import { ConteoRepositoryProvider } from "./repositorio-contexto.js";
import { useSesion } from "./useSesion.js";

function sesionBase(overrides: Partial<SesionConteo> = {}): SesionConteo {
  return {
    sesionId: "ses_1",
    sucursalId: "suc_norte",
    sucursalNombre: "Sucursal Norte",
    estado: "abierta",
    abiertaEn: new Date("2026-08-01T08:00:00Z"),
    abiertaPor: "uid_admin",
    cerradaEn: null,
    cerradaPor: null,
    participantes: [],
    totalUnidades: 0,
    sesionCorregidaId: null,
    ...overrides,
  };
}

function envoltura(repo: FakeConteoRepository) {
  return ({ children }: { children: ReactNode }) =>
    createElement(ConteoRepositoryProvider, { repo, children });
}

describe("useSesion", () => {
  it("informa 'existe' con la sesión cuando el documento está", () => {
    const repo = new FakeConteoRepository();
    repo.sembrarSesion(sesionBase());

    const { result } = renderHook(() => useSesion("ses_1"), { wrapper: envoltura(repo) });

    expect(result.current).toEqual({ estado: "existe", sesion: expect.objectContaining({}) });
  });

  it("informa 'sin-resolver' mientras el listener no ha emitido nada", () => {
    // Este caso NO se puede escribir con FakeConteoRepository: su
    // `observarSesion` llama al callback SÍNCRONAMENTE al suscribirse, así
    // que React agrupa el reset a "sin-resolver" con la respuesta en el
    // mismo render y el estado intermedio nunca llega a observarse. Con el
    // doble síncrono, borrar el reset del hook no rompería ni un test — la
    // ventana de carga honesta, que es la razón entera de este estado, iba
    // sin prueba. Este doble se queda callado a propósito: es la única
    // forma de ver el estado que un listener real de Firestore sí produce
    // antes de su primer snapshot.
    const repoMudo = {
      observarSesion: () => () => {},
    } as unknown as FakeConteoRepository;

    const { result } = renderHook(() => useSesion("ses_1"), {
      wrapper: envoltura(repoMudo),
    });

    expect(result.current).toEqual({ estado: "sin-resolver" });
  });

  it("vuelve a 'sin-resolver' al cambiar de sesión, sin arrastrar la anterior", () => {
    // El doble responde por ses_1 y se queda MUDO por ses_2. Es lo que hace
    // discriminante al test: sin el reset del hook, al cambiar de sesión el
    // estado seguiría siendo el `existe` de ses_1 —una sesión ajena— y la
    // pantalla decidiría con datos de otro conteo. Un doble mudo para las
    // dos sesiones habría pasado igual con y sin reset, porque el estado
    // inicial ya es "sin-resolver": no habría probado nada.
    const repoParcial = {
      observarSesion: (id: string, onChange: (s: SesionConteo | null) => void) => {
        if (id === "ses_1") onChange(sesionBase());
        return () => {};
      },
    } as unknown as FakeConteoRepository;

    const { result, rerender } = renderHook(({ id }: { id: string }) => useSesion(id), {
      wrapper: envoltura(repoParcial),
      initialProps: { id: "ses_1" },
    });
    expect(result.current).toEqual({ estado: "existe", sesion: expect.objectContaining({}) });

    rerender({ id: "ses_2" });

    expect(result.current).toEqual({ estado: "sin-resolver" });
  });

  it("informa 'borrada' —no 'sin-resolver'— cuando el listener emite ausencia", () => {
    // Éste es el estado que antes se confundía con la carga inicial. El
    // repositorio emite `null` en cuanto sabe que el documento no está, y
    // eso es una RESPUESTA, no la falta de una.
    const repo = new FakeConteoRepository();

    const { result } = renderHook(() => useSesion("ses_inexistente"), {
      wrapper: envoltura(repo),
    });

    expect(result.current).toEqual({ estado: "borrada" });
  });
});
