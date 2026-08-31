// apps/web/src/ui/admin/ComparativoScreen.test.tsx
// (docs/diseno/10-analisis-y-dashboards.md §6, ADR-20)
import { FakeAdminRepository } from "@conteo/data";
import type { Historico } from "@conteo/shared/models/historico.js";
import type { SesionConteo } from "@conteo/shared/models/sesion-conteo.js";
import type { Sucursal } from "@conteo/shared/models/sucursal.js";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdminRepositoryProvider } from "../../state/admin-contexto.js";
import { ComparativoScreen } from "./ComparativoScreen.js";

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/** Fecha relativa al momento REAL de ejecución del test, `dias` atrás. Se
 *  usa tiempo real (no `vi.setSystemTime`) porque testing-library's
 *  `findBy*`/`waitFor` dependen de temporizadores reales para hacer polling;
 *  falsear el reloj global los deja colgados. Sólo importan las diferencias
 *  RELATIVAS entre fechas sembradas (orden, umbral atrasada/no-atrasada), así
 *  que unos milisegundos de deriva del reloj real no cambian ningún resultado. */
function hace(dias: number): Date {
  return new Date(Date.now() - dias * MS_POR_DIA);
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

function sesionBase(overrides: Partial<SesionConteo> = {}): SesionConteo {
  return {
    sesionId: "ses_1",
    sucursalId: "suc_norte",
    sucursalNombre: "Sucursal Norte",
    estado: "cerrada",
    abiertaEn: new Date("2026-08-01T14:40:00Z"),
    abiertaPor: "uid_admin",
    cerradaEn: new Date("2026-08-01T18:00:00Z"),
    cerradaPor: "uid_admin",
    participantes: ["uid_admin"],
    totalUnidades: 100,
    sesionCorregidaId: null,
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

/** Celdas de datos de la fila `nombreSucursal`, en el orden de columnas de
 *  escritorio: Sucursal · Días sin contar · Último cierre · Duración ·
 *  Unidades · Tendencia · Total $. */
async function celdasDeFila(nombreSucursal: string): Promise<HTMLElement[]> {
  const celdaNombre = await screen.findByRole("cell", { name: nombreSucursal });
  const fila = celdaNombre.closest("tr")!;
  return within(fila).getAllByRole("cell");
}

describe("ComparativoScreen (ADR-20: mide ejecución, no tamaño)", () => {
  it("ordena por defecto: sucursales sin cierres primero, luego días sin contar descendente", async () => {
    const repo = new FakeAdminRepository();
    repo.sembrarSucursal(sucursalBase({ sucursalId: "suc_a", nombre: "Sucursal A" }));
    repo.sembrarSucursal(sucursalBase({ sucursalId: "suc_b", nombre: "Sucursal B" }));
    repo.sembrarSucursal(sucursalBase({ sucursalId: "suc_c", nombre: "Sucursal C" }));
    // suc_a: cerró hace 10 días.
    repo.sembrarHistorico("suc_a", historicoBase({ sesionId: "ses_a", cerradaEn: hace(10) }));
    // suc_b: cerró hace 3 días.
    repo.sembrarHistorico("suc_b", historicoBase({ sesionId: "ses_b", cerradaEn: hace(3) }));
    // suc_c nunca cerró un conteo.

    renderPantalla(repo);

    const tabla = await screen.findByRole("table", { name: /comparativo de sucursales/i });
    const filas = within(tabla).getAllByRole("row").slice(1); // sin la fila de encabezado
    const nombres = filas.map((fila) => within(fila).getAllByRole("cell")[0]?.textContent);

    expect(nombres).toEqual(["Sucursal C", "Sucursal A", "Sucursal B"]);
  });

  it("una sucursal sin cierres dice 'Sin conteos cerrados' en su celda de días sin contar", async () => {
    const repo = new FakeAdminRepository();
    repo.sembrarSucursal(sucursalBase({ sucursalId: "suc_nueva", nombre: "Sucursal Nueva" }));

    renderPantalla(repo);

    const celdas = await celdasDeFila("Sucursal Nueva");
    expect(celdas[1]).toHaveTextContent("Sin conteos cerrados");
  });

  it("marca la sucursal atrasada con TEXTO además del color — no sólo con la clase de color", async () => {
    const repo = new FakeAdminRepository();
    repo.sembrarSucursal(sucursalBase({ sucursalId: "suc_atrasada", nombre: "Sucursal Atrasada" }));
    // Cadencia mensual (~30 días de intervalo) y último cierre hace 40 días:
    // 40 > 30, así que va atrasada.
    repo.sembrarHistorico(
      "suc_atrasada",
      historicoBase({ sesionId: "ses_1", cerradaEn: hace(40) }),
    );
    repo.sembrarHistorico(
      "suc_atrasada",
      historicoBase({ sesionId: "ses_0", cerradaEn: hace(70) }),
    ); // intervalo 30 días

    renderPantalla(repo);

    const celdas = await celdasDeFila("Sucursal Atrasada");
    // El texto lleva la marca, no sólo `className="text-riesgo"`.
    expect(celdas[1]).toHaveTextContent(/atrasada/i);
  });

  it("mismos días sin contar: sólo la sucursal quincenal sale atrasada, la mensual no (umbral auto-calibrado)", async () => {
    const repo = new FakeAdminRepository();
    repo.sembrarSucursal(
      sucursalBase({ sucursalId: "suc_quincenal", nombre: "Sucursal Quincenal" }),
    );
    repo.sembrarSucursal(sucursalBase({ sucursalId: "suc_mensual", nombre: "Sucursal Mensual" }));

    // Ambas cerraron por última vez hace 20 días (mismos "días sin contar").
    const ultimoCierre = hace(20);

    // Quincenal: intervalo histórico de 15 días → 20 > 15, atrasada.
    repo.sembrarHistorico(
      "suc_quincenal",
      historicoBase({ sesionId: "ses_q1", cerradaEn: ultimoCierre }),
    );
    repo.sembrarHistorico(
      "suc_quincenal",
      historicoBase({ sesionId: "ses_q0", cerradaEn: hace(35) }),
    );

    // Mensual: intervalo histórico de 30 días → 20 <= 30, NO atrasada.
    repo.sembrarHistorico(
      "suc_mensual",
      historicoBase({ sesionId: "ses_m1", cerradaEn: ultimoCierre }),
    );
    repo.sembrarHistorico(
      "suc_mensual",
      historicoBase({ sesionId: "ses_m0", cerradaEn: hace(50) }),
    );

    renderPantalla(repo);

    const celdasQuincenal = await celdasDeFila("Sucursal Quincenal");
    const celdasMensual = await celdasDeFila("Sucursal Mensual");

    expect(celdasQuincenal[1]).toHaveTextContent(/atrasada/i);
    expect(celdasMensual[1]).not.toHaveTextContent(/atrasada/i);
  });

  it("Duración muestra el valor calculado cuando la sesión del último histórico SÍ vino en listarSesiones", async () => {
    const repo = new FakeAdminRepository();
    repo.sembrarSucursal(sucursalBase({ sucursalId: "suc_norte", nombre: "Sucursal Norte" }));
    repo.sembrarHistorico("suc_norte", historicoBase({ sesionId: "ses_1" }));
    // abiertaEn 14:40, cerradaEn 18:00 → 3 h 20 min.
    repo.sembrarSesion(sesionBase({ sesionId: "ses_1", sucursalId: "suc_norte" }));

    renderPantalla(repo);

    const celdas = await celdasDeFila("Sucursal Norte");
    expect(celdas[3]).toHaveTextContent("3 h 20 min");
  });

  it("Duración muestra '—' cuando la sesión del último histórico NO vino en la página de listarSesiones", async () => {
    const repo = new FakeAdminRepository();
    repo.sembrarSucursal(sucursalBase({ sucursalId: "suc_norte", nombre: "Sucursal Norte" }));
    repo.sembrarHistorico("suc_norte", historicoBase({ sesionId: "ses_1" }));
    // Sin sembrarSesion: listarSesiones({estado:"cerrada"}) no trae "ses_1".

    renderPantalla(repo);

    const celdas = await celdasDeFila("Sucursal Norte");
    expect(celdas[3]).toHaveTextContent("—");
  });

  it("Tendencia muestra '—' con un solo cierre", async () => {
    const repo = new FakeAdminRepository();
    repo.sembrarSucursal(sucursalBase({ sucursalId: "suc_norte", nombre: "Sucursal Norte" }));
    repo.sembrarHistorico("suc_norte", historicoBase({ sesionId: "ses_1" }));

    renderPantalla(repo);

    const celdas = await celdasDeFila("Sucursal Norte");
    expect(celdas[5]).toHaveTextContent("—");
  });

  it("muestra un esqueleto con la forma final mientras carga", () => {
    const repo = new FakeAdminRepository();
    repo.sembrarSucursal(sucursalBase());
    repo.sembrarHistorico("suc_norte", historicoBase());

    renderPantalla(repo);

    expect(screen.getAllByTestId("fila-esqueleto").length).toBeGreaterThan(0);
  });

  it("muestra un error y limpia el esqueleto cuando historicosRecientesPorSucursal rechaza", async () => {
    const repo = new FakeAdminRepository();
    repo.sembrarSucursal(sucursalBase());
    repo.historicosRecientesPorSucursal = vi.fn().mockRejectedValue(new Error("network"));

    renderPantalla(repo);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /no se pudo cargar el comparativo\. intenta de nuevo\./i,
    );
    expect(screen.queryByTestId("fila-esqueleto")).not.toBeInTheDocument();
  });

  it("muestra un error y limpia el esqueleto cuando listarSesiones rechaza", async () => {
    const repo = new FakeAdminRepository();
    repo.sembrarSucursal(sucursalBase());
    repo.listarSesiones = vi.fn().mockRejectedValue(new Error("network"));

    renderPantalla(repo);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /no se pudo cargar el comparativo\. intenta de nuevo\./i,
    );
    expect(screen.queryByTestId("fila-esqueleto")).not.toBeInTheDocument();
  });
});
