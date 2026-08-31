// apps/web/src/ui/PrepararScreen.tsx (F3-B, doc 11 §3, plan §5 "las otras
// cuatro" — de "no existe" a pantalla real). Aparece al entrar a una sesión:
// resuelve el olvido por uso mensual con el recordatorio de los 4 pasos y
// confirma que el catálogo ya está disponible antes de contar.
//
// FUERA DE ALCANCE, verificado contra el código y no sólo asumido: el mock
// del plan (doc 11 §3) titula la pantalla "Conteo de agosto · Sucursal
// Norte" y condiciona un aviso a `sucursal.conectividad`. Esta ruta sólo
// recibe `:sesionId` (doc 11 §2, mapa de navegación). F4-A1 ya añadió
// `ConteoRepository.observarSesion(sesionId, …)` — la ruta de escalamiento
// que este comentario nombraba antes de que existiera — así que el nombre de
// sucursal (`SesionConteo.sucursalNombre`, ya viene denormalizado en la
// propia sesión) es alcanzable sin una segunda pieza. El aviso de datos
// móviles NO: `conectividad` sólo vive en `Sucursal`, y resolverla exige un
// segundo lookup (`observarSucursales([sesion.sucursalId], …)`) que ninguna
// pantalla de esta ola pide. Esta pantalla sigue sin consumir ninguno de los
// dos — ver el `ponytail:` sobre el <header> más abajo para la ruta de
// escalamiento real que queda.
import type { Auth } from "firebase/auth";
import { useNavigate, useParams } from "react-router-dom";
import { useAuthState } from "../state/useAuthState.js";
import { useConexion } from "../state/useConexion.js";
import { useLineasSesion } from "../state/useLineasSesion.js";
import { usePendientes } from "../state/usePendientes.js";
import { CabeceraCajero } from "./CabeceraCajero.js";
import { ChipEstado } from "./primitivos/ChipEstado.js";
import { Icono } from "./primitivos/Icono.js";
import { Placa } from "./primitivos/Placa.js";

const PASOS = [
  "Elige un valor de la lista",
  "Escribe cuántas unidades contaste TÚ",
  "El sistema suma lo de todo el equipo",
  'Al terminar, pulsa "Finalizar conteo"',
] as const;

export interface PrepararScreenProps {
  readonly auth: Auth;
  // issue #40: "Salir" (variante A, decidida vía /prototype) entra por prop,
  // igual que en SucursalesScreen/AdminLayout.
  readonly onSalir: () => void | Promise<void>;
}

export function PrepararScreen({ auth, onSalir }: PrepararScreenProps) {
  // Mismo valor por defecto que ConteoScreen y por la misma razón: no
  // romper las reglas de hooks con un return condicional antes de los
  // hooks de estado — la ruta siempre provee :sesionId al montar.
  const { sesionId = "" } = useParams<{ sesionId: string }>();
  const navigate = useNavigate();

  const lineas = useLineasSesion(sesionId);
  const pendientes = usePendientes(sesionId);
  const enLinea = useConexion();
  // Un admin que entró a contar desde /admin (PanelScreen "Contar →") no
  // tiene forma de volver salvo cerrar sesión — esAdmin es del usuario, no
  // de cómo navegó, así que funciona sin importar el punto de entrada.
  const esAdmin = useAuthState(auth)?.esAdmin ?? false;

  const catalogoCargado = lineas.length > 0;
  const estadoSync: "sincronizado" | "pendiente" | "sin-conexion" = !enLinea
    ? "sin-conexion"
    : pendientes > 0
      ? "pendiente"
      : "sincronizado";

  return (
    <section className="mx-auto flex min-h-dvh max-w-md flex-col px-3 pt-3 pb-4">
      {/* Cabecera callada — mismo criterio que SucursalesScreen: el numeral
          de 2rem es el outlier reservado a la denominación de categoría
          (DESIGN.md §Typography), no a un título de pantalla.
          ponytail: sin nombre de sucursal/sesión ni aviso de datos móviles.
          El techo YA NO es la falta de `observarSesion` (F4-A1 lo añadió a
          `ConteoRepository` + Fake + Firestore) — es que esta pantalla no lo
          llama, y que el aviso de conectividad sigue necesitando un segundo
          lookup a `Sucursal` que `SesionConteo` no trae (ver comentario de
          archivo). Ruta de escalamiento: consumir `observarSesion(sesionId,
          …)` aquí para el nombre, y `observarSucursales([sesion.sucursalId],
          …)` para el aviso de datos móviles, el día que una pantalla real lo
          necesite. */}
      <CabeceraCajero
        titulo="Antes de empezar"
        onSalir={onSalir}
        onVolverAdmin={esAdmin ? () => navigate("/admin") : undefined}
      />

      <ul className="flex flex-col gap-2">
        <li className="list-none">
          {/* Sin `confirmado`: LA FIRMA significa "el servidor agregó tu
              aporte" (sólida) o "en tránsito" (hueca). "Catálogo cargado" no
              es ninguna de las dos, y reusar la regla ámbar para un tercer
              significado la vacía justo donde sí decide algo — la misma razón
              por la que /sucursales dejó de pintarla. El estado ya lo lleva
              el visto de la izquierda, que no necesita un segundo emisor. */}
          <Placa className="flex items-center gap-2 py-2.5">
            <Icono
              nombre="visto"
              aria-hidden="true"
              className={
                catalogoCargado ? "size-4 shrink-0 text-senal" : "size-4 shrink-0 text-tenue"
              }
            />
            <span className="text-base text-tinta">
              {catalogoCargado
                ? `Catálogo cargado (${lineas.length} categorías)`
                : "Cargando catálogo…"}
            </span>
          </Placa>
        </li>

        <li className="flex list-none items-center gap-2 py-1">
          <span className="text-base text-tinta">Estado de la sesión</span>
          <ChipEstado estado={estadoSync} />
        </li>
      </ul>

      <h2 className="mt-5 mb-2 text-micro font-semibold text-tenue uppercase">Cómo funciona</h2>
      {/* <ol> nativo: el orden SÍ importa (son pasos secuenciales), así que la
          numeración no es la decoración "01/02/03" que craft-floor.md
          rechaza — aquí la lleva gratis el navegador, sin badges a mano. */}
      <ol aria-label="Cómo funciona" className="flex flex-col gap-2 pl-5 text-base text-tinta">
        {PASOS.map((paso) => (
          <li key={paso} className="list-decimal marker:text-tenue">
            {paso}
          </li>
        ))}
      </ol>

      <button
        type="button"
        onClick={() => navigate(`/conteo/${sesionId}`)}
        className="mt-6 min-h-[var(--size-toque)] w-full rounded-placa bg-senal font-semibold text-fondo transition-colors duration-150 ease-out active:bg-senal/85"
      >
        Empezar a contar
      </button>
    </section>
  );
}
