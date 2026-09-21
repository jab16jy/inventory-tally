// apps/web/src/ui/admin/pdf-analisis.ts (odd/tasks/analisis-pdf-orden-precio.md,
// ADR-28) — PDF del análisis de UNA sesión, generado y descargado en el
// navegador: cero backend, cero Storage, cero cuota de Blaze. AnalisisScreen
// lo carga con `import()` dinámico, así que jsPDF queda en su propio chunk y
// no pesa en el bundle inicial.
//
// Recibe datos YA calculados por la pantalla (filas en el orden elegido,
// totales, variación): aquí no se agrega ni se ordena nada, sólo se formatea
// con los mismos formateadores de `lib/formato.ts` y se dibuja.
import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import { fecha, moneda, numero, porcentaje, variacionConSigno } from "../../lib/formato.js";

export interface FilaPdf {
  readonly etiqueta: string;
  readonly unidades: number;
  readonly valor: number;
  /** Escala 0–100, salida de `distribuirRedondeo`. */
  readonly pct: number;
}

export interface DatosPdfAnalisis {
  readonly sucursalNombre: string;
  readonly sesionAbiertaEn: Date;
  readonly generadoEn: Date;
  /** Rótulo de la dimensión ("Categoría", "Cajero", "Área"). */
  readonly dimension: string;
  /** Rótulo del orden aplicado a `filas` ("Mayor valor total", …). */
  readonly orden: string;
  /** Ya ordenadas: se dibujan en este orden exacto. */
  readonly filas: readonly FilaPdf[];
  readonly totalUnidades: number;
  readonly totalMonetario: number;
  /** `null` = sin sesión anterior (o comparación apagada): no se imprime. */
  readonly deltaValor: number | null;
  readonly valorPorUnidad: number;
  readonly contadas: number;
  readonly totalLineas: number;
}

/** Helvetica estándar de jsPDF usa WinAnsi: acentos, ñ, "·" y U+00A0 sí
 *  existen ahí, pero U+202F (espacio fino que `Intl` mete en "a. m."), el
 *  menos U+2212 y la flecha U+2192 no — saldrían como basura. Se traducen
 *  sólo en el PDF; la pantalla conserva la tipografía correcta. U+00A0 se
 *  pasa a espacio normal para que el ancho de columna no dependa del glifo. */
function textoPdf(texto: string): string {
  return texto
    .replace(/[\u00a0\u202f]/g, " ")
    .replace(/\u2212/g, "-")
    .replace(/\u2192/g, "a");
}

export function filasPdfAnalisis(datos: DatosPdfAnalisis): {
  cuerpo: string[][];
  total: string[];
} {
  return {
    cuerpo: datos.filas.map((f) =>
      [f.etiqueta, numero(f.unidades), moneda(f.valor), porcentaje(f.pct)].map(textoPdf),
    ),
    // 100 literal, igual que la fila total de la pantalla: nunca la suma de
    // los floats de `distribuirRedondeo`.
    total: [
      "Total",
      numero(datos.totalUnidades),
      moneda(datos.totalMonetario),
      porcentaje(100),
    ].map(textoPdf),
  };
}

/** Bloque de resumen como pares rótulo/valor — el mismo contenido que las
 *  cards de la pantalla más el desglose y el orden aplicados. */
export function resumenPdf(datos: DatosPdfAnalisis): [string, string][] {
  const variacion =
    datos.deltaValor === null
      ? ""
      : ` (${variacionConSigno(datos.deltaValor)} vs. sesión anterior)`;
  const pares: [string, string][] = [
    ["Valor contado", `${moneda(datos.totalMonetario)}${variacion}`],
    ["Valor por unidad", moneda(datos.valorPorUnidad)],
    [
      "Unidades",
      `${numero(datos.totalUnidades)} · ${datos.contadas} / ${datos.totalLineas} categorías contadas`,
    ],
    ["Desglose por", datos.dimension],
    ["Orden", datos.orden],
  ];
  return pares.map(([rotulo, valor]) => [rotulo, textoPdf(valor)]);
}

const FECHA_ARCHIVO = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "America/Bogota",
});

/** `analisis-<sucursal>-<AAAA-MM-DD>.pdf`: sucursal sin tildes ni símbolos,
 *  fecha de apertura de la sesión en hora de Bogotá (mismo huso que `fecha`). */
export function nombreArchivoPdf(datos: DatosPdfAnalisis): string {
  const slug = datos.sucursalNombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `analisis-${slug}-${FECHA_ARCHIVO.format(datos.sesionAbiertaEn)}.pdf`;
}

