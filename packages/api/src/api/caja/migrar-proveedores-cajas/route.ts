import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { FERREMEX_CAJAS } from "../../../modules/ferremex-cajas"
import type FerremexCajasService from "../../../modules/ferremex-cajas/service"
import { FERREMEX_PROVEEDORES } from "../../../modules/ferremex-proveedores"
import type FerremexProveedoresService from "../../../modules/ferremex-proveedores/service"
import { FERREMEX_COMPRAS } from "../../../modules/ferremex-compras"
import type FerremexComprasService from "../../../modules/ferremex-compras/service"
import { asignarCajaAUsuario } from "../usuarios/route"
import { esFechaISO } from "../../../lib/text"

/**
 * POST /caja/migrar-proveedores-cajas — migración one-shot de los datos que cada
 * terminal tiene en localStorage (pos_proveedores, pos_cajas_catalogo,
 * pos_cajas_asignaciones) a la BD.
 *
 * Idempotente:
 *  - Cajas: upsert por `nombre`. Si ya existe una caja con ese nombre, se reusa
 *    su id (no se duplica). Construye mapa nombreCajaLocal -> caja.id de BD.
 *  - Proveedores: upsert por `num_proveedor`. Si ya existe, se omite (se reusa
 *    su id). Las facturas de un proveedor se migran solo si el proveedor destino
 *    aún no tiene facturas (evita duplicar al re-ejecutar).
 *  - Asignaciones: Record<usuarioId, nombreCajaLocal>. Se remapea el nombre a la
 *    caja.id de BD y se persiste como caja_id en el usuario. Asignaciones cuyo
 *    usuario no exista (o cuya caja no se haya migrado) se reportan como huérfanas.
 *
 * NO migra los PROVEEDORES_DEMO automáticamente: el frontend solo envía lo que
 * el usuario realmente capturó (pos_proveedores con datos reales).
 *
 * Body: { proveedores?: Proveedor[], cajas?: Caja[], asignaciones?: Record<usuarioId, nombreCaja> }
 */

interface FacturaIn {
  numero_factura?: string; fecha_emision?: string; dias_credito?: number
  monto?: number; descripcion?: string; pagada?: boolean
}
interface ProveedorIn {
  id?: string; num_proveedor?: string; nombre?: string; contacto?: string
  telefono?: string; email?: string; dias_credito?: number; limite_credito?: number
  rfc?: string; notas?: string; facturas?: FacturaIn[]
}
interface CajaIn { id?: string | number; nombre?: string; descripcion?: string; activa?: boolean }
interface ArticuloCompraIn {
  codigo?: string; nombre?: string; cantidad?: number; precioUnit?: number
  categoria?: string; departamento?: string; marca?: string
}
interface CompraIn {
  folio?: string; proveedor?: string; proveedorId?: string | null; fecha?: string
  tipo?: string; estado?: string; subtotal?: number; iva?: number; total?: number
  canceladaEl?: string | null; motivoCancelacion?: string | null
  articulos?: ArticuloCompraIn[]
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = (req.body ?? {}) as {
    proveedores?: ProveedorIn[]
    cajas?: CajaIn[]
    asignaciones?: Record<string, string>
    compras?: CompraIn[]
  }
  const proveedoresIn = Array.isArray(body.proveedores) ? body.proveedores : []
  const cajasIn = Array.isArray(body.cajas) ? body.cajas : []
  const asignacionesIn = body.asignaciones ?? {}
  const comprasIn = Array.isArray(body.compras) ? body.compras : []

  const resumen = {
    proveedores_creados: 0,
    proveedores_omitidos: 0,
    facturas: 0,
    cajas_creadas: 0,
    cajas_omitidas: 0,
    asignaciones_aplicadas: 0,
    compras_creadas: 0,
    compras_omitidas: 0,
    huerfanos: [] as string[], // descripción de asignaciones que no se pudieron aplicar
  }

