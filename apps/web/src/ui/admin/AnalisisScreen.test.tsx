// apps/web/src/ui/admin/AnalisisScreen.test.tsx (docs/plan-panel-administrador.md
// §5, fase F5; issue #20 item 3 para los 5 estados degradados de
// docs/diseno/10-analisis-y-dashboards.md:220-228) — dashboard de análisis de
// una sesión.
import { FakeAdminRepository } from "@conteo/data";
import type { EstadoSincronizacion } from "@conteo/data";
import type { LineaConteo } from "@conteo/shared/models/linea-conteo.js";
import type { SesionConteo } from "@conteo/shared/models/sesion-conteo.js";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { fecha, moneda } from "../../lib/formato.js";
import { AdminRepositoryProvider } from "../../state/admin-contexto.js";
import { AnalisisScreen } from "./AnalisisScreen.js";

const ESPACIO_NO_SEPARABLE = String.fromCharCode(0xa0);

function fijarEnLinea(enLinea: boolean): void {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, value: enLinea });
}

afterEach(() => {
  // `onLine` vive en el prototipo de Navigator, no como propiedad propia de
  // la instancia: borrar la propia (la que puso `fijarEnLinea`) basta para
  // que vuelva a resolverse por el getter original de jsdom (`true`).
  delete (window.navigator as { onLine?: boolean }).onLine;
});

/** `moneda()` inserta un espacio de no separación que Testing Library
 *  colapsa a uno normal antes de comparar (verificado en formato.test.ts,
 *  mismo helper que ComparativoScreen.test.tsx y Dona.test.tsx). */
function textoDom(s: string): string {
  return s.split(ESPACIO_NO_SEPARABLE).join(" ");
}

function sesionBase(overrides: Partial<SesionConteo> = {}): SesionConteo {
  return {
    sesionId: "ses_1",
    sucursalId: "suc_norte",
    sucursalNombre: "Sucursal Norte",
    estado: "abierta",
    abiertaEn: new Date("2026-08-01T10:00:00Z"),
    abiertaPor: "uid_admin",
    cerradaEn: null,
    cerradaPor: null,
    participantes: ["uid_ana"],
    totalUnidades: 0,
    sesionCorregidaId: null,
    ...overrides,
  };
}

function lineaBase(
  categoriaId: string,
  valorUnitario: number,
  cantidadTotal: number,
  overrides: Partial<LineaConteo> = {},
): LineaConteo {
  return {
    categoriaId,
    valorUnitario,
    etiqueta: `$${valorUnitario}`,
    cantidadTotal,
    numAportantes: 1,
    versiones: {},
    actualizadaEn: new Date("2026-08-01T10:05:00Z"),
    actualizadaPor: "uid_ana",
    ...overrides,
  };
}

function todosSincronizados(): EstadoSincronizacion {
  return {
    participantes: [{ uid: "uid_ana", nombre: "Ana Ramírez", sincronizado: true }],
  };
}

function renderPantalla(repo: FakeAdminRepository, sesionId = "ses_1") {
  return render(
    <MemoryRouter initialEntries={[`/admin/sesiones/${sesionId}/analisis`]}>
      <AdminRepositoryProvider repo={repo}>
        <Routes>
          <Route path="/admin/sesiones/:sesionId/analisis" element={<AnalisisScreen />} />
        </Routes>
      </AdminRepositoryProvider>
    </MemoryRouter>,
  );
}

/** Siembra una sesión con varias líneas y sincronización completa: la base
 *  compartida por los tests que necesitan la pantalla ya cargada. */
function sembrarSesionCompleta(repo: FakeAdminRepository) {
  repo.sembrarSesion(sesionBase());
  repo.sembrarLinea("ses_1", lineaBase("cat_a", 2000, 310)); // subtotal 620.000
  repo.sembrarLinea("ses_1", lineaBase("cat_b", 150000, 2)); // subtotal 300.000
  repo.sembrarLinea("ses_1", lineaBase("cat_c", 5000, 0)); // no contada
  repo.sembrarSincronizacion("ses_1", todosSincronizados());
}

