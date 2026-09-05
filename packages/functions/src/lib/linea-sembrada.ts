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
  /** `CategoriaValor.areaIds` (D-1, docs/diseno/etapa-3-ui.md) — copiado y
   *  congelado igual que `valorUnitario`. Ausente o vacío omite el campo:
   *  significa "sin área", el mismo default que ya rige en `CategoriaValor`. */
  areaIds?: readonly string[];
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
    ...(input.areaIds && input.areaIds.length > 0 && { areaIds: input.areaIds }),
  };
}
