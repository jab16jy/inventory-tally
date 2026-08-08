// apps/web/src/ui/admin/ComparativoScreen.test.tsx
// (docs/plan-panel-administrador.md §5, fase F4, R8)
import { FakeAdminRepository } from "@conteo/data";
import type { Historico } from "@conteo/shared/models/historico.js";
import type { Sucursal } from "@conteo/shared/models/sucursal.js";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { moneda, porcentaje } from "../../lib/formato.js";
import { AdminRepositoryProvider } from "../../state/admin-contexto.js";
import { ComparativoScreen } from "./ComparativoScreen.js";

/** El invariante real de `distribuirRedondeo` vive en las décimas enteras,
 *  NO en la suma en coma flotante de los porcentajes mostrados: `33.4 +
 *  33.3 + 33.3` puede dar `99.99999999999999` en JS por representación
 *  binaria, aunque las décimas (334 + 333 + 333) sumen 1000 exacto — mismo
 *  motivo documentado en calculadora-analisis.ts. Se lee el texto renderizado
 *  y se compara en décimas, nunca sumando los floats directamente. */
function sumaEnDecimas(textos: readonly string[]): number {
  return textos.reduce((total, t) => total + Math.round(parseFloat(t.replace(",", ".")) * 10), 0);
}

const ESPACIO_NO_SEPARABLE = String.fromCharCode(0xa0);

/** `moneda()` inserta un espacio de no separación entre "$" y la cifra
 *  (verificado en formato.test.ts); el normalizador por defecto de Testing
 *  Library colapsa ESE espacio a uno normal antes de comparar, así que el
 *  texto esperado necesita el mismo colapso o nunca hace match. */
function textoDom(s: string): string {
  return s.split(ESPACIO_NO_SEPARABLE).join(" ");
}

