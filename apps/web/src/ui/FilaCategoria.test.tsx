// La regla de tinta izquierda es LA FIRMA del sistema y responde la única
// pregunta que angustia al cajero: ¿mi conteo ya está a salvo? Como es
// color, no llega a un lector de pantalla — de ahí el texto sólo-lectores.
//
// Archivo nuevo: los cinco de la primera ola son la red de regresión del
// rediseño y quedan intactos.
import { FakeConteoRepository } from "@conteo/data";
import type { LineaConteo } from "@conteo/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { moneda } from "../lib/formato.js";
import { ConteoRepositoryProvider } from "../state/repositorio-contexto.js";
import { FilaCategoria } from "./FilaCategoria.js";

function renderFila(repo: FakeConteoRepository, versiones: Record<string, number> = {}) {
  const linea: LineaConteo = {
    categoriaId: "cat_5000",
    valorUnitario: 5000,
    etiqueta: "$5.000",
    porArea: {},
    cantidadTotal: 0,
    numAportantes: 0,
    versiones,
    actualizadaEn: new Date(),
    actualizadaPor: "",
  };
  repo.sembrarLinea("ses_1", linea);
  return render(
    <ConteoRepositoryProvider repo={repo}>
      <ul>
        <FilaCategoria sesionId="ses_1" areaId="area_1" linea={linea} />
      </ul>
    </ConteoRepositoryProvider>,
  );
}

describe("FilaCategoria · estado de sincronización (RF-16)", () => {
  it("anuncia 'sin enviar' mientras el servidor no ha agregado el aporte", () => {
    renderFila(new FakeConteoRepository({ uid: "uid_ana", nombre: "Ana Ramírez" }));

    expect(screen.getByText(/sin enviar/i)).toBeInTheDocument();
    expect(screen.queryByText(/guardado/i)).not.toBeInTheDocument();
  });

  it("anuncia 'guardado' cuando la línea alcanza la versión del aporte", async () => {
    const repo = new FakeConteoRepository({ uid: "uid_ana", nombre: "Ana Ramírez" });
    // El aporte se registra ANTES de montar y la línea llega con la versión
    // ya agregada: es el estado que produce el trigger del backend. La línea
    // es un prop que administra el padre (ConteoScreen), así que la fila no
    // la actualiza sola.
    repo.sembrarLinea("ses_1", {
      categoriaId: "cat_5000",
      valorUnitario: 5000,
      etiqueta: "$5.000",
      porArea: {},
      cantidadTotal: 0,
      numAportantes: 0,
      versiones: {},
      actualizadaEn: new Date(),
      actualizadaPor: "",
    });
    await repo.registrarAporte({
      sesionId: "ses_1",
      categoriaId: "cat_5000",
      areaId: "area_1",
      deltaCantidad: 4,
      agregarPartida: { id: "p1", cantidad: 4 },
    });

    renderFila(repo, { uid_ana__area_1: 1 });

    expect(await screen.findByText(/guardado/i)).toBeInTheDocument();
    expect(screen.queryByText(/sin enviar/i)).not.toBeInTheDocument();
  });

  it("al tocar la fila se llama a onSeleccionar con el id de categoría", () => {
    const repo = new FakeConteoRepository({ uid: "uid_ana", nombre: "Ana Ramírez" });
    const onSeleccionar = vi.fn();
    const linea: LineaConteo = {
      categoriaId: "cat_5000",
      valorUnitario: 5000,
      etiqueta: "$5.000",
      porArea: {},
      cantidadTotal: 0,
      numAportantes: 0,
      versiones: {},
      actualizadaEn: new Date(),
      actualizadaPor: "",
    };
    repo.sembrarLinea("ses_1", linea);
    render(
      <ConteoRepositoryProvider repo={repo}>
        <ul>
          <FilaCategoria
            sesionId="ses_1"
            areaId="area_1"
            linea={linea}
            onSeleccionar={onSeleccionar}
          />
        </ul>
      </ConteoRepositoryProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /contar \$5\.000/i }));
    expect(onSeleccionar).toHaveBeenCalledWith("cat_5000");
  });
});