describe("AnalisisScreen (F5)", () => {
  it("presenta las secciones en el orden: cabecera, KPIs, sincronización, barras, dona, extremos, detalle, comparativo", async () => {
    const repo = new FakeAdminRepository();
    sembrarSesionCompleta(repo);

    const { container } = renderPantalla(repo);

    await screen.findByText("Sucursal Norte", { exact: false });

    // `querySelectorAll` devuelve los nodos en orden de documento sin
    // importar el orden del selector: comparar el arreglo mapeado prueba el
    // orden real del DOM, no sólo que cada sección exista en algún lugar.
    const secciones = Array.from(container.querySelectorAll<HTMLElement>("[data-seccion]")).map(
      (nodo) => nodo.getAttribute("data-seccion"),
    );

    expect(secciones).toEqual([
      "cabecera",
      "kpis",
      "sincronizacion",
      "barras",
      "dona",
      "extremos",
      "detalle",
      "comparativo",
    ]);
  });

  it("usa el numeral de 32px sólo en las tres tarjetas KPI", async () => {
    const repo = new FakeAdminRepository();
    sembrarSesionCompleta(repo);

    const { container } = renderPantalla(repo);

    await screen.findByText("Sucursal Norte", { exact: false });

    // `Numeral` con `tamano="placa"` (el default) pinta la clase
    // `text-numeral`; ni CierreScreen/PanelScreen (tamano="base") ni
    // ComparativoScreen (texto plano) la usan, así que contar en TODA la
    // pantalla —incluido el <ComparativoScreen /> compuesto— prueba que no
    // se roció el numeral de 32px fuera de las 3 tarjetas.
    const numerales32px = container.querySelectorAll(".text-numeral");
    expect(numerales32px).toHaveLength(3);

    const kpis = container.querySelector('[data-seccion="kpis"]')!;
    numerales32px.forEach((nodo) => {
      expect(kpis.contains(nodo)).toBe(true);
    });
  });

  it("tiene un solo h1: el comparativo compuesto baja a h2 en vez de competir con el título", async () => {
    const repo = new FakeAdminRepository();
    sembrarSesionCompleta(repo);

    renderPantalla(repo);

    await screen.findByText("Sucursal Norte", { exact: false });

    // `ComparativoScreen` pinta un <h1> cuando es la pantalla completa de
    // /admin/comparativo. Compuesto aquí sin bajar de nivel, el documento
    // quedaba con DOS <h1> y "Comparativo" —una subsección— se anunciaba como
    // par del título de la página al navegar por encabezados.
    const nivel1 = screen.getAllByRole("heading", { level: 1 });
    expect(nivel1).toHaveLength(1);
    expect(nivel1[0]).toHaveTextContent(/análisis/i);
    expect(screen.getByRole("heading", { level: 2, name: /comparativo/i })).toBeInTheDocument();
  });

  it("el comparativo anidado no repite el relleno p-6 de la pantalla que lo contiene", async () => {
    const repo = new FakeAdminRepository();
    sembrarSesionCompleta(repo);

    const { container } = renderPantalla(repo);

    await screen.findByText("Sucursal Norte", { exact: false });

    // `ComparativoScreen` trae `p-6` cuando ES la pantalla de
    // /admin/comparativo. Anidada sin quitarlo, su sección quedaba con 48 px
    // de relleno contra los 24 px de todas sus secciones hermanas: visiblemente
    // desalineada en una pantalla cuyo trabajo es barrerse de un vistazo.
    const seccionComparativo = container.querySelector('[data-seccion="comparativo"] section')!;
    expect(seccionComparativo).not.toBeNull();
    expect(seccionComparativo).not.toHaveClass("p-6");
  });

  it("la tabla de detalle usa text-base", async () => {
    const repo = new FakeAdminRepository();
    sembrarSesionCompleta(repo);

    renderPantalla(repo);

    const tabla = await screen.findByRole("table", { name: /detalle por categoría/i });
    expect(tabla).toHaveClass("text-base");
  });

  it("calcula el total monetario de las 3 tarjetas KPI desde las líneas, no desde resumen", async () => {
    const repo = new FakeAdminRepository();
    sembrarSesionCompleta(repo);

    renderPantalla(repo);

    // 310×2.000 + 2×150.000 + 0×5.000 = 620.000 + 300.000 = 920.000.
    expect(await screen.findByText(textoDom(moneda(920_000)))).toBeInTheDocument();
    // Unidades: 310 + 2 + 0 = 312.
    expect(screen.getByText("312")).toBeInTheDocument();
  });

  it("muestra 'categorías contadas' como líneas con cantidadTotal > 0 sobre el total de líneas de la sesión", async () => {
    const repo = new FakeAdminRepository();
    sembrarSesionCompleta(repo);

    renderPantalla(repo);

    // 2 líneas contadas (cat_a, cat_b) de 3 líneas totales (incluye cat_c en 0).
    expect(await screen.findByText("2 / 3")).toBeInTheDocument();
  });

  it("muestra los extremos con su subtotal y su cantidad", async () => {
    const repo = new FakeAdminRepository();
    sembrarSesionCompleta(repo);

    renderPantalla(repo);

    // Mayor subtotal: cat_a (620.000, 310 u). Menor de las CONTADAS: cat_b
    // (300.000, 2 u) — cat_c queda fuera por cantidadTotal 0.
    const mayor = await screen.findByText(/mayor: \$2000/i);
    expect(mayor).toHaveTextContent("310");
    const menor = screen.getByText(/menor: \$150000/i);
    expect(menor).toHaveTextContent(/\(2 u\.\)/);
  });

  it("sin ninguna categoría contada, los extremos muestran una línea vacía honesta, nunca un cero fabricado", async () => {
    const repo = new FakeAdminRepository();
    repo.sembrarSesion(sesionBase());
    repo.sembrarLinea("ses_1", lineaBase("cat_a", 2000, 0));
    repo.sembrarSincronizacion("ses_1", todosSincronizados());

    renderPantalla(repo);

    await screen.findByText("Sucursal Norte", { exact: false });

    expect(screen.getByText(/todavía no hay categorías contadas/i)).toBeInTheDocument();
    expect(screen.queryByText(/mayor:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/menor:/i)).not.toBeInTheDocument();
  });

  it("muestra la alerta de sincronización degradada con role=alert", async () => {
    const repo = new FakeAdminRepository();
    repo.sembrarSesion(sesionBase());
    repo.sembrarLinea("ses_1", lineaBase("cat_a", 2000, 10));
    repo.sembrarSincronizacion("ses_1", {
      participantes: [{ uid: "uid_ana", nombre: "uid_ana", sincronizado: false }],
      degradado: true,
    });

    renderPantalla(repo);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /no se pudo leer el estado de sincronización/i,
    );
  });

  it("muestra un esqueleto con la forma final mientras carga, nunca un spinner (estado 'Cargando', doc 10 §220-228)", () => {
    const repo = new FakeAdminRepository();
    // Sin sembrar nada: el fake entrega su primer valor sincrónicamente en
    // `observarSesion`/`observarSincronizacion`, así que para capturar el
    // instante de carga hay que mirar el primer render — igual que
    // ComparativoScreen.test.tsx captura la promesa de historicos sin resolver.
    repo.sembrarSesion(sesionBase());
    repo.sembrarLinea("ses_1", lineaBase("cat_a", 2000, 10));
    // No se siembra sincronización: el fake responde con su valor por
    // defecto de todos modos (no queda pendiente), así que en su lugar se
    // verifica el esqueleto reemplazando `observarSincronizacion` por una
    // implementación que nunca llama a `onChange`, dejando `cargando` en
    // `true` indefinidamente — el mismo truco que usan los tests de carga
    // existentes en este repo con promesas nunca resueltas.
    repo.observarSincronizacion = () => () => {};

    const { container } = renderPantalla(repo);

    expect(container.querySelector('[data-seccion="cabecera"] .animate-pulse')).not.toBeNull();
    expect(screen.queryByRole("heading", { name: /análisis/i })).not.toBeInTheDocument();
    expect(screen.getAllByTestId("fila-esqueleto").length).toBeGreaterThan(0);
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("si la sesión no existe, lo dice honestamente en vez de quedarse en el esqueleto", async () => {
    const repo = new FakeAdminRepository();
    // Nunca se siembra "ses_fantasma": observarSesion entrega `null`.

    renderPantalla(repo, "ses_fantasma");

    expect(await screen.findByText(/no se encontró la sesión/i)).toBeInTheDocument();
    expect(screen.queryByTestId("fila-esqueleto")).not.toBeInTheDocument();
  });
});

describe("AnalisisScreen · estados degradados (issue #20 item 3, doc 10 §220-228)", () => {
  it("'Sesión sin aportes': sin líneas todavía, cada sección lo dice honesto en vez de un cero fabricado", async () => {
    const repo = new FakeAdminRepository();
    repo.sembrarSesion(sesionBase());
    // Ninguna línea sembrada: sesión abierta pero sin ningún aporte todavía.
    repo.sembrarSincronizacion("ses_1", todosSincronizados());

    renderPantalla(repo);

    await screen.findByText("Sucursal Norte", { exact: false });

    expect(screen.getByText("0 / 0")).toBeInTheDocument();
    expect(screen.getByText(/todavía no hay unidades contadas/i)).toBeInTheDocument();
    expect(screen.getByText(/todavía no hay categorías contadas/i)).toBeInTheDocument();
    // La tabla de detalle usa un texto ligeramente distinto ("No hay..." sin
    // "Todavía"): coincide como subcadena con la línea de arriba, de ahí el
    // ancla `^`.
    expect(screen.getByText(/^No hay categorías contadas\.$/)).toBeInTheDocument();
  });

  it("'Sin conexión': con el navegador offline, muestra que los datos son de caché junto a su fecha", async () => {
    fijarEnLinea(false);
    const repo = new FakeAdminRepository();
    sembrarSesionCompleta(repo);

    renderPantalla(repo);

    const aviso = await screen.findByRole("status");
    expect(aviso).toHaveTextContent(/mostrando datos guardados/i);
    // Reusa el mismo timestamp que ya calcula la cabecera (actualizadaEn más
    // reciente de las líneas sembradas) — sin inventar un segundo reloj.
    expect(aviso).toHaveTextContent(fecha(new Date("2026-08-01T10:05:00Z")));
  });

  it("'Sin conexión': en línea, el aviso de datos guardados no aparece", async () => {
    fijarEnLinea(true);
    const repo = new FakeAdminRepository();
    sembrarSesionCompleta(repo);

    renderPantalla(repo);

    await screen.findByText("Sucursal Norte", { exact: false });
    expect(screen.queryByText(/mostrando datos guardados/i)).not.toBeInTheDocument();
  });

  it("'Datos inconsistentes': con un evento RECONCILIACION de esta sesión, muestra un aviso discreto (no role=alert)", async () => {
    const repo = new FakeAdminRepository();
    sembrarSesionCompleta(repo);
    repo.sembrarAuditoria({
      eventoId: "ev_1",
      tipo: "RECONCILIACION",
      ocurridoEn: new Date("2026-08-01T09:00:00Z"),
      sesionId: "ses_1",
      categoriaId: "cat_a",
      cantidadAnterior: 5,
      cantidadNueva: 310,
    });

    renderPantalla(repo);

    const aviso = await screen.findByText(/se corrigieron automáticamente/i);
    expect(aviso).toHaveAttribute("role", "status");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("'Datos inconsistentes': sin ningún evento RECONCILIACION de esta sesión, no aparece el aviso", async () => {
    const repo = new FakeAdminRepository();
    sembrarSesionCompleta(repo);
    // Un evento de OTRA sesión no debe activar el aviso de ésta.
    repo.sembrarAuditoria({
      eventoId: "ev_otra",
      tipo: "RECONCILIACION",
      ocurridoEn: new Date("2026-08-01T09:00:00Z"),
      sesionId: "ses_2",
      categoriaId: "cat_a",
      cantidadAnterior: 5,
      cantidadNueva: 310,
    });

    renderPantalla(repo);

    await screen.findByText("Sucursal Norte", { exact: false });
    expect(screen.queryByText(/se corrigieron automáticamente/i)).not.toBeInTheDocument();
  });
});
