import { defineConfig } from "vitest/config";

// Config dedicada para Stryker (stryker.percentiles.conf.json): sólo el test
// del helper, rápido y sin emulador. El vitest.config.ts de la raíz recoge
// por defecto TODOS los *.test.ts del repo (incluidos los de packages/*, que
// necesitan sus propios alias/mocks) y los de infra/test que requieren el
// emulador de Firestore corriendo — ninguno de los dos sirve para correr
// mutantes de esta única función pura.
export default defineConfig({
  test: {
    include: ["infra/test/percentiles.test.ts"],
  },
});
