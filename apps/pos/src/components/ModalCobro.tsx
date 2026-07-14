import { useEffect, useRef, useState } from "react"
import {
  Banknote, Smartphone, CreditCard, FileText, Coins, Sparkles,
  Check, X, AlertCircle, Fingerprint, ScanLine, Lock, Wallet, RotateCcw, ClipboardList, Truck,
  type LucideIcon,
} from "lucide-react"
import {
  registrarVenta, marcarCotizacionConvertida, obtenerDetalleMonederoAPI,
  listarReglasMonederoAPI, listarCatalogos, listarHuellasAPI, registrarVerificacionAPI,
  obtenerSaldoCambioAPI, obtenerFleteConfig, SKU_FLETE,
  type VentaResponse, type DetalleMonedero, type ReglaPuntosAPI, type CatalogosData,
  type DetalleSaldoCambio, type FleteConfig,
} from "../lib/client"
import { abrirCajonLocal } from "../lib/impresora-local"
import { healthBiometria, verificar1a1, cancelar as cancelarBiometria, BiometriaError } from "../lib/biometria"
import HuellaAnimacion from "./HuellaAnimacion"
import { FichaEncargoModal, type DatosFichaEncargo } from "./FichaEncargoModal"
import { FichaEntregaModal, type DatosFichaEntrega } from "./FichaEntregaModal"
import { usePOS, efectivoPrecio, type CartItem } from "../lib/pos-store"
import { claveLinea } from "../lib/promociones"
import { calcularPuntosGanados, topeCanjePesos, type LineaPuntos } from "../lib/monedero"
import { formatMXN as fmt } from "../lib/format"

interface ModalCobroProps {
  onCerrar: () => void
  onVentaCompletada: (venta: VentaResponse) => void
}

type Metodo = "efectivo" | "transferencia" | "tarjeta" | "credito" | "puntos"

// "Puntos" no es una tarjeta de método: tiene su propio banner de canje arriba.
// "Tarjeta" = tarjeta bancaria (crédito/débito por TPV); "Crédito" = fiado a la
// cuenta del cliente (cartera). Son métodos distintos.
const METODOS: { id: Metodo; label: string; icon: LucideIcon }[] = [
  { id: "efectivo",      label: "Efectivo",      icon: Banknote },
  { id: "transferencia", label: "Transferencia", icon: Smartphone },
  { id: "tarjeta",       label: "Tarjeta",       icon: CreditCard },
  { id: "credito",       label: "Crédito",       icon: FileText },
]

/**
 * Sanea un monto tecleado: acepta la coma como separador decimal (la convierte a
 * punto), descarta cualquier carácter no numérico y deja a lo sumo un punto. Así
 * el campo SIEMPRE se muestra y guarda con punto, independientemente del locale
 * del navegador (que en es-MX renderizaría un input number con coma).
 */
function saneaMonto(raw: string): string {
  const soloNumero = raw.replace(",", ".").replace(/[^0-9.]/g, "")
  const partes = soloNumero.split(".")
  if (partes.length <= 1) return soloNumero
  // Reúne todo lo posterior al primer punto en la parte decimal (un solo punto).
  return `${partes[0]}.${partes.slice(1).join("")}`
}

