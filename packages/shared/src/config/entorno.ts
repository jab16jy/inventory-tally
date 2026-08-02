// packages/shared/src/config/entorno.ts (doc 12 §1)
export type Entorno = "dev" | "prod";

const valor = import.meta.env.MODE === "prod" ? "prod" : "dev";

export const Config = {
  actual: valor as Entorno,
  esProd: valor === "prod",
  nombreApp: valor === "prod" ? "Conteo" : "Conteo DEV",
};
