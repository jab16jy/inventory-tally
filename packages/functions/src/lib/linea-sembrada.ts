import { FieldValue, type DocumentData } from "firebase-admin/firestore";

/**
 * lineaSembrada — la forma del documento `sesiones/*\/lineas/*` recién
 * sembrado, en un solo sitio (ADR-23).
 */
export function lineaSembrada(input: {
  categoriaId: string;
  valorUnitario: number;
  etiqueta: string;
  actualizadaPor: string;
}): DocumentData {
  return {
    categoriaId: input.categoriaId,
    valorUnitario: input.valorUnitario, // I-7: copiado y congelado
    etiqueta: input.etiqueta,
    porArea: {},
    cantidadTotal: 0,
    numAportantes: 0,
    versiones: {},
    actualizadaEn: FieldValue.serverTimestamp(),
    actualizadaPor: input.actualizadaPor,
  };
}
