import { beforeEach, describe, expect, it, vi } from "vitest";

// entorno.ts lee import.meta.env.MODE al cargarse el módulo, por lo que cada
// caso necesita reiniciar el registro de módulos e importar dinámicamente
// después de fijar la variable de entorno (doc 12 §1).
describe("Config (doc 12 §1)", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("usa 'dev' cuando MODE no es 'prod'", async () => {
    vi.stubEnv("MODE", "test");
    const { Config } = await import("./entorno.js");
    expect(Config.actual).toBe("dev");
    expect(Config.esProd).toBe(false);
    expect(Config.nombreApp).toBe("Conteo DEV");
  });

  it("usa 'prod' cuando MODE es 'prod'", async () => {
    vi.stubEnv("MODE", "prod");
    const { Config } = await import("./entorno.js");
    expect(Config.actual).toBe("prod");
    expect(Config.esProd).toBe(true);
    expect(Config.nombreApp).toBe("Conteo");
  });
});
