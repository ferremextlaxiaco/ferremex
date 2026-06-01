import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { usePOS } from "../lib/pos-store";
import { obtenerUsuarios, listarVentas, listarMovimientos, crearMovimiento, listarCajasAPI } from "../lib/client";
import { formatMXN } from "../lib/format";
import {
  PlusCircle, Store, User, Banknote, CreditCard, ArrowLeftRight, Star,
  ChevronDown, TrendingDown, TrendingUp, X, SearchX,
  ChevronLeft, ChevronRight, Wallet,
} from "lucide-react";

// ─── CONSTANTES ───────────────────────────────────────────────────────────────

// El catálogo de cajas vive en la BD (módulo ferremex_cajas), compartido entre
// terminales. Se carga vía listarCajasAPI(). Antes estaba en localStorage
// (`pos_cajas_catalogo`), aislado por navegador; esa deuda quedó saldada.

// Fecha de "hoy" calculada como función (no constante de módulo) para que una
// terminal abierta pasada la medianoche no quede anclada al día anterior.
function getTodayStr() {
  return new Date().toISOString().slice(0, 10);
}
// Snapshot inicial para los componentes de calendario (se navega manualmente).
const today = new Date();
const todayStr = getTodayStr();

// Persistencia de movimientos manuales de caja: ahora viven en el backend
// (/caja/movimientos vía lib/json-store), compartidos entre terminales y
// agrupables por turno para el corte/arqueo. Antes vivían en localStorage por
// día y por terminal (aislados); esa deuda quedó saldada.

// ─── VENTA → MOVEMENT TRANSFORM ──────────────────────────────────────────────

function ventaToMovement(venta, cajerosList, cajasList) {
  const employee = cajerosList.find(u => u.nombre === venta.cajero);
  // La caja asignada al empleado viene como caja_id (BD). Resolvemos el objeto
  // caja por id para obtener su nombre; si no hay asignación, queda sin caja.
  const cajaObj = employee?.caja_id
    ? cajasList.find(c => String(c.id) === String(employee.caja_id)) ?? null
    : null;
  const cajaNombre = cajaObj?.nombre ?? null;

  const fecha = new Date(venta.fecha);
  const timeStr = `${String(fecha.getHours()).padStart(2, "0")}:${String(fecha.getMinutes()).padStart(2, "0")}`;

  const methods = [];
  if (venta.pago_efectivo > 0) methods.push("efectivo");
  if (venta.pago_transferencia > 0) methods.push("transferencia");
  if (venta.pago_credito > 0) methods.push("credito");
  const method = methods.length === 1 ? methods[0] : methods.length > 1 ? "mixto" : "efectivo";

  const firstItem = venta.items[0]?.descripcion ?? "";
  const extra = venta.items.length > 1 ? ` · +${venta.items.length - 1} art.` : "";

  return {
    id: `venta-${venta.folio}`,
    date: venta.fecha.slice(0, 10),
    time: timeStr,
    origin: "VENTA",
    desc: `${venta.folio} — ${firstItem}${extra}`,
    method,
    amount: venta.total,
    cajaId: cajaObj ? String(cajaObj.id) : null,
    cajaName: cajaNombre ?? "—",
    cajeroId: employee?.id ?? venta.cajero,
    cajeroName: employee?.alias?.trim() || venta.cajero,
    folio: venta.folio,
    estado: venta.estado,
    pago_efectivo: venta.pago_efectivo,
    pago_transferencia: venta.pago_transferencia,
    pago_credito: venta.pago_credito,
    cambio: venta.cambio,
    items: venta.items,
  };
}

const CATEGORIES_SALIDA  = ["Gastos operativos", "Compra sin factura", "Retiro", "Servicio externo", "Otro gasto"];
const CATEGORIES_ENTRADA = ["Reposición de fondo", "Abono de cliente", "Fondo extra", "Otro ingreso"];
const CATEGORIES_FONDO   = ["Fondo inicial", "Fondo de apertura"];

const MONTH_NAMES_ES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DAY_NAMES_ES   = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function formatDateLabel(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" });
}

