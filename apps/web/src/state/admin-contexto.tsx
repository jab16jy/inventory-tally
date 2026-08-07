// apps/web/src/state/admin-contexto.tsx — inyecta el AdminRepository (fake en
// tests, Firestore en producción) sin que las pantallas de /admin conozcan
// cuál implementación reciben. Espejo de repositorio-contexto.tsx
// (docs/plan-panel-administrador.md §4: mismo patrón, segundo archivo).
import { createContext, useContext, type ReactNode } from "react";
import type { AdminRepository } from "@conteo/data";

const AdminRepositoryContext = createContext<AdminRepository | null>(null);

export function AdminRepositoryProvider({
  repo,
  children,
}: {
  readonly repo: AdminRepository;
  readonly children: ReactNode;
}) {
  return (
    <AdminRepositoryContext.Provider value={repo}>{children}</AdminRepositoryContext.Provider>
  );
}

export function useAdminRepository(): AdminRepository {
  const repo = useContext(AdminRepositoryContext);
  if (!repo) {
    throw new Error("useAdminRepository debe usarse dentro de <AdminRepositoryProvider>");
  }
  return repo;
}