  try {
    const cajasService: FerremexCajasService = req.scope.resolve(FERREMEX_CAJAS)
    const proveedoresService: FerremexProveedoresService = req.scope.resolve(FERREMEX_PROVEEDORES)
    const comprasService: FerremexComprasService = req.scope.resolve(FERREMEX_COMPRAS)

    // 1) Cajas: upsert por nombre. Mapa nombreLocal -> caja.id de BD.
    const cajasExistentes = await cajasService.listCajas({})
    const porNombreCaja = new Map<string, string>(
      (cajasExistentes as any[]).map((c) => [String(c.nombre).trim().toLowerCase(), c.id])
    )
    for (const caja of cajasIn) {
      const nombre = String(caja.nombre ?? "").trim()
      if (!nombre) continue
      const clave = nombre.toLowerCase()
      if (porNombreCaja.has(clave)) {
        resumen.cajas_omitidas++
        continue
      }
      const creada = await cajasService.createCajas({
        nombre,
        descripcion: caja.descripcion != null ? String(caja.descripcion) : null,
        activa: caja.activa ?? true,
      })
      porNombreCaja.set(clave, (creada as any).id)
      resumen.cajas_creadas++
    }

    // 2) Proveedores: upsert por num_proveedor. Facturas solo si el destino no tiene.
    const proveedoresExistentes = await proveedoresService.listProveedors({})
    const porNumProveedor = new Map<string, string>(
      (proveedoresExistentes as any[]).map((p) => [String(p.num_proveedor), p.id])
    )
    for (const prov of proveedoresIn) {
      const num = prov.num_proveedor ? String(prov.num_proveedor) : ""
      let proveedorId: string
      if (num && porNumProveedor.has(num)) {
        proveedorId = porNumProveedor.get(num)!
        resumen.proveedores_omitidos++
      } else {
        const numFinal = num || (await proveedoresService.siguienteNumProveedor())
        const creado = await proveedoresService.createProveedors({
          num_proveedor: numFinal,
          nombre: String(prov.nombre ?? "").trim() || "Sin nombre",
          contacto: prov.contacto ?? null,
          telefono: prov.telefono ?? null,
          email: prov.email ?? null,
          dias_credito: Number(prov.dias_credito) || 0,
          limite_credito: Number(prov.limite_credito) || 0,
          rfc: prov.rfc ?? null,
          notas: prov.notas ?? null,
        })
        proveedorId = (creado as any).id
        porNumProveedor.set(numFinal, proveedorId)
        resumen.proveedores_creados++
      }
      // Facturas: idempotencia por "el destino aún no tiene facturas".
      const facturasDestino = await proveedoresService.listFacturaProveedors({
        proveedor_id: proveedorId,
      })
      if ((facturasDestino as any[]).length === 0) {
        for (const f of prov.facturas ?? []) {
          if (!f.numero_factura) continue
          // Espejo de la validación de POST /facturas: no migrar montos no positivos
          // (datos de prueba/corruptos del localStorage) para no dejar facturas fantasma.
          if (!f.monto || Number(f.monto) <= 0) continue
          await proveedoresService.agregarFactura(proveedorId, {
            numero_factura: String(f.numero_factura),
            // Sanear fecha legacy: si no es YYYY-MM-DD válida, usar hoy (no romper migración).
            fecha_emision: esFechaISO(f.fecha_emision) ? f.fecha_emision : new Date().toISOString().slice(0, 10),
            dias_credito: Number(f.dias_credito) || 0,
            monto: Number(f.monto) || 0,
            descripcion: f.descripcion ?? "",
            pagada: !!f.pagada,
          })
          resumen.facturas++
        }
      }
    }

    // 3) Asignaciones: nombreCajaLocal -> caja.id -> caja_id del usuario.
    for (const [usuarioId, nombreCaja] of Object.entries(asignacionesIn)) {
      const clave = String(nombreCaja ?? "").trim().toLowerCase()
      const cajaId = clave ? porNombreCaja.get(clave) : undefined
      if (!cajaId) {
        resumen.huerfanos.push(`usuario ${usuarioId} → caja "${nombreCaja}" (caja no encontrada)`)
        continue
      }
      const aplicado = await asignarCajaAUsuario(usuarioId, cajaId)
      if (aplicado) resumen.asignaciones_aplicadas++
      else resumen.huerfanos.push(`usuario ${usuarioId} no existe (caja "${nombreCaja}")`)
    }

    // 4) Compras: upsert por folio. Remapea proveedorId por nombre cuando el id
    //    local (p.ej. "prov-001") no corresponde a un proveedor de BD.
    if (comprasIn.length > 0) {
      const comprasExistentes = await comprasService.listCompras({})
      const foliosExistentes = new Set((comprasExistentes as any[]).map((c) => c.folio))
      // Mapa nombre(lower) -> proveedor.id de BD, para remapear proveedorId.
      const proveedoresBD = await proveedoresService.listProveedors({})
      const porNombreProv = new Map<string, string>(
        (proveedoresBD as any[]).map((p) => [String(p.nombre).trim().toLowerCase(), p.id])
      )
      const idsValidos = new Set((proveedoresBD as any[]).map((p) => p.id))

      for (const compra of comprasIn) {
        const folio = String(compra.folio ?? "").trim()
        if (!folio || foliosExistentes.has(folio)) {
          resumen.compras_omitidas++
          continue
        }
        // proveedorId: usar el del payload si existe en BD; si no, remapear por nombre.
        let proveedorId: string | null = null
        if (compra.proveedorId && idsValidos.has(compra.proveedorId)) {
          proveedorId = compra.proveedorId
        } else if (compra.proveedor) {
          proveedorId = porNombreProv.get(String(compra.proveedor).trim().toLowerCase()) ?? null
        }
        await comprasService.crearCompraConArticulos(
          {
            folio,
            proveedor: compra.proveedor ?? "",
            proveedor_id: proveedorId,
            fecha: compra.fecha ?? new Date().toISOString().slice(0, 10),
            tipo: compra.tipo ?? "Factura",
            estado: compra.estado ?? "Recibida",
            subtotal: Number(compra.subtotal) || 0,
            iva: Number(compra.iva) || 0,
            total: Number(compra.total) || 0,
          },
          (compra.articulos ?? []).map((a) => ({
            codigo: a.codigo,
            nombre: a.nombre,
            cantidad: a.cantidad,
            precio_unit: a.precioUnit,
            categoria: a.categoria ?? null,
            departamento: a.departamento ?? null,
            marca: a.marca ?? null,
          }))
        )
        foliosExistentes.add(folio)
        resumen.compras_creadas++
      }
    }

    res.json({ ok: true, resumen })
  } catch (e: any) {
    console.error("[caja/migrar-proveedores-cajas] error:", e?.message ?? e)
    res.status(500).json({ error: "Falló la migración", detalle: e?.message ?? String(e), resumen })
  }
}
