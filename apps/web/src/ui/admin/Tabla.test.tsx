// apps/web/src/ui/admin/Tabla.test.tsx (docs/plan-panel-administrador.md §5,
// fase F2). El shell es presentacional; lo único con lógica propia — y por
// tanto lo único que este archivo cubre a fondo — es el ciclo de orden.
//
// issue #20 item 1 (doc 11 §298-304) añade el bloque de breakpoints al final:
// < 600px pinta tarjetas en vez de `<table>`.
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Tabla, type ColumnaTabla } from "./Tabla.js";

const ANCHO_ORIGINAL = window.innerWidth;

function fijarAncho(ancho: number): void {
  Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: ancho });
}

afterEach(() => {
  fijarAncho(ANCHO_ORIGINAL);
});

interface Fila {
  readonly id: string;
  readonly nombre: string;
  readonly edad: number;
}

const FILAS: Fila[] = [
  { id: "b", nombre: "Beatriz", edad: 40 },
  { id: "a", nombre: "Ana", edad: 25 },
  { id: "c", nombre: "Carlos", edad: 30 },
];

function columnas(): ColumnaTabla<Fila>[] {
  return [
    { clave: "nombre", etiqueta: "Nombre", render: (f) => f.nombre, valorOrden: (f) => f.nombre },
    { clave: "edad", etiqueta: "Edad", render: (f) => String(f.edad), valorOrden: (f) => f.edad },
    { clave: "id", etiqueta: "ID", render: (f) => f.id }, // no ordenable
  ];
}

function nombresEnOrden(): string[] {
  return within(screen.getByRole("table"))
    .getAllByRole("row")
    .slice(1) // salta la fila de encabezado
    .map((fila) => within(fila).getAllByRole("cell")[0]!.textContent);
}

describe("Tabla (F2)", () => {
  it("usa semántica real de tabla con th scope=col", () => {
    render(<Tabla columnas={columnas()} filas={FILAS} claveFila={(f) => f.id} etiqueta="Prueba" />);

    const tabla = screen.getByRole("table", { name: "Prueba" });
    const encabezados = within(tabla).getAllByRole("columnheader");
    expect(encabezados).toHaveLength(3);
    expect(encabezados[0]).toHaveAttribute("scope", "col");
  });

  it("una columna no ordenable no expone aria-sort", () => {
    render(<Tabla columnas={columnas()} filas={FILAS} claveFila={(f) => f.id} etiqueta="Prueba" />);

    expect(screen.getByRole("columnheader", { name: "ID" })).not.toHaveAttribute("aria-sort");
  });

  it("ordena ascendente, luego descendente, luego vuelve a sin ordenar al clicar la misma columna", () => {
    render(<Tabla columnas={columnas()} filas={FILAS} claveFila={(f) => f.id} etiqueta="Prueba" />);

    const encabezadoNombre = screen.getByRole("columnheader", { name: /nombre/i });
    expect(encabezadoNombre).toHaveAttribute("aria-sort", "none");
    expect(nombresEnOrden()).toEqual(["Beatriz", "Ana", "Carlos"]); // orden original

    fireEvent.click(within(encabezadoNombre).getByRole("button"));
    expect(encabezadoNombre).toHaveAttribute("aria-sort", "ascending");
    expect(nombresEnOrden()).toEqual(["Ana", "Beatriz", "Carlos"]);

    fireEvent.click(within(encabezadoNombre).getByRole("button"));
    expect(encabezadoNombre).toHaveAttribute("aria-sort", "descending");
    expect(nombresEnOrden()).toEqual(["Carlos", "Beatriz", "Ana"]);

    fireEvent.click(within(encabezadoNombre).getByRole("button"));
    expect(encabezadoNombre).toHaveAttribute("aria-sort", "none");
    expect(nombresEnOrden()).toEqual(["Beatriz", "Ana", "Carlos"]);
  });

  it("ordenar una columna nueva resetea la anterior a sin ordenar", () => {
    render(<Tabla columnas={columnas()} filas={FILAS} claveFila={(f) => f.id} etiqueta="Prueba" />);

    fireEvent.click(
      within(screen.getByRole("columnheader", { name: /nombre/i })).getByRole("button"),
    );
    fireEvent.click(
      within(screen.getByRole("columnheader", { name: /edad/i })).getByRole("button"),
    );

    expect(screen.getByRole("columnheader", { name: /nombre/i })).toHaveAttribute(
      "aria-sort",
      "none",
    );
    expect(screen.getByRole("columnheader", { name: /edad/i })).toHaveAttribute(
      "aria-sort",
      "ascending",
    );
    expect(nombresEnOrden()).toEqual(["Ana", "Carlos", "Beatriz"]); // 25, 30, 40
  });

  it("muestra el estado vacío cuando no hay filas", () => {
    render(
      <Tabla
        columnas={columnas()}
        filas={[]}
        claveFila={(f) => f.id}
        etiqueta="Prueba"
        vacio="Nada por aquí"
      />,
    );

    expect(screen.getByText("Nada por aquí")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});

describe("Tabla · breakpoints (issue #20 item 1, doc 11 §298-304)", () => {
  it("< 600px: pinta tarjetas etiqueta/valor en vez de <table>", () => {
    fijarAncho(375);
    render(<Tabla columnas={columnas()} filas={FILAS} claveFila={(f) => f.id} etiqueta="Prueba" />);

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    const lista = screen.getByRole("list", { name: "Prueba" });
    expect(within(lista).getAllByRole("listitem")).toHaveLength(3);
    // La tarjeta lleva la etiqueta de columna Y el valor de la fila, no sólo
    // el valor — perdería la columna al no haber `<th>`. "Nombre" se repite
    // una vez por tarjeta (sin encabezado compartido), de ahí `getAllByText`.
    expect(within(lista).getAllByText("Nombre")).toHaveLength(FILAS.length);
    expect(within(lista).getByText("Beatriz")).toBeInTheDocument();
  });

  it("< 600px con `cargando`: pinta tarjetas de esqueleto, no filas de tabla", () => {
    fijarAncho(375);
    render(
      <Tabla columnas={columnas()} filas={[]} claveFila={(f) => f.id} etiqueta="Prueba" cargando />,
    );

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("fila-esqueleto").length).toBeGreaterThan(0);
  });

  it("600–1024px: sigue usando <table>, envuelta para poder desplazarse en horizontal", () => {
    fijarAncho(800);
    const { container } = render(
      <Tabla columnas={columnas()} filas={FILAS} claveFila={(f) => f.id} etiqueta="Prueba" />,
    );

    const tabla = screen.getByRole("table", { name: "Prueba" });
    expect(tabla.parentElement).toHaveClass("overflow-x-auto");
    expect(container.querySelector("ul")).not.toBeInTheDocument();
  });
});
