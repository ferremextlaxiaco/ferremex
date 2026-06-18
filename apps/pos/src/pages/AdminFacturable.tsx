import ArticlesModule from "../components/ArticlesModule"

/** Tab "Saldo facturable" — vive dentro del módulo de Artículos (doble inventario fiscal). */
export function AdminFacturable() {
  return <ArticlesModule vista="facturable" />
}
