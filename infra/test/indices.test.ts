// Pruebas de infra/firestore.indexes.json.
//
// A diferencia de reglas.test.ts, esto NO se puede probar con
// initializeTestEnvironment: el emulador AUTO-CREA los índices al vuelo, así
// que una consulta sin índice compuesto nunca falla ahí. En producción sí
// falla (Firestore la rechaza), y el `.catch()` de SesionesScreen.tsx la
// convierte en "No se pudieron cargar las sesiones". Por eso el test es del
// ARCHIVO JSON: afirma que el índice que la consulta necesita existe.
import fs from "node:fs";
import { describe, expect, it } from "vitest";

interface CampoIndice {
  readonly fieldPath: string;
  readonly order?: "ASCENDING" | "DESCENDING";
  readonly arrayConfig?: "CONTAINS";
}

interface Indice {
  readonly collectionGroup: string;
  readonly queryScope: string;
  readonly fields: readonly CampoIndice[];
}

function leerIndices(): readonly Indice[] {
  const contenido = fs.readFileSync("infra/firestore.indexes.json", "utf8");
  return (JSON.parse(contenido) as { indexes: readonly Indice[] }).indexes;
}

describe("infra/firestore.indexes.json — colección sesiones", () => {
  it("tiene el índice (sucursalId, abiertaEn) que SesionesScreen necesita con Estado=Todos", () => {
    // Causa raíz: construirFiltro() omite `estado` cuando está vacío, así que
    // la query queda where(sucursalId==X) + orderBy(abiertaEn,desc). Sin este
    // índice compuesto, Firestore la rechaza en producción (el compuesto con
    // `estado` en medio no puede servirla: el campo de igualdad y el de
    // orden no son consecutivos).
    const indices = leerIndices();
    const indice = indices.find(
      (i) =>
        i.collectionGroup === "sesiones" &&
        i.fields.length === 2 &&
        i.fields[0]?.fieldPath === "sucursalId" &&
        i.fields[1]?.fieldPath === "abiertaEn",
    );

    expect(indice).toBeDefined();
    expect(indice?.fields).toEqual([
      { fieldPath: "sucursalId", order: "ASCENDING" },
      { fieldPath: "abiertaEn", order: "DESCENDING" },
    ]);
  });

  it("par afirmativo: el índice (sucursalId, estado, abiertaEn) del filtro combinado sigue existiendo", () => {
    // Si una regresión borrara este índice al agregar el de arriba, el
    // filtro combinado (sucursal + estado) se rompería en producción sin que
    // ningún test lo notara — por eso el caso negativo de arriba no basta.
    const indices = leerIndices();
    const indice = indices.find(
      (i) =>
        i.collectionGroup === "sesiones" &&
        i.fields.length === 3 &&
        i.fields[0]?.fieldPath === "sucursalId" &&
        i.fields[1]?.fieldPath === "estado" &&
        i.fields[2]?.fieldPath === "abiertaEn",
    );

    expect(indice).toBeDefined();
    expect(indice?.fields).toEqual([
      { fieldPath: "sucursalId", order: "ASCENDING" },
      { fieldPath: "estado", order: "ASCENDING" },
      { fieldPath: "abiertaEn", order: "DESCENDING" },
    ]);
  });
});
