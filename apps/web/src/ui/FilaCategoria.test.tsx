// La regla de tinta izquierda es LA FIRMA del sistema y responde la única
// pregunta que angustia al cajero: ¿mi conteo ya está a salvo? Como es
// color, no llega a un lector de pantalla — de ahí el texto sólo-lectores.
//
// Archivo nuevo: los cinco de la primera ola son la red de regresión del
// rediseño y quedan intactos.
import { FakeConteoRepository } from "@conteo/data";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConteoRepositoryProvider } from "../state/repositorio-contexto.js";
import { FilaCategoria } from "./FilaCategoria.js";

function renderFila(repo: FakeConteoRepository, versiones: Record<string, number> = {}) {
  const linea = {
    categoriaId: "cat_5000",
    valorUnitario: 5000,
    etiqueta: "$5.000",
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
        <FilaCategoria sesionId="ses_1" linea={linea} />
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
      cantidadTotal: 0,
      numAportantes: 0,
      versiones: {},
      actualizadaEn: new Date(),
      actualizadaPor: "",
    });
    await repo.registrarAporte({ sesionId: "ses_1", categoriaId: "cat_5000", cantidad: 4 });

    renderFila(repo, { uid_ana: 1 });

    expect(await screen.findByText(/guardado/i)).toBeInTheDocument();
    expect(screen.queryByText(/sin enviar/i)).not.toBeInTheDocument();
  });

  it("no se puede restar por debajo de cero", () => {
    const repo = new FakeConteoRepository({ uid: "uid_ana", nombre: "Ana Ramírez" });
    renderFila(repo);

    expect(screen.getByRole("button", { name: /restar \$5\.000/i })).toBeDisabled();
  });
});
