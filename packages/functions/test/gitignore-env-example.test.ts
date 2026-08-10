// Contrato de .gitignore (issue #13): ninguna credencial real versionada,
// sólo los .env.*.example. `.env*` ignora todo lo que empiece por `.env`, así
// que la negación debe cubrir CUALQUIER `*.example`, no sólo el nombre
// literal `.env.example` — si no, `.env.dev.example`/`.env.prod.example`
// quedan atrapados por la regla ancha y sólo entran al repo con `git add -f`.
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const RAIZ = fileURLToPath(new URL("../../../", import.meta.url));

function estaIgnorado(ruta: string): boolean {
  try {
    execSync(`git check-ignore -q "${ruta}"`, { cwd: RAIZ });
    return true;
  } catch {
    return false;
  }
}

describe(".gitignore — patrón .env*.example", () => {
  it.each(["apps/web/.env.dev.example", "apps/web/.env.prod.example", ".env.example"])(
    "%s NO está ignorado",
    (ruta) => {
      expect(estaIgnorado(ruta)).toBe(false);
    },
  );

  it.each(["apps/web/.env.dev.local", ".env", ".env.local"])("%s sigue ignorado", (ruta) => {
    expect(estaIgnorado(ruta)).toBe(true);
  });
});
