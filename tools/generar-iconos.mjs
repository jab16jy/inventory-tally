// tools/generar-iconos.mjs — genera los tres iconos PWA que el manifest de
// apps/web/vite.config.ts ya referencia.
//
// El mundo visual ("Placa de bodega") define qué son: un numeral ámbar de
// segmentos sobre la placa, con la regla de tinta izquierda sólida — la
// misma firma que usa cada fila de la pantalla de conteo.
//
// ponytail: escribe el PNG a mano sobre zlib (stdlib) en vez de añadir
// sharp/canvas. Son tres rectángulos y un dígito; una dependencia nativa de
// 30 MB para esto no se paga. Si algún día hacen falta iconos con curvas o
// texto real, la ruta de escalamiento es `sharp` + un SVG fuente.
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const DESTINO = join(dirname(fileURLToPath(import.meta.url)), "../apps/web/public/icons");

// Tokens espejados de apps/web/src/estilos/tema.css. El ámbar va en sRGB
// porque un PNG no puede llevar oklch; es el mismo tono convertido.
const FONDO = [0x0f, 0x11, 0x15, 0xff];
const PLACA = [0x16, 0x19, 0x1f, 0xff];
const BORDE = [0x2a, 0x2f, 0x38, 0xff];
const SENAL = [0xff, 0xb4, 0x07, 0xff]; // oklch(0.82 0.17 78) convertido

/** Lienzo RGBA plano con relleno de rectángulos. Sin antialias: el mundo es
 *  de borde duro, así que el pixelado recto es la estética correcta. */
function crearLienzo(lado, fondo) {
  const pixeles = Buffer.alloc(lado * lado * 4);
  for (let i = 0; i < lado * lado; i += 1) pixeles.set(fondo, i * 4);

  return {
    pixeles,
    rect(x, y, ancho, alto, color) {
      const x0 = Math.max(0, Math.round(x));
      const y0 = Math.max(0, Math.round(y));
      const x1 = Math.min(lado, Math.round(x + ancho));
      const y1 = Math.min(lado, Math.round(y + alto));
      for (let fila = y0; fila < y1; fila += 1) {
        for (let col = x0; col < x1; col += 1) {
          this.pixeles.set(color, (fila * lado + col) * 4);
        }
      }
    },
  };
}

/**
 * Dibuja un dígito de siete segmentos. La gramática de segmentos es la del
 * rótulo de estantería industrial del que sale el mundo, y se reduce a
 * rectángulos: nada que rasterizar.
 */
const SEGMENTOS = {
  5: ["arriba", "arribaIzq", "medio", "abajoDer", "abajo"],
};

function dibujarDigito(lienzo, digito, x, y, ancho, alto, grosor, color) {
  const activos = new Set(SEGMENTOS[digito]);
  const medioY = y + alto / 2 - grosor / 2;
  const pintar = (nombre, rect) => {
    if (activos.has(nombre)) lienzo.rect(...rect, color);
  };

  pintar("arriba", [x, y, ancho, grosor]);
  pintar("medio", [x, medioY, ancho, grosor]);
  pintar("abajo", [x, y + alto - grosor, ancho, grosor]);
  // Los verticales llegan justo hasta el borde lejano de la barra del medio
  // (y no más): medio grosor de más y el trazo se sale de la caja del dígito.
  const medioVertical = alto / 2 + grosor / 2;
  pintar("arribaIzq", [x, y, grosor, medioVertical]);
  pintar("arribaDer", [x + ancho - grosor, y, grosor, medioVertical]);
  pintar("abajoIzq", [x, medioY, grosor, medioVertical]);
  pintar("abajoDer", [x + ancho - grosor, medioY, grosor, medioVertical]);
}

/**
 * @param lado  píxeles del icono cuadrado.
 * @param zonaSegura fracción del lado que ocupa el contenido. Los iconos
 *   `maskable` se recortan con formas arbitrarias (círculo en Android), así
 *   que su contenido se encoge al 60 % central; los normales van a sangre.
 */
function componerIcono(lado, zonaSegura) {
  const lienzo = crearLienzo(lado, zonaSegura < 1 ? FONDO : PLACA);

  const margen = (lado * (1 - zonaSegura)) / 2;
  const caja = lado * zonaSegura;

  if (zonaSegura < 1) lienzo.rect(margen, margen, caja, caja, PLACA);

  // Borde duro de la placa (radio 0: el mundo rechaza el redondeo).
  const borde = Math.max(1, Math.round(caja * 0.02));
  lienzo.rect(margen, margen, caja, borde, BORDE);
  lienzo.rect(margen, margen + caja - borde, caja, borde, BORDE);
  lienzo.rect(margen, margen, borde, caja, BORDE);
  lienzo.rect(margen + caja - borde, margen, borde, caja, BORDE);

  // La firma del sistema: la regla de tinta izquierda, sólida = confirmado.
  lienzo.rect(margen, margen, caja * 0.11, caja, SENAL);

  // El numeral: el outlier deliberado de la escala tipográfica.
  const alto = caja * 0.5;
  const ancho = alto * 0.62;
  const grosor = Math.max(2, Math.round(caja * 0.075));
  const x = margen + caja * 0.11 + (caja * 0.89 - ancho) / 2;
  dibujarDigito(lienzo, 5, x, margen + (caja - alto) / 2, ancho, alto, grosor, SENAL);

  return lienzo.pixeles;
}

// --- Codificador PNG mínimo (RGBA de 8 bits, sin filtro) -----------------

const TABLA_CRC = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = TABLA_CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(tipo, datos) {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);
  const cuerpo = Buffer.concat([Buffer.from(tipo, "latin1"), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo));
  return Buffer.concat([largo, cuerpo, crc]);
}

function codificarPng(pixeles, lado) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(lado, 0);
  ihdr.writeUInt32BE(lado, 4);
  ihdr[8] = 8; // profundidad de bits
  ihdr[9] = 6; // color RGBA
  // 10..12 quedan en 0: deflate, filtro adaptativo, sin entrelazado.

  // Cada scanline lleva delante su byte de filtro (0 = ninguno).
  const crudo = Buffer.alloc(lado * (lado * 4 + 1));
  for (let fila = 0; fila < lado; fila += 1) {
    pixeles.copy(crudo, fila * (lado * 4 + 1) + 1, fila * lado * 4, (fila + 1) * lado * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(crudo, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- Salida ---------------------------------------------------------------

const ICONOS = [
  { nombre: "icon-192.png", lado: 192, zonaSegura: 1 },
  { nombre: "icon-512.png", lado: 512, zonaSegura: 1 },
  { nombre: "icon-maskable-512.png", lado: 512, zonaSegura: 0.6 },
];

mkdirSync(DESTINO, { recursive: true });

for (const { nombre, lado, zonaSegura } of ICONOS) {
  const png = codificarPng(componerIcono(lado, zonaSegura), lado);

  // Autocomprobación: firma PNG, ancho/alto declarados y chunk final. Si el
  // codificador se rompe, esto falla aquí y no en el instalador de la PWA.
  assert.equal(png.subarray(1, 4).toString("latin1"), "PNG", `${nombre}: firma inválida`);
  assert.equal(png.readUInt32BE(16), lado, `${nombre}: ancho declarado incorrecto`);
  assert.equal(png.readUInt32BE(20), lado, `${nombre}: alto declarado incorrecto`);
  assert.equal(png.subarray(-8, -4).toString("latin1"), "IEND", `${nombre}: falta IEND`);

  writeFileSync(join(DESTINO, nombre), png);
  console.log(`${nombre}  ${lado}×${lado}  ${(png.length / 1024).toFixed(1)} KB`);
}
