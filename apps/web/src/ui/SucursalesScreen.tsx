// apps/web/src/ui/SucursalesScreen.tsx (doc 11 §2, plan §5 "Las otras
// cuatro" — de stub a pantalla real). Lista de placas de sucursal, máx. 10
// por cajero (contracts/schemas/crear-cajero.schema.ts:
// `sucursalesAsignadas: z.array(z.string()).max(10)`).
//
// `auth` entra por prop, no como el singleton importado de `lib/firebase.js`
// — mismo patrón que `LoginScreen.onIniciarSesion`: la pantalla recibe su
// frontera de I/O desde afuera en vez de importar Firebase directo, así el
// test la monta sin inicializar la app real de Firebase.
//
// Fuente de navegación — DECISIÓN: se usa `sucursal.sesionAbiertaId`, NO
// `observarSesionAbierta(sucursalId, …)`. Razones:
//   1. `sucursal.sesionAbiertaId` ya viaja gratis en el doc que
//      `observarSucursales` trae para pintar la placa (nombre,
//      conectividad); pedirlo también vía `observarSesionAbierta` abriría
//      hasta 10 listeners de consulta adicionales (con su índice
//      compuesto sucursalId+estado+abiertaEn, doc 04 §4) sólo para
//      redescubrir un dato que ya está en memoria.
//   2. La invariante I-1 (doc 04 §3) es precisamente la garantía que hace
//      seguro usarlo así: `sesionAbiertaId` se escribe en una transacción
//      atómica junto con la apertura/cierre de la sesión, así que el
//      campo del documento de sucursal es la fuente autoritativa de "hay
//      una sesión abierta ahora mismo" — no una réplica que pueda
//      desincronizarse de la consulta.
//   3. Las Security Rules ya autorizan la lectura de `sucursales/{id}`
//      completa (`infra/firestore.rules:34`); no hace falta un permiso ni
//      una consulta adicional para leer este campo.
import type { Auth } from "firebase/auth";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Sucursal } from "@conteo/shared";
import { useConteoRepository } from "../state/repositorio-contexto.js";
import { useAuthState } from "../state/useAuthState.js";
import { Icono } from "./primitivos/Icono.js";
import { Placa } from "./primitivos/Placa.js";

// Referencia estable: evita que `estadoAuth?.sucursales ?? []` cree un
// array nuevo en cada render (el efecto de abajo depende de esta lista por
// contenido, no por referencia — con un `[]` literal inline el efecto
// entraría en un ciclo de resuscripción infinito).
const SIN_SUCURSALES: readonly string[] = [];

export interface SucursalesScreenProps {
  readonly auth: Auth;
}