function sucursalBase(overrides: Partial<Sucursal> = {}): Sucursal {
  return {
    sucursalId: "suc_norte",
    nombre: "Sucursal Norte",
    direccion: "Calle 10 # 5-20",
    conectividad: "wifi",
    activa: true,
    sesionAbiertaId: null,
    creadaEn: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function historicoBase(overrides: Partial<Historico> = {}): Historico {
  return {
    sesionId: "ses_1",
    cerradaEn: new Date("2026-08-01T18:00:00Z"),
    totalUnidades: 100,
    totalMonetario: 100_000,
    porCategoria: {},
    ...overrides,
  };
}

function renderPantalla(repo: FakeAdminRepository) {
  return render(
    <AdminRepositoryProvider repo={repo}>
      <ComparativoScreen />
    </AdminRepositoryProvider>,
  );
}

describe("ComparativoScreen (F4, R8)", () => {
  it("muestra la participación y el total de cada sucursal desde los históricos sembrados", async () => {
    const repo = new FakeAdminRepository();
    repo.sembrarSucursal(sucursalBase({ sucursalId: "suc_norte", nombre: "Sucursal Norte" }));
    repo.sembrarSucursal(sucursalBase({ sucursalId: "suc_sur", nombre: "Sucursal Sur" }));
    repo.sembrarHistorico("suc_norte", historicoBase({ totalMonetario: 300_000 }));
    repo.sembrarHistorico("suc_sur", historicoBase({ totalMonetario: 100_000 }));

    renderPantalla(repo);

    expect(await screen.findByText("Sucursal Norte")).toBeInTheDocument();
    expect(screen.getByText("Sucursal Sur")).toBeInTheDocument();
    // 300.000 / 400.000 = 75 %, 100.000 / 400.000 = 25 %.
    expect(screen.getByText(porcentaje(75))).toBeInTheDocument();
    expect(screen.getByText(porcentaje(25))).toBeInTheDocument();
    // Absolutos como texto secundario.
    expect(screen.getByText(textoDom(moneda(300_000)))).toBeInTheDocument();
    expect(screen.getByText(textoDom(moneda(100_000)))).toBeInTheDocument();
  });

  it("una sucursal sin histórico se muestra como 'sin conteos cerrados', nunca como 0", async () => {
    const repo = new FakeAdminRepository();
    repo.sembrarSucursal(sucursalBase({ sucursalId: "suc_norte", nombre: "Sucursal Norte" }));
    repo.sembrarSucursal(sucursalBase({ sucursalId: "suc_nueva", nombre: "Sucursal Nueva" }));
    repo.sembrarHistorico("suc_norte", historicoBase({ totalMonetario: 100_000 }));
    // suc_nueva nunca cerró un conteo: el Map de sembrarHistorico no la toca,
    // así que ultimoHistoricoPorSucursal la deja en null, con su clave
    // presente (contrato de AdminRepository.ultimoHistoricoPorSucursal).

    renderPantalla(repo);

    expect(await screen.findByText("Sucursal Nueva")).toBeInTheDocument();
    expect(screen.getByText("Sin conteos cerrados")).toBeInTheDocument();
    // Nunca "0,0%": la ausencia de histórico no es un cero de participación
    // (suc_norte, la única con histórico, sí llega a 100,0% — sólo se
    // descarta el cero literal de la sucursal sin cerrar).
    expect(screen.queryByText(porcentaje(0))).not.toBeInTheDocument();
  });

  it("los porcentajes mostrados suman 100.0 en décimas enteras, no en floats", async () => {
    const repo = new FakeAdminRepository();
    // Tres sucursales con el mismo monto: 1/3 exacto reparte 33.4/33.3/33.3
    // (mayor resto), el caso exacto que el doc-comment de distribuirRedondeo
    // usa para advertir sobre la suma en coma flotante.
    repo.sembrarSucursal(sucursalBase({ sucursalId: "suc_1", nombre: "Sucursal Uno" }));
    repo.sembrarSucursal(sucursalBase({ sucursalId: "suc_2", nombre: "Sucursal Dos" }));
    repo.sembrarSucursal(sucursalBase({ sucursalId: "suc_3", nombre: "Sucursal Tres" }));
    repo.sembrarHistorico("suc_1", historicoBase({ totalMonetario: 1_000 }));
    repo.sembrarHistorico("suc_2", historicoBase({ totalMonetario: 1_000 }));
    repo.sembrarHistorico("suc_3", historicoBase({ totalMonetario: 1_000 }));

    renderPantalla(repo);

    await screen.findByText("Sucursal Uno");

    const textosPorcentaje = screen
      .getAllByTestId("valor-participacion")
      .map((nodo) => nodo.textContent ?? "");

    expect(textosPorcentaje).toHaveLength(3);
    expect(sumaEnDecimas(textosPorcentaje)).toBe(1000);
  });

  it("muestra un esqueleto con la forma final mientras carga", () => {
    const repo = new FakeAdminRepository();
    repo.sembrarSucursal(sucursalBase());
    repo.sembrarHistorico("suc_norte", historicoBase());

    renderPantalla(repo);

    // `ultimoHistoricoPorSucursal` es una promesa: justo después de montar
    // todavía no se resolvió el primer `.then()`, así que la pantalla sigue
    // en su estado de carga real.
    expect(screen.getAllByTestId("fila-esqueleto").length).toBeGreaterThan(0);
  });

  it("expone un equivalente textual accesible de la barra, no sólo el ancho en CSS", async () => {
    const repo = new FakeAdminRepository();
    repo.sembrarSucursal(sucursalBase());
    repo.sembrarHistorico("suc_norte", historicoBase({ totalMonetario: 100_000 }));

    renderPantalla(repo);

    const tabla = await screen.findByRole("table", { name: /comparativo de sucursales/i });
    // Con una sola sucursal en el reparto, `distribuirRedondeo` da 100 %: el
    // valor está en el DOM como texto, no sólo como `width` de un div.
    expect(within(tabla).getByText(porcentaje(100))).toBeInTheDocument();
  });

  it("muestra un error y limpia el esqueleto cuando el repositorio rechaza", async () => {
    const repo = new FakeAdminRepository();
    repo.ultimoHistoricoPorSucursal = vi.fn().mockRejectedValue(new Error("network"));

    renderPantalla(repo);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /no se pudo cargar el comparativo\. intenta de nuevo\./i,
    );
    expect(screen.queryByTestId("fila-esqueleto")).not.toBeInTheDocument();
  });
});
