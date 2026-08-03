import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { PATRON_DEGRADACION, instalarMonitorPersistencia } from "./persistencia-monitor.js";

function crearConsolaFalsa() {
  return { warn: vi.fn() };
}

describe("instalarMonitorPersistencia", () => {
  // Hallazgo verificado en @firebase/firestore/dist/index.esm2017.js
  // (__PRIVATE_ensureOfflineComponents): si IndexedDB falla con un error
  // recuperable (cuota excedida, UNIMPLEMENTED/FAILED_PRECONDITION, o
  // INVALID_STATE de Firefox privado), el SDK cae a caché en memoria y
  // SÓLO emite: "Error using user provided cache. Falling back to memory
  // cache: <detalle>" vía console.warn. No hay evento ni excepción.
  it("detecta el warning exacto de fallback a caché en memoria del SDK de Firestore", () => {
    const consolaFalsa = crearConsolaFalsa();
    const monitor = instalarMonitorPersistencia(consolaFalsa);
    expect(monitor.estaDegradada()).toBe(false);

    consolaFalsa.warn("Error using user provided cache. Falling back to memory cache: boom");

    expect(monitor.estaDegradada()).toBe(true);
  });

  it("notifica a los suscriptores cuando detecta la degradación", () => {
    const consolaFalsa = crearConsolaFalsa();
    const monitor = instalarMonitorPersistencia(consolaFalsa);
    const recibidos: boolean[] = [];
    monitor.subscribe((d) => recibidos.push(d));

    consolaFalsa.warn("Error using user provided cache. Falling back to memory cache: x");

    expect(recibidos).toEqual([true]);
  });

  it("ignora warnings sin relación con la persistencia", () => {
    const consolaFalsa = crearConsolaFalsa();
    const monitor = instalarMonitorPersistencia(consolaFalsa);

    consolaFalsa.warn("algo no relacionado");

    expect(monitor.estaDegradada()).toBe(false);
  });

  it("no silencia el warning original: sigue llegando a la consola real", () => {
    const original = vi.fn();
    const consolaFalsa = { warn: original };
    instalarMonitorPersistencia(consolaFalsa);

    // consolaFalsa.warn ya es el envoltorio instalado; debe seguir invocando
    // el `warn` original capturado antes del parche.
    consolaFalsa.warn("cualquier cosa");

    expect(original).toHaveBeenCalledWith("cualquier cosa");
  });

  // CANARIO DE DEPENDENCIA EXTERNA — no un test roto si falla.
  // Los tests de arriba escriben a mano el mismo literal que
  // PATRON_DEGRADACION busca: son autorreferenciales y nunca detectarían
  // que Firebase cambió el texto real del warning. Este test lee el
  // bundle REAL instalado en node_modules y confirma que el patrón sigue
  // coincidiendo con lo que el SDK emite hoy. Si se pone en ROJO tras un
  // `npm update` de @firebase/firestore, NO arregles el test: significa
  // que Firebase reescribió el mensaje y hay que actualizar
  // PATRON_DEGRADACION en persistencia-monitor.ts para que el monitor
  // siga detectando la caída a caché en memoria.
  it("canario: el bundle instalado de @firebase/firestore aún contiene el texto que PATRON_DEGRADACION reconoce", () => {
    // "@firebase/firestore/dist/index.esm2017.js" no es resolvable vía
    // require.resolve: el "exports" del paquete sólo permite "." y
    // "./package.json". Se resuelve la raíz del paquete a través de un
    // subpath sí permitido y se arma la ruta al bundle a mano.
    const requerir = createRequire(import.meta.url);
    const raizPaquete = dirname(requerir.resolve("@firebase/firestore/package.json"));
    const rutaBundle = join(raizPaquete, "dist", "index.esm2017.js");

    let contenidoBundle: string;
    try {
      contenidoBundle = readFileSync(rutaBundle, "utf8");
    } catch {
      throw new Error(
        `No se encontró el bundle esperado de @firebase/firestore en ${rutaBundle}. ` +
          "¿Cambió la estructura del paquete? Actualiza la ruta en este test canario.",
      );
    }
    expect(contenidoBundle).toMatch(PATRON_DEGRADACION);
  });
});
