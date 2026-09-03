// apps/web/src/ui/admin/AnalisisScreen.test.tsx (docs/plan-panel-administrador.md
// §5, fase F5; rediseño rama rediseno-analisis-sesion,
// docs/diseno/10-analisis-y-dashboards.md §3) — dashboard de análisis de una
// sesión: cabecera, resumen y una tabla con selector de dimensión.
import { FakeAdminRepository } from "@conteo/data";
import type { EstadoSincronizacion } from "@conteo/data";
import type { Historico } from "@conteo/shared/models/historico.js";
import type { LineaConteo } from "@conteo/shared/models/linea-conteo.js";
import type { SesionConteo } from "@conteo/shared/models/sesion-conteo.js";
import type { Usuario } from "@conteo/shared/models/usuario.js";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fecha, moneda, porcentaje } from "../../lib/formato.js";
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
 *  mismo helper que ComparativoScreen.test.tsx y EvolucionMensual.test.tsx). */
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
    porArea: {},
    cantidadTotal,
    numAportantes: 1,
    versiones: {},
    actualizadaEn: new Date("2026-08-01T10:05:00Z"),
    actualizadaPor: "uid_ana",
    ...overrides,
  };
}

function crearHistorico(overrides: Partial<Historico> = {}): Historico {
  return {
    sesionId: "ses_hist",
    cerradaEn: new Date("2026-06-01T00:00:00Z"),
    totalUnidades: 100,
    totalMonetario: 500_000,
    porCategoria: {},
    porArea: {},
    ...overrides,
  };
}

