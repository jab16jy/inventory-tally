// apps/web/src/state/repositorio-contexto.tsx — inyecta el ConteoRepository
// (fake en tests, Firestore en producción) sin que las pantallas conozcan
// cuál implementación reciben (doc 07 §4).
import { createContext, useContext, type ReactNode } from "react";
import type { ConteoRepository } from "@conteo/data";

const ConteoRepositoryContext = createContext<ConteoRepository | null>(null);

export function ConteoRepositoryProvider({
  repo,
  children,
}: {
  readonly repo: ConteoRepository;
  readonly children: ReactNode;
}) {
  return (
    <ConteoRepositoryContext.Provider value={repo}>{children}</ConteoRepositoryContext.Provider>
  );
}

export function useConteoRepository(): ConteoRepository {
  const repo = useContext(ConteoRepositoryContext);
  if (!repo) {
    throw new Error("useConteoRepository debe usarse dentro de <ConteoRepositoryProvider>");
  }
  return repo;
}
