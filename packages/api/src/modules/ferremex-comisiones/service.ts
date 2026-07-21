import { MedusaService } from "@medusajs/framework/utils"
import ComisionEje from "./models/comision-eje"
import ComisionRegla from "./models/comision-regla"

/** Normaliza un nombre de taxonomía para comparar sin importar mayúsculas/espacios. */
function norm(s: string | null | undefined): string {
  return String(s ?? "").trim().toLowerCase()
}

/**
 * Service del módulo ferremex_comisiones.
 *
 * MedusaService genera el CRUD base (listComisionEjes/createComisionEjes/… y
 * listComisionReglas/createComisionReglas/…, pluralizador simple, sin mismatch
 * conocido a diferencia de ferremex_monedero).
 *
 * Los helpers de negocio de aquí resuelven "¿este eje admite comisión?" y
 * "¿qué % aplica a esta línea de venta para este empleado?" — mismo espíritu
 * que ferremex-monedero/service.ts + apps/pos/src/lib/monedero.ts, pero el
 * motor de resolución vive en el frontend compartido (lib/comisiones.ts) para
 * que backend (persistencia de venta) y UI (preview) usen la misma fórmula;
 * aquí solo helpers de consulta/mutación de las reglas.
 */
class FerremexComisionesService extends MedusaService({
  ComisionEje,
  ComisionRegla,
}) {
  /** Ejes habilitados (globalmente) para un ámbito dado, o todos si se omite. */
  async listarEjesHabilitados(ambito?: "marca" | "categoria" | "departamento") {
    const filtro: Record<string, unknown> = { habilitado: true }
    if (ambito) filtro.ambito = ambito
    return await this.listComisionEjes(filtro, { take: 10000 })
  }

  /** true si el ámbito+ref está habilitado para comisión (comparación normalizada). */
  async ejeHabilitado(ambito: "marca" | "categoria" | "departamento", ref: string): Promise<boolean> {
    const ejes = await this.listComisionEjes({ ambito }, { take: 10000 })
    const target = norm(ref)
    return ejes.some((e) => e.habilitado && norm(e.ref) === target)
  }

  /** Reglas de comisión activas de un empleado, para el motor de cálculo. */
  async reglasDeEmpleado(empleado_id: string) {
    return await this.listComisionReglas({ empleado_id, activa: true }, { take: 10000 })
  }
}

export default FerremexComisionesService
