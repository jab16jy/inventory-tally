import { describe, expect, it } from "vitest";
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { exigirAdmin } from "../../src/lib/exigir-admin.js";

const req = (auth: CallableRequest["auth"]) => ({ auth }) as CallableRequest;

describe("exigirAdmin (doc 08 §5)", () => {
  it("rechaza sin autenticación", () => {
    expect(() => exigirAdmin(req(undefined))).toThrow(HttpsError);
  });

  it("rechaza rol distinto de admin", () => {
    expect(() =>
      exigirAdmin(
        req({ uid: "uid_ana", token: { rol: "cajero" } } as unknown as CallableRequest["auth"]),
      ),
    ).toThrow(HttpsError);
  });

  it("permite rol admin", () => {
    expect(() =>
      exigirAdmin(
        req({ uid: "uid_admin", token: { rol: "admin" } } as unknown as CallableRequest["auth"]),
      ),
    ).not.toThrow();
  });
});
