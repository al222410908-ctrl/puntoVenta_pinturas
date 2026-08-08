import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { toast } from 'sonner'
import { History, SlidersHorizontal } from 'lucide-react'
import { db } from '../db/db'
import { adjustStock } from '../db/repos'
import type { MovementType } from '../types'
import { formatQty } from '../lib/units'
import { Button, EmptyState, Field, Input, Modal, Segmented, Select } from '../components/ui'

type Tab = 'ajustes' | 'historial'

const MOVEMENT_LABELS: Record<MovementType, string> = {
  venta: 'Venta',
  compra: 'Compra',
  ajuste: 'Ajuste',
  devolucion: 'Devolución',
}

const MOVEMENT_COLORS: Record<MovementType, string> = {
  venta: 'chip chip-info',
  compra: 'chip chip-ok',
  ajuste: 'chip chip-warn',
  devolucion: 'chip chip-devol',
}

export default function Inventory() {
  const [tab, setTab] = useState<Tab>('ajustes')
  return (
    <div className="flex h-full flex-col">
      <div className="p-3">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'ajustes', label: 'Ajustes' },
            { value: 'historial', label: 'Historial' },
          ]}
        />
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-6">
        {tab === 'ajustes' && <Adjustments />}
        {tab === 'historial' && <HistoryView />}
      </div>
    </div>
  )
}

function Adjustments() {
  const products = useLiveQuery(() => db.products.toArray(), []) ?? []
  const [productId, setProductId] = useState('')
  const [qty, setQty] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const product = products.find((p) => p.id === productId)
  const delta = Number(qty) || 0

  const apply = async () => {
    if (!product || delta === 0) {
      toast.error('Selecciona producto y una cantidad distinta de cero')
      return
    }
    setBusy(true)
    try {
      await adjustStock(product, delta, note.trim() || undefined)
      toast.success(`Stock de ${product.name} ajustado`)
      setQty('')
      setNote('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card space-y-3 p-4">
      <p className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-300">
        <SlidersHorizontal className="h-4 w-4" />
        Usa cantidades <b>positivas</b> para entradas (mermas compensadas, sobrantes) y <b>negativas</b> para salidas (merma, pérdida, corrección).
      </p>
      <Field label="Producto">
        <Select value={productId} onChange={(e) => setProductId(e.target.value)}>
          <option value="">Selecciona producto…</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </Field>
      {product && (
        <p className="text-sm text-slate-500 dark:text-slate-300">
          Stock actual: <b>{formatQty(product.stock, product.unit)}</b>
          {delta !== 0 && (
            <> → nuevo stock: <b>{formatQty(product.stock + delta, product.unit)}</b></>
          )}
        </p>
      )}
      <Field label="Cantidad (positiva o negativa)">
        <Input type="number" inputMode="decimal" step="0.01" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Ej. -2 o 5" />
      </Field>
      <Field label="Motivo">
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. merma, devolución, corrección…" />
      </Field>
      <Button className="w-full" disabled={busy} onClick={() => void apply()}>Aplicar ajuste</Button>
    </div>
  )
}

function HistoryView() {
  const movements = useLiveQuery(() => db.stockMovements.toArray(), []) ?? []
  const [filter, setFilter] = useState<MovementType | ''>('')
  const [detail, setDetail] = useState<{ id: string; label: string; date: number } | null>(null)

  const sorted = useMemo(
    () => [...movements].sort((a, b) => b.date - a.date).filter((m) => !filter || m.type === filter),
    [movements, filter],
  )

  return (
    <div>
      <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
        {(['', 'venta', 'compra', 'ajuste', 'devolucion'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`shrink-0 rounded-full px-3 py-1 text-sm font-medium ${
              filter === f ? 'bg-primary text-white' : 'bg-white border border-slate-200 text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300'
            }`}
          >
            {f === '' ? 'Todos' : MOVEMENT_LABELS[f]}
          </button>
        ))}
      </div>
      {sorted.length === 0 ? (
        <EmptyState icon={<History className="h-10 w-10" />} title="Sin movimientos" />
      ) : (
        <div className="space-y-2">
          {sorted.map((m) => (
            <div key={m.id} className="card flex items-center gap-3 p-3">
              <span className={`shrink-0 ${MOVEMENT_COLORS[m.type]}`}>
                {MOVEMENT_LABELS[m.type]}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{m.productName}</p>
                <p className="text-xs text-slate-400">{new Date(m.date).toLocaleString('es-MX')}</p>
              </div>
              <span className={`text-sm font-bold ${m.qty >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                {m.qty >= 0 ? '+' : ''}{formatQty(m.qty, m.unit)}
              </span>
              <button
                onClick={() => setDetail({ id: m.id, label: m.note ?? '', date: m.date })}
                className="rounded-lg px-2 py-1 text-xs text-primary hover:bg-blue-50 dark:hover:bg-blue-900/30"
              >
                Detalle
              </button>
            </div>
          ))}
        </div>
      )}

      <Modal open={!!detail} onClose={() => setDetail(null)} title="Detalle del movimiento">
        {detail && (
          <div className="space-y-2 text-sm text-slate-700 dark:text-slate-200">
            <p><b>Fecha:</b> {new Date(detail.date).toLocaleString('es-MX')}</p>
            <p><b>Motivo:</b> {detail.label || '—'}</p>
          </div>
        )}
      </Modal>
    </div>
  )
}
