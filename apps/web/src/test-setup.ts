import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";

// Sin `test.globals: true` en vite.config.ts (este repo importa
// describe/it/expect explícitos), la auto-limpieza de Testing Library no se
// registra sola: hay que engancharla a mano o el DOM de un test contamina
// el siguiente (dos `<li>` con el mismo aria-label, etc.).
afterEach(() => {
  cleanup();
});
