import { MedusaService } from "@medusajs/framework/utils"
import HuellaBiometrica from "./models/huella-biometrica"
import VerificacionBiometrica from "./models/verificacion-biometrica"

/**
 * Service del módulo ferremex_biometria.
 *
 * MedusaService genera el CRUD base. El pluralizador de Medusa convierte
 * "HuellaBiometrica" → "HuellaBiometricas" y "VerificacionBiometrica" →
 * "VerificacionBiometricas" (un solo -s). Como en ferremex-monedero, el codegen
 * puede sugerir un plural distinto (…icaes) al runtime, así que declaramos abajo
 * (interface merge) las firmas REALES que usamos, con tipos laxos.
 *
 * Helpers de negocio para que las rutas no dupliquen lógica.
 */
class FerremexBiometriaService extends MedusaService({
  HuellaBiometrica,
  VerificacionBiometrica,
}) {
  /** Registra una plantilla nueva (rellena timestamps). */
  async registrarHuella(data: {
    sujeto_tipo: "empleado" | "cliente"
    sujeto_ref: string
    dedo?: string
    plantilla: string
    calidad?: number
    motor?: string
    formato?: string
    version_plantilla?: string
  }) {
    const ahora = new Date().toISOString()
    return await this.createHuellaBiometricas({
      sujeto_tipo: data.sujeto_tipo,
      sujeto_ref: data.sujeto_ref,
      dedo: data.dedo ?? "indice_der",
      plantilla: data.plantilla,
      calidad: data.calidad ?? 0,
      motor: data.motor ?? "dpfj",
      formato: data.formato ?? "ANSI_378_2004",
      version_plantilla: data.version_plantilla ?? "dpfj-3.5",
      activa: true,
      creado_en: ahora,
      actualizado_en: ahora,
    })
  }

  /** Plantillas ACTIVAS de un sujeto (para verify 1:1 o listado). */
  async huellasDeSujeto(sujeto_tipo: "empleado" | "cliente", sujeto_ref: string) {
    const filas = await this.listHuellaBiometricas({ sujeto_tipo, sujeto_ref })
    return filas.filter((h) => h.activa)
  }

  /** ¿El sujeto tiene al menos una huella activa? (para UI: "tiene huella"). */
  async tieneHuella(sujeto_tipo: "empleado" | "cliente", sujeto_ref: string): Promise<boolean> {
    const filas = await this.huellasDeSujeto(sujeto_tipo, sujeto_ref)
    return filas.length > 0
  }

  /**
   * Candidatos para identificación 1:N: todas las plantillas activas de empleados.
   * El filtrado por permiso de acción lo hace la ruta (cruza con usuarios POS);
   * aquí devolvemos el universo de empleados con huella.
   */
  async candidatosEmpleados(): Promise<{ sujeto_ref: string; plantilla: string }[]> {
    const filas = await this.listHuellaBiometricas({ sujeto_tipo: "empleado" }, { take: 10000 })
    return filas
      .filter((h) => h.activa)
      .map((h) => ({ sujeto_ref: h.sujeto_ref, plantilla: h.plantilla }))
  }

  /** Soft-disable de una huella (no borra: auditoría). */
  async desactivarHuella(id: string) {
    return await this.updateHuellaBiometricas({
      id,
      activa: false,
      actualizado_en: new Date().toISOString(),
    })
  }

  /** Soft-disable de TODAS las huellas de un sujeto (ej. al borrar el usuario). */
  async desactivarHuellasDeSujeto(sujeto_tipo: "empleado" | "cliente", sujeto_ref: string): Promise<number> {
    const filas = await this.huellasDeSujeto(sujeto_tipo, sujeto_ref)
    const ahora = new Date().toISOString()
    for (const h of filas) {
      await this.updateHuellaBiometricas({ id: h.id, activa: false, actualizado_en: ahora })
    }
    return filas.length
  }

  /** Registra una entrada en el log de auditoría (append-only). */
  async registrarVerificacion(data: {
    accion: string
    contexto_ref?: string | null
    resultado: string
    sujeto_tipo?: "empleado" | "cliente" | null
    sujeto_ref?: string | null
    score?: number | null
    umbral?: number | null
    caja_id?: string | null
    cajero_id?: string | null
    detalle?: string | null
  }) {
    // Cast: `accion`/`resultado` son enums estrictos en el modelo; el helper los
    // recibe como string (la ruta ya validó los valores permitidos).
    return await this.createVerificacionBiometricas({
      accion: data.accion,
      contexto_ref: data.contexto_ref ?? null,
      resultado: data.resultado,
      sujeto_tipo: data.sujeto_tipo ?? null,
      sujeto_ref: data.sujeto_ref ?? null,
      score: data.score ?? null,
      umbral: data.umbral ?? null,
      caja_id: data.caja_id ?? null,
      cajero_id: data.cajero_id ?? null,
      detalle: data.detalle ?? null,
      fecha: new Date().toISOString(),
    } as any)
  }
}

/**
 * NOTA sobre el pluralizador: para este módulo el codegen y el runtime COINCIDEN
 * ("HuellaBiometrica"→"HuellaBiometricas", "VerificacionBiometrica"→
 * "VerificacionBiometricas"), así que los métodos CRUD ya vienen bien tipados de
 * la clase base MedusaService. NO se declara interface merge: hacerlo provoca
 * TS2425 (property-vs-method), igual que ReglaPuntos en ferremex-monedero.
 */
export default FerremexBiometriaService
