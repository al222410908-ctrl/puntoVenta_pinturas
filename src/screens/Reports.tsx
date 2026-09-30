import { useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { toast } from 'sonner'
import { BarChart3, Download, Upload, Wallet, CreditCard, TrendingUp, Coins, PackageOpen, RefreshCw } from 'lucide-react'
import { db } from '../db/db'
import { exportBackup, restoreBackup } from '../db/repos'
import type { Backup } from '../types'
import { formatMoney, round2 } from '../lib/utils'
import { Button, EmptyState, Segmented } from '../components/ui'
import { syncNow, lastSyncAt } from '../lib/sync'

type Range = 'hoy' | 'semana' | 'mes' | 'todo'

const RANGES: { value: Range; label: string }[] = [
  { value: 'hoy', label: 'Hoy' },
  { value: 'semana', label: 'Semana' },
  { value: 'mes', label: 'Mes' },
  { value: 'todo', label: 'Todo' },
]

export default function Reports() {
  const [range, setRange] = useState<Range>('hoy')
  const sales = useLiveQuery(() => db.sales.toArray(), []) ?? []
  const fileRef = useRef<HTMLInputElement>(null)
  const [syncing, setSyncing] = useState(false)
  const [, setLast] = useState(lastSyncAt())

  const start = useMemo(() => {
    const now = new Date()
    if (range === 'hoy') return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    if (range === 'semana') {
      const d = new Date(now)
      const day = (d.getDay() + 6) % 7
      d.setDate(d.getDate() - day)
      d.setHours(0, 0, 0, 0)
      return d.getTime()
    }
    if (range === 'mes') return new Date(now.getFullYear(), now.getMonth(), 1).getTime()
    return 0
  }, [range])

  const filtered = useMemo(() => sales.filter((s) => s.date >= start), [sales, start])

  const totals = useMemo(() => {
    let count = 0
    let cash = 0
    let card = 0
    let profit = 0
    const byProduct = new Map<string, { name: string; qty: number; sales: number; profit: number }>()
    for (const s of filtered) {
      count++
      for (const p of s.payments) {
        if (p.type === 'efectivo') cash += p.amount
        else card += p.amount
      }
      for (const it of s.items) {
        const margin = (it.unitPrice - it.cost) * it.qty
        profit += margin
        const cur = byProduct.get(it.productId) ?? { name: it.name, qty: 0, sales: 0, profit: 0 }
        cur.qty += it.qty
        cur.sales += it.lineTotal
        cur.profit += margin
        byProduct.set(it.productId, cur)
      }
    }
    const total = round2(filtered.reduce((s, x) => s + x.total, 0))
    const list = [...byProduct.values()].sort((a, b) => b.profit - a.profit)
    return { count, cash: round2(cash), card: round2(card), total, profit: round2(profit), list }
  }, [filtered])

  const last7 = useMemo(() => {
    const now = new Date()
    const days: { label: string; total: number }[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
      const start = d.getTime()
      const end = start + 86_400_000
      days.push({
        label: d.toLocaleDateString('es-MX', { weekday: 'short' }),
        total: round2(sales.filter((s) => s.date >= start && s.date < end).reduce((sum, s) => sum + s.total, 0)),
      })
    }
    return days
  }, [sales])
  const last7Max = Math.max(...last7.map((d) => d.total), 0)
  const topByQty = useMemo(
    () => [...totals.list].sort((a, b) => b.qty - a.qty).slice(0, 5),
    [totals.list],
  )
  const fmtCompact = (n: number) =>
    new Intl.NumberFormat('es-MX', { notation: 'compact', maximumFractionDigits: 1 }).format(n)

  const handleExport = async () => {
    const data = await exportBackup()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pinturas-pos-respaldo-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Respaldo exportado')
  }

  const doSync = async () => {
    if (syncing) return
    setSyncing(true)
    try {
      const r = await syncNow()
      setLast(r.down)
      toast.success(r.changed > 0 ? `Sincronizado (${r.changed} cambios)` : 'Todo sincronizado')
    } catch (e) {
      toast.error(e instanceof Error && e.message === 'Failed to fetch' ? 'Sin conexión con el servidor de sincronización' : 'Error al sincronizar')
    } finally {
      setSyncing(false)
    }
  }

  const handleExportCsv = () => {
    if (filtered.length === 0) {
      toast.error('No hay ventas en este periodo')
      return
    }
    const rows: string[][] = [
      ['Fecha', 'Producto', 'Cantidad', 'Unidad', 'Precio unitario', 'Subtotal', 'Costo', 'Utilidad', 'Total venta'],
    ]
    for (const s of filtered) {
      for (const it of s.items) {
        rows.push([
          new Date(s.date).toLocaleString('es-MX'),
          it.name,
          String(it.qty),
          it.unit,
          it.unitPrice.toFixed(2),
          it.lineTotal.toFixed(2),
          it.cost.toFixed(2),
          round2((it.unitPrice - it.cost) * it.qty).toFixed(2),
          s.total.toFixed(2),
        ])
      }
    }
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\r\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pinturas-pos-ventas-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('CSV de ventas exportado')
  }

  const handleImport = async (file: File) => {
    try {
      const text = await file.text()
      const data = JSON.parse(text) as Backup
      if (data.version !== 2 && (data as { version?: unknown }).version !== 1) throw new Error('Formato no válido')
      if (!window.confirm('Esto REEMPLAZARÁ todos los datos actuales con los del respaldo. ¿Continuar?')) return
      await restoreBackup(data)
      toast.success('Respaldo restaurado')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Archivo no válido')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="space-y-4 p-3 pb-6">
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <Segmented value={range} onChange={setRange} options={RANGES} />
        </div>
        <Button className="btn-secondary shrink-0" onClick={handleExportCsv} title="Exportar ventas a CSV">
          <Download className="h-4 w-4" />CSV
        </Button>
      </div>

      {totals.count === 0 ? (
        <EmptyState icon={<BarChart3 className="h-10 w-10" />} title="Sin ventas en este periodo" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
            <StatCard
              icon={<Wallet className="h-4 w-4" />}
              label="Ventas totales"
              value={formatMoney(totals.total)}
              accent="text-primary dark:text-emerald-400"
              bgAccent="bg-primary/10 text-primary dark:bg-emerald-950/60 dark:text-emerald-400"
            />
            <StatCard
              icon={<TrendingUp className="h-4 w-4" />}
              label="Utilidad estimada"
              value={formatMoney(totals.profit)}
              accent="text-emerald-700 dark:text-emerald-400"
              bgAccent="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
            />
            <StatCard
              icon={<Coins className="h-4 w-4" />}
              label="Efectivo"
              value={formatMoney(totals.cash)}
              accent="text-slate-800 dark:text-slate-200"
              bgAccent="bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
            />
            <StatCard
              icon={<CreditCard className="h-4 w-4" />}
              label="Tarjeta"
              value={formatMoney(totals.card)}
              accent="text-slate-800 dark:text-slate-200"
              bgAccent="bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300"
            />
          </div>
          <div className="card flex items-center justify-between p-3.5 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
            <span className="font-semibold text-slate-800 dark:text-slate-100">
              {totals.count} {totals.count === 1 ? 'operación registrada' : 'operaciones registradas'}
            </span>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800 border border-emerald-200/80 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800/40">
              <span>Margen global:</span>
              <span className="tabular-nums">{totals.total > 0 ? `${((totals.profit / totals.total) * 100).toFixed(1)}%` : '0%'}</span>
            </div>
          </div>
        </>
      )}

      <div className="card p-4">
        <p className="font-display text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100 uppercase">
          Ventas últimos 7 días
        </p>
        <div className="mt-4 flex h-36 items-end gap-2">
          {last7.map((d) => {
            const pct = last7Max > 0 ? Math.max(8, Math.round((d.total / last7Max) * 100)) : 0
            return (
              <div key={d.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                <span className="font-display text-[10px] font-bold text-slate-600 dark:text-slate-400 tabular-nums">
                  {d.total > 0 ? fmtCompact(d.total) : ''}
                </span>
                <div
                  className="w-full rounded-t-lg bg-gradient-to-t from-primary-700 via-primary to-primary-600 shadow-2xs transition-all duration-300 hover:brightness-110"
                  style={{ height: `${pct}%` }}
                />
                <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase">{d.label}</span>
              </div>
            )
          })}
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-slate-200/80 bg-slate-50/70 px-4 py-2.5 font-display text-xs font-bold uppercase tracking-wider text-slate-700 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-300">
          Top 5 más vendidos
        </div>
        {topByQty.length === 0 ? (
          <p className="p-4 text-xs text-slate-400">Sin datos de venta</p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {topByQty.map((r, i) => (
              <div key={r.name} className="flex items-center gap-3 px-4 py-2.5">
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${
                  i === 0 ? 'bg-amber-500 text-slate-950 font-extrabold shadow-2xs' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                }`}>
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100">{r.name}</p>
                  <p className="text-[11px] text-slate-400">{r.qty} unidades · {formatMoney(r.sales)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-slate-200/80 bg-slate-50/70 px-4 py-2.5 font-display text-xs font-bold uppercase tracking-wider text-slate-700 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-300">
          Utilidad por producto
        </div>
        {totals.list.length === 0 ? (
          <p className="p-4 text-xs text-slate-400">Sin datos de utilidad</p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {totals.list.slice(0, 15).map((r) => (
              <div key={r.name} className="flex items-center gap-2 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100">{r.name}</p>
                  <p className="text-[11px] text-slate-400">{r.qty} vendido · {formatMoney(r.sales)}</p>
                </div>
                <span className="font-display text-xs sm:text-sm font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                  +{formatMoney(round2(r.profit))}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card space-y-3 p-4">
        <p className="flex items-center gap-2 font-display text-sm font-bold text-slate-800 dark:text-slate-100">
          <PackageOpen className="h-4 w-4 text-primary dark:text-emerald-400" />
          Respaldo de datos
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Button className="btn-secondary" onClick={() => void handleExport()}>
            <Download className="h-4 w-4" />Exportar
          </Button>
          <Button className="btn-secondary" onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4" />Importar
          </Button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void handleImport(f)
          }}
        />
        <p className="text-[11px] text-slate-400 leading-relaxed">
          Los datos viven localmente en este dispositivo. Exporta un respaldo periódicamente para tener siempre una copia segura.
        </p>
      </div>

      <div className="card space-y-3 p-4">
        <p className="flex items-center gap-2 font-display text-sm font-bold text-slate-800 dark:text-slate-100">
          <RefreshCw className="h-4 w-4 text-primary dark:text-emerald-400" />
          Sincronización en la nube
        </p>
        <Button
          onClick={() => void doSync()}
          disabled={syncing}
          className="w-full"
        >
          <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Sincronizando…' : 'Sincronizar ahora'}
        </Button>
        <p className="text-[11px] text-slate-400">
          {lastSyncAt() > 0
            ? `Última sincronización: ${new Date(lastSyncAt()).toLocaleString()}`
            : 'Aún no se ha sincronizado con el servidor.'}
        </p>
      </div>
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
  accent,
  bgAccent,
}: {
  icon: React.ReactNode
  label: string
  value: string
  accent: string
  bgAccent?: string
}) {
  return (
    <div className="card flex flex-col justify-between p-3.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          {label}
        </span>
        <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${bgAccent ?? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
          {icon}
        </div>
      </div>
      <p className={`font-display text-xl sm:text-2xl font-extrabold tracking-tight mt-2 tabular-nums ${accent}`}>
        {value}
      </p>
    </div>
  )
}
