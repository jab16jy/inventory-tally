import { describe, expect, it } from "vitest";
import { z } from "zod";
import { HttpsError } from "firebase-functions/v2/https";
import { validar } from "../../src/lib/validar.js";

const esquema = z.object({ nombre: z.string().min(1) });

describe("validar (doc 08 §5 — nunca confiar en req.data)", () => {
  it("retorna los datos si son válidos", () => {
    expect(validar({ nombre: "Ana" }, esquema)).toEqual({ nombre: "Ana" });
  });

  it("lanza invalid-argument si no son válidos", () => {
    expect(() => validar({}, esquema)).toThrow(HttpsError);
  });
});
