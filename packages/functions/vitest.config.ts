import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Vite (a diferencia de tsc) no lee "paths" de tsconfig.base.json. Este
// paquete importa `@conteo/shared` por submódulo (`@conteo/shared/services/…`,
// no el barrel) para no arrastrar `config/entorno.ts` y su ambient
// `ImportMeta.env` de Vite — mismo motivo y mismo alias que ya usa
// `packages/data/vitest.config.ts`.
export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@conteo\/shared\/(.*)$/,
        replacement: fileURLToPath(new URL("../shared/src/$1", import.meta.url)),
      },
    ],
  },
  test: {
    // Todos los archivos de este paquete comparten UN emulador de Firestore
    // mutable (un solo proyecto, sin reset entre archivos). `recalcularResumenesImpl`
    // (slice 1) hace un `where("estado","==","abierta")` sin acotar por sesión:
    // en paralelo, otro archivo puede estar creando/mutando sesiones "abierta"
    // a mitad de esa consulta, lo que vuelve no determinista el interleaving
    // que D-1 exige probar. Ejecutar los archivos en serie es lo que hace que
    // `vi.spyOn(db, "runTransaction").mockImplementationOnce(...)` intercepte
    // con certeza SU propia transacción, no la de una sesión ajena.
    fileParallelism: false,
  },
});
