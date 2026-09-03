// apps/web/src/ui/FinalizarScreen.tsx (F3-B, doc 11 §6, RF-16). Cierra el
// recorrido del cajero: resume su progreso, bloquea la salida mientras haya
// escrituras sin sincronizar y sólo entonces deja escribir `confirmadoEn`
// — el dato que habilita al administrador a cerrar la sesión (doc 11 §6).
//
// FUERA DE ALCANCE, verificado y no asumido: el mock (doc 11 §6) muestra
// "Contaste 412 UNIDADES en 47 categorías". Esta pantalla sólo puede
// mostrar CATEGORÍAS: el total de unidades PROPIAS del cajero exige sumar
// el `Aporte` de cada categoría para este uid, y
// `ConteoRepository.observarMiAporte` sólo observa una categoría a la vez.
// `ConteoScreen` evita ese mismo costo abriendo cero suscripciones nuevas —
// cada `FilaCategoria` ya montada REPORTA su cantidad hacia el padre (ver el
// comentario de `onCantidadPropiaCambio` en FilaCategoria.tsx) — pero aquí no
// hay filas montadas de las que colgarse. Ver el `ponytail:` de más abajo.
//
// El desglose por ÁREA que sí se muestra abajo es distinto: es el agregado
// DE EQUIPO (`LineaConteo.cantidadTotal`, ya sincronizado por el trigger de
// aportes), no el aporte propio del cajero — por eso no choca con la
// limitación de arriba.
import type { Auth } from "firebase/auth";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { estaPendiente, totalPorArea } from "@conteo/shared";
import { useAuthState } from "../state/useAuthState.js";
import { useConteoRepository } from "../state/repositorio-contexto.js";
import { useEscriturasConError } from "../state/useEscriturasConError.js";
import { useLineasSesion } from "../state/useLineasSesion.js";
import { usePendientes } from "../state/usePendientes.js";
import { CabeceraCajero } from "./CabeceraCajero.js";
import { Icono } from "./primitivos/Icono.js";

export interface FinalizarScreenProps {
  readonly auth: Auth;
  // issue #40: "Salir" (variante A, decidida vía /prototype) entra por prop,
  // igual que en SucursalesScreen/PrepararScreen/AdminLayout. Distinto de
  // "Confirmar y salir": ese botón exige listo === true; éste sale sin
  // confirmar nada, para el cajero que entró por error o quiere volver luego.
  readonly onSalir: () => void | Promise<void>;
}