function formatDateLong(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function isFuture(dateStr) {
  return dateStr > todayStr;
}

function calcEffectiveSaldo(movements, openingFloat) {
  const eff = movements.filter(m => m.method === "efectivo");
  return openingFloat + eff.reduce((sum, m) => sum + m.amount, 0);
}

function calcMethodTotal(movements, method) {
  return movements
    .filter(m => m.method === method && m.amount > 0)
    .reduce((sum, m) => sum + m.amount, 0);
}

// ─── SUB-COMPONENTS ───────────────────────────────────────────────────────────

function OriginBadge({ origin }) {
  const map = {
    VENTA:   { label: "VENTA",   cls: "bg-green-100 text-green-700" },
    DEVOL:   { label: "DEVOL.",  cls: "bg-red-100 text-red-700" },
    MOVIM_E: { label: "ENTRADA", cls: "bg-blue-100 text-blue-700" },
    MOVIM_S: { label: "SALIDA",  cls: "bg-orange-100 text-orange-700" },
    FONDO:   { label: "FONDO",   cls: "bg-indigo-100 text-indigo-700" },
  };
  const { label, cls } = map[origin] || { label: origin, cls: "bg-gray-100 text-gray-700" };
  return <span className={`rounded-full px-2 py-1 text-xs font-semibold ${cls}`}>{label}</span>;
}

function MethodIcon({ method, size = 14 }) {
  const props = { size, className: "inline-block mr-1 flex-shrink-0" };
  const map = {
    efectivo:      { icon: <Banknote {...props} />,       label: "Efectivo" },
    tarjeta:       { icon: <CreditCard {...props} />,     label: "Tarjeta" },
    transferencia: { icon: <ArrowLeftRight {...props} />, label: "Transferencia" },
    monedero:      { icon: <Star {...props} />,           label: "Monedero" },
    credito:       { icon: <CreditCard {...props} />,     label: "Crédito" },
    mixto:         { icon: <ArrowLeftRight {...props} />, label: "Mixto" },
  };
  const { icon, label } = map[method] || { icon: null, label: method };
  return <span className="text-base text-gray-600 flex items-center">{icon}{label}</span>;
}

// ─── CALENDAR POPOVER ─────────────────────────────────────────────────────────

function CalendarPopover({ selectedStart, selectedEnd, onSelect, onClose }) {
  const [mode, setMode] = useState("dia");
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [rangeStart, setRangeStart] = useState(selectedStart);
  const [rangeEnd, setRangeEnd] = useState(selectedEnd);
  const [rangeError, setRangeError] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) onClose(); }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  useEffect(() => {
    function handler(e) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  function getDaysInMonth(year, month) { return new Date(year, month + 1, 0).getDate(); }
  function getFirstDayOfMonth(year, month) { return new Date(year, month, 1).getDay(); }

  function handleDayClick(dateStr) {
    if (isFuture(dateStr)) return;
    if (mode === "dia") { onSelect(dateStr, dateStr); onClose(); return; }
    if (!rangeStart || (rangeStart && rangeEnd)) {
      setRangeStart(dateStr); setRangeEnd(null); setRangeError("");
    } else {
      let s = rangeStart, e = dateStr;
      if (e < s) { [s, e] = [e, s]; }
      if ((new Date(e) - new Date(s)) / 86400000 > 30) { setRangeError("Máximo 31 días"); return; }
      setRangeStart(s); setRangeEnd(e); setRangeError("");
      onSelect(s, e); onClose();
    }
  }

  function isInRange(dateStr) {
    if (!rangeStart || !rangeEnd) return false;
    return dateStr > rangeStart && dateStr < rangeEnd;
  }

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth);
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }

  return (
    <div ref={ref} className="absolute top-full left-0 mt-1 z-50 bg-white rounded-xl shadow-xl border border-gray-200 p-4 w-80">
      <div className="flex gap-4 mb-4 border-b border-gray-200">
        {["dia", "rango", "mes"].map(m => (
          <button key={m} onClick={() => { setMode(m); setRangeStart(selectedStart); setRangeEnd(selectedEnd); setRangeError(""); }}
            className={`pb-2 text-sm font-medium capitalize ${mode === m ? "text-orange-600 border-b-2 border-orange-600" : "text-gray-500 hover:text-gray-700"}`}>
            {m === "dia" ? "Día" : m === "rango" ? "Rango" : "Mes"}
          </button>
        ))}
      </div>

      {mode !== "mes" && (
        <>
          <div className="flex items-center justify-between mb-3">
            <button onClick={() => { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); } else setViewMonth(m => m - 1); }} className="p-1 hover:bg-gray-100 rounded"><ChevronLeft size={16} /></button>
            <span className="text-sm font-semibold text-gray-700">{MONTH_NAMES_ES[viewMonth]} {viewYear}</span>
            <button onClick={() => { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); } else setViewMonth(m => m + 1); }} className="p-1 hover:bg-gray-100 rounded"><ChevronRight size={16} /></button>
          </div>
          <div className="grid grid-cols-7 mb-1">
            {DAY_NAMES_ES.map(d => <div key={d} className="text-center text-xs text-gray-400 font-medium py-1">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-y-1">
            {cells.map((ds, i) => {
              if (!ds) return <div key={`e-${i}`} />;
              const future = isFuture(ds);
              const isSelStart = ds === (mode === "dia" ? selectedStart : rangeStart);
              const isSelEnd = ds === rangeEnd;
              const inRange = isInRange(ds);
              let cls = "w-8 h-8 mx-auto flex items-center justify-center text-sm rounded-full ";
              if (future) cls += "text-gray-300 cursor-not-allowed";
              else if (isSelStart || isSelEnd) cls += "bg-orange-600 text-white cursor-pointer";
              else if (ds === todayStr && mode === "dia") cls += "bg-orange-600 text-white cursor-pointer";
              else if (inRange) cls += "bg-orange-50 text-orange-800 cursor-pointer";
              else cls += "text-gray-700 hover:bg-gray-100 cursor-pointer";
              return (
                <div key={ds} className="flex items-center justify-center">
                  <button className={cls} onClick={() => handleDayClick(ds)} disabled={future}>{parseInt(ds.slice(8))}</button>
                </div>
              );
            })}
          </div>
          {rangeError && <p className="text-xs text-red-500 mt-2">{rangeError}</p>}
          {mode === "rango" && rangeStart && !rangeEnd && <p className="text-xs text-gray-400 mt-2">Selecciona la fecha final</p>}
        </>
      )}

      {mode === "mes" && (
        <div className="grid grid-cols-3 gap-2">
          {MONTH_NAMES_ES.map((name, idx) => {
            const isCurrent = idx === today.getMonth() && viewYear === today.getFullYear();
            const isFutureMon = new Date(viewYear, idx, 1) > new Date(today.getFullYear(), today.getMonth(), 1);
            const s = `${viewYear}-${String(idx + 1).padStart(2, "0")}-01`;
            const lastDay = new Date(viewYear, idx + 1, 0).getDate();
            const e = `${viewYear}-${String(idx + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
            return (
              <button key={name} disabled={isFutureMon}
                onClick={() => { onSelect(s, e <= todayStr ? e : todayStr); onClose(); }}
                className={`py-2 rounded text-sm font-medium ${isCurrent ? "bg-orange-600 text-white" : isFutureMon ? "text-gray-300 cursor-not-allowed" : "hover:bg-orange-50 text-gray-700"}`}>
                {name.slice(0, 3)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── DROPDOWN ─────────────────────────────────────────────────────────────────

function Dropdown({ label, options, value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const current = options.find(o => o.value === value);

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)}
        className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm flex items-center gap-2 hover:border-gray-400">
        <span>{current ? current.label : label}</span>
        <ChevronDown size={14} className="text-gray-400" />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-40 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[200px]">
          {options.map((opt, i) =>
            opt.separator ? (
              <div key={`sep-${i}`} className="border-t border-gray-100 my-1" />
            ) : (
              <button key={opt.value} onClick={() => { onChange(opt.value); setOpen(false); }}
                className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${value === opt.value ? "text-orange-600 font-medium" : "text-gray-700"}`}>
                {opt.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

// ─── TOAST ────────────────────────────────────────────────────────────────────

function Toast({ toasts }) {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
      {toasts.map(t => (
        <div key={t.id}
          className={`px-4 py-3 rounded-lg shadow-lg text-sm font-medium text-white
            ${t.type === "success" ? "bg-green-600" : t.type === "warning" ? "bg-amber-500" : "bg-red-600"}`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}

// ─── CONFIRMATION MODAL ───────────────────────────────────────────────────────

function ConfirmModal({ title, body, confirmLabel, confirmClass, onConfirm, onCancel, cancelLabel = "Cancelar" }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-2">{title}</h3>
        <p className="text-sm text-gray-600 mb-5">{body}</p>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">{cancelLabel}</button>
          <button onClick={onConfirm} className={`px-4 py-2 text-sm font-medium rounded-lg ${confirmClass}`}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

// ─── REGISTER MOVEMENT MODAL ──────────────────────────────────────────────────

function RegisterModal({ onClose, onSave, cajas, preselectedCajaId, getSaldo, cajeroNombre }) {
  const [selectedCajaId, setSelectedCajaId] = useState(
    preselectedCajaId !== "todos" ? preselectedCajaId : (cajas[0] ? String(cajas[0].id) : "")
  );
  const [type, setType] = useState("SALIDA");
  const [category, setCategory] = useState(CATEGORIES_SALIDA[0]);
  const [amount, setAmount] = useState("");
  const [desc, setDesc] = useState("");
  const [supplier, setSupplier] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState({});
  const [showDiscard, setShowDiscard] = useState(false);
  const [showNegativeWarning, setShowNegativeWarning] = useState(false);
  const [guardando, setGuardando] = useState(false);

  function catsForType(t) {
    return t === "SALIDA" ? CATEGORIES_SALIDA : t === "FONDO" ? CATEGORIES_FONDO : CATEGORIES_ENTRADA;
  }
  const cats = catsForType(type);
  const currentEfectivoSaldo = getSaldo(selectedCajaId);

  function handleTypeChange(t) {
    setType(t);
    const nextCats = catsForType(t);
    setCategory(nextCats[0]);
    // Prellenar una descripción útil para el fondo inicial.
    if (t === "FONDO" && !desc.trim()) setDesc("Fondo inicial de caja");
  }

  function hasContent() { return amount !== "" || desc !== "" || supplier !== "" || notes !== ""; }

  function handleClose() {
    if (hasContent()) setShowDiscard(true);
    else onClose();
  }

  function validate() {
    const e = {};
    if (!amount || parseFloat(amount) <= 0) e.amount = "El monto debe ser mayor a $0";
    if (!desc.trim()) e.desc = "La descripción es obligatoria";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit() {
    if (!validate()) return;
    const mov = parseFloat(amount);
    const delta = type === "SALIDA" ? -mov : mov;
    const newSaldo = currentEfectivoSaldo + delta;
    if (type === "SALIDA" && newSaldo < 0) { setShowNegativeWarning(true); return; }
    doSave(delta);
  }

  async function doSave(delta) {
    const caja = cajas.find(c => String(c.id) === selectedCajaId);
    const origin = type === "SALIDA" ? "MOVIM_S" : type === "FONDO" ? "FONDO" : "MOVIM_E";
    setShowNegativeWarning(false);
    setGuardando(true);
    try {
      // El padre persiste en backend (crearMovimiento) y cierra el modal al
      // resolverse. El servidor pone id/fecha/time y normaliza el signo.
      await onSave({
        date: todayStr,
        origin,
        desc: desc.trim(),
        method: "efectivo",
        amount: delta,
        category,
        cajaId: selectedCajaId,
        cajaName: caja?.nombre ?? selectedCajaId,
        cajeroName: cajeroNombre,
        ...(supplier.trim() ? { supplier: supplier.trim() } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });
    } finally {
      setGuardando(false);
    }
  }

  const amountVal = parseFloat(amount) || 0;
  const projectedDelta = type === "SALIDA" ? -amountVal : amountVal;
  const projectedSaldo = currentEfectivoSaldo + projectedDelta;
  const submitDisabled = !amount || parseFloat(amount) <= 0 || !desc.trim();

  return (
    <>
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4" onClick={handleClose}>
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
          {/* Header — fijo */}
          <div className="px-8 py-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
            <h2 className="text-base font-semibold text-gray-900">Registrar movimiento</h2>
            <button onClick={handleClose} className="p-1 hover:bg-gray-100 rounded text-gray-500"><X size={18} /></button>
          </div>

          {/* Cuerpo — scrolleable */}
          <div className="px-8 py-6 space-y-6 overflow-y-auto flex-1">
            {/* Caja selector */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Caja</label>
              {preselectedCajaId !== "todos" ? (
                <div className="text-sm text-gray-700 bg-gray-50 rounded-lg px-4 py-3 border border-gray-200">
                  <Store size={14} className="inline mr-1.5 text-gray-400" />
                  {cajas.find(c => String(c.id) === preselectedCajaId)?.nombre ?? preselectedCajaId}
                </div>
              ) : (
                <div className="flex gap-2 flex-wrap">
                  {cajas.map(c => (
                    <button key={c.id} type="button" onClick={() => setSelectedCajaId(String(c.id))}
                      className={`flex-1 min-w-[100px] py-2.5 px-4 rounded-lg border text-sm font-medium transition-colors
                        ${selectedCajaId === String(c.id) ? "border-orange-400 bg-orange-50 text-orange-700" : "border-gray-300 text-gray-600 hover:border-gray-400"}`}>
                      {c.nombre}
                    </button>
                  ))}
                </div>
              )}
              {selectedCajaId && (
                <p className="text-sm text-gray-500 mt-2">
                  Efectivo actual: <span className={`font-medium ${currentEfectivoSaldo < 0 ? "text-red-600" : "text-gray-700"}`}>{formatMXN(currentEfectivoSaldo)}</span>
                </p>
              )}
            </div>

            {/* Type toggle */}
            <div className="flex gap-3">
              <button onClick={() => handleTypeChange("SALIDA")}
                className={`flex-1 flex items-center justify-center gap-2 py-4 rounded-lg border-2 font-semibold text-sm transition-colors
                  ${type === "SALIDA" ? "bg-red-50 border-red-400 text-red-700" : "bg-white border-gray-300 text-gray-500 hover:border-gray-400"}`}>
                <TrendingDown size={18} /> SALIDA
              </button>
              <button onClick={() => handleTypeChange("ENTRADA")}
                className={`flex-1 flex items-center justify-center gap-2 py-4 rounded-lg border-2 font-semibold text-sm transition-colors
                  ${type === "ENTRADA" ? "bg-green-50 border-green-400 text-green-700" : "bg-white border-gray-300 text-gray-500 hover:border-gray-400"}`}>
                <TrendingUp size={18} /> ENTRADA
              </button>
              <button onClick={() => handleTypeChange("FONDO")}
                className={`flex-1 flex items-center justify-center gap-2 py-4 rounded-lg border-2 font-semibold text-sm transition-colors
                  ${type === "FONDO" ? "bg-indigo-50 border-indigo-400 text-indigo-700" : "bg-white border-gray-300 text-gray-500 hover:border-gray-400"}`}>
                <Wallet size={18} /> FONDO INICIAL
              </button>
            </div>
            {type === "FONDO" && (
              <p className="-mt-3 text-xs text-indigo-600 bg-indigo-50 rounded-lg px-3 py-2">
                El fondo inicial es el efectivo con el que abre la caja. Cuenta como entrada y es la base del arqueo en el corte.
              </p>
            )}

            {/* Categoría */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Categoría</label>
              <select value={category} onChange={e => setCategory(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400">
                {cats.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* Monto */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Monto <span className="text-red-500">*</span></label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-gray-500">$</span>
                <input type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg pl-8 pr-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400" placeholder="0.00" />
              </div>
              <div className="flex gap-3 mt-3">
                {[50, 100, 200, 500].map(n => (
                  <button key={n} type="button" onClick={() => setAmount(String(n))}
                    className="text-sm border border-gray-300 rounded-lg px-4 py-2 hover:bg-gray-100 text-gray-600 font-medium">${n}</button>
                ))}
              </div>
              {errors.amount && <p className="text-xs text-red-500 mt-1.5">{errors.amount}</p>}
            </div>

            {/* Descripción */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Descripción <span className="text-red-500">*</span></label>
              <input type="text" value={desc} onChange={e => setDesc(e.target.value.slice(0, 120))}
                placeholder="Describe brevemente este movimiento..."
                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400" />
              <div className="flex justify-between mt-1.5">
                {errors.desc ? <p className="text-xs text-red-500">{errors.desc}</p> : <span />}
                <span className="text-xs text-gray-400">{desc.length}/120</span>
              </div>
            </div>

            {/* Proveedor — solo si "Compra sin factura" */}
            <div style={{ overflow: "hidden", maxHeight: category === "Compra sin factura" ? "90px" : "0", transition: "max-height 0.2s ease" }}>
              <div className="pb-1">
                <label className="block text-sm font-medium text-gray-700 mb-2">Nombre del proveedor (opcional)</label>
                <input type="text" value={supplier} onChange={e => setSupplier(e.target.value)}
                  placeholder="Nombre o descripción del proveedor..."
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400" />
              </div>
            </div>

            {/* Notas */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Notas adicionales</label>
              <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="Información extra si es necesaria..."
                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400 resize-none" />
            </div>
          </div>

          {/* Footer — fijo */}
          <div className="px-8 py-5 border-t border-gray-200 flex justify-end gap-3 flex-shrink-0">
            <button onClick={handleClose} className="px-5 py-2.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancelar</button>
            <button onClick={handleSubmit} disabled={submitDisabled || guardando}
              className={`px-5 py-2.5 text-sm font-medium bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-opacity ${submitDisabled || guardando ? "opacity-40 pointer-events-none" : ""}`}>
              {guardando ? "Guardando…" : "Registrar movimiento"}
            </button>
          </div>
        </div>
      </div>

      {showDiscard && (
        <ConfirmModal title="¿Descartar movimiento?" body="Tienes datos sin guardar. Si cierras ahora se perderán."
          confirmLabel="Descartar" confirmClass="text-red-600 border border-red-200 hover:bg-red-50"
          cancelLabel="Seguir editando" onConfirm={onClose} onCancel={() => setShowDiscard(false)} />
      )}

      {showNegativeWarning && (
        <ConfirmModal title="Saldo en negativo"
          body={`Este movimiento dejará el efectivo de ${cajas.find(c => c.id === selectedCajaId)?.nombre} en ${formatMXN(projectedSaldo)}. ¿Deseas registrarlo de todas formas?`}
          confirmLabel="Sí, registrar" confirmClass="bg-red-600 text-white hover:bg-red-700"
          onConfirm={() => doSave(projectedDelta)}
          onCancel={() => setShowNegativeWarning(false)} />
      )}
    </>
  );
}

// ─── MAIN MODULE ──────────────────────────────────────────────────────────────

export default function CashMovementsModule() {
  const { state } = usePOS();
  const cajeroNombre = state.cajero?.alias?.trim() || state.cajero?.nombre || "Administrador";

  // Hoy recalculado al montar (no anclado al load del módulo).
  const [hoy] = useState(getTodayStr);
  const [manualMovements, setManualMovements] = useState([]);
  const [rawVentas, setRawVentas] = useState([]);
  const [dateStart, setDateStart] = useState(hoy);
  const [dateEnd, setDateEnd] = useState(hoy);
  const [showCalendar, setShowCalendar] = useState(false);
  const [filterCaja, setFilterCaja] = useState("todos");
  const [filterCajero, setFilterCajero] = useState("todos");
  const [clasificacion, setClasificacion] = useState("todos");
  const [metodo, setMetodo] = useState("todos");
  const [direccion, setDireccion] = useState("todos");
  const [expandedId, setExpandedId] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [cajas, setCajas] = useState([]);
  const [cajeros, setCajeros] = useState([]);

  // Cargar cajeros y catálogo de cajas una sola vez al montar (ambos de la BD).
  useEffect(() => {
    obtenerUsuarios()
      .then(users => setCajeros(users.filter(u => u.activo)))
      .catch(() => {});
    listarCajasAPI()
      .then(setCajas)
      .catch(() => setCajas([]));
  }, []);

  // Cargar ventas reales + movimientos manuales cada vez que cambia el rango de
  // fechas. Ambos vienen del backend; los movimientos ya no viven en localStorage.
  useEffect(() => {
    let on = true;
    listarVentas(dateStart, dateEnd)
      .then(ventas => { if (on) setRawVentas(ventas.filter(v => !v.estado || v.estado === "Vigente")); })
      .catch(() => { if (on) setRawVentas([]); });
    listarMovimientos({ desde: dateStart, hasta: dateEnd })
      .then(movs => { if (on) setManualMovements(movs); })
      .catch(() => { if (on) setManualMovements([]); });
    return () => { on = false; };
  }, [dateStart, dateEnd]);

  // Transformar ventas a formato de movimiento (se re-ejecuta cuando cargan cajeros)
  const saleMovements = useMemo(
    () => rawVentas.map(v => ventaToMovement(v, cajeros, cajas)),
    [rawVentas, cajeros, cajas]
  );

  // Movimientos combinados: ventas reales + movimientos manuales
  const movements = useMemo(
    () => [...saleMovements, ...manualMovements],
    [saleMovements, manualMovements]
  );

  const getSaldo = useCallback((cajaId) => {
    const efMovs = movements.filter(m => m.date === todayStr && m.cajaId === cajaId && m.method === "efectivo");
    return efMovs.reduce((s, m) => s + m.amount, 0);
  }, [movements]);

  const isViewingToday = dateStart === todayStr && dateEnd === todayStr;
  const isRange = dateStart !== dateEnd;

  // Range movements (date + caja + cajero)
  const rangeMovements = movements.filter(m =>
    m.date >= dateStart && m.date <= dateEnd &&
    (filterCaja === "todos" || m.cajaId === filterCaja) &&
    (filterCajero === "todos" || m.cajeroId === filterCajero)
  );

  // Filtered movements (all filters)
  const filteredMovements = rangeMovements.filter(m => {
    if (clasificacion !== "todos") {
      const map = { venta: m.origin === "VENTA", devol: m.origin === "DEVOL", movim_e: m.origin === "MOVIM_E", movim_s: m.origin === "MOVIM_S", fondo: m.origin === "FONDO" };
      if (!map[clasificacion]) return false;
    }
    if (metodo !== "todos" && m.method !== metodo) return false;
    if (direccion === "entrada" && m.amount <= 0) return false;
    if (direccion === "salida" && m.amount >= 0) return false;
    return true;
  });

  const filteredEntradas = filteredMovements.filter(m => m.amount > 0).reduce((s, m) => s + m.amount, 0);
  const filteredSalidas  = filteredMovements.filter(m => m.amount < 0).reduce((s, m) => s + m.amount, 0);
  const filteredNeto = filteredEntradas + filteredSalidas;

  const filtersActive = {
    date:          !(dateStart === todayStr && dateEnd === todayStr),
    caja:          filterCaja !== "todos",
    cajero:        filterCajero !== "todos",
    clasificacion: clasificacion !== "todos",
    metodo:        metodo !== "todos",
    direccion:     direccion !== "todos",
  };
  const anyFilter = Object.values(filtersActive).some(Boolean);

  function clearAll() {
    setDateStart(todayStr); setDateEnd(todayStr);
    setFilterCaja("todos"); setFilterCajero("todos");
    setClasificacion("todos"); setMetodo("todos");
    setDireccion("todos");
  }

  function addToast(message, type = "success") {
    const id = Date.now();
    setToasts(t => [...t, { id, message, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3000);
  }

  async function handleSaveMovement(movement) {
    // Asociamos el movimiento al turno y cajero activos para que el corte pueda
    // agruparlo. El backend normaliza el signo y asigna id/fecha/hora.
    const payload = {
      ...movement,
      turnoId: state.cajero?.turno_id ?? null,
      cajeroId: movement.cajeroId ?? state.cajero?.id ?? "admin",
    };
    try {
      const creado = await crearMovimiento(payload);
      setManualMovements(prev => [creado, ...prev]);
      setShowModal(false);

      const efMovs = movements.filter(m => m.date === todayStr && m.cajaId === creado.cajaId && m.method === "efectivo");
      const newSaldo = efMovs.reduce((s, m) => s + m.amount, 0) + (creado.method === "efectivo" ? creado.amount : 0);
      const etiqueta = creado.origin === "FONDO" ? "Fondo inicial registrado ✓" : "Movimiento registrado ✓";
      addToast(etiqueta, "success");
      if (creado.origin !== "FONDO") {
        if (newSaldo < 0) setTimeout(() => addToast("🚨 El saldo de efectivo es negativo.", "error"), 150);
        else if (newSaldo < 100) setTimeout(() => addToast("⚠️ Saldo bajo en caja. Considera reponer el fondo.", "warning"), 150);
      }
    } catch {
      addToast("No se pudo registrar el movimiento", "error");
    }
  }

  function dateButtonLabel() {
    if (dateStart === dateEnd) return `📅 ${formatDateLabel(dateStart)}`;
    const s = new Date(dateStart + "T12:00:00");
    const e = new Date(dateEnd + "T12:00:00");
    return `📅 ${s.getDate()}–${e.getDate()} ${MONTH_NAMES_ES[e.getMonth()].slice(0, 3)}`;
  }

  // Group by date for range view
  const groupedByDate = {};
  filteredMovements.forEach(m => {
    if (!groupedByDate[m.date]) groupedByDate[m.date] = [];
    groupedByDate[m.date].push(m);
  });
  const sortedDates = Object.keys(groupedByDate).sort((a, b) => b.localeCompare(a));

  const tableRows = [];
  if (isRange) {
    sortedDates.forEach(date => {
      tableRows.push({ type: "separator", date });
      groupedByDate[date].forEach(m => tableRows.push({ type: "movement", movement: m }));
    });
  } else {
    filteredMovements.slice().sort((a, b) => a.time.localeCompare(b.time)).forEach(m =>
      tableRows.push({ type: "movement", movement: m })
    );
  }

  // Dropdown options
  const cajaOptions = [
    { value: "todos", label: "Todas las cajas" },
    { separator: true },
    ...cajas.filter(r => r.activa).map(c => ({ value: String(c.id), label: c.nombre })),
  ];

  const cajeroOptions = [
    { value: "todos", label: "Todos los cajeros" },
    { separator: true },
    ...cajeros.map(e => ({ value: e.id, label: e.alias?.trim() || e.nombre })),
  ];

  const clasificacionOptions = [
    { value: "todos",   label: "Clasificación" },
    { separator: true },
    { value: "venta",   label: "Ventas (entradas)" },
    { value: "devol",   label: "Devoluciones (salidas)" },
    { separator: true },
    { value: "movim_e", label: "Movimientos — Entradas" },
    { value: "movim_s", label: "Movimientos — Salidas" },
    { value: "fondo",   label: "Fondo inicial" },
  ];

  const metodoOptions = [
    { value: "todos",        label: "Método de pago" },
    { separator: true },
    { value: "efectivo",     label: "💵 Efectivo" },
    { value: "tarjeta",      label: "💳 Tarjeta" },
    { value: "transferencia",label: "🔄 Transferencia" },
    { value: "monedero",     label: "⭐ Monedero / Puntos" },
    { value: "credito",      label: "📋 Crédito" },
    { value: "mixto",        label: "🔀 Mixto" },
  ];

  const cajaNombre         = filterCaja   === "todos" ? "Todas las cajas"   : cajas.find(c => String(c.id) === filterCaja)?.nombre ?? filterCaja;
  const cajeroNombreFilter = filterCajero === "todos" ? "Todos los cajeros" : (() => { const e = cajeros.find(c => c.id === filterCajero); return e ? (e.alias?.trim() || e.nombre) : filterCajero; })();

  // Whether to show caja/cajero info per row
  const showCajaInRow   = filterCaja   === "todos";
  const showCajeroInRow = filterCajero === "todos";

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* TOOLBAR */}
      <div className="h-14 border-b border-gray-200 px-6 flex items-center justify-between flex-shrink-0">
        <h1 className="text-lg font-semibold text-gray-900">Movimientos de Caja</h1>
        <button
          onClick={() => isViewingToday && setShowModal(true)}
          title={!isViewingToday ? "Solo puedes registrar movimientos en el día actual" : ""}
          className={`flex items-center gap-2 bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-orange-700 transition-colors
            ${!isViewingToday ? "opacity-40 pointer-events-none" : ""}`}
        >
          <PlusCircle size={16} />
          + Movimiento
        </button>
      </div>

      {/* STATUS BAR */}
      <div className="px-6 py-2 bg-gray-50 border-b border-gray-200 flex items-center gap-4 text-sm text-gray-600 flex-shrink-0 flex-wrap">
        <span className="flex items-center gap-1.5"><Store size={14} />{cajaNombre}</span>
        <span className="text-gray-300">·</span>
        <span className="flex items-center gap-1.5"><User size={14} />{cajeroNombreFilter}</span>
        <div className="flex-1" />
        {!isViewingToday && (
          <span className="bg-amber-100 text-amber-700 text-xs rounded-full px-2 py-0.5">📅 Modo lectura</span>
        )}
      </div>

      {/* FILTER BAR */}
      <div className="px-6 py-3 border-b border-gray-200 flex items-center gap-3 flex-wrap flex-shrink-0">
        {/* Date picker */}
        <div className="relative">
          <button onClick={() => setShowCalendar(o => !o)}
            className={`bg-white border rounded-lg px-3 py-2 text-sm flex items-center gap-2 hover:border-gray-400
              ${filtersActive.date ? "border-orange-400 text-orange-600 font-medium" : "border-gray-300"}`}>
            {dateButtonLabel()}
            <ChevronDown size={14} className="text-gray-400" />
          </button>
          {showCalendar && (
            <CalendarPopover
              selectedStart={dateStart} selectedEnd={dateEnd}
              onSelect={(s, e) => { setDateStart(s); setDateEnd(e); }}
              onClose={() => setShowCalendar(false)}
            />
          )}
        </div>

        <Dropdown label="Todas las cajas"    options={cajaOptions}           value={filterCaja}    onChange={setFilterCaja} />
        <Dropdown label="Todos los cajeros"  options={cajeroOptions}         value={filterCajero}  onChange={setFilterCajero} />
        <Dropdown label="Clasificación"      options={clasificacionOptions}  value={clasificacion} onChange={setClasificacion} />
        <Dropdown label="Método de pago"     options={metodoOptions}         value={metodo}        onChange={setMetodo} />

        {/* Dirección pills */}
        <div className="flex gap-1">
          {[["todos","Todos"],["entrada","↑ Entradas"],["salida","↓ Salidas"]].map(([val, lbl]) => (
            <button key={val} onClick={() => setDireccion(val)}
              className={`px-3 py-1.5 rounded-full text-sm transition-colors
                ${direccion === val ? "bg-orange-600 text-white" : "bg-white border border-gray-300 text-gray-600 hover:bg-gray-50"}`}>
              {lbl}
            </button>
          ))}
        </div>

      </div>

      {/* ACTIVE FILTER CHIPS */}
      {anyFilter && (
        <div className="px-6 py-2 bg-orange-50 border-b border-orange-100 flex items-center gap-2 flex-wrap flex-shrink-0">
          <span className="text-xs text-gray-500 font-medium mr-1">Mostrando:</span>

          {filtersActive.date && (
            <span className="bg-white border border-orange-200 text-orange-700 text-xs rounded-full px-2 py-1 flex items-center gap-1">
              📅 {dateStart === dateEnd ? formatDateLabel(dateStart) : `${dateStart} – ${dateEnd}`}
              <button onClick={() => { setDateStart(todayStr); setDateEnd(todayStr); }} className="hover:text-orange-900"><X size={10} /></button>
            </span>
          )}
          {filtersActive.caja && (
            <span className="bg-white border border-orange-200 text-orange-700 text-xs rounded-full px-2 py-1 flex items-center gap-1">
              🏪 {cajaNombre}
              <button onClick={() => setFilterCaja("todos")} className="hover:text-orange-900"><X size={10} /></button>
            </span>
          )}
          {filtersActive.cajero && (
            <span className="bg-white border border-orange-200 text-orange-700 text-xs rounded-full px-2 py-1 flex items-center gap-1">
              👤 {cajeroNombreFilter}
              <button onClick={() => setFilterCajero("todos")} className="hover:text-orange-900"><X size={10} /></button>
            </span>
          )}
          {filtersActive.clasificacion && (
            <span className="bg-white border border-orange-200 text-orange-700 text-xs rounded-full px-2 py-1 flex items-center gap-1">
              {clasificacionOptions.find(o => o.value === clasificacion)?.label}
              <button onClick={() => setClasificacion("todos")} className="hover:text-orange-900"><X size={10} /></button>
            </span>
          )}
          {filtersActive.metodo && (
            <span className="bg-white border border-orange-200 text-orange-700 text-xs rounded-full px-2 py-1 flex items-center gap-1">
              {metodoOptions.find(o => o.value === metodo)?.label}
              <button onClick={() => setMetodo("todos")} className="hover:text-orange-900"><X size={10} /></button>
            </span>
          )}
          {filtersActive.direccion && (
            <span className="bg-white border border-orange-200 text-orange-700 text-xs rounded-full px-2 py-1 flex items-center gap-1">
              {direccion === "entrada" ? "↑ Entradas" : "↓ Salidas"}
              <button onClick={() => setDireccion("todos")} className="hover:text-orange-900"><X size={10} /></button>
            </span>
          )}
          <div className="flex-1" />
          <button onClick={clearAll} className="text-xs text-orange-600 hover:text-orange-800 font-medium underline">Limpiar todo</button>
        </div>
      )}

      {/* TABLE */}
      <div className="flex-1 overflow-y-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-gray-50 border-b-2 border-gray-200">
              <th className="py-3 px-4 text-sm font-semibold text-gray-500 uppercase tracking-wide text-left w-20">Hora</th>
              <th className="py-3 px-4 text-sm font-semibold text-gray-500 uppercase tracking-wide text-left w-28">Origen</th>
              <th className="py-3 px-4 text-sm font-semibold text-gray-500 uppercase tracking-wide text-left">Descripción</th>
              <th className="py-3 px-4 text-sm font-semibold text-gray-500 uppercase tracking-wide text-left w-32">Método</th>
              <th className="py-3 px-4 text-sm font-semibold text-gray-500 uppercase tracking-wide text-right w-28">Monto</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {tableRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-16 text-center">
                  <SearchX size={40} className="text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-400 font-medium">Sin movimientos que coincidan con los filtros</p>
                  {rangeMovements.length === 0 && (
                    <p className="text-sm text-gray-400 italic mt-1">
                      No hay movimientos para esta selección.
                    </p>
                  )}
                </td>
              </tr>
            ) : (
              tableRows.map((row, idx) => {
                if (row.type === "separator") {
                  return (
                    <tr key={`sep-${row.date}`} className="bg-gray-50">
                      <td colSpan={6} className="py-2 px-4 text-xs font-semibold text-gray-500 uppercase text-center tracking-wide">
                        ── {formatDateLong(row.date)} ──
                      </td>
                    </tr>
                  );
                }
                const m = row.movement;
                const isExpanded = expandedId === m.id;
                return (
                  <>
                    <tr key={m.id} onClick={() => setExpandedId(isExpanded ? null : m.id)}
                      className="border-b border-gray-200 hover:bg-gray-50 cursor-pointer">
                      <td className="py-3.5 px-4 text-base text-gray-500 font-mono">{m.time}</td>
                      <td className="py-3.5 px-4"><OriginBadge origin={m.origin} /></td>
                      <td className="py-3.5 px-4">
                        <div className="text-base text-gray-900">{m.desc}</div>
                        {(showCajaInRow || showCajeroInRow || m.supplier) && (
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                            {showCajaInRow && (
                              <span className="text-sm text-blue-500 font-medium">{m.cajaName}</span>
                            )}
                            {showCajeroInRow && (
                              <span className="text-sm text-purple-500">{m.cajeroName}</span>
                            )}
                            {m.supplier && (
                              <span className="text-sm text-gray-400">Prov: {m.supplier}</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4"><MethodIcon method={m.method} size={16} /></td>
                      <td className={`py-3.5 px-4 text-base font-semibold text-right ${m.amount > 0 ? "text-green-600" : "text-red-600"}`}>
                        {m.amount > 0 ? "+" : ""}{formatMXN(m.amount)}
                      </td>
                      <td className="py-3.5 px-4">
                        <ChevronDown size={16} className={`text-gray-400 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
                      </td>
                    </tr>
                    <tr key={`exp-${m.id}`}>
                      <td colSpan={6} className="p-0">
                        <div style={{ maxHeight: isExpanded ? "200px" : "0", overflow: "hidden", transition: "max-height 0.2s ease" }}>
                          <div className="bg-gray-50 px-4 py-3 text-sm border-b border-gray-200">
                            <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-gray-600">
                              <p><span className="font-medium">Caja:</span> {m.cajaName}</p>
                              <p><span className="font-medium">Cajero:</span> {m.cajeroName}</p>
                              {(m.origin === "VENTA" || m.origin === "DEVOL") ? (
                                <p className="col-span-2 text-gray-500 italic mt-1">Registrado automáticamente desde el módulo de Ventas</p>
                              ) : (
                                <>
                                  {m.category && <p><span className="font-medium">Categoría:</span> {m.category}</p>}
                                  {m.supplier && <p><span className="font-medium">Proveedor:</span> {m.supplier}</p>}
                                  {m.notes    && <p className="col-span-2"><span className="font-medium">Notas:</span> {m.notes}</p>}
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  </>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* TABLE FOOTER */}
      <div className="border-t-2 border-gray-200 bg-white px-6 py-3 flex justify-between items-center flex-shrink-0">
        <span className="text-sm text-gray-500">
          {filteredMovements.length} movimiento{filteredMovements.length !== 1 ? "s" : ""}
          {anyFilter && rangeMovements.length !== filteredMovements.length && ` (filtrados de ${rangeMovements.length})`}
        </span>
        <div className="flex gap-6 text-sm">
          <span className="text-gray-600">Entradas: <span className="text-green-600 font-semibold">+{formatMXN(filteredEntradas)}</span></span>
          <span className="text-gray-600">Salidas: <span className="text-red-600 font-semibold">{formatMXN(filteredSalidas)}</span></span>
          <span className="text-gray-600">Neto: <span className={`font-semibold ${filteredNeto >= 0 ? "text-green-600" : "text-red-600"}`}>{filteredNeto >= 0 ? "+" : ""}{formatMXN(filteredNeto)}</span></span>
        </div>
      </div>

      {/* MODAL */}
      {showModal && (
        <RegisterModal
          onClose={() => setShowModal(false)}
          onSave={handleSaveMovement}
          cajas={cajas.filter(r => r.activa)}
          preselectedCajaId={filterCaja}
          getSaldo={getSaldo}
          cajeroNombre={cajeroNombre}
        />
      )}

      <Toast toasts={toasts} />
    </div>
  );
}
