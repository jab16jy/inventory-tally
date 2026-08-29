// apps/web/src/ui/primitivos/Spinner.tsx (docs/DESIGN.md — "Botón primario")
//
// Se antepone al texto del botón, nunca lo reemplaza: el nombre accesible
// no puede cambiar o rompe los `getByRole("button", { name })` del repo
// (fijado por Spinner.test.tsx). Sin tamaño ni color configurable: hereda
// `currentColor` y la clase que le pase el llamador, mismo criterio que
// `Icono.tsx`.
export interface SpinnerProps {
  readonly className?: string;
}

export function Spinner({ className }: SpinnerProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="square"
      aria-hidden="true"
      className={className ? `animate-spin ${className}` : "animate-spin"}
    >
      <circle cx="12" cy="12" r="9" strokeOpacity={0.25} />
      <path d="M21 12a9 9 0 0 0-9-9" />
    </svg>
  );
}
