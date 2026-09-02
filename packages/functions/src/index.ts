import { initializeApp } from "firebase-admin/app";

// Sin esto, getFirestore()/getAuth() (llamadas dentro de cada handler) lanzan
// "The default Firebase app does not exist" en el runtime real de Cloud
// Functions — v2/https.js (onCall) no auto-inicializa el Admin SDK. Los tests
// no lo detectan porque cada uno llama initializeApp() en su propio
// beforeAll contra el emulador.
initializeApp();

export { onAporteEscrito } from "./triggers/on-aporte-escrito.js";
export { abrirSesion } from "./callables/abrir-sesion.js";
export { cerrarSesion } from "./callables/cerrar-sesion.js";
export { crearCajero } from "./callables/crear-cajero.js";
export { actualizarCajero } from "./callables/actualizar-cajero.js";
export { desactivarCajero } from "./callables/desactivar-cajero.js";
export { reactivarCajero } from "./callables/reactivar-cajero.js";
export { eliminarCajero } from "./callables/eliminar-cajero.js";
export { crearSucursal } from "./callables/crear-sucursal.js";
export { actualizarSucursal } from "./callables/actualizar-sucursal.js";
export { crearCategoria } from "./callables/crear-categoria.js";
export { actualizarCategoria } from "./callables/actualizar-categoria.js";
export { desactivarCategoria } from "./callables/desactivar-categoria.js";
export { eliminarCategoria } from "./callables/eliminar-categoria.js";
export { reactivarCategoria } from "./callables/reactivar-categoria.js";
export { crearArea } from "./callables/crear-area.js";
export { actualizarArea } from "./callables/actualizar-area.js";
export { desactivarArea } from "./callables/desactivar-area.js";
export { eliminarArea } from "./callables/eliminar-area.js";
export { reactivarArea } from "./callables/reactivar-area.js";
export { vincularArea } from "./callables/vincular-area.js";
export { crearCategoriaEnSesion } from "./callables/crear-categoria-en-sesion.js";
export { recalcularResumenes } from "./scheduled/recalcular-resumenes.js";
export { reconciliarLineas } from "./scheduled/reconciliar-lineas.js";
export { purgarAuditoria } from "./scheduled/purgar-auditoria.js";
