import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { toast } from 'sonner'
import { Wallet, TrendingUp, TrendingDown, Plus, Trash2, PiggyBank, ArrowDownCircle, ArrowUpCircle } from 'lucide-react'
import { db } from '../db/db'
import { addCashEntry, cashSummary, deleteCashEntry } from '../db/repos'
import type { CashType } from '../types'
import { formatMoney, round2 } from '../lib/utils'
import { Button, EmptyState, Field, Input, Modal, Segmented, Select } from '../components/ui'

const CATEGORIES = ['Ventas', 'Renta', 'Inversión', 'Gastos', 'Otro']

type View = 'caja' | 'movimientos'

export default function Money() {
  const [view, setView] = useState<View>('caja')
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<CashType>('ingreso')
  const [concept, setConcept] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('')
  const [busy, setBusy] = useState(false)

  const summary = useLiveQuery(() => cashSummary(), []) ?? null

  const save = async () => {
    if (!concept.trim()) {
      toast.error('Escribe un concepto')
      return
    }
    const value = round2(Number(amount))
    if (!Number.isFinite(value) || value <= 0) {
      toast.error('Monto inválido')
      return
    }
    setBusy(true)
    try {
      await addCashEntry({
        date: Date.now(),
        type,
        concept: concept.trim(),
        amount: value,
        category: category || undefined,
      })
      toast.success(type === 'ingreso' ? 'Ingreso registrado' : 'Egreso registrado')
      setConcept('')
      setAmount('')
      setCategory('')
      setOpen(false)
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: string) => {
    if (!window.confirm('¿Eliminar este movimiento?')) return
    await deleteCashEntry(id)
    toast.success('Movimiento eliminado')
  }

  return (
    <div className="space-y-4 p-3 pb-6">
      <Segmented
        value={view}
        onChange={setView}
        options={[
          { value: 'caja', label: 'Caja y Balance' },
          { value: 'movimientos', label: 'Historial de Movimientos' },
        ]}
      />

      {view === 'caja' ? (
        <>
          {!summary ? (
            <EmptyState icon={<Wallet className="h-10 w-10" />} title="Cargando balance..." />
          ) : (
            <>
              <div className="card relative overflow-hidden p-6 text-center bg-gradient-to-b from-white via-white to-slate-50/50 dark:from-slate-900 dark:to-slate-900/80 border border-slate-200/90 shadow-xs">
                <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider text-slate-500 bg-slate-100 dark:bg-slate-800 dark:text-slate-400">
                  <Wallet className="h-3.5 w-3.5 text-primary dark:text-emerald-400" />
                  Saldo neto en caja
                </span>
                <p className={`font-display mt-3 text-4xl sm:text-5xl font-extrabold tracking-tight tabular-nums ${
                  summary.saldo >= 0 ? 'text-primary dark:text-emerald-400' : 'text-danger'
                }`}>
                  {formatMoney(summary.saldo)}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                <div className="card p-3.5 flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Total Ingresos</span>
                    <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                      <TrendingUp className="h-4 w-4" />
                    </span>
                  </div>
                  <p className="font-display text-xl sm:text-2xl font-extrabold text-emerald-700 dark:text-emerald-400 tabular-nums mt-2">
                    +{formatMoney(summary.ingresos)}
                  </p>
                </div>

                <div className="card p-3.5 flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Total Egresos</span>
                    <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300">
                      <TrendingDown className="h-4 w-4" />
                    </span>
                  </div>
                  <p className="font-display text-xl sm:text-2xl font-extrabold text-red-600 dark:text-red-400 tabular-nums mt-2">
                    −{formatMoney(summary.egresos)}
                  </p>
                </div>
              </div>

              <div className="card divide-y divide-slate-100 overflow-hidden dark:divide-slate-800">
                <RowDetalle label="Ventas cobradas en mostrador" value={formatMoney(summary.salesTotal)} accent="text-emerald-700 dark:text-emerald-400 font-bold" />
                <RowDetalle label="Ingresos adicionales (rentas, extras)" value={formatMoney(round2(summary.ingresos - summary.salesTotal))} accent="text-emerald-700 dark:text-emerald-400 font-bold" />
                <RowDetalle label="Compras / resurtidos de mercancía" value={formatMoney(summary.purchasesTotal)} accent="text-red-600 dark:text-red-400 font-bold" />
                <RowDetalle label="Egresos y gastos operativos" value={formatMoney(round2(summary.egresos - summary.purchasesTotal))} accent="text-red-600 dark:text-red-400 font-bold" />
              </div>

              <Button className="btn btn-primary w-full py-3 text-base shadow-sm shadow-primary/25" onClick={() => setOpen(true)}>
                <Plus className="h-5 w-5" />Registrar movimiento manual
              </Button>
            </>
          )}
        </>
      ) : (
        <MovementsView onRemove={(id) => void remove(id)} />
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Nuevo movimiento de caja">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-slate-200/80 p-1 border border-slate-300/40 dark:bg-slate-800/90 dark:border-slate-700/60">
            <button
              onClick={() => setType('ingreso')}
              className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs sm:text-sm font-bold tracking-tight transition ${
                type === 'ingreso' ? 'bg-white text-emerald-800 shadow-xs dark:bg-slate-900 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <ArrowUpCircle className="h-4 w-4" />Ingreso (+)
            </button>
            <button
              onClick={() => setType('egreso')}
              className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs sm:text-sm font-bold tracking-tight transition ${
                type === 'egreso' ? 'bg-white text-red-700 shadow-xs dark:bg-slate-900 dark:text-red-400' : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <ArrowDownCircle className="h-4 w-4" />Egreso (−)
            </button>
          </div>

          <Field label="Concepto">
            <Input
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              placeholder={type === 'ingreso' ? 'Ej. Renta de andamio o escalera' : 'Ej. Surtido de solventes o flete'}
            />
          </Field>

          <Field label="Monto en pesos">
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </Field>

          <Field label="Categoría">
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Sin categoría</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Select>
          </Field>

          <Button className={type === 'ingreso' ? 'btn btn-primary w-full py-3 text-base shadow-sm shadow-primary/20' : 'btn btn-danger w-full py-3 text-base shadow-sm shadow-red-600/20'} disabled={busy} onClick={() => void save()}>
            <Plus className="h-5 w-5" />Guardar {type === 'ingreso' ? 'ingreso' : 'egreso'}
          </Button>
        </div>
      </Modal>
    </div>
  )
}

function RowDetalle({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 text-xs sm:text-sm">
      <span className="font-medium text-slate-600 dark:text-slate-300">{label}</span>
      <span className={`font-display tabular-nums ${accent}`}>{value}</span>
    </div>
  )
}

function MovementsView({ onRemove }: { onRemove: (id: string) => void }) {
  const entries = useLiveQuery(() => db.cashEntries.orderBy('date').reverse().toArray(), []) ?? []

  if (entries.length === 0) {
    return <EmptyState icon={<PiggyBank className="h-10 w-10" />} title="Sin movimientos registrados" />
  }

  return (
    <div className="card overflow-hidden">
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {entries.map((e) => (
          <div key={e.id} className="flex items-center gap-3 px-4 py-3">
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
              e.type === 'ingreso'
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                : 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300'
            }`}>
              {e.type === 'ingreso' ? <ArrowUpCircle className="h-4.5 w-4.5" /> : <ArrowDownCircle className="h-4.5 w-4.5" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100">{e.concept}</p>
              <p className="text-[11px] text-slate-400">
                {new Date(e.date).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                {e.category ? ` · ${e.category}` : ''}
              </p>
            </div>
            <span className={`font-display text-sm font-bold tabular-nums ${
              e.type === 'ingreso' ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
            }`}>
              {e.type === 'ingreso' ? '+' : '−'}{formatMoney(e.amount)}
            </span>
            <button
              onClick={() => onRemove(e.id)}
              className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-600 dark:hover:bg-slate-800 transition"
              aria-label="Eliminar"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}