function usuarioBase(overrides: Partial<Usuario> = {}): Usuario {
  return {
    uid: "uid_x",
    nombre: "Usuario X",
    correo: "x@example.com",
    rol: "cajero",
    sucursalesAsignadas: [],
    activo: true,
    creadoEn: new Date("2026-01-01T00:00:00Z"),
    creadoPor: "uid_admin",
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

async function irADimension(valor: "categoria" | "cajero" | "area"): Promise<void> {
  // `getByRole("combobox", ...)`, no `findByLabelText`: el <table> también
  // lleva un `aria-label` que empieza por "Desglose por" (rótulo dinámico
  // según dimensión), y `getByLabelText` matchea `aria-label` en CUALQUIER
  // elemento, no sólo en el <select> — ambigüedad falsa que el rol evita.
  const select = await screen.findByRole("combobox", { name: /desglose por/i });
  fireEvent.change(select, { target: { value: valor } });
}

describe("AnalisisScreen (rediseño)", () => {
  it("presenta las secciones en el orden: cabecera, resumen, tabla", async () => {
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

    expect(secciones).toEqual(["cabecera", "resumen", "tabla"]);
  });

  it('no monta ningún elemento con data-seccion="comparativo" (ADR-20: Comparativo pasó a panel de red, ya no es composición de esta pantalla)', async () => {
    const repo = new FakeAdminRepository();
    sembrarSesionCompleta(repo);

    const { container } = renderPantalla(repo);

    await screen.findByText("Sucursal Norte", { exact: false });

    expect(container.querySelector('[data-seccion="comparativo"]')).not.toBeInTheDocument();
  });

  it("usa el numeral de 32px sólo una vez, en la card Valor contado", async () => {
    const repo = new FakeAdminRepository();
    sembrarSesionCompleta(repo);

    const { container } = renderPantalla(repo);

    await screen.findByText("Sucursal Norte", { exact: false });

    // `Numeral` con `tamano="placa"` (el default) pinta la clase
    // `text-numeral`; Valor por unidad y Unidades usan `tamano="medio"`, así
    // que contar en TODA la pantalla prueba que no se roció el numeral de
    // 32px fuera de la card Valor contado.
    await screen.findByText("Sucursal Norte", { exact: false });
    const numerales32px = container.querySelectorAll(".text-numeral");
    expect(numerales32px).toHaveLength(1);
    expect(numerales32px[0]).toHaveTextContent(textoDom(moneda(920_000)));
  });

  it("calcula el total monetario y de unidades desde las líneas, no desde resumen", async () => {
    const repo = new FakeAdminRepository();
    sembrarSesionCompleta(repo);

    const { container } = renderPantalla(repo);

    await screen.findByText("Sucursal Norte", { exact: false });
    // 310×2.000 + 2×150.000 + 0×5.000 = 620.000 + 300.000 = 920.000.
    // La tabla de detalle también pinta esta cifra (fila cat_a + fila total),
    // así que se acota a "resumen" para no depender de eso.
    const resumen = container.querySelector('[data-seccion="resumen"]')!;
    expect(resumen).toHaveTextContent(textoDom(moneda(920_000)));
    // Unidades: 310 + 2 + 0 = 312.
    expect(resumen).toHaveTextContent("312");
    expect(resumen).toHaveTextContent("2 / 3 categorías contadas");
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

  it("muestra un esqueleto con la forma final mientras carga, nunca un spinner", () => {
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

  it("'Datos inconsistentes': con un evento RECONCILIACION de esta sesión, muestra un aviso discreto con role=status (nunca alert)", async () => {
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
    // Región "polite" propia: llega ASÍNCRONO (useHayReconciliacion resuelve
    // después del primer render), así que necesita anunciarse sola — es
    // hermana del párrafo de estado de la cabecera, no está anidada en él,
    // y por eso no compite con esa región (ver comentario en
    // AnalisisScreen.tsx).
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

  it("dimensión Cajero muestra el nombre de cada participante con sus unidades y su dinero", async () => {
    const repo = new FakeAdminRepository();
    repo.sembrarSesion(sesionBase());
    repo.sembrarUsuario(usuarioBase({ uid: "uid_ana", nombre: "Ana Ramírez" }));
    repo.sembrarLinea("ses_1", lineaBase("cat_a", 2000, 10, { aplicados: { uid_ana: 10 } }));
    repo.sembrarSincronizacion("ses_1", todosSincronizados());

    renderPantalla(repo);
    await irADimension("cajero");

    const fila = (await screen.findByText("Ana Ramírez")).closest("tr")!;
    expect(fila).toHaveTextContent("10");
    expect(fila).toHaveTextContent(textoDom(moneda(20_000)));
  });

  it("un uid en aplicados sin Usuario sembrado cae al propio uid, nunca a cadena vacía", async () => {
    const repo = new FakeAdminRepository();
    repo.sembrarSesion(sesionBase());
    repo.sembrarLinea("ses_1", lineaBase("cat_a", 2000, 5, { aplicados: { uid_fantasma: 5 } }));
    repo.sembrarSincronizacion("ses_1", todosSincronizados());

    renderPantalla(repo);
    await irADimension("cajero");

    expect(await screen.findByText("uid_fantasma")).toBeInTheDocument();
  });

  it("cambiar de dimensión no invoca ningún método del repositorio", async () => {
    const repo = new FakeAdminRepository();
    sembrarSesionCompleta(repo);

    const metodos = [
      "observarSesion",
      "observarSincronizacion",
      "observarLineasSesion",
      "observarUsuarios",
      "historicosRecientesPorSucursal",
      "listarAuditoria",
    ] as const;
    const espias = metodos.map((metodo) => {
      const original = repo[metodo].bind(repo);
      const espia = vi.fn(original as (...args: unknown[]) => unknown);
      // @ts-expect-error — asignación dinámica del mismo método por nombre.
      repo[metodo] = espia;
      return espia;
    });

    renderPantalla(repo);
    await screen.findByText("Sucursal Norte", { exact: false });

    const llamadasAntes = espias.reduce((total, espia) => total + espia.mock.calls.length, 0);

    await irADimension("cajero");
    await irADimension("area");

    const llamadasDespues = espias.reduce((total, espia) => total + espia.mock.calls.length, 0);

    expect(llamadasDespues).toBe(llamadasAntes);
  });

  it("el orden elegido por el usuario sobrevive al cambio de dimensión", async () => {
    const repo = new FakeAdminRepository();
    sembrarSesionCompleta(repo);

    renderPantalla(repo);
    const encabezadoUnidades = await screen.findByRole("columnheader", { name: /unidades/i });
    fireEvent.click(within(encabezadoUnidades).getByRole("button"));
    expect(encabezadoUnidades).toHaveAttribute("aria-sort", "ascending");

    await irADimension("area");

    const encabezadoUnidadesDespues = screen.getByRole("columnheader", { name: /unidades/i });
    expect(encabezadoUnidadesDespues).toHaveAttribute("aria-sort", "ascending");
  });

  it('la tabla arranca por Valor descendente y la columna Valor reporta aria-sort="descending"', async () => {
    const repo = new FakeAdminRepository();
    sembrarSesionCompleta(repo);

    renderPantalla(repo);

    const encabezadoValor = await screen.findByRole("columnheader", { name: /valor/i });
    expect(encabezadoValor).toHaveAttribute("aria-sort", "descending");

    const filas = screen.getAllByRole("row");
    // filas[0] es el encabezado; filas[1] es la primera fila de datos, que
    // con orden Valor desc debe ser cat_a (620.000), no cat_b (300.000).
    expect(filas[1]).toHaveTextContent("$2000");
  });

  it("la fila de total cuadra con la card Valor contado en las tres dimensiones", async () => {
    const repo = new FakeAdminRepository();
    sembrarSesionCompleta(repo);

    renderPantalla(repo);
    await screen.findByText("Sucursal Norte", { exact: false });

    for (const dimension of ["categoria", "cajero", "area"] as const) {
      await irADimension(dimension);
      const filas = screen.getAllByRole("row");
      const filaTotal = filas.at(-1)!;
      expect(filaTotal).toHaveTextContent(textoDom(moneda(920_000)));
      // El invariante que protege el comentario de `filaTotal.pct` en
      // AnalisisScreen.tsx: 100 literal, NUNCA la suma de los floats de
      // `distribuirRedondeo` (que puede dar 99,99999999999999).
      expect(filaTotal).toHaveTextContent(porcentaje(100));
    }
  });

  it("con historicos que incluyen el propio sesionId (sesión cerrada), el delta se calcula contra el segundo", async () => {
    const repo = new FakeAdminRepository();
    repo.sembrarSesion(
      sesionBase({ estado: "cerrada", cerradaEn: new Date("2026-08-01T12:00:00Z") }),
    );
    repo.sembrarLinea("ses_1", lineaBase("cat_a", 2000, 100)); // 200.000
    repo.sembrarSincronizacion("ses_1", todosSincronizados());
    repo.sembrarHistorico(
      "suc_norte",
      crearHistorico({
        sesionId: "ses_1",
        cerradaEn: new Date("2026-08-01T12:00:00Z"),
        totalMonetario: 200_000,
        totalUnidades: 100,
      }),
    );
    repo.sembrarHistorico(
      "suc_norte",
      crearHistorico({
        sesionId: "ses_previa",
        cerradaEn: new Date("2026-07-01T00:00:00Z"),
        totalMonetario: 100_000,
        // Distinto de la variación de dinero (100 %) a propósito: si el
        // delta se calculara contra el propio histórico de "ses_1" (0 % en
        // ambos casos) o si dinero/unidades se confundieran entre sí, este
        // valor lo delataría.
        totalUnidades: 80,
      }),
    );

    renderPantalla(repo);
    await screen.findByText("Sucursal Norte", { exact: false });

    // variacion(200.000, 100.000) = +100,0 %, nunca comparado contra sí misma
    // (que daría 0 %). Se acota a la card "Valor contado": la card
    // "Unidades" también pinta un delta (+25,0 %, variacion(100, 80)).
    const cardValorContado = (await screen.findByText("Valor contado")).closest("div")!;
    expect(cardValorContado).toHaveTextContent(`+${porcentaje(100)}`);
  });

  it("un delta de cero se pinta sin signo: «+0,0 %» se leería como crecimiento", async () => {
    const repo = new FakeAdminRepository();
    repo.sembrarSesion(sesionBase());
    repo.sembrarLinea("ses_1", lineaBase("cat_a", 2000, 100)); // 200.000
    repo.sembrarSincronizacion("ses_1", todosSincronizados());
    repo.sembrarHistorico(
      "suc_norte",
      crearHistorico({ sesionId: "ses_previa", totalMonetario: 200_000, totalUnidades: 100 }),
    );

    renderPantalla(repo);
    await screen.findByText("Sucursal Norte", { exact: false });

    const cardValorContado = (await screen.findByText("Valor contado")).closest("div")!;
    expect(cardValorContado).toHaveTextContent(porcentaje(0));
    expect(cardValorContado).not.toHaveTextContent(`+${porcentaje(0)}`);
  });

  it("sin sesión anterior, el chip está disabled y no aparece ningún delta", async () => {
    const repo = new FakeAdminRepository();
    sembrarSesionCompleta(repo); // sin históricos sembrados

    renderPantalla(repo);

    const chip = await screen.findByRole("button", { name: /sin sesión anterior/i });
    expect(chip).toBeDisabled();
    expect(screen.queryByText(/^[+−]/)).not.toBeInTheDocument();
  });

  it("sesión con una sola categoría y un solo participante se renderiza sin romperse", async () => {
    const repo = new FakeAdminRepository();
    repo.sembrarSesion(sesionBase({ participantes: ["uid_ana"] }));
    repo.sembrarLinea("ses_1", lineaBase("cat_a", 1000, 5));
    repo.sembrarSincronizacion("ses_1", todosSincronizados());

    renderPantalla(repo);

    expect(await screen.findByText("Sucursal Norte", { exact: false })).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it('una línea sin area cae en el grupo "Sin área"', async () => {
    const repo = new FakeAdminRepository();
    repo.sembrarSesion(sesionBase());
    repo.sembrarLinea("ses_1", lineaBase("cat_a", 1000, 5, { porArea: {} }));
    repo.sembrarSincronizacion("ses_1", todosSincronizados());

    renderPantalla(repo);
    await irADimension("area");

    expect(await screen.findByText("Sin área")).toBeInTheDocument();
  });

  it("sesión sin ninguna línea: 'Valor por unidad' no revienta (moneda(0), nunca NaN/Infinity) y la tabla queda vacía", async () => {
    const repo = new FakeAdminRepository();
    repo.sembrarSesion(sesionBase());
    // Ninguna línea sembrada.
    repo.sembrarSincronizacion("ses_1", todosSincronizados());

    renderPantalla(repo);
    await screen.findByText("Sucursal Norte", { exact: false });

    expect(screen.getByText("0 / 0 categorías contadas")).toBeInTheDocument();
    // Guarda de división por cero de `valorPorUnidad`: moneda(0), nunca un
    // NaN o Infinity fabricados por 0/0.
    const cardValorPorUnidad = screen.getByText("Valor por unidad").closest("div")!;
    expect(cardValorPorUnidad).toHaveTextContent(textoDom(moneda(0)));
    expect(screen.queryByText(/NaN|Infinity/i)).not.toBeInTheDocument();
    expect(screen.getByText("Todavía no hay unidades contadas.")).toBeInTheDocument();
  });

  it("dimensión Área suma varias líneas que comparten área en una sola fila", async () => {
    const repo = new FakeAdminRepository();
    repo.sembrarSesion(sesionBase());
    repo.sembrarLinea("ses_1", lineaBase("cat_a", 2000, 100, { porArea: { Bodega: 100 } })); // 200.000
    repo.sembrarLinea("ses_1", lineaBase("cat_b", 3000, 50, { porArea: { Bodega: 50 } })); // 150.000
    repo.sembrarSincronizacion("ses_1", todosSincronizados());

    renderPantalla(repo);
    await irADimension("area");

    const fila = (await screen.findByText("Bodega")).closest("tr")!;
    expect(fila).toHaveTextContent("150"); // unidades: 100 + 50
    expect(fila).toHaveTextContent(textoDom(moneda(350_000))); // 200.000 + 150.000
  });

  it("dimensión Cajero suma varias líneas del mismo uid en una sola fila, nunca un promedio", async () => {
    const repo = new FakeAdminRepository();
    repo.sembrarSesion(sesionBase());
    repo.sembrarUsuario(usuarioBase({ uid: "uid_ana", nombre: "Ana Ramírez" }));
    repo.sembrarLinea("ses_1", lineaBase("cat_a", 2000, 10, { aplicados: { uid_ana: 10 } })); // 20.000
    repo.sembrarLinea("ses_1", lineaBase("cat_b", 3000, 5, { aplicados: { uid_ana: 5 } })); // 15.000
    repo.sembrarSincronizacion("ses_1", todosSincronizados());

    renderPantalla(repo);
    await irADimension("cajero");

    const fila = (await screen.findByText("Ana Ramírez")).closest("tr")!;
    expect(fila).toHaveTextContent("15"); // unidades: 10 + 5
    // Suma de aplicados[uid] × valorUnitario de cada línea (20.000 + 15.000
    // = 35.000), nunca un promedio ni una división entre líneas.
    expect(fila).toHaveTextContent(textoDom(moneda(35_000)));
  });

  it("estadoChip: sin conexión manda sobre sincronización aunque todos los participantes hayan confirmado", async () => {
    fijarEnLinea(false);
    const repo = new FakeAdminRepository();
    sembrarSesionCompleta(repo); // todosSincronizados()

    renderPantalla(repo);

    expect(await screen.findByText("Sin conexión")).toBeInTheDocument();
    expect(screen.queryByText("Sincronizado")).not.toBeInTheDocument();
  });

  it("estadoChip: sincronizado cuando está en línea y todos los participantes confirmaron", async () => {
    const repo = new FakeAdminRepository();
    sembrarSesionCompleta(repo); // todosSincronizados()

    renderPantalla(repo);

    expect(await screen.findByText("Sincronizado")).toBeInTheDocument();
  });

  it("estadoChip: pendiente cuando está en línea y falta al menos un participante por confirmar", async () => {
    const repo = new FakeAdminRepository();
    repo.sembrarSesion(sesionBase());
    repo.sembrarLinea("ses_1", lineaBase("cat_a", 2000, 10));
    repo.sembrarSincronizacion("ses_1", {
      participantes: [
        { uid: "uid_ana", nombre: "Ana Ramírez", sincronizado: true },
        { uid: "uid_luis", nombre: "Luis Pérez", sincronizado: false },
      ],
    });

    renderPantalla(repo);

    expect(await screen.findByText("Sincronizando")).toBeInTheDocument();
  });

  it("el chip «vs. sesión anterior» activa y desactiva los deltas de las tres cards a la vez", async () => {
    const repo = new FakeAdminRepository();
    repo.sembrarSesion(sesionBase());
    repo.sembrarLinea("ses_1", lineaBase("cat_a", 3000, 100)); // 300.000, valor/u 3.000
    repo.sembrarSincronizacion("ses_1", todosSincronizados());
    repo.sembrarHistorico(
      "suc_norte",
      // valor/u anterior = 200.000 / 80 = 2.500. Los tres deltas resultan
      // distintos entre sí (+50 %, +25 %, +20 %) para que cada aserción sólo
      // pueda pasar leyendo la card correcta, no cualquier delta visible.
      crearHistorico({ sesionId: "ses_previa", totalMonetario: 200_000, totalUnidades: 80 }),
    );

    const { container } = renderPantalla(repo);
    await screen.findByText("Sucursal Norte", { exact: false });

    const resumen = within(container.querySelector('[data-seccion="resumen"]')!);
    const chip = resumen.getByRole("button", { name: /vs\. sesión anterior/i });
    const cardValorContado = resumen.getByText("Valor contado").closest("div")!;
    const cardValorPorUnidad = resumen.getByText("Valor por unidad").closest("div")!;
    const cardUnidades = resumen.getByText("Unidades").closest("div")!;

    // Arranca activo (doc: "arranca activo"): los tres deltas visibles.
    expect(chip).toHaveAttribute("aria-pressed", "true");
    expect(cardValorContado).toHaveTextContent(`+${porcentaje(50)}`);
    expect(cardValorPorUnidad).toHaveTextContent(`+${porcentaje(20)}`);
    expect(cardUnidades).toHaveTextContent(`+${porcentaje(25)}`);

    fireEvent.click(chip);

    expect(chip).toHaveAttribute("aria-pressed", "false");
    expect(cardValorContado).not.toHaveTextContent(`+${porcentaje(50)}`);
    expect(cardValorPorUnidad).not.toHaveTextContent(`+${porcentaje(20)}`);
    expect(cardUnidades).not.toHaveTextContent(`+${porcentaje(25)}`);

    fireEvent.click(chip);

    expect(chip).toHaveAttribute("aria-pressed", "true");
    expect(cardValorContado).toHaveTextContent(`+${porcentaje(50)}`);
    expect(cardValorPorUnidad).toHaveTextContent(`+${porcentaje(20)}`);
    expect(cardUnidades).toHaveTextContent(`+${porcentaje(25)}`);
  });

  it('la card "Valor contado" monta la evolución mensual con su SVG y el monto de un cierre histórico', async () => {
    const repo = new FakeAdminRepository();
    sembrarSesionCompleta(repo);
    repo.sembrarHistorico(
      "suc_norte",
      crearHistorico({
        sesionId: "ses_previa",
        cerradaEn: new Date("2026-07-01T00:00:00Z"),
        totalMonetario: 654_321,
      }),
    );

    renderPantalla(repo);
    await screen.findByText("Sucursal Norte", { exact: false });

    const cardValorContado = screen.getByText("Valor contado").closest("div")!;
    expect(cardValorContado.querySelector("svg")).not.toBeNull();
    // La lista de valores arranca `sr-only` pero SIGUE en el DOM (nunca
    // `hidden`), así que el monto del cierre histórico es consultable por
    // texto sin desplegarla.
    expect(cardValorContado).toHaveTextContent(textoDom(moneda(654_321)));
  });
});
