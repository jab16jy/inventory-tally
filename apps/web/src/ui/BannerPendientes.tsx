// apps/web/src/ui/BannerPendientes.tsx — RF-16 / doc 06 §3 / doc 11 §5.
// Deliberadamente SIN botón de cerrar: cerrar la app con pendientes pierde
// conteos en silencio, por eso el aviso es insistente y no descartable.
//
// Rojo, que junto al ámbar es el único otro color del sistema y está
// reservado a riesgo real de pérdida. Aquí lo hay.
interface BannerPendientesProps {
  readonly pendientes: number;
}

export function BannerPendientes({ pendientes }: BannerPendientesProps) {
  if (pendientes <= 0) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="sticky top-0 z-10 border border-riesgo bg-riesgo-placa rounded-placa px-3 py-2.5 text-base text-tinta"
    >
      <strong className="font-semibold text-riesgo">No cierres la aplicación.</strong> Tienes{" "}
      {pendientes} {pendientes === 1 ? "conteo" : "conteos"} sin enviar. Busca señal o WiFi para que
      se guarden.
    </div>
  );
}
