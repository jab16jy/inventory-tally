import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import {
  subtotal,
  totalMonetarioSesion,
  totalUnidadesSesion,
  type LineaSumable,
} from "@conteo/shared/services/calculadora.js";

interface EntradaCategoria {
  readonly categoriaId: string;
  readonly etiqueta: string;
  readonly cantidad: number;
}

export interface ResumenCalculado {
  readonly totalUnidades: number;
  readonly totalMonetario: number;
  readonly numCategoriasConConteo: number;
  readonly categoriaMayor: EntradaCategoria | null;
  readonly categoriaMenor: EntradaCategoria | null;
  readonly porCategoria: Record<
    string,
    { cantidad: number; subtotal: number; actualizadaEn: unknown }
  >;
  readonly porArea: Record<string, number>;
}

/**
 * calcularResumen — ensambla el `resumen/actual` derivado (doc 04 §3) a
 * partir de `lineas` ya leídas por el llamador (D-2). No lee ni escribe
 * Firestore: el cron las lee fuera de una transacción y `cerrarSesion` las lee
 * dentro de la suya — pasar las líneas ya resueltas es lo que evita que este
 * helper imponga su propio límite transaccional a ninguno de los dos.
 *
 * `totalUnidades`/`totalMonetario` reutilizan `calculadora.ts` (no se
 * reimplementa la suma); `categoriaMayor`/`categoriaMenor` quedan como un
 * bucle corto aquí porque tienen un único consumidor — una exportación
 * compartida sería una abstracción sin segundo llamador.
 */
export function calcularResumen(lineas: readonly QueryDocumentSnapshot[]): ResumenCalculado {
  const lineasSumables: LineaSumable[] = lineas.map((linea) => ({
    cantidadTotal: linea.get("cantidadTotal") as number,
    valorUnitario: linea.get("valorUnitario") as number,
  }));

  const porCategoria: ResumenCalculado["porCategoria"] = {};
  const porArea: Record<string, number> = {};
  let categoriaMayor: EntradaCategoria | null = null;
  let categoriaMenor: EntradaCategoria | null = null;

  for (const linea of lineas) {
    const cantidadTotal = linea.get("cantidadTotal") as number;
    const valorUnitario = linea.get("valorUnitario") as number;
    const etiqueta = linea.get("etiqueta") as string;
    const porAreaLinea = (linea.get("porArea") as Record<string, number> | undefined) ?? {};

    for (const [areaId, cantidad] of Object.entries(porAreaLinea)) {
      porArea[areaId] = (porArea[areaId] ?? 0) + cantidad;
    }

    porCategoria[linea.id] = {
      cantidad: cantidadTotal,
      subtotal: subtotal({ cantidadTotal, valorUnitario }),
      actualizadaEn: linea.get("actualizadaEn"),
    };

    if (!categoriaMayor || cantidadTotal > categoriaMayor.cantidad) {
      categoriaMayor = { categoriaId: linea.id, etiqueta, cantidad: cantidadTotal };
    }
    if (!categoriaMenor || cantidadTotal < categoriaMenor.cantidad) {
      categoriaMenor = { categoriaId: linea.id, etiqueta, cantidad: cantidadTotal };
    }
  }

  return {
    totalUnidades: totalUnidadesSesion(lineasSumables),
    totalMonetario: totalMonetarioSesion(lineasSumables),
    numCategoriasConConteo: lineas.length,
    categoriaMayor,
    categoriaMenor,
    porCategoria,
    porArea,
  };
}