// Paleta del tema (apps/web/src/estilos/tema.css) llevada a papel blanco:
// `--color-placa` como tinta/encabezado, `--color-tinta` (crema) como fondo
// de la fila total, `--color-senal` (oklch 0.82 0.17 78 ≈ #FFB407) como
// única marca de acento. El gris es más oscuro que `--color-tenue` porque en
// papel blanco el de pantalla no alcanza contraste AA.
type Rgb = [number, number, number];
const TINTA: Rgb = [22, 25, 31];
const TENUE: Rgb = [96, 102, 112];
const SENAL: Rgb = [255, 180, 7];
const CREMA: Rgb = [242, 239, 233];
const LINEA: Rgb = [218, 214, 206];
const FILA_ALTERNA: Rgb = [250, 249, 246];

const MARGEN = 18;

export function generarPdfAnalisis(datos: DatosPdfAnalisis): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const ancho = doc.internal.pageSize.getWidth();
  const alto = doc.internal.pageSize.getHeight();

  // ── Cabecera ──
  doc.setFillColor(...SENAL);
  doc.rect(MARGEN, MARGEN, 14, 1.2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...TINTA);
  doc.text(textoPdf("Análisis de sesión"), MARGEN, MARGEN + 10);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.text(textoPdf(datos.sucursalNombre), MARGEN, MARGEN + 17);
  doc.setFontSize(9);
  doc.setTextColor(...TENUE);
  doc.text(
    textoPdf(
      `Sesión abierta el ${fecha(datos.sesionAbiertaEn)} · Generado el ${fecha(datos.generadoEn)}`,
    ),
    MARGEN,
    MARGEN + 23,
  );
  doc.setDrawColor(...LINEA);
  doc.setLineWidth(0.3);
  doc.line(MARGEN, MARGEN + 28, ancho - MARGEN, MARGEN + 28);

  // ── Resumen: "Valor contado" solo en su fila (la cifra protagonista, con
  //    su variación); el resto en rejilla de 2 columnas. Rótulo pequeño en
  //    mayúsculas arriba de cada valor. ──
  const resumen = resumenPdf(datos);
  const anchoCelda = (ancho - MARGEN * 2) / 2;
  let y = MARGEN + 36;
  resumen.forEach(([rotulo, valor], i) => {
    const x = MARGEN + (i === 0 ? 0 : ((i - 1) % 2) * anchoCelda);
    if (i % 2 === 1) y += i === 1 ? 14 : 13;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...TENUE);
    doc.text(rotulo.toUpperCase(), x, y, { charSpace: 0.3 });
    doc.setFont("helvetica", i === 0 ? "bold" : "normal");
    doc.setFontSize(i === 0 ? 13 : 11);
    doc.setTextColor(...TINTA);
    doc.text(valor, x, y + 5.5);
  });
  const inicioTabla = y + 14;

  // ── Tabla ──
  const { cuerpo, total } = filasPdfAnalisis(datos);
  autoTable(doc, {
    head: [[datos.dimension, "Unidades", "Valor", "%"].map(textoPdf)],
    body: cuerpo,
    foot: [total],
    startY: inicioTabla,
    margin: { top: MARGEN, right: MARGEN, bottom: 22, left: MARGEN },
    showHead: "everyPage",
    showFoot: "lastPage",
    theme: "plain",
    styles: {
      font: "helvetica",
      fontSize: 9.5,
      textColor: TINTA,
      cellPadding: { top: 2.4, bottom: 2.4, left: 3, right: 3 },
      lineColor: LINEA,
    },
    headStyles: { fillColor: TINTA, textColor: 255, fontStyle: "bold", fontSize: 9 },
    bodyStyles: { lineWidth: { bottom: 0.2 } },
    alternateRowStyles: { fillColor: FILA_ALTERNA },
    footStyles: { fillColor: CREMA, textColor: TINTA, fontStyle: "bold" },
    columnStyles: { 0: { cellWidth: (ancho - MARGEN * 2) * 0.4 } },
    // `columnStyles` sólo aplica al cuerpo: el hook alinea a la derecha las
    // columnas numéricas también en encabezado y pie.
    didParseCell: (celda) => {
      if (celda.column.index > 0) celda.cell.styles.halign = "right";
    },
  });

  // ── Pie en cada página: se escribe al final, cuando ya se sabe el total ──
  const paginas = doc.getNumberOfPages();
  for (let n = 1; n <= paginas; n++) {
    doc.setPage(n);
    doc.setDrawColor(...LINEA);
    doc.line(MARGEN, alto - 14, ancho - MARGEN, alto - 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...TENUE);
    doc.text(textoPdf(`Análisis de sesión · ${datos.sucursalNombre}`), MARGEN, alto - 9);
    doc.text(textoPdf(`Página ${n} de ${paginas}`), ancho - MARGEN, alto - 9, { align: "right" });
  }

  return doc;
}

export function descargarPdfAnalisis(datos: DatosPdfAnalisis): void {
  generarPdfAnalisis(datos).save(nombreArchivoPdf(datos));
}
