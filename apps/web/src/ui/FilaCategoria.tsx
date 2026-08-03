// apps/web/src/ui/FilaCategoria.tsx (doc 07 §7, doc 11 §4)
//
// Envuelta en React.memo recibiendo sólo su línea por props: evita
// recalcular las demás filas cuando cambia una sola (clave para 55 fps con
// 200 categorías). El aporte propio ("Tú") se suscribe DENTRO del
// componente vía useMiAporte, así que sólo esta fila se re-renderiza cuando
// cambia su propio aporte — el resto de la lista no se entera.
import { memo } from "react";
import type { LineaConteo } from "@conteo/shared";
import { useConteoRepository } from "../state/repositorio-contexto.js";
import { useMiAporte } from "../state/useMiAporte.js";

interface FilaCategoriaProps {
  readonly sesionId: string;
  readonly linea: LineaConteo;
}

function FilaCategoriaBase({ sesionId, linea }: FilaCategoriaProps) {
  const repo = useConteoRepository();
  const miAporte = useMiAporte(sesionId, linea.categoriaId);
  const miCantidad = miAporte?.cantidad ?? 0;

  function registrar(cantidad: number): void {
    void repo.registrarAporte({
      sesionId,
      categoriaId: linea.categoriaId,
      cantidad: Math.max(0, cantidad),
    });
  }

  return (
    <li
      aria-label={`Valor ${linea.etiqueta}, tu aporte ${miCantidad}, total del equipo ${linea.cantidadTotal}`}
    >
      <span>{linea.etiqueta}</span>
      <button
        type="button"
        aria-label={`Restar ${linea.etiqueta}`}
        onClick={() => registrar(miCantidad - 1)}
      >
        −
      </button>
      <span data-testid="mi-cantidad">{miCantidad}</span>
      <button
        type="button"
        aria-label={`Sumar ${linea.etiqueta}`}
        onClick={() => registrar(miCantidad + 1)}
      >
        +
      </button>
      <span>
        Tú: {miAporte ? miCantidad : "—"} · Equipo: {linea.cantidadTotal}
      </span>
    </li>
  );
}

export const FilaCategoria = memo(FilaCategoriaBase);
