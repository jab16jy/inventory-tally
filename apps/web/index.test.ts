import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const aqui = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(aqui, "index.html"), "utf-8");

describe("index.html (favicon 404)", () => {
  it('declara un <link rel="icon"> para que el navegador no pida /favicon.ico', () => {
    expect(html).toMatch(/<link[^>]+rel="icon"/);
  });
});