export function FinalizarScreen({ auth, onSalir }: FinalizarScreenProps) {
  const { sesionId = "" } = useParams<{ sesionId: string }>();
  const repo = useConteoRepository();
  const navigate = useNavigate();
  const uid = repo.uidActual();
  // Mismo criterio que PrepararScreen: un admin que entró a contar desde
  // /admin no tiene forma de volver salvo cerrar sesión.
  const esAdmin = useAuthState(auth)?.esAdmin ?? false;

  const lineas = useLineasSesion(sesionId);
  const pendientes = usePendientes(sesionId);
  const escriturasConError = useEscriturasConError(sesionId);

  // ponytail: total PROPIO en CATEGORÍAS, no en unidades — el techo es la
  // falta de una vía de agregación en el repositorio (ver comentario de
  // archivo). Ruta de escalamiento: exponer un `observarMiTotalUnidades(sesionId)`
  // en `ConteoRepository` (+ Fake + Firestore) que agregue en el servidor o
  // en el propio listener, sin abrir una suscripción por categoría en el
  // cliente — el mismo presupuesto que ya protege a `ConteoScreen`.
  const contadas = lineas.filter((l) => !estaPendiente(l, uid)).length;
  const faltantes = lineas.length - contadas;

  // El desglose por área SÍ es un reduce puro sobre `lineas`, ya suscritas
  // en tiempo real vía `useLineasSesion` — sin suscripción nueva.
  const porArea = totalPorArea(lineas);

  const listo = pendientes === 0;
  const [fallo, setFallo] = useState(false);

  // Se ESPERA la confirmación antes de navegar. `confirmarSincronizacion`
  // devuelve `Promise<void>` y puede rechazar (permiso, o sesión ya cerrada
  // por el administrador); descartarla con `void` y navegar en el mismo tick
  // daba por escrito un `confirmadoEn` que quizá nunca llegó, y ese dato es
  // lo único que habilita al admin a cerrar la sesión (doc 11 §6). El cajero
  // se iba creyendo que confirmó y nadie podía notarlo después.
  async function confirmarYSalir(): Promise<void> {
    setFallo(false);
    try {
      await repo.confirmarSincronizacion(sesionId);
    } catch {
      setFallo(true);
      return;
    }
    // Un admin que contó desde /admin no tiene "sucursales" propio (esa
    // pantalla es el home del cajero, doc 11 §2) — el flujo real para él es
    // volver al panel, mismo destino que "Volver al panel" en la cabecera.
    navigate(esAdmin ? "/admin" : "/sucursales");
  }

  return (
    <section className="mx-auto flex min-h-dvh max-w-md flex-col px-3 pt-3 pb-4">
      {/* Cabecera callada, igual que SucursalesScreen y PrepararScreen: las
          tres pantallas del recorrido comparten patrón para que el cajero no
          reaprenda la jerarquía en cada paso. El contenido —cuánto contó y
          si ya se envió todo— es lo que debe pesar aquí. */}
      <CabeceraCajero
        titulo="Finalizar tu conteo"
        onSalir={onSalir}
        onVolverAdmin={esAdmin ? () => navigate("/admin") : undefined}
      />

      <p className="text-base text-tinta">
        Contaste {contadas} {contadas === 1 ? "categoría" : "categorías"}.
      </p>
      <p className="mt-1 text-base text-tenue">
        {faltantes === 0
          ? "No falta ninguna categoría por contar."
          : `Falta${faltantes === 1 ? "" : "n"} ${faltantes} ${
              faltantes === 1 ? "categoría" : "categorías"
            } sin contar.`}
      </p>

      {porArea.length > 0 && (
        <ul className="mt-3 flex flex-col gap-0.5">
          {porArea.map(({ areaId, cantidad }) => (
            <li key={areaId} className="text-base text-tenue">
              {areaId}: {cantidad} {cantidad === 1 ? "producto" : "productos"}
            </li>
          ))}
        </ul>
      )}

      {/* Mismo lenguaje que BannerPendientes (doc 06 §3): insistente, nunca
          alarmante hacia el cajero — no hizo nada mal, sólo hay que esperar
          a que el dispositivo termine de enviar. */}
      <div
        role={listo ? undefined : "status"}
        aria-live={listo ? undefined : "polite"}
        className="mt-5 flex items-center gap-2 border border-borde bg-placa rounded-placa px-3 py-2.5"
      >
        <Icono
          nombre="visto"
          aria-hidden="true"
          className={listo ? "size-5 shrink-0 text-senal" : "size-5 shrink-0 text-tenue"}
        />
        <div>
          <p className="text-base text-tinta">
            {listo
              ? "Todo enviado"
              : `Enviando ${pendientes} ${pendientes === 1 ? "conteo" : "conteos"}…`}
          </p>
          {!listo && <p className="text-micro text-tenue">No cierres la app.</p>}
        </div>
      </div>

      {fallo && (
        <p role="alert" className="mt-4 text-base text-tinta">
          No se pudo confirmar. Tu conteo está guardado; vuelve a intentarlo.
        </p>
      )}

      {/* Issue #41: un rechazo del servidor que agotó sus reintentos
          automáticos ya no queda mudo dentro de "pendientes" — se distingue
          para que el cajero pueda reintentarlo a mano en vez de quedar
          varado para siempre en "Esperando conexión". */}
      {escriturasConError > 0 && (
        <div
          role="alert"
          className="mt-4 flex flex-col gap-2 border border-borde bg-placa rounded-placa px-3 py-2.5"
        >
          <p className="text-base text-tinta">
            No se pudo enviar {escriturasConError} {escriturasConError === 1 ? "conteo" : "conteos"}
            . Tu conteo está guardado.
          </p>
          <button
            type="button"
            onClick={() => repo.reintentarEscriturasFallidas(sesionId)}
            className="min-h-[var(--size-toque)] w-full rounded-placa border border-borde font-semibold text-tinta transition-colors duration-150 ease-out active:bg-borde/40"
          >
            Reintentar envío
          </button>
        </div>
      )}

      {/* Deshabilitado SIN atenuar el ámbar, mismo criterio que la fila sin
          sesión de SucursalesScreen: `bg-senal/40` con `text-fondo/70` da
          2.10:1 —calculado sobre los tokens, no supuesto—, muy por debajo
          del mínimo AA de 4.5:1, y el texto atenuado es justamente el que
          explica POR QUÉ no puede salir todavía. En hueco, `text-tenue`
          sobre `--color-fondo` queda en 5.9:1 y el estado lo comunica el
          contorno más el propio texto. */}
      <button
        type="button"
        disabled={!listo}
        onClick={() => void confirmarYSalir()}
        className="mt-6 min-h-[var(--size-toque)] w-full rounded-placa bg-senal font-semibold text-fondo transition-colors duration-150 ease-out disabled:border disabled:border-borde disabled:bg-transparent disabled:text-tenue active:enabled:bg-senal/85"
      >
        {listo ? "Confirmar y salir" : "Esperando conexión"}
      </button>
    </section>
  );
}
