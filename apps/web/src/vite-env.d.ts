/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  readonly VITE_USE_EMULATORS?: string;
}

// issue #12 (D1, corregido en RDD — R4-001): versión de build inyectada por
// `define` en vite.config.ts, tomada de un tag exacto de git en build time.
// `null` = build sin tag resoluble (dev, CI sin tags) — el bloqueo por
// versión mínima se desactiva en ese caso, nunca se compara un sentinel.
declare const __VERSION_APP__: string | null;
