import { model } from "@medusajs/framework/utils"

/**
 * Log AUDITABLE de cada intento de autorización por huella (append-only).
 *
 * Responde "quién autorizó qué y cuándo" — cubre la deuda de auditoría de las
 * acciones sensibles en /caja/*. Registra TAMBIÉN los fallos (no_match,
 * degradado_pin, servicio_caido), tan interesantes para auditoría como los éxitos.
 *
 * NUNCA guarda la imagen ni la plantilla capturada — solo referencias y score.
 * No hay soft-cancel aquí: es evidencia, inmutable.
 *
 * Distingue `cajero_id` (quién OPERABA la caja) de `sujeto_ref` (quién AUTORIZÓ
 * con su dedo) — pueden ser distintos (un cajero pide a un supervisor que autorice).
 */
const VerificacionBiometrica = model.define("biometria_verificacion", {
  id: model.id().primaryKey(),
  // Qué acción se intentó autorizar.
  accion: model.enum([
    "canje_puntos",
    "cancelar_venta",
    "descuento",
    "abrir_cajon",
    "gerencial",
    "otro",
  ]),
  // Folio de venta / id de canje / lo que aplique. Trazabilidad.
  contexto_ref: model.text().nullable(),
  resultado: model.enum([
    "match",          // huella reconocida y autorizada
    "no_match",       // huella no reconocida
    "sin_permiso",    // reconocida pero sin permiso para esa acción
    "degradado_pin",  // servicio caído → autorizó por PIN de supervisor
    "servicio_caido", // no se pudo ni intentar biometría
    "cancelado",      // el usuario canceló
    "error",          // error del lector/servicio
  ]),
  sujeto_tipo: model.enum(["empleado", "cliente"]).nullable(),
  // Quién resultó identificado/autorizó (null si no hubo match).
  sujeto_ref: model.text().nullable(),
  // Score de disimilitud de la comparación ganadora (para auditoría/calibración).
  score: model.number().nullable(),
  // Umbral aplicado (para trazar la decisión).
  umbral: model.number().nullable(),
  caja_id: model.text().nullable(),
  // Quién operaba el POS (contexto), distinto de sujeto_ref.
  cajero_id: model.text().nullable(),
  detalle: model.text().nullable(),
  fecha: model.text(), // ISO timestamp
})

export default VerificacionBiometrica
