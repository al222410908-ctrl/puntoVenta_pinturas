import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { toast } from 'sonner'
import {
  Plus,
  Trash2,
  PiggyBank,
  ArrowDownCircle,
  ArrowUpCircle,
  Banknote,
  CreditCard,
  Smartphone,
  Lock,
  Unlock,
  Printer,
  FileCheck2,
  AlertTriangle,
  Clock,
  Building2,
  Truck,
  ShieldCheck,
  History,
} from 'lucide-react'
import { db } from '../db/db'
import {
  addCashEntry,
  deleteCashEntry,
  getCurrentShift,
  openCashShift,
  getShiftMetrics,
  closeCashShift,
} from '../db/repos'
import type { CashExpenseCategory, CashType } from '../types'
import { formatMoney, round2 } from '../lib/utils'
import { Button, EmptyState, Field, Input, Modal, Segmented, Select } from '../components/ui'
import { downloadCashCutPdf } from '../lib/cashCutTicket'

type View = 'turno' | 'cortes' | 'movimientos'

const EXPENSE_CATEGORIES: { id: CashExpenseCategory; label: string; icon: typeof Building2 }[] = [
  { id: 'operativo', label: 'Gasto operativo (luz, flete, comida, papelería)', icon: Building2 },
  { id: 'proveedor', label: 'Pago a proveedores (insumos, abonos)', icon: Truck },
  { id: 'retiro_seguro', label: 'Retiro de efectivo seguro (a caja fuerte o banco)', icon: ShieldCheck },
  { id: 'otro', label: 'Otro egreso', icon: ArrowDownCircle },
]

