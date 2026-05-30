import { useCallback, useState } from "react"

export interface Toast {
  id: number
  msg: string
  type: "success" | "error" | "info" | "warning"
}

/**
 * Hook de toasts compartido por los módulos del POS. Antes estaba duplicado
 * verbatim en SalesHistory, EmployeesModule y CashMovementsModule.
 * Los toasts auto-expiran a los 3000 ms.
 */
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([])

  const push = useCallback((msg: string, type: Toast["type"] = "success") => {
    const id = Date.now() + Math.floor(Math.random() * 1000)
    setToasts((t) => [...t, { id, msg, type }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3000)
  }, [])

  return { toasts, push }
}
