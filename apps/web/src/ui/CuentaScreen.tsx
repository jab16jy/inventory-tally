// apps/web/src/ui/CuentaScreen.tsx (doc 11 §2) — hermana de SucursalesScreen:
// datos de la cuenta del cajero (nombre, correo, rol) y sus sucursales
// asignadas, sin ninguna acción de navegación (a diferencia de
// SucursalesScreen, aquí no se entra a un conteo).
import type { Auth } from "firebase/auth";
import { useEffect, useState } from "react";
import type { Sucursal } from "@conteo/shared";
import { etiquetaRol } from "../lib/etiqueta-rol.js";
import { useConteoRepository } from "../state/repositorio-contexto.js";
import { useAuthState } from "../state/useAuthState.js";
import { CabeceraCajero } from "./CabeceraCajero.js";
import { Icono } from "./primitivos/Icono.js";
import { Placa } from "./primitivos/Placa.js";

// ponytail: mismo problema que SucursalesScreen.tsx — evita que
// `estadoAuth?.sucursales ?? []` cree un array nuevo cada render, lo que
// resuscribiría el efecto de abajo en loop (depende de esta lista por
// contenido, no por referencia).
const SIN_SUCURSALES: readonly string[] = [];

export interface CuentaScreenProps {
  readonly auth: Auth;
  readonly onSalir: () => void | Promise<void>;
}

export function CuentaScreen({ auth, onSalir }: CuentaScreenProps) {
  const estadoAuth = useAuthState(auth);
  const sucursalIds = estadoAuth?.sucursales ?? SIN_SUCURSALES;
  const repo = useConteoRepository();

  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const claveSucursales = sucursalIds.join(",");
  useEffect(() => {
    return repo.observarSucursales(sucursalIds, setSucursales);
  }, [repo, claveSucursales]);

  // A diferencia de SucursalesScreen, esta pantalla también necesita
  // `estadoAuth` para el nombre y el rol (no sólo para las sucursales): el
  // "cargando" arranca desde que el claim mismo no ha resuelto, no sólo
  // desde que resolvió con IDs pendientes de snapshot.
  const cargandoCuenta = estadoAuth === undefined;
  const cargandoSucursales =
    estadoAuth !== undefined && sucursalIds.length > 0 && sucursales.length === 0;
  const cargando = cargandoCuenta || cargandoSucursales;

  return (
    <section className="mx-auto flex min-h-dvh max-w-md flex-col px-3 pt-3">
      <CabeceraCajero titulo="Cuenta" onSalir={onSalir} />

      {/* Región viva silenciosa: único aviso de "cargando" que llega a un
          lector de pantalla, ya que los esqueletos de abajo son
          `aria-hidden`. Mismo patrón que SucursalesScreen.tsx. */}
      <p className="sr-only" aria-live="polite">
        {cargando ? "Cargando datos de la cuenta…" : ""}
      </p>

      {cargandoCuenta ? (
        <div aria-hidden="true" data-testid="fila-esqueleto" className="mb-4">
          <Placa className="py-3">
            <div className="flex flex-col gap-2">
              <span className="h-[1.125rem] w-40 animate-pulse rounded-placa bg-placa-alta" />
              <span className="h-3 w-56 animate-pulse rounded-placa bg-placa-alta" />
              <span className="h-3 w-24 animate-pulse rounded-placa bg-placa-alta" />
            </div>
          </Placa>
        </div>
      ) : (
        <Placa className="mb-4 py-3">
          <dl className="flex flex-col gap-3">
            <div>
              <dt className="text-micro text-tenue">Nombre</dt>
              <dd className="text-base text-tinta">{estadoAuth?.nombre ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-micro text-tenue">Correo</dt>
              <dd className="text-base text-tinta">{auth.currentUser?.email ?? "—"}</dd>
            </div>
            <div>
              {/* ponytail: `usuarios/{uid}` SÍ es legible por las Security
                  Rules (infra/firestore.rules:27, `allow get: if
                  autenticado() && (uid == miUid() || esAdmin())`), pero esta
                  pantalla no lo lee: rol y nombre ya viajan gratis en el
                  claim del token y en `currentUser`. Ese doc queda como la
                  puerta si algún día hace falta `pwaInstalada` o
                  `ultimoAccesoEn`. */}
              <dt className="text-micro text-tenue">Rol</dt>
              <dd className="text-base text-tinta">{etiquetaRol(estadoAuth?.rol)}</dd>
            </div>
          </dl>
        </Placa>
      )}

      <h2 className="mb-2 text-micro tracking-[0.18em] text-tenue uppercase">
        Sucursales asignadas
      </h2>

      {/* El claim es la autoridad sobre "no tiene sucursales", NO la lista
          de snapshots — mismo criterio que SucursalesScreen.tsx. */}
      {estadoAuth !== undefined && sucursalIds.length === 0 && (
        <p className="text-base text-tenue">No tienes sucursales asignadas.</p>
      )}

      {cargando ? (
        <ul aria-hidden="true" className="flex flex-col gap-2 pb-4">
          {/* Con `estadoAuth` aún sin resolver no hay cuenta exacta de
              filas esperadas todavía — una fila genérica basta como aviso de
              carga; en cuanto resuelve con IDs, `sucursalIds` sí da la
              cuenta exacta (ver SucursalesScreen.tsx). */}
          {(sucursalIds.length > 0 ? sucursalIds : ["_placeholder"]).map((id) => (
            <li key={id} className="list-none" data-testid="fila-esqueleto">
              <Placa className="py-2.5">
                <span className="block h-[1.125rem] w-32 animate-pulse rounded-placa bg-placa-alta" />
              </Placa>
            </li>
          ))}
        </ul>
      ) : (
        sucursales.length > 0 && (
          <ul className="flex flex-col gap-2 pb-4">
            {sucursales.map((sucursal) => (
              // Sin <button> y sin <Link>: esta pantalla informa, no navega.
              <li key={sucursal.sucursalId} className="list-none">
                <Placa className="py-2.5">
                  <span className="block truncate text-medio leading-none font-semibold text-tinta">
                    {sucursal.nombre}
                  </span>
                  <span className="mt-1 flex items-center gap-1.5 text-micro text-tenue">
                    <Icono
                      nombre={sucursal.conectividad === "wifi" ? "wifi" : "datos"}
                      className="size-3.5 shrink-0"
                    />
                    {sucursal.conectividad === "wifi" ? "WiFi" : "Datos móviles"}
                  </span>
                </Placa>
              </li>
            ))}
          </ul>
        )
      )}
    </section>
  );
}
