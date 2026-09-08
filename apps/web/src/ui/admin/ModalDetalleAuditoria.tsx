// apps/web/src/ui/admin/ModalDetalleAuditoria.tsx — diálogo accesible
// para inspeccionar el contexto completo de un evento de auditoría.
import { useEffect, useRef } from "react";
import type { EventoAuditoria } from "@conteo/shared/models/evento-auditoria.js";
import type { Sucursal } from "@conteo/shared/models/sucursal.js";
import type { Usuario } from "@conteo/shared/models/usuario.js";
import { fecha } from "../../lib/formato.js";
import { describirContexto, obtenerAutor, obtenerNombreSucursal } from "./auditoria-helpers.js";

interface ModalDetalleAuditoriaProps {
  readonly evento: EventoAuditoria | null;
  readonly onCerrar: () => void;
  readonly usuariosMap?: ReadonlyMap<string, Usuario>;
  readonly sucursalesMap?: ReadonlyMap<string, Sucursal>;
}

export function ModalDetalleAuditoria({
  evento,
  onCerrar,
  usuariosMap,
  sucursalesMap,
}: ModalDetalleAuditoriaProps) {
  const dialogoRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogoRef.current;
    if (!dialog) return;

    if (evento) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [evento]);

  if (!evento) return null;

  const autor = obtenerAutor(evento, usuariosMap);
  const contexto = describirContexto(evento);
  const sucursal = obtenerNombreSucursal(evento, sucursalesMap);

  return (
    <dialog
      ref={dialogoRef}
      aria-label="Detalle de auditoría"
      onClose={onCerrar}
      className="m-auto w-[calc(100%-2rem)] max-w-xl rounded-placa border border-borde bg-placa-alta p-6 text-tinta backdrop:bg-fondo/70"
    >
      <header className="mb-4 border-b border-borde pb-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold text-tinta">Detalle de Auditoría</h2>
          <span className="font-mono text-micro text-tenue">{evento.eventoId}</span>
        </div>
        <p className="mt-1 text-micro text-tenue">{fecha(evento.ocurridoEn)}</p>
      </header>

      <dl className="mb-6 flex flex-col gap-3 text-base">
        <div className="flex items-baseline justify-between gap-4 border-b border-borde/50 pb-2">
          <dt className="text-micro text-tenue">Tipo de Evento</dt>
          <dd className="font-medium text-tinta">{evento.tipo.replaceAll("_", " ")}</dd>
        </div>

        <div className="flex items-baseline justify-between gap-4 border-b border-borde/50 pb-2">
          <dt className="text-micro text-tenue">Autor / Responsable</dt>
          <dd className="flex items-center gap-2 font-medium text-tinta">
            <span>{autor.nombre}</span>
            {autor.rol && (
              <span className="rounded-placa border border-borde bg-placa px-2 py-0.5 text-micro text-tenue">
                {autor.rol}
              </span>
            )}
          </dd>
        </div>

        <div className="flex items-baseline justify-between gap-4 border-b border-borde/50 pb-2">
          <dt className="text-micro text-tenue">Contexto / Causa</dt>
          <dd className="text-right text-tinta">{contexto}</dd>
        </div>

        <div className="flex items-baseline justify-between gap-4 border-b border-borde/50 pb-2">
          <dt className="text-micro text-tenue">Sucursal</dt>
          <dd className="text-tinta">{sucursal}</dd>
        </div>

        {evento.sesionId && (
          <div className="flex items-baseline justify-between gap-4 border-b border-borde/50 pb-2">
            <dt className="text-micro text-tenue">Sesión de Conteo</dt>
            <dd className="font-mono text-micro text-tinta">{evento.sesionId}</dd>
          </div>
        )}
      </dl>

      <details className="mb-6 rounded-placa border border-borde bg-placa p-3">
        <summary className="cursor-pointer text-micro font-medium text-tenue hover:text-tinta">
          Ver datos técnicos completos (JSON)
        </summary>
        <pre className="mt-3 max-h-48 overflow-auto font-mono text-micro text-tenue">
          {JSON.stringify(evento, null, 2)}
        </pre>
      </details>

      <footer className="flex justify-end">
        <button
          type="button"
          onClick={onCerrar}
          className="min-h-[var(--size-toque)] min-w-[6rem] rounded-placa border border-borde bg-placa px-4 py-2 text-micro font-semibold text-tinta transition-colors duration-150 ease-out hover:border-senal hover:text-senal"
        >
          Cerrar
        </button>
      </footer>
    </dialog>
  );
}
