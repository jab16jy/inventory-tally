// Prueba empírica contra el emulador de Auth de la propiedad en la que se
// apoya `exigirReautenticacion`: un refresh del ID token NO mueve `auth_time`,
// sólo un login real lo mueve. firebase-admin no puede iniciar sesión (es una
// operación de cliente), así que se usa la REST API del emulador con `fetch`
// global (Node 22, cero dependencias nuevas).
import { randomUUID } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

if (getApps().length === 0) {
  initializeApp({ projectId: "demo-conteo-eficiente" });
}
const auth = getAuth();

const AUTH_EMULATOR_BASE = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1";
const TOKEN_EMULATOR_BASE = "http://127.0.0.1:9099/securetoken.googleapis.com/v1";
const FAKE_API_KEY = "fake-api-key"; // el emulador acepta cualquier string

async function signIn(email: string, password: string) {
  const res = await fetch(`${AUTH_EMULATOR_BASE}/accounts:signInWithPassword?key=${FAKE_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const body = (await res.json()) as { idToken: string; refreshToken: string };
  return body;
}

async function refresh(refreshToken: string) {
  const res = await fetch(`${TOKEN_EMULATOR_BASE}/token?key=${FAKE_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=refresh_token&refresh_token=${refreshToken}`,
  });
  const body = (await res.json()) as { id_token: string };
  return body;
}

describe("auth_time tras refresh vs. relogin (empírico, emulador de Auth)", () => {
  const email = `reauth_${randomUUID()}@negocio.com`;
  const password = "Temp2026#";
  let uid: string;

  beforeAll(async () => {
    const usuario = await auth.createUser({ email, password });
    uid = usuario.uid;
  });

  afterAll(async () => {
    await auth.deleteUser(uid);
  });

  it("un refresh conserva auth_time; un segundo login lo adelanta", async () => {
    const primerLogin = await signIn(email, password);
    const authTimeA = (await auth.verifyIdToken(primerLogin.idToken)).auth_time;

    const refrescado = await refresh(primerLogin.refreshToken);
    const authTimeRefrescado = (await auth.verifyIdToken(refrescado.id_token)).auth_time;

    // `auth_time` tiene granularidad de 1 segundo: dos logins dentro del
    // mismo segundo de reloj producirían el mismo valor y el test sería
    // intermitente. Este sleep no es cosmético — es lo que garantiza que el
    // segundo login caiga en un segundo distinto del primero.
    await new Promise((resolve) => setTimeout(resolve, 1100));

    const segundoLogin = await signIn(email, password);
    const authTimeB = (await auth.verifyIdToken(segundoLogin.idToken)).auth_time;

    expect(authTimeRefrescado).toBe(authTimeA);
    expect(authTimeB).toBeGreaterThan(authTimeA);
  }, 15000);
});
