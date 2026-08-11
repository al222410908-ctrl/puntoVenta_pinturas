import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { toast } from 'sonner'
import { Wallet, TrendingUp, TrendingDown, Plus, Trash2, PiggyBank, ArrowDownCircle, ArrowUpCircle } from 'lucide-react'
import { db } from '../db/db'
import { addCashEntry, cashSummary, deleteCashEntry } from '../db/repos'
import type { CashType } from '../types'
import { formatMoney, round2 } from '../lib/utils'
import { Button, EmptyState, Field, Input, Modal, Select } from '../components/ui'

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
      <div className="flex gap-1 rounded-lg bg-slate-200 p-1 dark:bg-slate-700">
        {(['caja', 'movimientos'] as View[]).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${
              view === v ? 'bg-white text-primary shadow-sm dark:bg-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            {v === 'caja' ? 'Caja / Resultados' : 'Movimientos'}
          </button>
        ))}
      </div>

      {view === 'caja' ? (
        <>
          {!summary ? (
            <EmptyState icon={<Wallet className="h-10 w-10" />} title="Cargando..." />
          ) : (
            <>
              <div className="card p-4 text-center">
                <p className="text-sm text-slate-500 dark:text-slate-400">Saldo actual</p>
                <p className={`font-display mt-1 text-4xl font-semibold ${summary.saldo >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600'}`}>
                  {formatMoney(summary.saldo)}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="card p-3">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                    <TrendingUp className="h-4 w-4 text-emerald-600" />Ingresos
                  </p>
                  <p className="font-display mt-1 text-xl font-semibold text-emerald-600 dark:text-emerald-400">{formatMoney(summary.ingresos)}</p>
                </div>
                <div className="card p-3">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                    <TrendingDown className="h-4 w-4 text-red-500" />Egresos
                  </p>
                  <p className="font-display mt-1 text-xl font-semibold text-red-600 dark:text-red-400">{formatMoney(summary.egresos)}</p>
                </div>
              </div>

              <div className="card divide-y divide-slate-100 dark:divide-slate-700">
                <RowDetalle label="Ventas realizadas" value={formatMoney(summary.salesTotal)} accent="text-emerald-600" />
                <RowDetalle label="Ingresos manuales (rentas, extras)" value={formatMoney(round2(summary.ingresos - summary.salesTotal))} accent="text-emerald-600" />
                <RowDetalle label="Compras / resurtidos" value={formatMoney(summary.purchasesTotal)} accent="text-red-500" />
                <RowDetalle label="Egresos manuales (inversión, gastos)" value={formatMoney(round2(summary.egresos - summary.purchasesTotal))} accent="text-red-500" />
              </div>

              <Button className="btn btn-primary w-full" onClick={() => setOpen(true)}>
                <Plus className="h-4 w-4" />Registrar ingreso o egreso
              </Button>
            </>
          )}
        </>
      ) : (
        <MovementsView onRemove={(id) => void remove(id)} />
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Nuevo movimiento">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-200 p-1 dark:bg-slate-700">
            <button
              onClick={() => setType('ingreso')}
              className={`flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                type === 'ingreso' ? 'bg-white text-emerald-600 shadow-sm dark:bg-slate-900 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <ArrowUpCircle className="h-4 w-4" />Ingreso
            </button>
            <button
              onClick={() => setType('egreso')}
              className={`flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                type === 'egreso' ? 'bg-white text-red-600 shadow-sm dark:bg-slate-900 dark:text-red-400' : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <ArrowDownCircle className="h-4 w-4" />Egreso
            </button>
          </div>

          <Field label="Concepto">
            <Input
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              placeholder={type === 'ingreso' ? 'Ej. Renta de escalera' : 'Ej. Surtido semanal de comex'}
            />
          </Field>

          <Field label="Monto">
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

          <Button className={type === 'ingreso' ? 'btn btn-primary w-full' : 'btn btn-danger w-full'} disabled={busy} onClick={() => void save()}>
            <Plus className="h-4 w-4" />Guardar
          </Button>
        </div>
      </Modal>
    </div>
  )
}

function RowDetalle({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="flex items-center justify-between px-3 py-2.5">
      <span className="text-sm text-slate-600 dark:text-slate-300">{label}</span>
      <span className={`text-sm font-semibold ${accent}`}>{value}</span>
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
      <div className="divide-y divide-slate-100 dark:divide-slate-700">
        {entries.map((e) => (
          <div key={e.id} className="flex items-center gap-2 px-3 py-2">
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${e.type === 'ingreso' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300'}`}>
              {e.type === 'ingreso' ? <ArrowUpCircle className="h-4 w-4" /> : <ArrowDownCircle className="h-4 w-4" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{e.concept}</p>
              <p className="text-xs text-slate-400">
                {new Date(e.date).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                {e.category ? ` · ${e.category}` : ''}
              </p>
            </div>
            <span className={`text-sm font-bold ${e.type === 'ingreso' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
              {e.type === 'ingreso' ? '+' : '−'}{formatMoney(e.amount)}
            </span>
            <button onClick={() => onRemove(e.id)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-500 dark:hover:bg-slate-700" aria-label="Eliminar">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}