export default function Money() {
  const [view, setView] = useState<View>('turno')

  // Modales
  const [openShiftModal, setOpenShiftModal] = useState(false)
  const [corteXModal, setCorteXModal] = useState(false)
  const [corteZModal, setCorteZModal] = useState(false)
  const [movementModal, setMovementModal] = useState(false)

  // Datos reactivos de Dexie
  const currentShift = useLiveQuery(() => getCurrentShift(), [])
  const shiftMetrics = useLiveQuery(
    async () => (currentShift ? getShiftMetrics(currentShift) : null),
    [currentShift?.id, currentShift?.openedAt],
  )
  const pastShifts = useLiveQuery(() => db.cashShifts.where('status').equals('cerrado').reverse().sortBy('closedAt'), []) ?? []

  // Estado formulario apertura
  const [openInitialCash, setOpenInitialCash] = useState('500')
  const [openCashier, setOpenCashier] = useState('')
  const [busyOpen, setBusyOpen] = useState(false)

  // Estado formulario movimiento
  const [movType, setMovType] = useState<CashType>('egreso')
  const [movConcept, setMovConcept] = useState('')
  const [movAmount, setMovAmount] = useState('')
  const [movExpenseCat, setMovExpenseCat] = useState<CashExpenseCategory>('operativo')
  const [movBusy, setMovBusy] = useState(false)

  // Estado formulario Corte Z (Arqueo ciego)
  const [countedCash, setCountedCash] = useState('')
  const [corteZNotes, setCorteZNotes] = useState('')
  const [corteZStep, setCorteZStep] = useState<'conteo' | 'resultado'>('conteo')
  const [corteZBusy, setCorteZBusy] = useState(false)

  // Manejador apertura de turno
  const handleOpenShift = async () => {
    const val = round2(Number(openInitialCash))
    if (!Number.isFinite(val) || val < 0) {
      toast.error('Ingresa un monto de fondo inicial válido')
      return
    }
    setBusyOpen(true)
    try {
      await openCashShift({ initialCash: val, cashierName: openCashier })
      toast.success('Turno de caja abierto correctamente')
      setOpenShiftModal(false)
      setOpenCashier('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al abrir turno')
    } finally {
      setBusyOpen(false)
    }
  }

  // Manejador nuevo movimiento tipificado
  const handleSaveMovement = async () => {
    if (!movConcept.trim()) {
      toast.error('Escribe un concepto claro')
      return
    }
    const val = round2(Number(movAmount))
    if (!Number.isFinite(val) || val <= 0) {
      toast.error('Monto inválido')
      return
    }
    setMovBusy(true)
    try {
      await addCashEntry({
        date: Date.now(),
        type: movType,
        concept: movConcept.trim(),
        amount: val,
        subCategory: movType === 'egreso' ? movExpenseCat : 'aportacion',
        shiftId: currentShift?.id,
      })
      toast.success(movType === 'ingreso' ? 'Ingreso registrado' : 'Egreso registrado')
      setMovConcept('')
      setMovAmount('')
      setMovementModal(false)
    } finally {
      setMovBusy(false)
    }
  }

  // Manejador Arqueo Ciego (Corte Z)
  const handleCalculateBlindAudit = () => {
    const counted = round2(Number(countedCash))
    if (!Number.isFinite(counted) || counted < 0) {
      toast.error('Ingresa el monto físico contado en el cajón')
      return
    }
    setCorteZStep('resultado')
  }

  const handleConfirmCloseShift = async () => {
    if (!currentShift || !shiftMetrics) return
    const counted = round2(Number(countedCash))
    setCorteZBusy(true)
    try {
      const closed = await closeCashShift(currentShift.id, {
        actualCash: counted,
        notes: corteZNotes,
        cashierName: currentShift.openedBy,
      })
      toast.success('Turno cerrado y arqueo registrado')
      // Descargar ticket de corte Z
      await downloadCashCutPdf(closed, shiftMetrics, true)
      setCorteZModal(false)
      setCorteZStep('conteo')
      setCountedCash('')
      setCorteZNotes('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al cerrar turno')
    } finally {
      setCorteZBusy(false)
    }
  }

  const handleDownloadCorteX = async () => {
    if (!currentShift || !shiftMetrics) return
    try {
      await downloadCashCutPdf(currentShift, shiftMetrics, false)
      toast.success('Ticket de Corte X generado y descargado')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al generar ticket')
    }
  }

  const removeEntry = async (id: string) => {
    if (!window.confirm('¿Eliminar este movimiento de caja?')) return
    await deleteCashEntry(id)
    toast.success('Movimiento eliminado')
  }

  return (
    <div className="space-y-4 p-3 pb-8 max-w-5xl mx-auto">
      <Segmented
        value={view}
        onChange={setView}
        options={[
          { value: 'turno', label: 'Turno Actual & Caja' },
          { value: 'cortes', label: `Historial de Cortes (${pastShifts.length})` },
          { value: 'movimientos', label: 'Movimientos de Caja' },
        ]}
      />

      {view === 'turno' && (
        <>
          {!currentShift ? (
            /* --- ESTADO: CAJA CERRADA --- */
            <div className="card p-6 text-center space-y-4 border-dashed border-2 border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/40">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                <Lock className="h-8 w-8" />
              </div>
              <div>
                <h2 className="font-display text-xl font-bold text-slate-800 dark:text-slate-100">
                  Caja Cerrada / Sin Turno Activo
                </h2>
                <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto mt-1">
                  Abre un nuevo turno de caja ingresando el fondo inicial para dar cambio y llevar la auditoría exacta del dinero físico.
                </p>
              </div>
              <div>
                <Button
                  className="btn-primary"
                  onClick={() => {
                    setOpenInitialCash('500')
                    setOpenShiftModal(true)
                  }}
                >
                  <Unlock className="h-4 w-4" />
                  Abrir Turno de Caja
                </Button>
              </div>
            </div>
          ) : (
            /* --- ESTADO: TURNO ACTIVO --- */
            <div className="space-y-4">
              {/* Header del Turno */}
              <div className="card flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center">
                <div className="flex items-center gap-3">
                  <span className="relative flex h-3 w-3">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-600 dark:bg-emerald-400" />
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-display text-base font-semibold text-slate-800 dark:text-slate-100">
                        Turno de Caja Activo
                      </span>
                      <span className="chip chip-ok text-xs">En curso</span>
                    </div>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
                      <Clock className="h-3.5 w-3.5 text-slate-400" />
                      Abierto:{' '}
                      <span className="font-medium text-slate-700 dark:text-slate-300">
                        {new Date(currentShift.openedAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {currentShift.openedBy && (
                        <span>· Cajero: <strong className="text-slate-700 dark:text-slate-300">{currentShift.openedBy}</strong></span>
                      )}
                      <span>· Fondo inicial: <strong>{formatMoney(currentShift.initialCash)}</strong></span>
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    className="btn-secondary"
                    onClick={() => setCorteXModal(true)}
                  >
                    <Printer className="h-4 w-4" />
                    Corte X (Parcial)
                  </Button>
                  <Button
                    className="btn-danger"
                    onClick={() => {
                      setCountedCash('')
                      setCorteZNotes('')
                      setCorteZStep('conteo')
                      setCorteZModal(true)
                    }}
                  >
                    <FileCheck2 className="h-4 w-4" />
                    Corte Z (Cierre)
                  </Button>
                </div>
              </div>

              {/* 1.2 Separación estricta por Método de Pago */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* 💵 Efectivo en Cajón */}
                <div className="card p-4 flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                      <Banknote className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      Efectivo en Cajón
                    </span>
                    <span className="chip chip-ok">Dinero Físico</span>
                  </div>
                  <div className="mt-3">
                    <p className="font-display text-2xl font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                      {formatMoney(shiftMetrics?.expectedCash ?? currentShift.initialCash)}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Fondo ({formatMoney(currentShift.initialCash)}) + Ventas ({formatMoney(shiftMetrics?.cashSales ?? 0)}) − Salidas ({formatMoney(shiftMetrics?.expensesCash ?? 0)})
                    </p>
                  </div>
                </div>

                {/* 💳 Tarjeta / Terminal */}
                <div className="card p-4 flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                      <CreditCard className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                      Tarjeta / Terminal
                    </span>
                    <span className="chip chip-info">Banco</span>
                  </div>
                  <div className="mt-3">
                    <p className="font-display text-2xl font-bold text-sky-700 dark:text-sky-400 tabular-nums">
                      {formatMoney(shiftMetrics?.cardSales ?? 0)}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Ingresos bancarios directos por terminal
                    </p>
                  </div>
                </div>

                {/* 📱 Transferencia / SPEI */}
                <div className="card p-4 flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                      <Smartphone className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                      Transferencia / SPEI
                    </span>
                    <span className="chip chip-devol">Confirmación</span>
                  </div>
                  <div className="mt-3">
                    <p className="font-display text-2xl font-bold text-violet-700 dark:text-violet-400 tabular-nums">
                      {formatMoney(shiftMetrics?.transferSales ?? 0)}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Transferencias electrónicas verificadas
                    </p>
                  </div>
                </div>
              </div>

              {/* Resumen Detallado y Botón de Salida */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <div className="lg:col-span-2 card divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
                  <div className="p-3 bg-slate-50/60 dark:bg-slate-800/40 flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                      Auditoría del Turno
                    </span>
                    <span className="text-xs text-slate-400 font-medium">
                      {shiftMetrics?.salesCount ?? 0} notas cobradas
                    </span>
                  </div>
                  <RowDetalle label="Fondo inicial de apertura" value={formatMoney(currentShift.initialCash)} accent="text-slate-800 dark:text-slate-100 font-bold" />
                  <RowDetalle label="Total vendido en el turno (todos los métodos)" value={formatMoney(shiftMetrics?.totalSales ?? 0)} accent="text-primary dark:text-emerald-400 font-bold" />
                  <RowDetalle label="Egresos operativos de caja chica" value={`−${formatMoney(shiftMetrics?.expensesOperativos ?? 0)}`} accent="text-amber-700 dark:text-amber-400" />
                  <RowDetalle label="Pagos a proveedores desde caja" value={`−${formatMoney(shiftMetrics?.expensesProveedores ?? 0)}`} accent="text-orange-700 dark:text-orange-400" />
                  <RowDetalle label="Retiro de efectivo seguro (traslado)" value={`−${formatMoney(shiftMetrics?.expensesRetiroSeguro ?? 0)}`} accent="text-red-600 dark:text-red-400" />
                  <RowDetalle label="Efectivo físico que debe haber en el cajón" value={formatMoney(shiftMetrics?.expectedCash ?? currentShift.initialCash)} accent="text-emerald-700 dark:text-emerald-400 font-extrabold text-base" />
                </div>

                <div className="card p-4 flex flex-col justify-between space-y-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                      Caja Chica & Salidas Tipificadas
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                      Registra cualquier salida de dinero físico (luz, flete, comida, pago de insumos a proveedores o retiro seguro).
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Button
                      className="btn-primary w-full"
                      onClick={() => {
                        setMovType('egreso')
                        setMovementModal(true)
                      }}
                    >
                      <Plus className="h-4 w-4" />
                      Registrar Retiro o Gasto
                    </Button>
                    <Button
                      className="btn-secondary w-full"
                      onClick={() => {
                        setMovType('ingreso')
                        setMovementModal(true)
                      }}
                    >
                      <ArrowUpCircle className="h-4 w-4 text-emerald-600" />
                      Entrada Extra de Dinero
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* --- TAB: HISTORIAL DE CORTES Z --- */}
      {view === 'cortes' && (
        <div className="space-y-3">
          {pastShifts.length === 0 ? (
            <EmptyState
              icon={<History className="h-10 w-10 text-slate-400" />}
              title="Aún no hay cortes Z cerrados"
              hint="Cuando cierres tu primer turno mediante el Arqueo Ciego, quedará archivado aquí con su ticket PDF."
            />
          ) : (
            pastShifts.map((s) => {
              const diff = s.difference ?? 0
              const diffColor =
                diff === 0
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : diff > 0
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-red-600 dark:text-red-400'
              const diffText =
                diff === 0
                  ? 'Exacto ($0.00)'
                  : diff > 0
                    ? `Sobrante +${formatMoney(diff)}`
                    : `Faltante −${formatMoney(Math.abs(diff))}`

              return (
                <div
                  key={s.id}
                  className="card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-display text-sm font-semibold text-slate-800 dark:text-slate-100">
                        Corte Z — {new Date(s.closedAt ?? s.openedAt).toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'short' })}
                      </span>
                      <span className="chip chip-ok">Cerrado</span>
                    </div>
                    <p className="text-xs text-slate-400">
                      Abierto: {new Date(s.openedAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })} · Cierre:{' '}
                      {s.closedAt ? new Date(s.closedAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                      {s.openedBy ? ` · Cajero: ${s.openedBy}` : ''}
                    </p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs pt-1">
                      <span>Fondo inicial: <strong>{formatMoney(s.initialCash)}</strong></span>
                      <span>Vendido: <strong>{formatMoney(s.summary?.totalSales ?? 0)}</strong></span>
                      <span>Esperado: <strong>{formatMoney(s.expectedCash ?? 0)}</strong></span>
                      <span>Físico contado: <strong>{formatMoney(s.actualCash ?? 0)}</strong></span>
                      <span className={`font-semibold ${diffColor}`}>Auditoría: {diffText}</span>
                    </div>
                    {s.notes && (
                      <p className="text-xs text-slate-400 italic pt-0.5">Notas: &quot;{s.notes}&quot;</p>
                    )}
                  </div>

                  <Button
                    className="btn-secondary shrink-0"
                    onClick={async () => {
                      try {
                        const m = await getShiftMetrics(s)
                        await downloadCashCutPdf(s, m, true)
                        toast.success('Ticket de Corte Z descargado')
                      } catch {
                        toast.error('Error al descargar el corte')
                      }
                    }}
                  >
                    <Printer className="h-4 w-4" />
                    Reimprimir Corte Z
                  </Button>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* --- TAB: MOVIMIENTOS HISTÓRICOS --- */}
      {view === 'movimientos' && (
        <div className="space-y-3">
          <MovementsListView onRemove={(id) => void removeEntry(id)} />
        </div>
      )}

      {/* ======================================================== */}
      {/* ======================================================== */}
      {/* MODAL 1: APERTURA DE TURNO DE CAJA                      */}
      {/* ======================================================== */}
      <Modal open={openShiftModal} onClose={() => setOpenShiftModal(false)} title="Abrir Turno de Caja">
        <div className="space-y-4">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 text-center dark:border-emerald-800 dark:bg-emerald-950/20">
            <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
              Fondo inicial para cambio
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Cantidad en monedas y billetes físicos con la que arranca el cajón hoy.
            </p>
          </div>

          <Field label="Fondo Inicial ($ MXN)">
            <Input
              type="number"
              inputMode="decimal"
              min="0"
              step="1"
              value={openInitialCash}
              onChange={(e) => setOpenInitialCash(e.target.value)}
              placeholder="500.00"
            />
          </Field>

          <div className="flex flex-wrap gap-1.5">
            {[200, 300, 500, 1000].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setOpenInitialCash(String(n))}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              >
                ${n} MXN
              </button>
            ))}
          </div>

          <Field label="Nombre del Cajero / Responsable (Opcional)">
            <Input
              value={openCashier}
              onChange={(e) => setOpenCashier(e.target.value)}
              placeholder="Ej. Alan / Lina"
            />
          </Field>

          <Button
            className="btn-primary w-full"
            disabled={busyOpen}
            onClick={() => void handleOpenShift()}
          >
            <Unlock className="h-4 w-4" />
            Iniciar Turno de Caja
          </Button>
        </div>
      </Modal>

      {/* ======================================================== */}
      {/* MODAL 2: CORTE X (PARCIAL DE TURNO)                      */}
      {/* ======================================================== */}
      {currentShift && shiftMetrics && (
        <Modal open={corteXModal} onClose={() => setCorteXModal(false)} title="Corte X (Parcial de Turno)">
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-700 dark:bg-slate-900/60">
              <p className="text-slate-500 dark:text-slate-400">
                Visualización instantánea a mitad del día sin cerrar el turno. Puedes generar el ticket impreso en cualquier momento.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-700 text-xs">
              <RowDetalle label="Fondo inicial de apertura" value={formatMoney(currentShift.initialCash)} accent="font-semibold text-slate-800 dark:text-slate-100" />
              <RowDetalle label="💵 Ventas en Efectivo" value={formatMoney(shiftMetrics.cashSales)} accent="text-emerald-700 dark:text-emerald-400 font-semibold" />
              <RowDetalle label="💳 Ventas en Tarjeta" value={formatMoney(shiftMetrics.cardSales)} accent="text-sky-700 dark:text-sky-400 font-semibold" />
              <RowDetalle label="📱 Ventas en Transferencia" value={formatMoney(shiftMetrics.transferSales)} accent="text-violet-700 dark:text-violet-400 font-semibold" />
              <RowDetalle label="Total ventas cobradas" value={formatMoney(shiftMetrics.totalSales)} accent="font-bold text-sm text-primary dark:text-emerald-400" />
              <RowDetalle label="Total salidas de efectivo" value={`−${formatMoney(shiftMetrics.expensesCash)}`} accent="text-red-600 font-semibold" />
              <div className="p-3 bg-emerald-50/50 dark:bg-emerald-950/20 flex items-center justify-between font-semibold text-sm">
                <span className="text-emerald-900 dark:text-emerald-200">Efectivo actual en cajón</span>
                <span className="font-display text-emerald-800 dark:text-emerald-300 text-base">{formatMoney(shiftMetrics.expectedCash)}</span>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                className="btn-primary flex-1"
                onClick={() => void handleDownloadCorteX()}
              >
                <Printer className="h-4 w-4" />
                Descargar Ticket Corte X (PDF)
              </Button>
              <Button
                className="btn-secondary"
                onClick={() => setCorteXModal(false)}
              >
                Cerrar vista
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ======================================================== */}
      {/* MODAL 3: CORTE Z (ARQUEO CIEGO Y CIERRE DE DÍA)          */}
      {/* ======================================================== */}
      {currentShift && shiftMetrics && (
        <Modal
          open={corteZModal}
          onClose={() => setCorteZModal(false)}
          title="Corte Z — Arqueo Ciego y Cierre de Turno"
        >
          <div className="space-y-4">
            {corteZStep === 'conteo' ? (
              /* PASO 1: CONTEO FÍSICO CIEGO */
              <div className="space-y-4">
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950/30">
                  <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-semibold text-xs">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    Arqueo Ciego de Seguridad
                  </div>
                  <p className="text-xs text-amber-800/90 dark:text-amber-200/90 mt-1">
                    Cuenta todo el dinero físico en billetes y monedas que hay en el cajón e ingresa el total exacto. El sistema no muestra el cálculo previo para evitar sesgos o alteraciones.
                  </p>
                </div>

                <Field label="Dinero Físico Total en Cajón ($ MXN)">
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    autoFocus
                    value={countedCash}
                    onChange={(e) => setCountedCash(e.target.value)}
                    placeholder="0.00"
                    className="text-xl font-display font-bold py-3 text-center"
                  />
                </Field>

                <Field label="Notas del Cierre / Observaciones">
                  <Input
                    value={corteZNotes}
                    onChange={(e) => setCorteZNotes(e.target.value)}
                    placeholder="Ej. Se dejaron $500 para mañana, monedas en bolsa..."
                  />
                </Field>

                <Button
                  className="btn-primary w-full"
                  onClick={handleCalculateBlindAudit}
                >
                  Comparar y Auditar Caja
                </Button>
              </div>
            ) : (
              /* PASO 2: RESULTADO DE AUDITORÍA (SOBRANTE / FALTANTE) */
              <div className="space-y-4">
                {(() => {
                  const counted = round2(Number(countedCash))
                  const diff = round2(counted - shiftMetrics.expectedCash)
                  const isExact = diff === 0
                  const isOver = diff > 0

                  return (
                    <>
                      <div
                        className={`rounded-xl border p-4 text-center ${
                          isExact
                            ? 'bg-emerald-50 border-emerald-300 dark:bg-emerald-950/40 dark:border-emerald-800'
                            : isOver
                              ? 'bg-blue-50 border-blue-300 dark:bg-blue-950/40 dark:border-blue-800'
                              : 'bg-red-50 border-red-300 dark:bg-red-950/40 dark:border-red-800'
                        }`}
                      >
                        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                          Auditoría de Cierre
                        </span>
                        <p
                          className={`font-display text-2xl font-bold mt-1 ${
                            isExact
                              ? 'text-emerald-700 dark:text-emerald-300'
                              : isOver
                                ? 'text-blue-700 dark:text-blue-300'
                                : 'text-red-700 dark:text-red-300'
                          }`}
                        >
                          {isExact ? '¡Caja Cuadrada Exacta!' : isOver ? `Sobrante: +${formatMoney(diff)}` : `Faltante: −${formatMoney(Math.abs(diff))}`}
                        </p>
                      </div>

                      <div className="rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-700 text-xs">
                        <RowDetalle label="Dinero físico contado por cajero" value={formatMoney(counted)} accent="font-semibold text-slate-900 dark:text-slate-100" />
                        <RowDetalle label="Efectivo calculado por el sistema" value={formatMoney(shiftMetrics.expectedCash)} accent="font-semibold text-slate-600 dark:text-slate-300" />
                        <RowDetalle
                          label="Diferencia final"
                          value={isExact ? '$0.00' : isOver ? `+${formatMoney(diff)}` : `−${formatMoney(Math.abs(diff))}`}
                          accent={`font-bold text-sm ${isExact || isOver ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}
                        />
                      </div>

                      <div className="flex gap-2">
                        <Button
                          className="btn-secondary flex-1"
                          onClick={() => setCorteZStep('conteo')}
                        >
                          Volver a contar
                        </Button>
                        <Button
                          className="btn-danger flex-1"
                          disabled={corteZBusy}
                          onClick={() => void handleConfirmCloseShift()}
                        >
                          <Lock className="h-4 w-4" />
                          Confirmar Cierre y Descargar Ticket
                        </Button>
                      </div>
                    </>
                  )
                })()}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* ======================================================== */}
      {/* MODAL 4: NUEVO MOVIMIENTO (CAJA CHICA TIPIFICADA)        */}
      {/* ======================================================== */}
      <Modal open={movementModal} onClose={() => setMovementModal(false)} title="Movimiento de Caja Chica">
        <div className="space-y-4">
          <div className="flex gap-1 rounded-lg bg-slate-200 p-1 dark:bg-slate-700">
            <button
              type="button"
              onClick={() => setMovType('egreso')}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                movType === 'egreso' ? 'bg-white text-red-700 shadow-sm dark:bg-slate-900 dark:text-red-400' : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <ArrowDownCircle className="h-4 w-4" />
              Salida / Gasto (−)
            </button>
            <button
              type="button"
              onClick={() => setMovType('ingreso')}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                movType === 'ingreso' ? 'bg-white text-emerald-800 shadow-sm dark:bg-slate-900 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <ArrowUpCircle className="h-4 w-4" />
              Entrada Extra (+)
            </button>
          </div>

          {movType === 'egreso' && (
            <Field label="1.3 Subcategoría Tipificada del Gasto">
              <Select
                value={movExpenseCat}
                onChange={(e) => setMovExpenseCat(e.target.value as CashExpenseCategory)}
              >
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <Field label="Concepto">
            <Input
              value={movConcept}
              onChange={(e) => setMovConcept(e.target.value)}
              placeholder={
                movType === 'egreso'
                  ? movExpenseCat === 'proveedor'
                    ? 'Ej. Abono a factura de solventes Comex'
                    : movExpenseCat === 'retiro_seguro'
                      ? 'Ej. Traslado a caja fuerte / depósito'
                      : 'Ej. Pago de recibo de luz o comida de personal'
                  : 'Ej. Renta de equipo o aportación voluntaria'
              }
            />
          </Field>

          <Field label="Monto en pesos ($ MXN)">
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={movAmount}
              onChange={(e) => setMovAmount(e.target.value)}
              placeholder="0.00"
            />
          </Field>

          <Button
            className={movType === 'ingreso' ? 'btn-primary w-full' : 'btn-danger w-full'}
            disabled={movBusy}
            onClick={() => void handleSaveMovement()}
          >
            <Plus className="h-4 w-4" />
            Guardar {movType === 'ingreso' ? 'Entrada' : 'Salida'}
          </Button>
        </div>
      </Modal>
    </div>
  )
}

function RowDetalle({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="flex items-center justify-between px-3 py-2.5 text-xs sm:text-sm">
      <span className="font-medium text-slate-600 dark:text-slate-300">{label}</span>
      <span className={`font-display tabular-nums ${accent}`}>{value}</span>
    </div>
  )
}

function MovementsListView({ onRemove }: { onRemove: (id: string) => void }) {
  const entries = useLiveQuery(() => db.cashEntries.orderBy('date').reverse().toArray(), []) ?? []

  if (entries.length === 0) {
    return <EmptyState icon={<PiggyBank className="h-10 w-10 text-slate-400" />} title="Sin movimientos de caja chica registrados" />
  }

  return (
    <div className="card overflow-hidden">
      <div className="divide-y divide-slate-100 dark:divide-slate-700">
        {entries.map((e) => {
          const isInitialFund = e.subCategory === 'fondo_inicial'
          const catLabel =
            e.subCategory === 'operativo'
              ? '🏢 Operativo'
              : e.subCategory === 'proveedor'
                ? '🚚 Proveedor'
                : e.subCategory === 'retiro_seguro'
                  ? '🔒 Retiro Seguro'
                  : isInitialFund
                    ? '💼 Fondo Inicial'
                    : e.category || 'General'

          return (
            <div key={e.id} className="flex items-center gap-3 px-3 py-2.5">
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                  e.type === 'ingreso'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                    : 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300'
                }`}
              >
                {e.type === 'ingreso' ? <ArrowUpCircle className="h-4 w-4" /> : <ArrowDownCircle className="h-4 w-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-100">{e.concept}</p>
                <p className="text-xs text-slate-400">
                  {new Date(e.date).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  {' · '}
                  <span className="font-medium text-slate-500 dark:text-slate-400">{catLabel}</span>
                </p>
              </div>
              <span
                className={`font-display text-sm font-semibold tabular-nums ${
                  e.type === 'ingreso' ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                }`}
              >
                {e.type === 'ingreso' ? '+' : '−'}{formatMoney(e.amount)}
              </span>
              {!isInitialFund && (
                <button
                  onClick={() => onRemove(e.id)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-600 dark:hover:bg-slate-700 transition"
                  aria-label="Eliminar"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}