import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Vite (a diferencia de tsc) no lee "paths" de tsconfig.base.json. Este
// paquete importa `@conteo/shared` por submódulo (`@conteo/shared/errors.js`,
// no el barrel) para no arrastrar `config/entorno.ts` y su ambient
// `ImportMeta.env` de Vite (ver comentario en conteo-repository.ts); el
// alias replica, sólo para pruebas, el mismo mapeo que ya usa `tsc`.
export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@conteo\/shared\/(.*)$/,
        replacement: fileURLToPath(new URL("../shared/src/$1", import.meta.url)),
      },
    ],
  },
});
