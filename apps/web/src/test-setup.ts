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

// jsdom (v30) todavía no implementa showModal()/close() de <dialog> (Hoja.tsx,
// plan §3): el navegador real objetivo — iOS Safari 15.4+ — sí lo soporta
// nativo, así que el parche va aquí (el entorno de test), no como una rama
// de compatibilidad especulativa dentro del componente de producción.
if (typeof HTMLDialogElement !== "undefined" && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
}