// D-4 (docs/diseno/etapa-3-ui.md): el desglose por área que el ticket #84
// original pedía como fila-por-par se resuelve con una tercera línea de
// texto, sólo en modo "ver todo" y sólo cuando hay unidades fuera del área
// activa — nunca una fila nueva (rompería FilaCategoria.tsx:9-10/RNF-05).
describe("FilaCategoria · desglose de otras áreas (D-4)", () => {
  function renderFilaConDesglose(
    mostrarOtrasAreas: boolean | undefined,
    porArea: Record<string, number>,
  ) {
    const repo = new FakeConteoRepository({ uid: "uid_ana", nombre: "Ana Ramírez" });
    const linea: LineaConteo = {
      categoriaId: "cat_5000",
      valorUnitario: 5000,
      etiqueta: "$5.000",
      porArea,
      cantidadTotal: Object.values(porArea).reduce((a, b) => a + b, 0),
      numAportantes: 0,
      versiones: {},
      actualizadaEn: new Date(),
      actualizadaPor: "",
    };
    repo.sembrarLinea("ses_1", linea);
    return render(
      <ConteoRepositoryProvider repo={repo}>
        <ul>
          <FilaCategoria
            sesionId="ses_1"
            areaId="area_1"
            linea={linea}
            mostrarOtrasAreas={mostrarOtrasAreas}
          />
        </ul>
      </ConteoRepositoryProvider>,
    );
  }

  it("con mostrarOtrasAreas=false (por defecto), NO pinta 'Otras áreas'", () => {
    renderFilaConDesglose(false, { area_1: 5, area_2: 3 });

    expect(screen.queryByText(/otras áreas/i)).not.toBeInTheDocument();
  });

  it("con mostrarOtrasAreas=true pero sin unidades fuera de mi área, NO pinta 'Otras áreas'", () => {
    renderFilaConDesglose(true, { area_1: 5 });

    expect(screen.queryByText(/otras áreas/i)).not.toBeInTheDocument();
  });

  it("con mostrarOtrasAreas=true y unidades en otras áreas, pinta la suma correcta", () => {
    // 3 en area_2 + 2 en area_3 = 5 en otras áreas (area_1 es la mía y se ignora)
    renderFilaConDesglose(true, { area_1: 10, area_2: 3, area_3: 2 });

    expect(screen.getByText(/otras áreas: 5/i)).toBeInTheDocument();
  });
});

// D-6 (docs/diseno/etapa-3-ui.md): dinero de la línea propia (#85, ADR-23).
// Comparación EXACTA contra moneda(), nunca un parseo de la etiqueta.
//
// moneda() usa un espacio irrompible (U+00A0) entre "$" y la cifra; el
// normalizador por defecto de Testing Library lo colapsa a un espacio normal
// al leer el DOM, así que el texto esperado debe pasar por el mismo
// reemplazo o nunca calzará.
const sinEspacioIrrompible = (texto: string) => texto.replace(/\u00a0/g, " ");

