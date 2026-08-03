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
