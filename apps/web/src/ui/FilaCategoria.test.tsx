// La regla de tinta izquierda es LA FIRMA del sistema y responde la única
// pregunta que angustia al cajero: ¿mi conteo ya está a salvo? Como es
// color, no llega a un lector de pantalla — de ahí el texto sólo-lectores.
//
// Archivo nuevo: los cinco de la primera ola son la red de regresión del
// rediseño y quedan intactos.
import { FakeConteoRepository } from "@conteo/data";
import type { LineaConteo } from "@conteo/shared";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
      cantidad: 4,
    });

    renderFila(repo, { uid_ana__area_1: 1 });

    expect(await screen.findByText(/guardado/i)).toBeInTheDocument();
    expect(screen.queryByText(/sin enviar/i)).not.toBeInTheDocument();
  });

  it("no se puede restar por debajo de cero", () => {
    const repo = new FakeConteoRepository({ uid: "uid_ana", nombre: "Ana Ramírez" });
    renderFila(repo);

    expect(screen.getByRole("button", { name: /restar \$5\.000/i })).toBeDisabled();
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
            areaId="area_activa"
            linea={linea}
            mostrarOtrasAreas={mostrarOtrasAreas}
          />
        </ul>
      </ConteoRepositoryProvider>,
    );
  }

  it("en modo 'ver todo', con unidades en otra área, muestra 'Otras áreas: N'", () => {
    renderFilaConDesglose(true, { area_activa: 3, area_bodega: 12 });

    expect(screen.getByText(/otras áreas: 12/i)).toBeInTheDocument();
  });

  it("fuera de modo 'ver todo' NO muestra el desglose, aunque haya unidades en otra área", () => {
    renderFilaConDesglose(false, { area_activa: 3, area_bodega: 12 });

    expect(screen.queryByText(/otras áreas/i)).not.toBeInTheDocument();
  });

  it("en modo 'ver todo' sin unidades fuera del área activa, NO muestra el desglose", () => {
    renderFilaConDesglose(true, { area_activa: 3 });

    expect(screen.queryByText(/otras áreas/i)).not.toBeInTheDocument();
  });
});
