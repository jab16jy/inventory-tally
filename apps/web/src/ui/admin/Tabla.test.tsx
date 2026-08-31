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

const TOTAL: Fila = { id: "total", nombre: "Total", edad: 95 };

describe("Tabla · filaTotal", () => {
  it("escritorio: pinta un tfoot con los valores del total y el orden no lo mueve del final", () => {
    render(
      <Tabla
        columnas={columnas()}
        filas={FILAS}
        claveFila={(f) => f.id}
        etiqueta="Prueba"
        filaTotal={TOTAL}
      />,
    );

    const tabla = screen.getByRole("table", { name: "Prueba" });
    const pie = tabla.querySelector("tfoot");
    expect(pie).not.toBeNull();
    expect(within(pie as HTMLElement).getByText("Total")).toBeInTheDocument();
    expect(within(pie as HTMLElement).getByText("95")).toBeInTheDocument();

    // Ordenar por Nombre no debe mover el total: sigue sin aparecer dentro
    // del tbody (que es lo que lee nombresEnOrden) y sigue en el tfoot.
    fireEvent.click(
      within(screen.getByRole("columnheader", { name: /nombre/i })).getByRole("button"),
    );
    expect(within(tabla.querySelector("tbody") as HTMLElement).queryByText("Total")).toBeNull();
    expect(within(pie as HTMLElement).getByText("Total")).toBeInTheDocument();
  });

  it("móvil: el total aparece como última tarjeta y se distingue de las demás", () => {
    fijarAncho(375);
    render(
      <Tabla
        columnas={columnas()}
        filas={FILAS}
        claveFila={(f) => f.id}
        etiqueta="Prueba"
        filaTotal={TOTAL}
      />,
    );

    const lista = screen.getByRole("list", { name: "Prueba" });
    const tarjetas = within(lista).getAllByRole("listitem");
    expect(tarjetas).toHaveLength(FILAS.length + 1);
    const tarjetaTotal = tarjetas.at(-1)!;
    expect(within(tarjetaTotal).getByText("Total")).toBeInTheDocument();
    expect(tarjetaTotal).toHaveClass("bg-placa-alta");
  });

  it("con cargando, el total no se pinta", () => {
    render(
      <Tabla
        columnas={columnas()}
        filas={FILAS}
        claveFila={(f) => f.id}
        etiqueta="Prueba"
        filaTotal={TOTAL}
        cargando
      />,
    );

    expect(screen.queryByText("Total")).not.toBeInTheDocument();
    expect(screen.getByRole("table").querySelector("tfoot")).toBeNull();
  });

  it("con filas vacío, el total no se pinta — sale el mensaje de vacío", () => {
    render(
      <Tabla
        columnas={columnas()}
        filas={[]}
        claveFila={(f) => f.id}
        etiqueta="Prueba"
        vacio="Nada por aquí"
        filaTotal={TOTAL}
      />,
    );

    expect(screen.getByText("Nada por aquí")).toBeInTheDocument();
    expect(screen.queryByText("Total")).not.toBeInTheDocument();
  });

  it("sin filaTotal, no hay tfoot — el markup es el de hoy", () => {
    render(<Tabla columnas={columnas()} filas={FILAS} claveFila={(f) => f.id} etiqueta="Prueba" />);

    expect(screen.getByRole("table").querySelector("tfoot")).toBeNull();
  });
});

describe("Tabla · ordenInicial", () => {
  it("arranca ordenada por la columna sembrada y su th reporta el aria-sort correcto en el primer render", () => {
    render(
      <Tabla
        columnas={columnas()}
        filas={FILAS}
        claveFila={(f) => f.id}
        etiqueta="Prueba"
        ordenInicial={{ clave: "nombre", direccion: "asc" }}
      />,
    );

    expect(screen.getByRole("columnheader", { name: /nombre/i })).toHaveAttribute(
      "aria-sort",
      "ascending",
    );
    expect(nombresEnOrden()).toEqual(["Ana", "Beatriz", "Carlos"]);
  });

  it("el ciclo de clics vuelve al orden inicial en el tercer clic, no a orden de inserción", () => {
    render(
      <Tabla
        columnas={columnas()}
        filas={FILAS}
        claveFila={(f) => f.id}
        etiqueta="Prueba"
        ordenInicial={{ clave: "nombre", direccion: "asc" }}
      />,
    );

    const encabezadoNombre = screen.getByRole("columnheader", { name: /nombre/i });
    const boton = within(encabezadoNombre).getByRole("button");

    fireEvent.click(boton); // asc -> desc
    expect(encabezadoNombre).toHaveAttribute("aria-sort", "descending");
    expect(nombresEnOrden()).toEqual(["Carlos", "Beatriz", "Ana"]);

    fireEvent.click(boton); // desc -> vuelve al orden inicial (asc), no a null
    expect(encabezadoNombre).toHaveAttribute("aria-sort", "ascending");
    expect(nombresEnOrden()).toEqual(["Ana", "Beatriz", "Carlos"]);
  });

  it("sin ordenInicial, el ciclo de 3 estados sigue terminando en sin orden como hoy", () => {
    render(<Tabla columnas={columnas()} filas={FILAS} claveFila={(f) => f.id} etiqueta="Prueba" />);

    const encabezadoNombre = screen.getByRole("columnheader", { name: /nombre/i });
    const boton = within(encabezadoNombre).getByRole("button");

    fireEvent.click(boton); // asc
    fireEvent.click(boton); // desc
    fireEvent.click(boton); // vuelve a sin orden

    expect(encabezadoNombre).toHaveAttribute("aria-sort", "none");
    expect(nombresEnOrden()).toEqual(["Beatriz", "Ana", "Carlos"]);
  });
});
