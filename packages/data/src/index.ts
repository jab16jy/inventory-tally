export type {
  ConteoRepository,
  RegistrarAporteInput,
  Unsubscribe,
} from "./repositories/conteo-repository.js";

export { FakeConteoRepository } from "./fakes/fake-conteo-repository.js";
export type { OpcionesFake, UsuarioFake } from "./fakes/fake-conteo-repository.js";

export { FirestoreConteoRepository } from "./firebase/firestore-conteo-repository.js";
export type { ProveedorUsuarioActual } from "./firebase/firestore-conteo-repository.js";

export { obtenerIdDispositivo } from "./firebase/dispositivo.js";

export type {
  AbrirSesionPayload,
  ActualizarAreaPayload,
  ActualizarCajeroPayload,
  ActualizarCategoriaPayload,
  ActualizarSucursalPayload,
  AdminRepository,
  CerrarSesionPayload,
  CrearAreaPayload,
  CrearCajeroPayload,
  CrearCategoriaPayload,
  CrearSucursalPayload,
  EstadoSincronizacion,
  FiltroAuditoria,
  FiltroSesiones,
  Pagina,
} from "./repositories/admin-repository.js";

export { FakeAdminRepository } from "./fakes/fake-admin-repository.js";
export type { LlamadaEscritura, OpcionesFakeAdmin } from "./fakes/fake-admin-repository.js";

export { FirestoreAdminRepository } from "./firebase/firestore-admin-repository.js";
