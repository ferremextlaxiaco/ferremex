import { model } from "@medusajs/framework/utils"

/**
 * Una plantilla de huella (FMD — Fingerprint Minutiae Data) de un sujeto.
 *
 * POLI-SUJETO: la misma tabla guarda huellas de empleados y de clientes,
 * discriminadas por `sujeto_tipo`. Esto deja el modelo LISTO para ambos casos
 * sin migración (el canje 1:1 usa clientes, las acciones sensibles usan empleados).
 *
 * La plantilla NO es una imagen: es un buffer de minucias (~440 bytes) que el
 * motor nativo dpfj extrae y compara. Se guarda como base64 en `plantilla`.
 * El servicio local (FerremexBiometriaService, 127.0.0.1:52700) la produce y la
 * consume; aquí solo se persiste. La huella NUNCA se guarda como imagen.
 *
 * `sujeto_ref` referencia lógica (no FK real):
 *   - empleado → id del usuario POS (viven en JSON, no en BD)
 *   - cliente  → customer_id nativo de Medusa (cus_...)
 *
 * Multi-dedo: un sujeto puede tener varias filas (índice + pulgar de respaldo),
 * distinguidas por `dedo`.
 */
const HuellaBiometrica = model.define("biometria_huella", {
  id: model.id().primaryKey(),
  sujeto_tipo: model.enum(["empleado", "cliente"]),
  sujeto_ref: model.text(),
  // Qué dedo se registró. String libre para no atarnos a un enum cerrado.
  dedo: model.text().default("indice_der"),
  // FMD en base64 (~600 chars). Blob de minucias, no imagen.
  plantilla: model.text(),
  // Calidad de la consolidación de enroll (0-100).
  calidad: model.number().default(0),
  // Qué motor generó la plantilla (para migración si se cambia de extractor).
  motor: model.text().default("dpfj"),
  // Formato del FMD (estándar).
  formato: model.text().default("ANSI_378_2004"),
  // Versión de plantilla — permite re-enroll selectivo si cambia el motor.
  version_plantilla: model.text().default("dpfj-3.5"),
  // Soft-disable: no se borra (auditoría), deja de contar como candidata.
  activa: model.boolean().default(true),
  creado_en: model.text(),
  actualizado_en: model.text().nullable(),
})

export default HuellaBiometrica
