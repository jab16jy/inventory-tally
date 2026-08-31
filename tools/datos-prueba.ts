/**
 * datos-prueba.ts — constantes compartidas entre sembrar-datos-prueba.ts y
 * borrar-datos-prueba.ts, para que borrar revierta EXACTAMENTE lo que
 * sembrar creó (mismos IDs/correos), sin arrastrar otros datos reales.
 */
export const SUCURSAL_ID = "suc_norte";
export const NUM_CATEGORIAS = 15;
export const CAJEROS = [
  { nombre: "Ana Ramírez", correo: "ana@negocio.com" },
  { nombre: "Luis Pérez", correo: "luis@negocio.com" },
];
