// apps/web/src/ui/AnalisisConteoScreen.tsx (RF-14, doc 10) — dashboard
// operativo del cajero para UN conteo, ruta `/mis-conteos/:sesionId`.
//
// I-9 / ADR-07 / A-10: el cajero NUNCA ve dinero. Esta pantalla sólo pinta
// `unidades` de `FilaDimension` — `valor` (monetario) se calcula dentro de
// `agruparPorDimension` porque la función es compartida con el panel admin,
// pero aquí se descarta sin pintarlo ni pasarlo a ningún formateador.
//
// Datos: sólo `useLineasSesion`/`useSesion` — `sesiones/*/lineas` es
// `read: if autenticado() && tieneSucursal(...)` (infra/firestore.rules:64),
// sin exigir sesión abierta, así que el cajero ya puede leer un conteo
// cerrado. Cero métodos nuevos en el repositorio.
import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { totalUnidadesSesion } from "@conteo/shared";
import {
  agruparPorDimension,
  participacion,
  type DimensionAnalisis,
  type FilaDimension,
} from "@conteo/shared/services/calculadora-analisis.js";
import { fecha, numero, porcentaje } from "../lib/formato.js";
import { useConteoRepository } from "../state/repositorio-contexto.js";
import { useLineasSesion } from "../state/useLineasSesion.js";
import { useSesion } from "../state/useSesion.js";
import { CabeceraCajero } from "./CabeceraCajero.js";
import { Numeral } from "./primitivos/Numeral.js";
import { Placa } from "./primitivos/Placa.js";

const DIMENSIONES: readonly { readonly valor: DimensionAnalisis; readonly etiqueta: string }[] = [
  { valor: "categoria", etiqueta: "Categoría" },
  { valor: "area", etiqueta: "Área" },
  { valor: "cajero", etiqueta: "Cajero" },
];

/** `agruparPorDimension` ordena por `valor` (dinero, doc §260) — coherente
 *  para el panel admin, incoherente aquí donde `valor` ni se pinta. Se
 *  reordena por `unidades` descendente en el consumidor, mismo desempate
 *  estable (`etiqueta` ascendente) que documenta calculadora-analisis.ts
 *  para no parpadear entre renders con los mismos datos. */
function ordenarPorUnidades(filas: readonly FilaDimension[]): FilaDimension[] {
  return [...filas].sort((a, b) => b.unidades - a.unidades || a.etiqueta.localeCompare(b.etiqueta));
}

/** Nunca un uid crudo en pantalla (dimensión "cajero"). `agruparPorDimension`
 *  sólo pone `etiqueta === clave` cuando el uid no está en `nombres` — aquí
 *  sólo se nombra al propio uid ("Tú"), así que cualquier fila que siga así
 *  es un compañero sin nombre. N = índice en la lista ya ordenada (estable
 *  entre renders con los mismos datos).
 *  // ponytail: nombres reales exigirían leer `usuarios/{uid}` de terceros,
 *  pero `usuarios` es `list: if esAdmin()` — haría falta denormalizar
 *  nombresPorUid en el doc de sesión desde onAporteEscrito, o cambiar
 *  reglas + decidir privacidad. Fuera de esta ola. */
function anonimizarCompaneros(filas: readonly FilaDimension[]): FilaDimension[] {
  let contador = 0;
  return filas.map((fila) => {
    if (fila.etiqueta !== fila.clave) return fila;
    contador += 1;
    return { ...fila, etiqueta: `Compañero ${contador}` };
  });
}

// Sin `auth`, a diferencia de sus hermanas de cajero: esta pantalla no lee el
// claim —el uid sale de `repo.uidActual()`— y una prop que nadie usa obliga al
// llamador a inventar un valor (el test lo delataba con `{} as never`).
export interface AnalisisConteoScreenProps {
  readonly onSalir: () => void | Promise<void>;
}

