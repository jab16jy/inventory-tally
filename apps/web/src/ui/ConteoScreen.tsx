// apps/web/src/ui/ConteoScreen.tsx (doc 11 §4) — la pantalla crítica del
// sistema: sin importes, sólo unidades (I-9).
import { useParams } from "react-router-dom";
import { useLineasSesion } from "../state/useLineasSesion.js";
import { usePendientes } from "../state/usePendientes.js";
import { BannerPendientes } from "./BannerPendientes.js";
import { FilaCategoria } from "./FilaCategoria.js";

export function ConteoScreen() {
  // Valor por defecto para no romper las reglas de hooks con un return
  // condicional antes de useLineasSesion/usePendientes; la ruta siempre
  // provee :sesionId cuando este componente se monta desde el router.
  const { sesionId = "" } = useParams<{ sesionId: string }>();
  const lineas = useLineasSesion(sesionId);
  const pendientes = usePendientes(sesionId);

  return (
    <section>
      <BannerPendientes pendientes={pendientes} />
      <ul>
        {lineas.map((linea) => (
          <FilaCategoria key={linea.categoriaId} sesionId={sesionId} linea={linea} />
        ))}
      </ul>
    </section>
  );
}