export function ModalCobro({ onCerrar, onVentaCompletada }: ModalCobroProps) {
  const { state, total, dispatch, promosCarrito } = usePOS()

  // ── Monedero Electrónico ──────────────────────────────────────────────────
  // Si el cliente activo está inscrito al monedero, cargamos su detalle (saldo,
  // config, nivel) + reglas + taxonomía para: (a) habilitar el pago con puntos,
  // (b) calcular el preview "ganarás ~X pts". Todo opcional: sin cliente con
  // monedero, el flujo de cobro es idéntico al de siempre.
  const [monedero, setMonedero] = useState<DetalleMonedero | null>(null)
  const [reglasMon, setReglasMon] = useState<ReglaPuntosAPI[]>([])
  const [catMon, setCatMon] = useState<CatalogosData | null>(null)
  const [confirmCanje, setConfirmCanje] = useState(false)
  const [codigoConfirm, setCodigoConfirm] = useState("")
  // ── Saldo a favor por cambio (ferremex_saldo_cambio) ──────────────────────
  // Concepto de negocio DISTINTO al Monedero de lealtad: se acredita cuando el
  // cliente cambia un artículo por otro de menor valor. Se consume 1:1 en pesos
  // (sin tasa de conversión). Se carga junto con el monedero al elegir cliente.
  const [saldoCambio, setSaldoCambio] = useState<DetalleSaldoCambio | null>(null)
  // ── Venta por encargo ─────────────────────────────────────────────────────
  // Dos sub-modos de encargo:
  //   - REPOSICIÓN: todas las líneas se encargan sin descontar inventario.
  //   - MIXTO: solo se encarga el faltante (cantidad > existencia) de cada línea;
  //     lo que hay se vende. Una línea marcada esEncargo (agotado agregado) o que
  //     excede su stock cuenta como encargo.
  const modoReposicion = state.modoEncargo && state.encargoReposicion
  const modoMixto = state.modoEncargo && !state.encargoReposicion
  // ¿Una línea aporta faltante encargado? (para preview de resta y para la ficha)
  const esLineaEncargo = (i: (typeof state.items)[number]) =>
    // Las líneas de artículo especial (granel) NUNCA son encargo: su inventario es
    // informativo, no se pide al proveedor. Se excluyen aunque cantidad > existencia
    // (que para granel es siempre 0).
    !i.esGranel && (modoReposicion || i.esEncargo || (modoMixto && i.cantidad > i.existencia))
  const faltanteLinea = (i: (typeof state.items)[number]) =>
    modoReposicion ? i.cantidad : Math.max(0, i.cantidad - i.existencia)
  // Si la FICHA se abre al entrar al cobro (define el anticipo). Hay encargo si el
  // modo es reposición, o si alguna línea aporta faltante.
  const hayEncargo = modoReposicion || state.items.some((i) => esLineaEncargo(i) && faltanteLinea(i) > 0)
  // Datos de la ficha ya confirmada (con anticipo). En estado —no ref— para que
  // el total a cobrar se recalcule al definir el anticipo.
  const [datosFicha, setDatosFicha] = useState<DatosFichaEncargo | null>(null)
  // La ficha se abre automáticamente al montar si hay encargo (antes de cobrar).
  const [fichaAbierta, setFichaAbierta] = useState(hayEncargo)
  // ── Entrega a domicilio ───────────────────────────────────────────────────
  // Disponible solo en venta normal (sin encargo). Dos naturalezas:
  //   - CONTRA ENTREGA: la venta se registra por_cobrar (sin cobro hoy); al
  //     confirmar la ficha se cobra al liquidar. No exige pago cubierto.
  //   - YA PAGADA: el cliente pagó en tienda (métodos normales) y solo hay que
  //     enviarla. Exige que el pago esté cubierto ANTES de capturar la entrega.
  // `entregaPagada` distingue cuál ficha se está abriendo.
  const [fichaEntregaAbierta, setFichaEntregaAbierta] = useState(false)
  const [entregaPagada, setEntregaPagada] = useState(false)
  const datosEntregaRef = useRef<DatosFichaEntrega | null>(null)
  // Config del servicio de flete (nombre + precio base + IVA). El flete se agrega
  // como LÍNEA de la venta (SKU SERVICIO-FLETE) desde la ficha de entrega. Se
  // carga al montar; si falla, la ficha simplemente no ofrece flete.
  const [fleteConfig, setFleteConfig] = useState<FleteConfig | null>(null)
  useEffect(() => {
    let on = true
    obtenerFleteConfig().then((c) => { if (on) setFleteConfig(c) }).catch(() => {})
    return () => { on = false }
  }, [])
  // Verificación de huella del cliente para el canje (1:1). Estados del sub-flujo:
  //   idle → esperando que el cajero pulse "Verificar huella"
  //   verificando → capturando+comparando en el servicio local
  //   ok → huella coincidió (habilita confirmar)
  //   error → no coincidió / falló (permite reintentar)
  //   sin_huella → el cliente no tiene huella registrada (permite canje directo)
  //   no_disponible → servicio/lector caído (degrada a confirmación manual)
  type FaseHuella = "idle" | "verificando" | "ok" | "error" | "sin_huella" | "no_disponible"
  const [faseHuella, setFaseHuella] = useState<FaseHuella>("idle")
  const [msgHuella, setMsgHuella] = useState("")
  const capturaHuellaRef = useRef<string | null>(null)

  useEffect(() => {
    const cli = state.clienteActivo
    if (!cli?.monedero) { setMonedero(null); return }
    let on = true
    ;(async () => {
      try {
        const [det, reglas, cat] = await Promise.all([
          obtenerDetalleMonederoAPI(cli.id),
          listarReglasMonederoAPI(),
          listarCatalogos(),
        ])
        if (on) { setMonedero(det); setReglasMon(reglas); setCatMon(cat) }
      } catch { /* el monedero es opcional; si falla, se cobra sin puntos */ }
    })()
    return () => { on = false }
  }, [state.clienteActivo])

  // Saldo a favor por cambio: independiente del Monedero (no requiere inscripción,
  // cualquier cliente identificado puede tener saldo generado por un cambio previo).
  useEffect(() => {
    const cli = state.clienteActivo
    if (!cli?.id) { setSaldoCambio(null); return }
    let on = true
    ;(async () => {
      try {
        const det = await obtenerSaldoCambioAPI(cli.id)
        if (on) setSaldoCambio(det)
      } catch { /* el saldo a favor es opcional; si falla, se cobra sin él */ if (on) setSaldoCambio(null) }
    })()
    return () => { on = false }
  }, [state.clienteActivo])

  // Precio unitario efectivo de una línea, ya con promociones aplicadas. Para
  // NxM/volumen el descuento no es un precio uniforme, así que se reparte el
  // importe total de la línea entre sus unidades (lo que se persiste y se imprime).
  function precioUnitEfectivo(i: (typeof state.items)[number]): number {
    const linea = promosCarrito.get(claveLinea(i))
    if (linea && i.cantidad > 0) return Math.round((linea.importe / i.cantidad) * 100) / 100
    return efectivoPrecio(i)
  }
  const [pagos, setPagos] = useState<Record<Metodo, string> & { saldoCambio: string }>({ efectivo: "", transferencia: "", tarjeta: "", credito: "", puntos: "", saldoCambio: "" })
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const efectivoRef = useRef<HTMLInputElement>(null)

  useEffect(() => { efectivoRef.current?.focus() }, [])

  const tieneCredito = (state.clienteActivo?.limite_credito ?? 0) > 0

  // ── Total a cobrar HOY ────────────────────────────────────────────────────
  // En una venta por encargo, el cliente paga hoy la parte-con-stock + el anticipo;
  // la resta del encargo queda pendiente. El valor ENCARGADO es el faltante (lo que
  // no hay) × precio: en reposición = toda la línea, en mixto = cantidad − stock.
  const totalEncargoCarrito = Math.round(
    state.items.reduce((s, i) => s + precioUnitEfectivo(i) * faltanteLinea(i), 0) * 100
  ) / 100
  const restaEncargo = datosFicha
    ? Math.max(0, Math.round((totalEncargoCarrito - datosFicha.anticipo) * 100) / 100)
    : 0
  // Lo que se debe cubrir en el modal = total del carrito − resta diferida.
  const totalACobrar = Math.round((total - restaEncargo) * 100) / 100

  const pEfectivo      = parseFloat(pagos.efectivo)      || 0
  const pTransferencia = parseFloat(pagos.transferencia)  || 0
  const pTarjeta       = parseFloat(pagos.tarjeta)        || 0
  const pCredito       = parseFloat(pagos.credito)        || 0
  const pPuntos        = parseFloat(pagos.puntos)          || 0
  const pSaldoCambio   = parseFloat(pagos.saldoCambio)     || 0
  const asignado       = pEfectivo + pTransferencia + pTarjeta + pCredito + pPuntos + pSaldoCambio

  // Cuánto falta cubrir con efectivo una vez restados otros métodos
  const neededCash = Math.max(0, totalACobrar - pTransferencia - pTarjeta - pCredito - pPuntos - pSaldoCambio)
  const cambio     = Math.max(0, pEfectivo - neededCash)
  const pendiente  = Math.max(0, neededCash - pEfectivo)
  const cubierto   = asignado >= totalACobrar - 0.005
  const pctCubierto = totalACobrar > 0 ? Math.min(100, (asignado / totalACobrar) * 100) : 100

  // ── Derivados del monedero ──────────────────────────────────────────────
  // Saldo disponible (en pesos), tope de canje del ticket y puntos a ganar.
  const cfgMon = monedero?.config ?? null
  const saldoPuntos = monedero?.saldo ?? 0
  // Valor de CANJE de un punto en pesos. Usa el valor base de la config —el mismo
  // que el backend usa para descontar puntos (puntos_canjeados = pesos/valor_punto)—
  // NO el valor_punto_bonus del nivel (ese es un beneficio de tier que afecta el
  // valor mostrado del saldo, no el descuento real en una venta).
  const valorCanje = cfgMon?.valor_punto || 1
  const saldoPesos = Math.round(saldoPuntos * valorCanje * 100) / 100
  const topePesos = cfgMon ? topeCanjePesos(totalACobrar, cfgMon) : 0
  const maxCanjePesos = Math.min(saldoPesos, topePesos)
  // Tope de canje expresado en PUNTOS (lo que el cajero/cliente razona): el menor
  // entre el saldo, lo que cabe en el tope del ticket, y lo que cubre el total.
  // Con 2 decimales (centésimas de punto) para permitir ajustes finos de cambio
  // (ej. 0.5 pts si 1 pt = $1, para cubrir $0.50 exactos sin dar cambio en efectivo).
  const maxCanjePuntos = valorCanje > 0 ? Math.floor((maxCanjePesos / valorCanje) * 100) / 100 : 0
  // El cliente tiene puntos pero no llega al mínimo configurado (informativo).
  const bajoMinimo = !!cfgMon && saldoPuntos > 0 && saldoPuntos < cfgMon.min_puntos_canje
  // Puede usar puntos si: inscrito, saldo ≥ mínimo, y hay algo canjeable.
  const puedeUsarPuntos = !!cfgMon && saldoPuntos >= cfgMon.min_puntos_canje && maxCanjePesos >= 0.01
  // Puntos a ganar por esta compra (preview). Usa el nivel del cliente.
  const puntosAGanar = (cfgMon && catMon)
    ? calcularPuntosGanados(
        // El flete es un SERVICIO: no genera puntos, se excluye del devengo.
        state.items.filter((i) => !i.esFlete).map<LineaPuntos>((i) => ({ subtotal: precioUnitEfectivo(i) * i.cantidad, marca: i.marca, departamento: i.departamento, categoria: i.categoria })),
        cfgMon, reglasMon, catMon, monedero?.nivel_actual ?? null
      )
    : 0
  // Si la config exige confirmar el canje (huella/código), se gatea con un modal.
  const requiereConfirmCanje = !!cfgMon && pPuntos > 0 && (cfgMon.confirmar_huella || cfgMon.confirmar_codigo)
  // Puntos que representa el monto canjeado en pesos (2 decimales). Es el valor
  // que el cajero teclea/ve; el backend redondea hacia arriba al DESCONTAR del
  // saldo real del cliente (nunca a favor del cliente), ver /caja/ventas.
  const puntosUsados = (cfgMon && pPuntos > 0) ? Math.round((pPuntos / cfgMon.valor_punto) * 100) / 100 : 0

  // ── Derivados del saldo a favor por cambio ────────────────────────────────
  // 1:1 con pesos (sin tasa de conversión). Máximo aplicable = min(saldo, lo que
  // falta cubrir tras el resto de métodos ya capturados + lo ya aplicado aquí).
  const saldoCambioDisponible = saldoCambio?.saldo ?? 0
  const maxSaldoCambio = Math.max(0, Math.min(saldoCambioDisponible, totalACobrar))
  const puedeUsarSaldoCambio = saldoCambioDisponible >= 0.01

  // ── Banner de canje de puntos ────────────────────────────────────────────
  // El control de canje se despliega cuando el cajero pulsa "Usar puntos". El
  // cliente razona en PUNTOS; internamente el pago se guarda en pesos (pagos.puntos).
  const [canjeAbierto, setCanjeAbierto] = useState(false)
  // Texto libre del input de puntos, desacoplado de `puntosUsados` (derivado).
  // Sin esto, un input controlado por un valor siempre recalculado "pelea" con
  // el usuario al escribir decimales: al teclear "1." el parseFloat da 1, el
  // valor derivado vuelve a "1" y el punto que acababa de escribir se pierde,
  // dejando imposible completar "1.75". Con texto local, el DOM refleja
  // exactamente lo tecleado; solo se re-sincroniza con el valor aplicado
  // cuando este cambia por una acción externa (abrir canje, "Usar todos", etc).
  const [puntosTexto, setPuntosTexto] = useState("")

  // Aplica N puntos: los convierte a pesos y los fija como pago con puntos.
  // Acota al máximo canjeable para no exceder saldo / tope / total. Si EXACTAMENTE
  // un método en pesos estaba cubriendo el ticket él solo, lo reajusta al nuevo
  // monto a pagar (Total − puntos) para que no quede cobrando de más ni de menos.
  function aplicarPuntos(puntos: number, opts?: { sincronizarTexto?: boolean }) {
    if (!cfgMon) return
    // 2 decimales (centésimas de punto): permite usar fracciones como 0.5 pts
    // para ajustar el cambio exacto, no solo puntos enteros.
    const puntosRedondeados = Math.round(puntos * 100) / 100
    const p = Math.max(0, Math.min(puntosRedondeados, maxCanjePuntos))
    const pesos = Math.round(p * cfgMon.valor_punto * 100) / 100
    const nuevoPuntos = pesos > 0 ? pesos.toFixed(2) : ""
    // Solo re-sincroniza el texto visible del input cuando la llamada viene de
    // una acción externa (botones "Usar todos"/"Quitar"), NO cuando el usuario
    // está escribiendo: ahí el input ya refleja su propio texto libre.
    if (opts?.sincronizarTexto) {
      setPuntosTexto(p > 0 ? String(p) : "")
    }
    setPagos((prev) => {
      const enPesos = (["efectivo", "transferencia", "tarjeta", "credito"] as Metodo[])
        .filter((m) => (parseFloat(prev[m]) || 0) > 0)
      const aPagar = Math.max(0, totalACobrar - pesos)
      // Un único método cubriéndolo todo → reajustarlo al nuevo "a pagar".
      if (enPesos.length === 1) {
        return { ...prev, puntos: nuevoPuntos, [enPesos[0]]: aPagar > 0 ? aPagar.toFixed(2) : "" }
      }
      return { ...prev, puntos: nuevoPuntos }
    })
  }

  // Handler del input de puntos: el texto se muestra tal cual se teclea (sin
  // reformatear en cada tecla). Solo aplica el canje cuando el texto ya parsea
  // a un número (p. ej. mientras se escribe "1." aún no aplica, y no se pierde
  // el punto decimal recién tecleado).
  function handlePuntosTextoChange(texto: string) {
    setPuntosTexto(texto)
    const n = parseFloat(texto)
    aplicarPuntos(Number.isFinite(n) ? n : 0)
  }

  // ── Banner de saldo a favor por cambio ────────────────────────────────────
  // Más simple que el de puntos: pesos directos, sin conversión ni tasa.
  const [saldoCambioAbierto, setSaldoCambioAbierto] = useState(false)
  const [saldoCambioTexto, setSaldoCambioTexto] = useState("")

  // Aplica un monto de saldo a favor (en pesos), acotado a lo disponible/al total
  // a cobrar. Mismo ajuste que `aplicarPuntos`: si un único método en pesos
  // cubría el ticket él solo, se reajusta al nuevo "a pagar".
  function aplicarSaldoCambio(monto: number, opts?: { sincronizarTexto?: boolean }) {
    const m = Math.max(0, Math.min(Math.round(monto * 100) / 100, maxSaldoCambio))
    const nuevoMonto = m > 0 ? m.toFixed(2) : ""
    if (opts?.sincronizarTexto) {
      setSaldoCambioTexto(m > 0 ? String(m) : "")
    }
    setPagos((prev) => {
      const enPesos = (["efectivo", "transferencia", "tarjeta", "credito"] as Metodo[])
        .filter((mtd) => (parseFloat(prev[mtd]) || 0) > 0)
      const aPagar = Math.max(0, totalACobrar - m)
      if (enPesos.length === 1) {
        return { ...prev, saldoCambio: nuevoMonto, [enPesos[0]]: aPagar > 0 ? aPagar.toFixed(2) : "" }
      }
      return { ...prev, saldoCambio: nuevoMonto }
    })
  }

  function handleSaldoCambioTextoChange(texto: string) {
    setSaldoCambioTexto(texto)
    const n = parseFloat(texto)
    aplicarSaldoCambio(Number.isFinite(n) ? n : 0)
  }

  function completar(id: Metodo) {
    const otros = asignado - (parseFloat(pagos[id]) || 0)
    let resto = Math.max(0, totalACobrar - otros)
    // El pago con puntos no puede exceder lo canjeable (saldo y tope del ticket).
    if (id === "puntos") resto = Math.min(resto, maxCanjePesos)
    setPagos(p => ({ ...p, [id]: resto.toFixed(2) }))
  }

  // Cambiar de método en un clic: asigna TODO el restante (tras lo ya canjeado en
  // puntos y/o saldo a favor) al método elegido y vacía los otros métodos en
  // pesos. El canje de puntos y el saldo a favor se conservan (se controlan
  // aparte desde sus banners). Para pagos combinados el cajero sigue usando
  // "Completar" o teclea manualmente.
  function pagarTodoAqui(id: Metodo) {
    if (id === "credito" && !tieneCredito) return
    const resto = Math.max(0, totalACobrar - pPuntos - pSaldoCambio)
    setPagos((p) => ({
      ...p,
      efectivo: "", transferencia: "", tarjeta: "", credito: "",
      [id]: resto.toFixed(2),
    }))
  }

  // Cuando se abre el modal de canje con confirmar_huella activo, preparamos el
  // sub-flujo de huella: si el cliente tiene huella, arrancamos en "idle" (pedir
  // dedo); si no, en "sin_huella" (canje directo); si el servicio no está,
  // "no_disponible" (degrada a manual). Ver decisión: canje NO se bloquea.
  useEffect(() => {
    if (!confirmCanje || !cfgMon?.confirmar_huella) return
    let vivo = true
    setFaseHuella("verificando") // provisional mientras consultamos
    setMsgHuella("")
    ;(async () => {
      const cli = state.clienteActivo
      if (!cli?.id) { if (vivo) setFaseHuella("sin_huella"); return }
      // ¿Servicio + lector disponibles?
      const h = await healthBiometria()
      if (!vivo) return
      if (!h?.ok || !h.lector?.conectado) {
        setFaseHuella("no_disponible")
        setMsgHuella("El lector de huella no está disponible en esta caja.")
        return
      }
      // ¿El cliente tiene huella registrada?
      try {
        const huellas = await listarHuellasAPI("cliente", cli.id)
        if (!vivo) return
        setFaseHuella(huellas.length > 0 ? "idle" : "sin_huella")
      } catch {
        if (vivo) setFaseHuella("sin_huella")
      }
    })()
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmCanje, cfgMon?.confirmar_huella])

  // Captura la huella del cliente y la compara 1:1 contra su plantilla en BD.
  async function verificarHuellaCliente() {
    const cli = state.clienteActivo
    if (!cli?.id) { setFaseHuella("sin_huella"); return }
    setFaseHuella("verificando")
    setMsgHuella("")
    try {
      const huellas = await listarHuellasAPI("cliente", cli.id)
      if (huellas.length === 0) { setFaseHuella("sin_huella"); return }
      // Comparamos contra la primera plantilla activa (multi-dedo: se podría
      // iterar, pero 1 basta para v1). El servicio captura del lector y compara.
      const r = await verificar1a1(huellas[0].plantilla_b64)
      capturaHuellaRef.current = r.captura_id
      // Log de auditoría del intento.
      registrarVerificacionAPI({
        accion: "canje_puntos",
        resultado: r.match ? "match" : "no_match",
        sujeto_tipo: "cliente",
        sujeto_ref: cli.id,
        score: r.score,
        umbral: r.umbral,
        caja_id: state.cajero?.caja_id ?? null,
        cajero_id: state.cajero?.id ?? null,
      }).catch(() => {})
      if (r.match) { setFaseHuella("ok") }
      else { setFaseHuella("error"); setMsgHuella("La huella no coincide con el cliente.") }
    } catch (e: any) {
      const be = e as BiometriaError
      setFaseHuella("error")
      if (be?.codigo === "TIMEOUT_DEDO") setMsgHuella("No se detectó el dedo. Reintenta.")
      else if (be?.codigo === "CALIDAD_INSUFICIENTE") setMsgHuella("Calidad baja. Coloca bien el dedo.")
      else if (be?.codigo === "SERVICIO_CAIDO") { setFaseHuella("no_disponible"); setMsgHuella("El lector dejó de responder.") }
      else setMsgHuella(be?.message || "No se pudo verificar la huella.")
    }
  }

  // Llamada real de registro de venta, una vez superada la confirmación de canje.
  async function ejecutarVenta() {
    if (capturaHuellaRef.current) { cancelarBiometria(capturaHuellaRef.current); capturaHuellaRef.current = null }
    setConfirmCanje(false)
    setFaseHuella("idle")
    await finalizarVenta()
  }

  async function handleConfirmar() {
    if (!cubierto || procesando || !state.cajero) return
    if (pCredito > 0 && !state.clienteActivo) return
    if (pPuntos > 0 && !state.clienteActivo) return
    if (pSaldoCambio > 0 && !state.clienteActivo) return
    // Validación de canje contra saldo/tope antes de tocar el backend.
    if (pPuntos > maxCanjePesos + 0.01) {
      setError(`Con puntos solo puedes cubrir ${fmt(maxCanjePesos)} de este ticket`)
      return
    }
    // Validación de saldo a favor contra lo disponible antes de tocar el backend.
    if (pSaldoCambio > saldoCambioDisponible + 0.01) {
      setError(`Con saldo a favor solo puedes cubrir ${fmt(saldoCambioDisponible)} de este ticket`)
      return
    }
    // Venta por encargo: la ficha se llena al ENTRAR al cobro (define el anticipo).
    // Si por algún motivo aún no está, reabrirla en vez de cobrar.
    if (hayEncargo && !datosFicha) { setFichaAbierta(true); return }
    // Si la config exige confirmación (huella/código), abrir el modal de canje.
    if (requiereConfirmCanje) { setConfirmCanje(true); return }
    await finalizarVenta()
  }

  // La ficha de encargo quedó llena: guardamos los datos (definen el anticipo) y
  // volvemos al modal, que ahora exige cobrar solo la parte-con-stock + anticipo.
  // NO se cobra automáticamente: el cajero teclea el pago del anticipo y confirma.
  function onFichaConfirmada(datos: DatosFichaEncargo) {
    setDatosFicha(datos)
    setFichaAbierta(false)
  }

  // Cancelar la ficha = cancelar el cobro por encargo (no tiene sentido cobrar sin
  // la ficha). Cierra todo el modal de cobro.
  function onFichaCancelada() {
    setFichaAbierta(false)
    onCerrar()
  }

  // Entrega confirmada. finalizarVenta() adjunta entrega_ficha con la bandera
  // `pagada`. Contra entrega → el backend registra por_cobrar (no exige pago).
  // Pagada → la venta se cobra hoy (los métodos ya cubren el total; el botón que
  // abre esta ficha solo se habilita con el pago cubierto).
  async function onFichaEntregaConfirmada(datos: DatosFichaEntrega) {
    datosEntregaRef.current = datos
    setFichaEntregaAbierta(false)
    // Flete = LÍNEA de la venta (SKU SERVICIO-FLETE). Al confirmar la ficha con
    // flete, lo agregamos al carrito (para que el total/ticket lo reflejen) Y lo
    // pasamos explícito a finalizarVenta (el state.items de esta misma pasada aún
    // no incluye el dispatch, así que sin pasarlo el backend no lo recibiría).
    let lineaFlete: CartItem | null = null
    const precioFlete = Number(datos.flete?.precio) || 0
    if (precioFlete > 0 && fleteConfig) {
      dispatch({
        type: "SET_FLETE",
        sku: fleteConfig.sku || SKU_FLETE,
        descripcion: fleteConfig.nombre || "Servicio de flete",
        precio: precioFlete,
        impuesto: fleteConfig.aplicaIva,
      })
      lineaFlete = {
        sku: fleteConfig.sku || SKU_FLETE,
        descripcion: fleteConfig.nombre || "Servicio de flete",
        precio: Math.round(precioFlete * 100) / 100,
        cantidad: 1,
        existencia: 0,
        impuesto: fleteConfig.aplicaIva,
        esFlete: true,
      }
    }
    await finalizarVenta(lineaFlete)
  }

  async function finalizarVenta(lineaFleteExtra?: CartItem | null) {
    if (!state.cajero) return
    setProcesando(true)
    setError(null)
    try {
      // El flete se agrega como una línea más. Se pasa explícito (no vía state)
      // porque el dispatch SET_FLETE no se refleja en state.items en esta misma
      // pasada. Si ya estuviera en el carrito (raro), no lo duplicamos.
      const ventaItems = lineaFleteExtra && !state.items.some((i) => i.esFlete)
        ? [...state.items, lineaFleteExtra]
        : state.items
      const ventaCliente = state.clienteActivo
      // Diagnóstico (Bug: venta sin cliente pese a estar elegido): registra el
      // cliente EXACTO que se enviará en el payload, en el momento del cobro. Si
      // esto sale null pero el cajero veía un cliente, comparar con la traza de
      // [POS clienteActivo] en pos-store para ver dónde se perdió. Quitar tras diagnosticar.
      // eslint-disable-next-line no-console
      console.info(
        `[POS cobro] registrando venta — cliente:`,
        ventaCliente ? `${ventaCliente.nombre} (${ventaCliente.id})` : "∅ público en general"
      )
      // El cargo a crédito lo registra el backend de forma TRANSACCIONAL dentro
      // de POST /caja/ventas (dentro del lock de la venta). Por eso enviamos
      // cliente_id/plazo y ya NO llamamos a agregarMovimientoCredito por separado:
      // así nunca queda un cargo huérfano si la venta falla, ni una venta sin cargo.
      const venta = await registrarVenta({
        cajero: state.cajero.nombre,
        turno_id: state.cajero.turno_id,
        // Caja física de la venta (del cajero logueado) → el corte agrupa por aquí.
        caja_id: state.cajero.caja_id ?? null,
        caja_name: state.cajero.caja_nombre ?? null,
        // Vendedor de la venta: el elegido en el panel (atribución) o el cajero
        // logueado por defecto. No afecta el corte (que agrupa por caja).
        vendedor: state.vendedorVenta?.nombre ?? state.cajero.nombre,
        items: ventaItems.map((i) => ({
          // Artículo especial (granel): el `sku` de la línea es compuesto
          // (`PADRE::presId`) para separar presentaciones en el carrito, pero el
          // backend descuenta inventario por el SKU REAL (`granelSku`).
          sku: i.esGranel && i.granelSku ? i.granelSku : i.sku,
          descripcion: i.descripcion,
          cantidad: i.cantidad,
          // Precio unitario ya con promoción aplicada (gana sobre mayoreo).
          precio_unitario: precioUnitEfectivo(i),
          // Traza del paquete (si la línea proviene de un paquete vendido).
          ...(i.paquete_id ? { paquete_id: i.paquete_id, paquete_nombre: i.paquete_nombre } : {}),
          // Artículo especial (granel): inventario informativo. `granel_descuento` =
          // cantidad × factor de la presentación (en unidad base). El backend
          // descuenta eso sin validar ni bloquear (puede ir a negativo).
          ...(i.esGranel
            ? {
                granel: true,
                granel_descuento: i.granelFactor ? Math.round(i.cantidad * i.granelFactor * 1000) / 1000 : 0,
                presentacion: i.presentacion ?? "",
              }
            : {}),
          // Venta por encargo. Dos sabores:
          //  - MIXTO (esEncargo o cantidad > stock): el backend vende lo que hay y
          //    encarga el faltante. Enviamos `existencia` para que parta la línea.
          //  - REPOSICIÓN (no_descontar): no toca inventario; todo se encarga.
          ...(esLineaEncargo(i)
            ? {
                encargo: true,
                existencia: i.existencia,
                proveedor_id: i.proveedor_id ?? "",
                proveedor: i.proveedor ?? "",
                ...(modoReposicion ? { no_descontar: true } : {}),
              }
            : {}),
        })),
        pago_efectivo: pEfectivo,
        pago_transferencia: pTransferencia,
        pago_tarjeta: pTarjeta,
        pago_credito: pCredito,
        // Monedero: pago con puntos (MXN) y puntos a ganar (los calcula el motor
        // del frontend; el backend valida el canje y registra ambos movimientos).
        ...(pPuntos > 0 ? { pago_puntos: pPuntos } : {}),
        ...(puntosAGanar > 0 ? { puntos_ganados: puntosAGanar } : {}),
        // Saldo a favor por cambio (ferremex_saldo_cambio): 1:1 con pesos, sin
        // tasa de conversión. El backend valida saldo disponible y registra el
        // consumo transaccionalmente.
        ...(pSaldoCambio > 0 ? { pago_saldo_cambio: pSaldoCambio } : {}),
        // El cliente se envía SIEMPRE que haya uno seleccionado (no solo cuando
        // hay crédito/puntos). Así la venta queda atribuida al cliente —necesario
        // para facturar nominativo y para distinguir en el historial—. El `plazo`
        // solo aplica cuando hay cargo a crédito.
        ...(ventaCliente
          ? {
              cliente_id: ventaCliente.id,
              cliente_nombre: ventaCliente.nombre,
              ...(pCredito > 0 ? { plazo: ventaCliente.dias_credito } : {}),
            }
          : {}),
        // Ficha de encargo (venta sobre pedido): si el cajero la llenó, se adjunta
        // para que el backend cree la EncargoFicha del módulo "Encargos". Incluye
        // el anticipo (define lo cobrado hoy) y si la resta va a cartera.
        ...(datosFicha
          ? {
              encargo_ficha: {
                cliente_nombre: datosFicha.cliente_nombre,
                telefono: datosFicha.telefono,
                motivo: datosFicha.motivo,
                tiempo_entrega: datosFicha.tiempo_entrega,
                correo: datosFicha.correo ?? null,
                notas: datosFicha.notas ?? null,
                anticipo: datosFicha.anticipo,
                resta_a_cartera: datosFicha.resta_a_cartera,
              },
            }
          : {}),
        // Ficha de entrega a domicilio. Si `pagada`, la venta se cobra hoy normal
        // (los métodos de pago ya cubren el total) y la ficha es solo logística.
        // Si no, es contra entrega: el backend la registra por_cobrar (sin cobro hoy).
        ...(datosEntregaRef.current
          ? {
              entrega_ficha: {
                pagada: datosEntregaRef.current.pagada ?? false,
                direccion: datosEntregaRef.current.direccion,
                recibe: datosEntregaRef.current.recibe,
                paga: datosEntregaRef.current.paga,
                comentarios: datosEntregaRef.current.comentarios ?? "",
                // Con cuánto pagará al recibir (contra entrega) → cambio del repartidor.
                ...(datosEntregaRef.current.paga_con != null
                  ? { paga_con: datosEntregaRef.current.paga_con }
                  : {}),
                // NOTA: el flete YA NO va aquí. Ahora es una LÍNEA de la venta
                // (SKU SERVICIO-FLETE) → suma al total, aparece en el ticket y es
                // facturable. Ver onFichaEntregaConfirmada + SET_FLETE.
              },
            }
          : {}),
      })
      // Si la venta nació de una cotización cargada, enlázala (trazabilidad).
      // No es crítico para la venta: si falla, la venta ya quedó registrada.
      if (state.cotizacionCargadaFolio) {
        try {
          await marcarCotizacionConvertida(state.cotizacionCargadaFolio, venta.folio)
        } catch { /* la venta es lo importante; el enlace es best-effort */ }
      }
      if (pEfectivo > 0) {
        // Abre el cajón por el servicio local (la térmica USB no tiene puerto COM,
        // así que el pulso ESC/POS sale por la cola de Windows). Best-effort: si
        // no hay servicio/impresora, la venta continúa igual.
        try { await abrirCajonLocal() } catch { /* sin cajón, continuar */ }
      }
      dispatch({ type: "CLEAR" })
      onVentaCompletada(venta)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido")
      setProcesando(false)
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onCerrar() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onCerrar])

  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={() => !procesando && onCerrar()}>
      <div
        className="relative w-full max-w-2xl max-h-[92vh] overflow-y-auto bg-white rounded-2xl shadow-2xl border-t-4 border-orange-500"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Encabezado */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4">
          <h2 className="text-xl font-bold text-gray-900">Cobro</h2>
          <button onClick={onCerrar} disabled={procesando}
            className="w-9 h-9 p-0 inline-flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 disabled:opacity-40">
            <X size={20} />
          </button>
        </div>

        <div className="px-6 pb-6 flex flex-col gap-4">
          {/* Resumen de items */}
          <div className="bg-gray-50 border border-gray-100 rounded-xl divide-y divide-gray-100 max-h-40 overflow-y-auto">
            {state.items.map((i) => {
              const linea = promosCarrito.get(claveLinea(i))
              const importe = linea ? linea.importe : efectivoPrecio(i) * i.cantidad
              return (
                <div key={i.sku} className="flex items-start justify-between gap-3 px-4 py-2.5 text-sm">
                  <span className="text-gray-700">
                    {i.descripcion} <span className="text-gray-400">× {i.cantidad}</span>
                    {linea?.promo && <span className="ml-1 text-xs font-medium text-orange-600">· {linea.etiqueta}</span>}
                  </span>
                  <span className="font-medium text-gray-900 whitespace-nowrap">{fmt(importe)}</span>
                </div>
              )
            })}
          </div>

          {/* Aviso de encargo: cuando hay resta diferida, aclarar que hoy se cobra
              solo la parte con stock + anticipo (el total del carrito es mayor). */}
          {restaEncargo > 0 && (
            <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-2.5 flex flex-col gap-1 text-sm">
              <div className="flex items-center justify-between text-gray-500">
                <span>Total del carrito</span><span className="tabular-nums">{fmt(total)}</span>
              </div>
              <div className="flex items-center justify-between text-orange-700">
                <span className="inline-flex items-center gap-1"><ClipboardList size={14} /> Resta de encargo (al entregar)</span>
                <span className="font-semibold tabular-nums">−{fmt(restaEncargo)}</span>
              </div>
            </div>
          )}

          {/* Total — con desglose cuando se aplican puntos y/o saldo a favor
              (Total − puntos − saldo a favor = a pagar) */}
          {(pPuntos > 0 || pSaldoCambio > 0) ? (
            <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-3 flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-sm text-gray-500">
                <span>{restaEncargo > 0 ? "A cobrar hoy" : "Total"}</span>
                <span className="font-medium text-gray-700">{fmt(totalACobrar)}</span>
              </div>
              {pPuntos > 0 && (
                <div className="flex items-center justify-between text-sm text-amber-700">
                  <span className="inline-flex items-center gap-1">
                    <Coins size={14} /> Puntos aplicados ({puntosUsados.toLocaleString("es-MX", { maximumFractionDigits: 2 })} pts)
                  </span>
                  <span className="font-semibold">−{fmt(pPuntos)}</span>
                </div>
              )}
              {pSaldoCambio > 0 && (
                <div className="flex items-center justify-between text-sm text-teal-700">
                  <span className="inline-flex items-center gap-1">
                    <RotateCcw size={14} /> Saldo a favor aplicado
                  </span>
                  <span className="font-semibold">−{fmt(pSaldoCambio)}</span>
                </div>
              )}
              <div className="h-px bg-gray-200 my-0.5" />
              <div className="flex items-end justify-between">
                <span className="text-sm font-medium text-gray-500 uppercase tracking-wide">A pagar</span>
                <span className="text-4xl font-black text-orange-600 leading-none">{fmt(Math.max(0, totalACobrar - pPuntos - pSaldoCambio))}</span>
              </div>
            </div>
          ) : (
            <div className="flex items-end justify-between">
              <span className="text-sm font-medium text-gray-500 uppercase tracking-wide">{restaEncargo > 0 ? "A cobrar hoy" : "Total"}</span>
              <span className="text-4xl font-black text-orange-600 leading-none">{fmt(totalACobrar)}</span>
            </div>
          )}

          {/* ── Banner de canje de puntos ──────────────────────────────────
              Aparece cuando el cliente tiene puntos canjeables. Permite usar
              todos o una cantidad parcial; el monto canjeado descuenta de lo que
              se paga con los demás métodos. */}
          {puedeUsarPuntos && cfgMon && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3">
                <span className="w-10 h-10 p-0 inline-flex items-center justify-center rounded-lg bg-amber-100 text-amber-600 shrink-0">
                  <Wallet size={20} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-amber-900">Monedero del cliente</div>
                  <div className="text-xs text-amber-700">
                    {saldoPuntos.toLocaleString("es-MX")} pts disponibles · equivalen a {fmt(saldoPesos)}
                  </div>
                </div>
                {pPuntos > 0 ? (
                  <button
                    onClick={() => { aplicarPuntos(0, { sincronizarTexto: true }); setCanjeAbierto(false) }}
                    className="inline-flex items-center gap-1.5 bg-white border border-amber-300 text-amber-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-amber-100">
                    <RotateCcw size={14} /> Quitar
                  </button>
                ) : (
                  <button
                    onClick={() => { setCanjeAbierto(true); aplicarPuntos(maxCanjePuntos, { sincronizarTexto: true }) }}
                    className="inline-flex items-center gap-1.5 bg-amber-500 text-white px-3.5 py-2 rounded-lg text-sm font-semibold hover:bg-amber-600">
                    <Coins size={15} /> Usar puntos
                  </button>
                )}
              </div>

              {/* Control de cantidad (slider + atajos), visible al activar canje */}
              {(canjeAbierto || pPuntos > 0) && (
                <div className="px-4 pb-3 pt-1 border-t border-amber-100 bg-amber-50/60">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-amber-700">Puntos a usar</span>
                    <span className="text-sm font-bold text-amber-900">
                      {puntosUsados.toLocaleString("es-MX", { maximumFractionDigits: 2 })} pts = {fmt(pPuntos)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      className="w-24 text-right text-sm font-bold text-gray-900 bg-white border border-amber-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-amber-500"
                      value={puntosTexto}
                      onChange={(e) => {
                        // Solo dígitos y un separador decimal (. o ,); deja pasar
                        // estados intermedios como "1." o "" sin forzar el número.
                        const limpio = e.target.value.replace(/[^0-9.,]/g, "").replace(",", ".")
                        if ((limpio.match(/\./g) || []).length > 1) return
                        handlePuntosTextoChange(limpio)
                      }}
                      onBlur={() => {
                        // Al salir del campo, re-sincroniza el texto con el valor
                        // realmente aplicado (formateado, dentro del tope).
                        setPuntosTexto(puntosUsados > 0 ? String(puntosUsados) : "")
                      }}
                      placeholder="0"
                    />
                    <span className="text-xs text-gray-500">pts</span>
                    <button
                      onClick={() => aplicarPuntos(maxCanjePuntos, { sincronizarTexto: true })}
                      className="ml-auto text-xs font-medium text-amber-700 border border-amber-300 rounded-lg px-3 py-1.5 hover:bg-amber-100">
                      Usar todos ({maxCanjePuntos.toLocaleString("es-MX", { maximumFractionDigits: 2 })})
                    </button>
                  </div>
                  {maxCanjePuntos < saldoPuntos && (
                    <p className="text-[11px] text-amber-600 mt-2 leading-tight">
                      Máx {maxCanjePuntos.toLocaleString("es-MX", { maximumFractionDigits: 2 })} pts en este ticket (tope {cfgMon.max_canje_pct}% del total).
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Cliente con puntos pero por debajo del mínimo para canjear */}
          {bajoMinimo && cfgMon && (
            <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500">
              <Wallet size={14} className="text-gray-400 shrink-0" />
              El cliente tiene {saldoPuntos.toLocaleString("es-MX")} pts, pero se requieren {cfgMon.min_puntos_canje} para canjear.
            </div>
          )}

          {/* ── Banner de saldo a favor por cambio ───────────────────────────
              Concepto de negocio DISTINTO al Monedero: se acredita al cambiar un
              artículo por otro de menor valor. Aparece si el cliente activo tiene
              saldo disponible. 1:1 con pesos — sin conversión ni tasa. */}
          {puedeUsarSaldoCambio && (
            <div className="rounded-xl border border-teal-200 bg-teal-50 overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3">
                <span className="w-10 h-10 p-0 inline-flex items-center justify-center rounded-lg bg-teal-100 text-teal-600 shrink-0">
                  <RotateCcw size={20} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-teal-900">Saldo a favor por cambio</div>
                  <div className="text-xs text-teal-700">
                    {fmt(saldoCambioDisponible)} disponibles
                  </div>
                </div>
                {pSaldoCambio > 0 ? (
                  <button
                    onClick={() => { aplicarSaldoCambio(0, { sincronizarTexto: true }); setSaldoCambioAbierto(false) }}
                    className="inline-flex items-center gap-1.5 bg-white border border-teal-300 text-teal-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-teal-100">
                    <X size={14} /> Quitar
                  </button>
                ) : (
                  <button
                    onClick={() => { setSaldoCambioAbierto(true); aplicarSaldoCambio(maxSaldoCambio, { sincronizarTexto: true }) }}
                    className="inline-flex items-center gap-1.5 bg-teal-500 text-white px-3.5 py-2 rounded-lg text-sm font-semibold hover:bg-teal-600">
                    <RotateCcw size={15} /> Usar saldo
                  </button>
                )}
              </div>

              {/* Control de monto, visible al activar el uso del saldo */}
              {(saldoCambioAbierto || pSaldoCambio > 0) && (
                <div className="px-4 pb-3 pt-1 border-t border-teal-100 bg-teal-50/60">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-teal-700">Monto a usar</span>
                    <span className="text-sm font-bold text-teal-900">{fmt(pSaldoCambio)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      className="w-24 text-right text-sm font-bold text-gray-900 bg-white border border-teal-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-teal-500"
                      value={saldoCambioTexto}
                      onChange={(e) => {
                        const limpio = e.target.value.replace(/[^0-9.,]/g, "").replace(",", ".")
                        if ((limpio.match(/\./g) || []).length > 1) return
                        handleSaldoCambioTextoChange(limpio)
                      }}
                      onBlur={() => {
                        setSaldoCambioTexto(pSaldoCambio > 0 ? String(pSaldoCambio) : "")
                      }}
                      placeholder="0.00"
                    />
                    <span className="text-xs text-gray-500">MXN</span>
                    <button
                      onClick={() => aplicarSaldoCambio(maxSaldoCambio, { sincronizarTexto: true })}
                      className="ml-auto text-xs font-medium text-teal-700 border border-teal-300 rounded-lg px-3 py-1.5 hover:bg-teal-100">
                      Usar todo ({fmt(maxSaldoCambio)})
                    </button>
                  </div>
                  {maxSaldoCambio < saldoCambioDisponible && (
                    <p className="text-[11px] text-teal-600 mt-2 leading-tight">
                      Máx {fmt(maxSaldoCambio)} en este ticket (no puede exceder el total a cobrar).
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          <p className="text-sm text-gray-500 -mb-1">
            {(pPuntos > 0 || pSaldoCambio > 0) ? "Cobra el resto con:" : "Selecciona una forma de pago o combínalas:"}
          </p>

          {/* Métodos de pago como tarjetas */}
          <div className="grid grid-cols-2 gap-3">
            {METODOS.map(({ id, label, icon: Icon }) => {
              const disabled = id === "credito" && !tieneCredito
              const activo   = (parseFloat(pagos[id]) || 0) > 0
              const restante = Math.max(0, totalACobrar - asignado + (parseFloat(pagos[id]) || 0))

              return (
                <div key={id}
                  role={disabled ? undefined : "button"}
                  // Clic en la tarjeta = "pagar todo aquí": mueve el total restante a
                  // este método y vacía los otros. El input y "Completar" frenan la
                  // propagación para conservar su propio comportamiento (manual/combinado).
                  onClick={disabled ? undefined : () => pagarTodoAqui(id)}
                  title={disabled ? undefined : `Pagar todo con ${label}`}
                  className={`rounded-xl border-2 p-3 transition-colors ${
                    disabled
                      ? "border-gray-100 bg-gray-50 opacity-60"
                      : activo
                        ? "border-orange-500 bg-orange-50 cursor-pointer"
                        : "border-gray-200 bg-white hover:border-gray-300 cursor-pointer"
                  }`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`w-8 h-8 p-0 inline-flex items-center justify-center rounded-lg shrink-0 ${
                      activo ? "bg-orange-500 text-white" : "bg-gray-100 text-gray-500"
                    }`}>
                      <Icon size={17} />
                    </span>
                    <span className="text-sm font-semibold text-gray-800">{label}</span>
                  </div>

                  {id === "credito" && !tieneCredito && (
                    <p className="text-[11px] text-gray-400 mb-1.5 leading-tight">Requiere cliente con crédito</p>
                  )}

                  <input
                    ref={id === "efectivo" ? efectivoRef : undefined}
                    type="text"
                    inputMode="decimal"
                    className="w-full text-right text-lg font-bold text-gray-900 bg-white border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-orange-500 disabled:opacity-40 disabled:bg-gray-50"
                    value={pagos[id]}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setPagos(p => ({ ...p, [id]: saneaMonto(e.target.value) }))}
                    placeholder="$0.00"
                    disabled={disabled}
                  />

                  {!disabled && !cubierto && (
                    <button
                      onClick={(e) => { e.stopPropagation(); completar(id) }}
                      className="mt-2 w-full text-xs font-medium text-orange-600 border border-orange-200 rounded-lg py-1.5 hover:bg-orange-50">
                      Completar {fmt(restante)}
                    </button>
                  )}

                  {id === "efectivo" && activo && cubierto && cambio >= 0.01 && (
                    <p className="mt-1.5 text-[11px] text-gray-500 text-center">
                      Cambio: <strong className="text-gray-700">{fmt(cambio)}</strong>
                    </p>
                  )}
                </div>
              )
            })}
          </div>

          {/* Preview de puntos a ganar */}
          {puntosAGanar > 0 && (
            <div className="flex items-center justify-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-sm text-amber-800">
              <Sparkles size={16} className="text-amber-500 shrink-0" />
              Ganará <strong>{puntosAGanar.toLocaleString("es-MX")} puntos</strong> con esta compra
            </div>
          )}

          {/* Barra de progreso + estado de cobertura */}
          {!cubierto ? (
            <div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-2">
                <div className="h-full bg-orange-500 rounded-full transition-all" style={{ width: `${pctCubierto}%` }} />
              </div>
              <div className="flex items-center justify-between text-sm bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                <span className="text-red-600">Falta por cubrir</span>
                <strong className="text-red-700">{fmt(pendiente)}</strong>
              </div>
            </div>
          ) : cambio >= 0.01 && pTransferencia === 0 && pTarjeta === 0 && pCredito === 0 && pPuntos === 0 && pSaldoCambio === 0 ? (
            <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-4 py-3">
              <span className="text-sm font-medium text-green-700">Cambio</span>
              <span className="text-2xl font-black text-green-600">{fmt(cambio)}</span>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm font-medium text-green-700">
              <Check size={16} /> Pago completo
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
              <AlertCircle size={16} className="shrink-0 mt-0.5" /> {error}
            </div>
          )}

          {/* Entrega a domicilio (solo en venta normal, sin encargo). Dos opciones:
              — "Pagar y enviar": el cliente paga AHORA (total o un ABONO parcial) y
                se envía; la resta la cobra el repartidor. Habilitado con cualquier
                pago capturado (> $0); no exige cubrir el total.
              — "Cobrar contra entrega": nada hoy, todo se cobra al entregar. */}
          {!hayEncargo && (
            <div className="flex flex-col gap-2">
              <button
                onClick={() => { setEntregaPagada(true); setFichaEntregaAbierta(true) }}
                disabled={procesando || state.items.length === 0 || asignado <= 0}
                title={asignado <= 0 ? "Captura el pago o abono con un método antes de enviar" : undefined}
                className="w-full inline-flex items-center justify-center gap-2 bg-white border-2 border-green-300 text-green-700 px-4 py-3 rounded-xl text-sm font-bold hover:bg-green-50 disabled:opacity-40 disabled:cursor-not-allowed">
                <Truck size={18} /> {cubierto ? "Pagar y enviar a domicilio" : "Abonar y enviar (resta al entregar)"}
              </button>
              <button
                onClick={() => { setEntregaPagada(false); setFichaEntregaAbierta(true) }}
                disabled={procesando || state.items.length === 0 || asignado > 0}
                title={asignado > 0 ? "Ya capturaste un pago/abono. Usa \"Abonar y enviar\" en su lugar." : undefined}
                className="w-full inline-flex items-center justify-center gap-2 bg-white border-2 border-orange-300 text-orange-700 px-4 py-3 rounded-xl text-sm font-bold hover:bg-orange-50 disabled:opacity-40 disabled:cursor-not-allowed">
                <Truck size={18} /> Cobrar contra entrega (a domicilio)
              </button>
            </div>
          )}

          {/* Acciones */}
          <div className="flex gap-3 pt-1">
            <button
              onClick={onCerrar}
              disabled={procesando}
              className="flex-1 inline-flex items-center justify-center gap-2 bg-white border border-gray-300 text-gray-700 px-4 py-3 rounded-xl text-sm font-medium hover:bg-gray-50 disabled:opacity-40">
              Cancelar
            </button>
            <button
              onClick={handleConfirmar}
              disabled={!cubierto || procesando}
              className="flex-[2] inline-flex items-center justify-center gap-2 bg-green-600 text-white px-4 py-3 rounded-xl text-sm font-bold hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed">
              {procesando ? "Procesando…" : <><Check size={18} /> Confirmar y ticket</>}
            </button>
          </div>
        </div>
      </div>

      {/* Ficha de encargo (venta sobre pedido): se abre antes de finalizar el cobro
          cuando hay líneas por encargo. Al confirmarla, el cobro continúa. */}
      {fichaAbierta && (
        <FichaEncargoModal
          onCancelar={onFichaCancelada}
          onConfirmar={onFichaConfirmada}
        />
      )}

      {/* Ficha de entrega a domicilio. Pagada → la venta se cobra hoy (total o
          abono); la resta la cobra el repartidor. Contra entrega → por_cobrar.
          `totalACobrar` (no `total`) es el monto de referencia; hoy coinciden
          porque las entregas están gateadas por `!hayEncargo`. `abonado` = lo ya
          capturado (para calcular la resta a mostrar). */}
      {fichaEntregaAbierta && (
        <FichaEntregaModal
          total={totalACobrar}
          pagada={entregaPagada}
          abonado={entregaPagada ? asignado : 0}
          precioBaseFlete={fleteConfig?.precioBase ?? 0}
          nombreFlete={fleteConfig?.nombre ?? "Servicio de flete"}
          onCancelar={() => setFichaEntregaAbierta(false)}
          onConfirmar={onFichaEntregaConfirmada}
        />
      )}

      {/* Confirmación de canje de puntos (huella / código de barras). Mientras el
          lector no esté conectado, la confirmación se simula: huella con un botón,
          código pidiendo el # de cliente. Configurable en Monedero → Configuración. */}
      {confirmCanje && cfgMon && (
        <div className="fixed inset-0 z-[700] flex items-center justify-center p-4 bg-black/50"
          onClick={() => !procesando && setConfirmCanje(false)}>
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border-t-4 border-orange-500 p-6"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-9 h-9 p-0 inline-flex items-center justify-center rounded-lg bg-orange-100 text-orange-600">
                <Lock size={18} />
              </span>
              <h2 className="text-lg font-bold text-gray-900">Confirmar uso de puntos</h2>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              El cliente canjeará <strong>{puntosUsados.toLocaleString("es-MX", { maximumFractionDigits: 2 })} puntos</strong> ({fmt(pPuntos)}).
            </p>

            {cfgMon.confirmar_huella && (
              <div className="text-center my-4 flex flex-col items-center gap-2">
                {/* idle: pedir el dedo */}
                {faseHuella === "idle" && (
                  <>
                    <div className="text-sm text-gray-500">Verifica la huella del cliente</div>
                    <HuellaAnimacion estado="escaneo" size={120} />
                    <button
                      onClick={verificarHuellaCliente}
                      className="mt-1 bg-orange-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-orange-700 inline-flex items-center gap-2">
                      <Fingerprint size={17} /> Verificar huella
                    </button>
                  </>
                )}
                {/* verificando */}
                {faseHuella === "verificando" && (
                  <>
                    <HuellaAnimacion estado="escaneo" size={120} />
                    <div className="text-sm text-orange-600 font-semibold">Coloca el dedo en el lector…</div>
                  </>
                )}
                {/* ok */}
                {faseHuella === "ok" && (
                  <>
                    <HuellaAnimacion estado="exito" size={120} />
                    <div className="text-sm text-green-600 font-bold">Huella verificada ✓</div>
                  </>
                )}
                {/* error → reintentar */}
                {faseHuella === "error" && (
                  <>
                    <HuellaAnimacion estado="error" size={120} />
                    <div className="text-sm text-red-600">{msgHuella}</div>
                    <button
                      onClick={verificarHuellaCliente}
                      className="mt-1 bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-orange-700">
                      Reintentar
                    </button>
                  </>
                )}
                {/* sin huella → canje directo, con nota del futuro código de barras */}
                {faseHuella === "sin_huella" && (
                  <div className="text-center bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <div className="text-sm text-amber-700 font-medium">Este cliente no tiene huella registrada.</div>
                    <div className="text-[11px] text-amber-600 mt-1">Puedes continuar el canje. (Próximamente: verificación por código de barras / tarjeta.)</div>
                  </div>
                )}
                {/* servicio/lector caído → degradar a manual */}
                {faseHuella === "no_disponible" && (
                  <div className="text-center bg-gray-50 border border-gray-200 rounded-lg p-3">
                    <div className="text-sm text-gray-600 font-medium">{msgHuella}</div>
                    <div className="text-[11px] text-gray-400 mt-1">Puedes confirmar el canje manualmente.</div>
                  </div>
                )}
              </div>
            )}

            {cfgMon.confirmar_codigo && (
              <div className="my-4">
                <label className="flex items-center gap-1.5 text-sm text-gray-600 mb-2">
                  <ScanLine size={15} className="text-gray-400" /> Escanea la tarjeta o teclea el # de cliente
                </label>
                <input
                  className="w-full text-right text-lg font-bold text-gray-900 bg-white border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-orange-500"
                  autoFocus
                  placeholder="# de cliente"
                  value={codigoConfirm}
                  onChange={(e) => setCodigoConfirm(e.target.value)}
                />
                {codigoConfirm && state.clienteActivo && codigoConfirm.trim() !== state.clienteActivo.num_cliente && (
                  <p className="mt-1.5 text-sm text-red-600">El código no coincide con el cliente activo.</p>
                )}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setConfirmCanje(false)}
                disabled={procesando}
                className="flex-1 inline-flex items-center justify-center bg-white border border-gray-300 text-gray-700 px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 disabled:opacity-40">
                Cancelar
              </button>
              <button
                onClick={ejecutarVenta}
                disabled={
                  procesando ||
                  // Gate de código de barras (# de cliente).
                  (cfgMon.confirmar_codigo &&
                    (!state.clienteActivo || codigoConfirm.trim() !== state.clienteActivo.num_cliente)) ||
                  // Gate de huella: si se exige y el cliente TIENE huella, debe haber
                  // coincidido. Si no tiene huella o el lector no está, el canje procede.
                  (cfgMon.confirmar_huella &&
                    (faseHuella === "idle" || faseHuella === "verificando" || faseHuella === "error"))
                }
                className="flex-[2] inline-flex items-center justify-center gap-2 bg-green-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed">
                {procesando ? "Procesando…" : <><Check size={17} /> Confirmar canje</>}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
