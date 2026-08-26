import { describe, expect, it } from "vitest";
import { construirFirebaseConfig } from "./firebase.js";

describe("construirFirebaseConfig", () => {
  it("en un build real sin emuladores y sin variables reales, revienta en vez de caer al demo", () => {
    expect(() =>
      construirFirebaseConfig({}, { usaEmuladores: false, esBuildReal: true }),
    ).toThrow(/VITE_FIREBASE_API_KEY/);
  });

  it("bajo emuladores, cae al proyecto demo aunque sea un build real", () => {
    const config = construirFirebaseConfig({}, { usaEmuladores: true, esBuildReal: true });
    expect(config.projectId).toBe("demo-conteo-eficiente");
  });

  it("fuera de un build real (dev server / tests), cae al proyecto demo sin reventar", () => {
    const config = construirFirebaseConfig({}, { usaEmuladores: false, esBuildReal: false });
    expect(config.projectId).toBe("demo-conteo-eficiente");
  });

  it("con variables reales presentes, las usa aunque sea un build real sin emuladores", () => {
    const config = construirFirebaseConfig(
      {
        VITE_FIREBASE_API_KEY: "clave-real",
        VITE_FIREBASE_AUTH_DOMAIN: "real.firebaseapp.com",
        VITE_FIREBASE_PROJECT_ID: "proyecto-real",
        VITE_FIREBASE_STORAGE_BUCKET: "real.appspot.com",
        VITE_FIREBASE_MESSAGING_SENDER_ID: "123",
        VITE_FIREBASE_APP_ID: "1:123:web:abc",
      },
      { usaEmuladores: false, esBuildReal: true },
    );
    expect(config.projectId).toBe("proyecto-real");
    expect(config.apiKey).toBe("clave-real");
  });
});
