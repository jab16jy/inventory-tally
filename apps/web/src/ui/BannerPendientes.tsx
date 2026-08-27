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
      className="border border-riesgo bg-riesgo-placa rounded-placa px-3 py-2.5 text-base text-tinta"
    >
      {/* text-tinta, no text-riesgo: verificado con la fórmula WCAG (F4-B),
          ámbar/riesgo-placa mide 3.93:1 — bajo el mínimo AA de 4.5:1 para
          texto normal, y este `<strong>` a 15px semibold no llega al umbral
          de "texto grande" que exime la excepción. El rojo sigue marcando
          el riesgo en el borde y el fondo del banner; el texto usa el tono
          de mayor contraste (13.82:1) para que se pueda leer de verdad. */}
      <strong className="font-semibold text-tinta">No cierres la aplicación.</strong> Tienes{" "}
      {pendientes} {pendientes === 1 ? "conteo" : "conteos"} sin enviar. Busca señal o WiFi para que
      se guarden.
    </div>
  );
}
