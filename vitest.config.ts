import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Sólo entra en juego cuando vitest corre con la raíz del repo como cwd —
// hoy únicamente `npm run test:rules` ("vitest run infra/test"). Cada
// workspace (packages/*) tiene su propio vitest.config.ts y su propio cwd,
// así que esto no los afecta.
export default defineConfig({
  resolve: {
    // Mismo alias que packages/data/vitest.config.ts, necesario aquí desde
    // que aporte-repositorio-real.test.ts importa @conteo/data, que a su vez
    // importa @conteo/shared por submódulo (no por el barrel, ver el
    // comentario de conteo-repository.ts) — Vite no lee "paths" de
    // tsconfig.base.json, así que sin este alias el subpath no resuelve.
    alias: [
      {
        find: /^@conteo\/shared\/(.*)$/,
        replacement: fileURLToPath(new URL("./packages/shared/src/$1", import.meta.url)),
      },
    ],
  },
  test: {
    // infra/test comparte UNA sola instancia real del emulador de Firestore
    // (mismo projectId "demo-conteo-eficiente"). Con 3+ archivos de test
    // corriendo en paralelo (paralelismo por defecto de vitest), sus
    // clearFirestore()/escrituras concurrentes chocan contra el emulador
    // compartido y producen fallos reales de contención ("Transaction lock
    // timeout", "evaluation error" en medio de un clearFirestore()) — no
    // es flakiness del test, es dos procesos escribiendo el mismo estado
    // externo a la vez. Descubierto al añadir rnf-01-latencia-sincronizacion.test.ts
    // (issue #62): con 2 archivos no se manifestaba, con 3 sí.
    fileParallelism: false,
  },
});
