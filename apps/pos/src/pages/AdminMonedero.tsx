import MonederoModule from "../modules/MonederoModule"

/**
 * Página del módulo Monedero Electrónico (programa de lealtad por puntos).
 * Wrapper delgado: solo monta el módulo, que es dueño del estado y la lógica.
 * Montada en /admin/monedero (ver main.tsx + sidebar en Admin.tsx).
 */
export function AdminMonedero() {
  return <MonederoModule />
}
