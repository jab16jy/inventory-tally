// apps/web/src/ui/BannerPendientes.tsx — RF-16 / doc 06 §3 / doc 11 §5.
// Deliberadamente SIN botón de cerrar: cerrar la app con pendientes pierde
// conteos en silencio, por eso el aviso es insistente y no descartable.
interface BannerPendientesProps {
  readonly pendientes: number;
}

export function BannerPendientes({ pendientes }: BannerPendientesProps) {
  if (pendientes <= 0) return null;

  return (
    <div role="alert" aria-live="assertive">
      <strong>No cierres la aplicación.</strong> Tienes {pendientes}{" "}
      {pendientes === 1 ? "conteo" : "conteos"} sin enviar. Busca señal o WiFi para que se guarden.
    </div>
  );
}
