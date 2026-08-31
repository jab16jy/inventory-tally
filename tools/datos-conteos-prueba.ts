/**
 * datos-conteos-prueba.ts — constantes compartidas entre
 * sembrar-conteos-prueba.ts y borrar-conteos-prueba.ts.
 */
import { SUCURSAL_ID } from "./datos-prueba.ts";

export const MARCADOR = "seed-conteos-prueba";

export const SUCURSALES_NUEVAS = [
  { id: "suc_sur", nombre: "Sucursal Sur", direccion: "Cra 15 #22-40" },
  { id: "suc_centro", nombre: "Sucursal Centro", direccion: "Cl 10 #5-30" },
  { id: "suc_oriente", nombre: "Sucursal Oriente", direccion: "Cra 68 #12-15" },
  { id: "suc_occidente", nombre: "Sucursal Occidente", direccion: "Cl 80 #45-20" },
  { id: "suc_industrial", nombre: "Sucursal Industrial", direccion: "Zona Franca Km 3" },
] as const;

export const TODAS_SUCURSALES_CONTEO = [SUCURSAL_ID, ...SUCURSALES_NUEVAS.map((s) => s.id)];

// Pedido explícito del usuario: productos de $1.000, $2.000 y $5.000 —
// mismos IDs que sembrar-datos-prueba.ts genera para categoriasValor
// (`cat_${valor}`).
export const CATEGORIAS_CONTEO = ["cat_1000", "cat_2000", "cat_5000"] as const;

// Área congelada de cada categoría, el mismo campo que `abrirSesionImpl` copia
// desde `areas` (packages/functions/src/callables/abrir-sesion.ts). Aquí va
// fija, sin sembrar la colección `areas` — mismo criterio que tools/seed.ts.
// Tres nombres DISTINTOS a propósito: con una sola área el desglose por área
// sería una fila única y no se podría ver funcionando.
export const AREA_POR_CATEGORIA: Record<string, string> = {
  cat_1000: "Bodega",
  cat_2000: "Caja",
  cat_5000: "Vitrina",
};

export const NUM_CONTEOS = 20;
