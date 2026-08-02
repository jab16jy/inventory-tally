// Tipado ambiental mínimo para import.meta.env: shared no depende del
// paquete `vite` (no puede importar más que lo estrictamente propio del
// dominio), pero Vite/Vitest inyectan este global en tiempo de ejecución.
interface ImportMetaEnv {
  readonly MODE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