export function AnalisisConteoScreen({ onSalir }: AnalisisConteoScreenProps) {
  // La ruta siempre provee :sesionId cuando este componente se monta desde
  // el router — mismo criterio de valor por defecto que ConteoScreen, para
  // no romper las reglas de hooks con un return condicional antes de ellos.
  const { sesionId = "" } = useParams<{ sesionId: string }>();
  const repo = useConteoRepository();
  const uid = repo.uidActual();

  const [dimension, setDimension] = useState<DimensionAnalisis>("categoria");

  const lineas = useLineasSesion(sesionId);
  const sesion = useSesion(sesionId);

  const equipo = totalUnidadesSesion(lineas);
  const tuAporte = lineas.reduce((total, l) => {
    if (!l.aplicados) return total;
    let suma = 0;
    for (const [clave, cant] of Object.entries(l.aplicados)) {
      if (clave === uid || clave.startsWith(`${uid}__`)) {
        suma += cant;
      }
    }
    return total + suma;
  }, 0);
  const pct = participacion(tuAporte, equipo);

  const nombresCajero = useMemo(() => new Map([[uid, "Tú"]]), [uid]);
  const filas = useMemo(() => {
    const base = agruparPorDimension(
      lineas,
      dimension,
      dimension === "cajero" ? nombresCajero : undefined,
    );
    const ordenadas = ordenarPorUnidades(base);
    return dimension === "cajero" ? anonimizarCompaneros(ordenadas) : ordenadas;
  }, [lineas, dimension, nombresCajero]);

  if (sesion.estado === "sin-resolver") {
    return (
      <section className="mx-auto flex min-h-dvh max-w-md flex-col px-3 pt-3">
        <CabeceraCajero titulo="Análisis" onSalir={onSalir} />
        <ul aria-hidden="true" className="flex flex-col gap-2 pb-4">
          {[0, 1, 2].map((i) => (
            <li key={i} className="list-none">
              <Placa className="py-2.5">
                <span className="block h-[1.125rem] w-32 animate-pulse rounded-placa bg-placa-alta" />
              </Placa>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  if (sesion.estado === "borrada") {
    return (
      <section className="mx-auto flex min-h-dvh max-w-md flex-col px-3 pt-3">
        <CabeceraCajero titulo="Análisis" onSalir={onSalir} />
        <p className="text-base text-tenue">Este conteo ya no está disponible.</p>
      </section>
    );
  }

  return (
    <section className="mx-auto flex min-h-dvh max-w-md flex-col px-3 pt-3">
      <CabeceraCajero
        titulo={`${sesion.sesion.sucursalNombre} · ${fecha(sesion.sesion.abiertaEn)}`}
        onSalir={onSalir}
      />

      <Placa className="mb-3">
        <div className="flex items-baseline justify-between gap-3 text-micro text-tenue uppercase">
          <p>
            Tú{" "}
            <Numeral tamano="placa" className="text-tinta normal-case" data-testid="tu-aporte">
              {numero(tuAporte)}
            </Numeral>
          </p>
          <p>
            Equipo{" "}
            <Numeral tamano="placa" className="text-tinta normal-case" data-testid="equipo-total">
              {numero(equipo)}
            </Numeral>
          </p>
        </div>
        <p className="mt-1 text-micro text-tenue">Participación: {porcentaje(pct)}</p>
      </Placa>

      {lineas.length === 0 ? (
        <p className="text-base text-tenue">Nadie ha contado todavía en esta sesión.</p>
      ) : (
        <>
          <label className="relative mb-3 block">
            <span className="sr-only">Filtrar por dimensión</span>
            <select
              value={dimension}
              onChange={(e) => setDimension(e.target.value as DimensionAnalisis)}
              className="min-h-[var(--size-toque)] w-full rounded-placa border border-borde bg-fondo px-3 text-tinta focus:border-senal focus:outline-none"
            >
              {DIMENSIONES.map((d) => (
                <option key={d.valor} value={d.valor}>
                  {d.etiqueta}
                </option>
              ))}
            </select>
          </label>

          {filas.length === 0 ? (
            <p className="text-base text-tenue">Nadie ha contado todavía en esta sesión.</p>
          ) : (
            <ul className="flex flex-col gap-2 pb-4">
              {filas.map((fila) => {
                const cuota = participacion(fila.unidades, equipo);
                return (
                  <li key={fila.clave} className="list-none">
                    <Placa className="py-2.5">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 truncate text-base text-tinta">
                          {fila.etiqueta}
                        </span>
                        <Numeral tamano="base">{numero(fila.unidades)} u</Numeral>
                      </div>
                      {/* Barra de cuota decorativa — `aria-hidden`: el
                          porcentaje en texto de abajo ya lleva la misma
                          información a un lector de pantalla, así que un
                          role="progressbar" por fila (hasta 60 en "cajero")
                          sería ruido repetido, no información nueva. */}
                      <div
                        aria-hidden="true"
                        className="mt-1.5 h-1 w-full overflow-hidden rounded-placa bg-placa-alta"
                      >
                        <div
                          className="h-full rounded-placa bg-senal"
                          style={{ width: `${Math.min(cuota, 100)}%` }}
                        />
                      </div>
                      <p className="mt-1 text-micro text-tenue">{porcentaje(cuota)}</p>
                    </Placa>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
