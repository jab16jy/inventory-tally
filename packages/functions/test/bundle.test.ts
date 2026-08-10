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

function exportsEsperados(): string[] {
  const fuente = readFileSync(ENTRADA, "utf8");
  const nombres: string[] = [];
  for (const linea of fuente.split("\n")) {
    const nombre = /^export \{ (\w+) \}/.exec(linea)?.[1];
    if (nombre) nombres.push(nombre);
  }
  return nombres.sort();
}

describe("bundle desplegable (lib/index.js)", () => {
  it("cada módulo de callables/scheduled/triggers está reexportado por src/index.ts", () => {
    const fuente = readFileSync(ENTRADA, "utf8");
    for (const carpeta of CARPETAS_DE_FUNCIONES) {
      const archivos = readdirSync(join(RAIZ, "src", carpeta)).filter((archivo) =>
        archivo.endsWith(".ts"),
      );
      for (const archivo of archivos) {
        const modulo = archivo.replace(/\.ts$/, "");
        expect(fuente, `${carpeta}/${archivo} no está reexportado en src/index.ts`).toContain(
          `./${carpeta}/${modulo}.js`,
        );
      }
    }
  });

  it("el script `build` produce lib/index.js con exactamente los exports de src/index.ts y pesa menos de 50 KB", async () => {
    execSync("npm run build", { cwd: RAIZ });

    expect(statSync(SALIDA).size).toBeLessThan(50 * 1024);

    // ponytail: specifier relativo, no `pathToFileURL(SALIDA).href` — con una
    // ruta con espacios (p.ej. "PC RYZEN" en el perfil de Windows), el
    // resolvedor SSR de Vitest compara el id contra el disco SIN decodificar
    // el "%20" del file:// URL y falla con "Does the file exist?" aunque el
    // archivo sí exista. La ruta relativa evita el viaje de ida y vuelta por URL.
    // @ts-expect-error -- lib/index.js es el artefacto de build (sin .d.ts); esta
    // prueba verifica su forma en runtime, no su tipado.
    const modulo: Record<string, unknown> = await import("../lib/index.js");
    expect(Object.keys(modulo).sort()).toEqual(exportsEsperados());
  }, 20_000);
});