describe("FilaCategoria · precio unitario y subtotal propios (D-6)", () => {
  function renderFilaConValor(linea: LineaConteo, miCantidadInicial = 0) {
    const repo = new FakeConteoRepository({ uid: "uid_ana", nombre: "Ana Ramírez" });
    repo.sembrarLinea("ses_1", linea);
    if (miCantidadInicial > 0) {
      void repo.registrarAporte({
        sesionId: "ses_1",
        categoriaId: linea.categoriaId,
        areaId: "area_1",
        deltaCantidad: miCantidadInicial,
        agregarPartida: { id: "p1", cantidad: miCantidadInicial },
      });
    }
    return render(
      <ConteoRepositoryProvider repo={repo}>
        <ul>
          <FilaCategoria sesionId="ses_1" areaId="area_1" linea={linea} />
        </ul>
      </ConteoRepositoryProvider>,
    );
  }

  it("NO pinta el precio unitario cuando la etiqueta ya es el precio formateado", () => {
    const valorUnitario = 5000;
    renderFilaConValor({
      categoriaId: "cat_valor",
      valorUnitario,
      etiqueta: moneda(valorUnitario),
      porArea: {},
      cantidadTotal: 0,
      numAportantes: 0,
      versiones: {},
      actualizadaEn: new Date(),
      actualizadaPor: "",
    });

    expect(screen.queryByText(/c\/u/i)).not.toBeInTheDocument();
  });

  it("fix(RDD R3-001) · NO pinta ni precio unitario ni subtotal cuando valorUnitario es 0 (aún sin precificar), aunque miCantidad > 0", async () => {
    renderFilaConValor(
      {
        categoriaId: "cat_sin_precio",
        valorUnitario: 0,
        etiqueta: "Bolsas de basura",
        porArea: {},
        cantidadTotal: 2,
        numAportantes: 1,
        versiones: {},
        actualizadaEn: new Date(),
        actualizadaPor: "",
      },
      2,
    );

    // await a que useMiAporte refleje el aporte sembrado antes de afirmar la
    // ausencia — si no, el test pasaría igual con la fila aún en cantidad 0.
    await screen.findByText("Tú: 2");
    expect(screen.queryByText(/c\/u/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/subtotal/i)).not.toBeInTheDocument();
  });

  it("SÍ pinta el precio unitario cuando la etiqueta es un nombre de producto (D1)", () => {
    const valorUnitario = 5000;
    renderFilaConValor({
      categoriaId: "cat_nombrado",
      valorUnitario,
      etiqueta: "Bolsas de basura",
      porArea: {},
      cantidadTotal: 0,
      numAportantes: 0,
      versiones: {},
      actualizadaEn: new Date(),
      actualizadaPor: "",
    });

    expect(
      screen.getByText(sinEspacioIrrompible(`${moneda(valorUnitario)} c/u`)),
    ).toBeInTheDocument();
  });

  it("SÍ pinta el subtotal cuando miCantidad > 0, y NO cuando es 0", async () => {
    const valorUnitario = 5000;
    renderFilaConValor(
      {
        categoriaId: "cat_nombrado",
        valorUnitario,
        etiqueta: "Bolsas de basura",
        porArea: {},
        cantidadTotal: 3,
        numAportantes: 1,
        versiones: {},
        actualizadaEn: new Date(),
        actualizadaPor: "",
      },
      3,
    );

    expect(
      await screen.findByText(sinEspacioIrrompible(`Subtotal ${moneda(3 * valorUnitario)}`)),
    ).toBeInTheDocument();
  });

  it("NO pinta el subtotal cuando miCantidad es 0", () => {
    renderFilaConValor({
      categoriaId: "cat_nombrado",
      valorUnitario: 5000,
      etiqueta: "Bolsas de basura",
      porArea: {},
      cantidadTotal: 0,
      numAportantes: 0,
      versiones: {},
      actualizadaEn: new Date(),
      actualizadaPor: "",
    });

    expect(screen.queryByText(/subtotal/i)).not.toBeInTheDocument();
  });

  it("el aria-label de la fila gana ', subtotal …' sólo cuando el subtotal se pinta", async () => {
    const valorUnitario = 5000;
    renderFilaConValor(
      {
        categoriaId: "cat_nombrado",
        valorUnitario,
        etiqueta: "Bolsas de basura",
        porArea: {},
        cantidadTotal: 2,
        numAportantes: 1,
        versiones: {},
        actualizadaEn: new Date(),
        actualizadaPor: "",
      },
      2,
    );

    expect(
      await screen.findByLabelText(
        sinEspacioIrrompible(
          `Valor Bolsas de basura, tu aporte 2, total del equipo 2, subtotal ${moneda(2 * valorUnitario)}`,
        ),
      ),
    ).toBeInTheDocument();
  });

  it("el aria-label NO gana el subtotal cuando miCantidad es 0", () => {
    renderFilaConValor({
      categoriaId: "cat_nombrado",
      valorUnitario: 5000,
      etiqueta: "Bolsas de basura",
      porArea: {},
      cantidadTotal: 0,
      numAportantes: 0,
      versiones: {},
      actualizadaEn: new Date(),
      actualizadaPor: "",
    });

    expect(
      screen.getByLabelText("Valor Bolsas de basura, tu aporte 0, total del equipo 0"),
    ).toBeInTheDocument();
  });
});
