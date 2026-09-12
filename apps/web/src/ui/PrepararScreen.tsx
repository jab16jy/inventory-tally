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
import { useAreaActiva } from "../state/useAreaActiva.js";
import { useAreasActivas } from "../state/useAreasActivas.js";
import { useAuthState } from "../state/useAuthState.js";
import { useConexion } from "../state/useConexion.js";
import { useConteoRepository } from "../state/repositorio-contexto.js";
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
  const repo = useConteoRepository();

  // `?? []`: esta pantalla no distingue "sin snapshot todavía" de "catálogo
  // vacío" (ver useLineasSesion.ts).
  const lineas = useLineasSesion(sesionId) ?? [];
  const pendientes = usePendientes(sesionId);
  const enLinea = useConexion();
  // Área activa obligatoria (ADR-23): el contador elige con qué área
  // organiza su conteo antes de empezar. Persistida en localStorage por
  // sesionId — ConteoScreen la lee de vuelta.
  const [areasActivas, areasCargadas] = useAreasActivas(repo);
  const [areaActiva, setAreaActiva] = useAreaActiva(sesionId);
  const areaValida = areasActivas.some((a) => a.areaId === areaActiva);
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

      {!areasCargadas ? (
        // issue #86 (revisión de resiliencia, ronda RDD 5): sin esto, un
        // listener que nunca emite (permiso revocado a mitad de sesión, o
        // carga fría sin red ni caché — ver el `ponytail:` de
        // useAreasActivas.ts) dejaba el botón deshabilitado para siempre sin
        // ninguna pista visual de que seguía "cargando". Mismo patrón que
        // "Cargando catálogo…" arriba.
        <p className="mt-5 text-base text-tenue">Cargando áreas…</p>
      ) : areasActivas.length === 0 ? (
        // issue #86 (revisión de resiliencia): infra/firestore.rules exige
        // areaId.size() > 0 SIN excepción — con el catálogo vacío no hay
        // ningún valor de área válido que dejar pasar. Fingir que "" sirve
        // deja al cajero enviando conteos que el servidor rechaza para
        // siempre, sin decirle por qué. Lo honesto es bloquear y explicar.
        <p role="alert" className="mt-5 text-base text-tinta">
          No hay áreas configuradas todavía. Pídele a un administrador que cree al menos una antes
          de empezar a contar.
        </p>
      ) : (
        <label className="mt-5 block">
          <span className="mb-1 block text-micro font-semibold text-tenue uppercase">Tu área</span>
          <select
            value={areaValida ? areaActiva : ""}
            onChange={(e) => setAreaActiva(e.target.value)}
            className="min-h-[var(--size-toque)] w-full rounded-placa border border-borde bg-fondo px-3 text-tinta focus:border-senal focus:outline-none"
          >
            <option value="" disabled>
              Elige un área
            </option>
            {areasActivas.map((area) => (
              <option key={area.areaId} value={area.areaId}>
                {area.nombre}
              </option>
            ))}
          </select>
        </label>
      )}

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
        // issue #86 (revisión de resiliencia / Judgment Day JD-002): siempre exige
        // `areaValida` presente en `areasActivas` — infra/firestore.rules rechaza
        // areaId="" igual, y un id huérfano en localStorage (área eliminada o
        // catálogo vacío) no debe dejar pasar al conteo. `areasCargadas` evita
        // habilitar el botón durante la ventana de carga, antes del primer snapshot.
        disabled={!areasCargadas || !areaValida}
        onClick={() => navigate(`/conteo/${sesionId}`)}
        className="mt-6 min-h-[var(--size-toque)] w-full rounded-placa bg-senal font-semibold text-fondo transition-colors duration-150 ease-out disabled:border disabled:border-borde disabled:bg-transparent disabled:text-tenue active:enabled:bg-senal/85"
      >
        Empezar a contar
      </button>
    </section>
  );
}
