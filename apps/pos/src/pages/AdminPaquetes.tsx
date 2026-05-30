import ArticlesModule from "../components/ArticlesModule"

// Reutiliza ArticlesModule en su vista "paquetes" (comparte la carga de
// taxonomía y toasts). La pestaña se controla desde el topbar (Admin.tsx).
export function AdminPaquetes() {
  return <ArticlesModule vista="paquetes" />
}