export function SucursalesScreen({ auth }: SucursalesScreenProps) {
  const estadoAuth = useAuthState(auth);
  const sucursalIds = estadoAuth?.sucursales ?? SIN_SUCURSALES;
  const repo = useConteoRepository();
  const navigate = useNavigate();

  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  // Dependencia por CONTENIDO (join), no por referencia: `sucursalIds` cae
  // a `SIN_SUCURSALES` cuando el claim aún no resolvió o viene vacío, pero
  // conviene no depender del array en sí — más explícito y no ata este
  // efecto a que el fallback siga siendo el mismo objeto.
  const claveSucursales = sucursalIds.join(",");
  useEffect(() => {
    return repo.observarSucursales(sucursalIds, setSucursales);
    // sucursalIds se lee por closure a propósito; la clave estable de abajo
    // es la que decide cuándo volver a suscribirse.
  }, [repo, claveSucursales]);

  // La misma ventana que el comentario de más abajo describía sin construir:
  // el claim ya resolvió con IDs reales (por eso NO es el caso de "no tienes
  // sucursales"), pero el efecto de arriba todavía no vio un solo snapshot
  // de Sucursal. `estadoAuth !== undefined` es la autoridad, no
  // `sucursales.length` a secas — así no se muestra el esqueleto por error
  // en el instante inicial en el que ni siquiera el claim ha resuelto (ese
  // instante no pinta nada, como antes; no es la ventana que este cambio
  // cubre).
  const cargandoSucursales =
    estadoAuth !== undefined && sucursalIds.length > 0 && sucursales.length === 0;

  return (
    <section className="mx-auto flex min-h-dvh max-w-md flex-col px-3 pt-3">
      {/* Cabecera callada a propósito. El primer borrador puso el h1 en
          `text-numeral` (2rem): ese token es el outlier deliberado de la
          escala y DESIGN.md lo reserva a la denominación de categoría —
          "el numeral es lo único que grita". Gastarlo en una palabra que
          no es una cifra diluye la única jerarquía audaz del sistema, y
          además dejaba el título compitiendo con las placas, que SON el
          contenido de esta pantalla. */}
      <header className="pb-3">
        <h1 className="text-micro tracking-[0.18em] text-tenue uppercase">Sucursales</h1>
      </header>

      {/* El claim es la autoridad sobre "no tienes sucursales", NO la lista
          de snapshots: `useAuthState` arranca en `undefined` y `sucursales`
          está vacío también mientras los N listeners de documento aún no
          emiten. Condicionar el mensaje a `sucursales.length` afirmaba algo
          falso en cada carga. */}
      {estadoAuth !== undefined && sucursalIds.length === 0 && (
        <p className="text-base text-tenue">No tienes sucursales asignadas.</p>
      )}

      {/* Región viva silenciosa: el único aviso de "cargando" que llega a un
          lector de pantalla, ya que el esqueleto de abajo es `aria-hidden`
          (no hay contenido real que anunciar fila por fila). Vacía el resto
          del tiempo — sólo cambia de vacío a texto y de vuelta, nunca se
          desmonta, así el lector de pantalla ya tiene la región registrada
          cuando empieza a haber algo que anunciar. */}
      <p className="sr-only" aria-live="polite">
        {cargandoSucursales ? "Cargando sucursales…" : ""}
      </p>

      {/* La ventana "claim resuelto con IDs, snapshots en vuelo": antes no
          pintaba nada (comentario retirado, ver commit); ahora es un
          esqueleto con la forma final de la fila real (plan §5, F4) — nunca
          un spinner. `sucursalIds` ya da la cuenta exacta de filas
          esperadas, así que no hay que adivinar cuántas pintar. */}
      {cargandoSucursales ? (
        <ul aria-hidden="true" className="flex flex-col gap-2 pb-4">
          {sucursalIds.map((id) => (
            <li key={id} className="list-none" data-testid="fila-esqueleto">
              <Placa className="py-2.5">
                <div className="flex min-h-[var(--size-toque)] w-full flex-col justify-center gap-2">
                  <span className="h-[1.125rem] w-32 animate-pulse rounded-placa bg-placa-alta" />
                  <span className="h-3 w-20 animate-pulse rounded-placa bg-placa-alta" />
                </div>
              </Placa>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="flex flex-col gap-2 pb-4">
          {sucursales.map((sucursal) => {
            const navegable = sucursal.sesionAbiertaId !== null;
            return (
              <li key={sucursal.sucursalId} className="list-none">
                <Placa className="py-2.5">
                  <button
                    type="button"
                    disabled={!navegable}
                    // Entra por /preparar, no directo al conteo: el grafo de
                    // docs/diseno/11-ux-y-navegacion.md §2 es `SUC --> PREP`,
                    // y el uso es MENSUAL (PRODUCT.md) — nadie llega
                    // recordando cómo va el flujo, así que el recordatorio de
                    // los cuatro pasos precede al conteo en vez de colgar a
                    // un lado.
                    onClick={() => navigate(`/conteo/${sucursal.sesionAbiertaId}/preparar`)}
                    // Sin atenuar al deshabilitar, a diferencia del patrón
                    // `disabled` de BotonPaso (DESIGN.md §Components): ahí el
                    // 40 % apaga un glifo −/+; aquí apagaría la fila entera y
                    // el nombre de la sucursal cae de 15.34:1 a 3.48:1 —
                    // calculado sobre --color-tinta contra --color-placa, no
                    // supuesto—, bajo el mínimo AA de 4.5:1, y la marca de
                    // conectividad a 1.93:1. Es exactamente la fila que el
                    // cajero necesita leer para saber CUÁL no tiene sesión.
                    // El estado lo comunica el texto "Sin sesión abierta".
                    className="flex min-h-[var(--size-toque)] w-full items-center justify-between gap-3 text-left disabled:cursor-not-allowed"
                  >
                    <span className="min-w-0">
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
                    </span>
                    {/* Etiqueta corta a propósito: medido en el harness a
                        390 px, "Sin sesión abierta" empujaba el nombre de la
                        sucursal a truncarse ("Zona Industrial Puente Ar…").
                        El nombre es el dato con el que el cajero decide; la
                        etiqueta de estado es secundaria y cede el ancho. */}
                    <span className="shrink-0 text-micro text-tenue">
                      {navegable ? "Continuar →" : "Sin sesión"}
                    </span>
                  </button>
                </Placa>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
