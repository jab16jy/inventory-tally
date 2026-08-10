// Contrato del bundle desplegable (issue #11): corre el script `build` REAL
// (no una copia de sus opciones) — así una edición del script que vuelva a
// inlinar zod no pasa inadvertida — y comprueba estructuralmente que cada
// módulo de callables/scheduled/triggers esté reexportado por `src/index.ts`.
// Comparar sólo los exports del bundle contra los de `index.ts` NO detecta un
// reexport olvidado (ambos lados se quedan sin la función y coinciden en
// verde); por eso esa comparación se complementa con el barrido de carpetas.
import { execSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const RAIZ = fileURLToPath(new URL("../", import.meta.url));
const ENTRADA = join(RAIZ, "src/index.ts");
const SALIDA = join(RAIZ, "lib/index.js");
// ponytail: se asume que estas tres carpetas sólo alojan funciones desplegables,
// que es como está organizado el paquete hoy. Si alguna llega a contener un
// helper compartido, este test exigirá reexportarlo y habrá que mover el helper
// a `src/lib/` — que es donde ya viven los que no se despliegan.
const CARPETAS_DE_FUNCIONES = ["callables", "scheduled", "triggers"];

/**
 * Reexportaciones que declara `src/index.ts`, en la forma
 * `export { nombre } from "./ruta.js";`. Devuelve los nombres y las rutas por
 * separado porque las dos comprobaciones de abajo necesitan una cada una, y
 * ambas tienen que quedar ancladas a una sentencia `export` real: buscar la
 * ruta como subcadena del archivo daría por buena una mención en un comentario
 * o en un import sin export.
 */
function reexportaciones(): { nombres: string[]; rutas: string[] } {
  const nombres: string[] = [];
  const rutas: string[] = [];
  for (const linea of readFileSync(ENTRADA, "utf8").split("\n")) {
    const coincidencia = /^export \{ (\w+) \} from "([^"]+)";/.exec(linea);
    if (!coincidencia) continue;
    const [, nombre, ruta] = coincidencia;
    if (!nombre || !ruta) continue;
    nombres.push(nombre);
    rutas.push(ruta);
  }
  return { nombres: nombres.sort(), rutas };
}

describe("bundle desplegable (lib/index.js)", () => {
  it("cada módulo de callables/scheduled/triggers está reexportado por src/index.ts", () => {
    const { rutas } = reexportaciones();
    for (const carpeta of CARPETAS_DE_FUNCIONES) {
      const archivos = readdirSync(join(RAIZ, "src", carpeta)).filter((archivo) =>
        archivo.endsWith(".ts"),
      );
      for (const archivo of archivos) {
        const ruta = `./${carpeta}/${archivo.replace(/\.ts$/, "")}.js`;
        expect(rutas, `${carpeta}/${archivo} no está reexportado en src/index.ts`).toContain(ruta);
      }
    }
  });

  it("el script `build` produce lib/index.js con exactamente los exports de src/index.ts y pesa menos de 50 KB", async () => {
    // ponytail: el `timeout` va aquí y no basta con el de `it` — execSync
    // bloquea el hilo único, así que el temporizador de Vitest no puede
    // dispararse mientras el proceso hijo siga vivo. Sin esto, un build colgado
    // cuelga también el job de CI.
    execSync("npm run build", { cwd: RAIZ, timeout: 60_000 });

    // 50 KB: el bundle propio pesa ~30 KB y sólo crece con código nuevo de este
    // paquete. El umbral no vigila ese crecimiento, vigila el salto de orden de
    // magnitud de volver a inlinar una dependencia — con zod dentro son 573 KB.
    // Si el código propio llegara a acercarse, subir el número es lo correcto.
    expect(statSync(SALIDA).size).toBeLessThan(50 * 1024);

    // ponytail: specifier relativo, no `pathToFileURL(SALIDA).href` — con una
    // ruta con espacios (p.ej. "PC RYZEN" en el perfil de Windows), el
    // resolvedor SSR de Vitest compara el id contra el disco SIN decodificar
    // el "%20" del file:// URL y falla con "Does the file exist?" aunque el
    // archivo sí exista. La ruta relativa evita el viaje de ida y vuelta por URL.
    // @ts-expect-error -- lib/index.js es el artefacto de build (sin .d.ts); esta
    // prueba verifica su forma en runtime, no su tipado.
    const modulo: Record<string, unknown> = await import("../lib/index.js");
    expect(Object.keys(modulo).sort()).toEqual(reexportaciones().nombres);
  }, 90_000);
});
