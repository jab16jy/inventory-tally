import { FieldValue, type DocumentData } from "firebase-admin/firestore";
import { SIN_AREA } from "@conteo/shared/models/linea-conteo.js";

/**
 * lineaSembrada — la forma del documento `sesiones/*\/lineas/*` recién
 * sembrado, en un solo sitio. Hoy sólo la escribe `abrirSesion`; mañana
 * también `crearCategoriaEnSesion` sembrará una línea suelta al crear una
 * categoría dentro de una sesión — si las dos formas divergieran, I-7 se
 * rompería en silencio entre una línea y la otra.
 */
export function lineaSembrada(input: {
  categoriaId: string;
  valorUnitario: number;
  etiqueta: string;
  area: string | undefined;
  actualizadaPor: string;
}): DocumentData {
  return {
    categoriaId: input.categoriaId,
    valorUnitario: input.valorUnitario, // I-7: copiado y congelado
    etiqueta: input.etiqueta,
    area: input.area ?? SIN_AREA, // I-7: copiado y congelado
    cantidadTotal: 0,
    numAportantes: 0,
    versiones: {},
    actualizadaEn: FieldValue.serverTimestamp(),
    actualizadaPor: input.actualizadaPor,
  };
}
