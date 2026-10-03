import { useMemo, useRef, useState, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { toast } from 'sonner'
import {
  Camera,
  CheckCircle2,
  Flame,
  History,
  Minus,
  Plus,
  Printer,
  RotateCcw,
  ScanLine,
  Search,
} from 'lucide-react'
import { db } from '../db/db'
import { applyInventoryAudit, registerMerma } from '../db/repos'
import type { MermaReason, MovementType, Product } from '../types'
import { formatMoney, round2 } from '../lib/utils'
import { formatQty } from '../lib/units'
import { Button, EmptyState, Field, Input, Modal, Segmented, Select } from '../components/ui'
import { BarcodeScanner } from '../components/BarcodeScanner'

type Tab = 'auditoria' | 'mermas' | 'historial'

const MOVEMENT_LABELS: Record<MovementType, string> = {
  venta: 'Venta',
  compra: 'Compra',
  ajuste: 'Ajuste',
  devolucion: 'Devolución',
  merma: 'Merma',
}

const MOVEMENT_COLORS: Record<MovementType, string> = {
  venta: 'chip chip-info',
  compra: 'chip chip-ok',
  ajuste: 'chip chip-warn',
  devolucion: 'chip chip-devol',
  merma: 'chip bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300 font-semibold',
}

const MERMA_REASONS: { id: MermaReason; label: string; icon: string; desc: string }[] = [
  { id: 'muestra_color', label: 'Muestra a cliente', icon: '🎨', desc: 'Pruebas de igualación / color' },
  { id: 'danado_derrame', label: 'Daño o derrame', icon: '💥', desc: 'Bote abollado / fuga / solvente' },
  { id: 'caducado_secado', label: 'Caducidad / secado', icon: '⏳', desc: 'Secado / catalizador / aerosol' },
  { id: 'uso_interno', label: 'Uso interno', icon: '🔧', desc: 'Mantenimiento o limpieza local' },
  { id: 'otro', label: 'Otro motivo', icon: '📦', desc: 'Merma justificada' },
]

function playBeep(success = true) {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(success ? 880 : 440, ctx.currentTime)
    gain.gain.setValueAtTime(0.12, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1)
    osc.start()
    osc.stop(ctx.currentTime + 0.1)
  } catch {
    // Ignore audio restrictions
  }
}

export default function Inventory() {
  const [tab, setTab] = useState<Tab>('auditoria')

  return (
    <div className="flex h-full flex-col">
      <div className="p-3">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'auditoria', label: 'Auditoría (Escáner)' },
            { value: 'mermas', label: 'Mermas' },
            { value: 'historial', label: 'Kárdex' },
          ]}
        />
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-6">
        {tab === 'auditoria' && <AuditView />}
        {tab === 'mermas' && <MermasView />}
        {tab === 'historial' && <HistoryView />}
      </div>
    </div>
  )
}

/* =========================================================================
   2.1 MÓDULO DE AUDITORÍA FÍSICA POR ESCÁNER
   ========================================================================= */

function AuditView() {
  const products = useLiveQuery(() => db.products.toArray(), []) ?? []
  const [counts, setCounts] = useState<Record<string, number>>(() => {
    try {
      const saved = sessionStorage.getItem('audit_counts')
      return saved ? JSON.parse(saved) : {}
    } catch {
      return {}
    }
  })

  // Guardar en sessionStorage para no perder conteo por recargas
  useEffect(() => {
    try {
      sessionStorage.setItem('audit_counts', JSON.stringify(counts))
    } catch {
      // Ignore storage errors
    }
  }, [counts])

  const [scanInput, setScanInput] = useState('')
  const [cameraOpen, setCameraOpen] = useState(false)
  const [filterMode, setFilterMode] = useState<'diferencias' | 'contados' | 'todos'>('diferencias')
  const [confirmModal, setConfirmModal] = useState(false)
  const [auditNote, setAuditNote] = useState('Auditoría física de inventario')
  const [busy, setBusy] = useState(false)
  const scanInputRef = useRef<HTMLInputElement>(null)

  // Discrepancy Matrix calculation
  const matrix = useMemo(() => {
    return products.map((p) => {
      const counted = counts[p.id]
      const isCounted = counted !== undefined
      const physical = isCounted ? counted : p.stock
      const diff = round2(physical - p.stock)
      const cost = p.cost || 0
      const costDiff = round2(diff * cost)
      return {
        product: p,
        isCounted,
        systemStock: p.stock,
        countedStock: physical,
        diff,
        costDiff,
      }
    })
  }, [products, counts])

  const countedItems = useMemo(() => matrix.filter((m) => m.isCounted), [matrix])
  const discrepancies = useMemo(() => matrix.filter((m) => m.isCounted && Math.abs(m.diff) > 0.0001), [matrix])

  const totalCounted = countedItems.length
  const totalMissingQty = round2(discrepancies.filter((d) => d.diff < 0).reduce((sum, d) => sum + Math.abs(d.diff), 0))
  const totalExcessQty = round2(discrepancies.filter((d) => d.diff > 0).reduce((sum, d) => sum + d.diff, 0))
  const netCostDiff = round2(discrepancies.reduce((sum, d) => sum + d.costDiff, 0))

  const displayedRows = useMemo(() => {
    if (filterMode === 'diferencias') {
      return discrepancies
    }
    if (filterMode === 'contados') {
      return countedItems
    }
    return matrix
  }, [filterMode, discrepancies, countedItems, matrix])

  // Handle barcode or text search input
  const handleScanOrSubmit = (val: string) => {
    const query = val.trim().toLowerCase()
    if (!query) return

    // Buscar coincidencia exacta por barcode, purchaseCode o nombre
    const matched = products.find(
      (p) =>
        p.barcode?.toLowerCase() === query ||
        p.purchaseCode?.toLowerCase() === query ||
        p.name.toLowerCase() === query ||
        p.name.toLowerCase().includes(query),
    )

    if (matched) {
      const current = counts[matched.id] ?? 0
      const next = round2(current + 1)
      setCounts((prev) => ({ ...prev, [matched.id]: next }))
      playBeep(true)
      toast.success(`+1 ${matched.name} (Conteo: ${next})`, { duration: 1500 })
      setScanInput('')
    } else {
      playBeep(false)
      toast.error(`Producto no encontrado: "${val}"`, { duration: 2000 })
    }
    scanInputRef.current?.focus()
  }

  const updateCount = (p: Product, delta: number) => {
    const current = counts[p.id] ?? p.stock
    const next = Math.max(0, round2(current + delta))
    setCounts((prev) => ({ ...prev, [p.id]: next }))
    playBeep(true)
  }

  const setCountDirectly = (p: Product, val: string) => {
    const num = Math.max(0, Number(val) || 0)
    setCounts((prev) => ({ ...prev, [p.id]: num }))
  }

  const resetCountForProduct = (productId: string) => {
    setCounts((prev) => {
      const copy = { ...prev }
      delete copy[productId]
      return copy
    })
  }

  const clearAllCounts = () => {
    if (window.confirm('¿Reiniciar todo el conteo físico de la auditoría?')) {
      setCounts({})
      sessionStorage.removeItem('audit_counts')
      toast.info('Conteo reiniciado')
    }
  }

  const applyAudit = async () => {
    if (discrepancies.length === 0) {
      toast.error('No hay discrepancias registradas entre los productos contados')
      return
    }
    setBusy(true)
    try {
      const itemsToAdjust = discrepancies.map((d) => ({
        product: d.product,
        countedStock: d.countedStock,
        note: `${auditNote.trim() || 'Auditoría física'} (Dif: ${d.diff > 0 ? '+' : ''}${d.diff} ${d.product.unit})`,
      }))
      const res = await applyInventoryAudit(itemsToAdjust, auditNote.trim() || undefined)
      toast.success(`Auditoría aplicada: ${res.adjustedCount} productos ajustados con impacto neto de ${formatMoney(res.netCostDiff)}`)
      setCounts({})
      sessionStorage.removeItem('audit_counts')
      setConfirmModal(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al aplicar auditoría')
    } finally {
      setBusy(false)
    }
  }

  const printAuditSummary = () => {
    const dateStr = new Date().toLocaleDateString('es-MX', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      toast.error('Permite las ventanas emergentes para imprimir')
      return
    }

    const rowsHtml = discrepancies
      .map(
        (d) => `
      <tr>
        <td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0;">${d.product.name}</td>
        <td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; text-align: center;">${d.systemStock} ${d.product.unit}</td>
        <td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; text-align: center; font-weight: bold;">${d.countedStock} ${d.product.unit}</td>
        <td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; text-align: center; color: ${d.diff < 0 ? '#dc2626' : '#16a34a'}; font-weight: bold;">
          ${d.diff > 0 ? '+' : ''}${d.diff} ${d.product.unit}
        </td>
        <td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; text-align: right; color: ${d.costDiff < 0 ? '#dc2626' : '#16a34a'}; font-weight: bold;">
          ${d.costDiff > 0 ? '+' : ''}${formatMoney(d.costDiff)}
        </td>
      </tr>
    `,
      )
      .join('')

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Reporte de Auditoría Física de Inventario</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 24px; color: #1e293b; font-size: 13px; }
            h1 { font-size: 20px; margin-bottom: 4px; color: #0f172a; }
            .kpis { display: flex; gap: 16px; margin: 16px 0; }
            .kpi { flex: 1; padding: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; }
            .kpi-title { font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: bold; }
            .kpi-value { font-size: 18px; font-weight: bold; margin-top: 4px; }
            table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 12px; }
            th { background: #f1f5f9; padding: 8px; text-align: left; border-bottom: 2px solid #cbd5e1; font-weight: 600; }
          </style>
        </head>
        <body>
          <h1>📋 Reporte de Auditoría Física</h1>
          <p style="color: #64748b; margin-top: 0;">Fecha: ${dateStr} · Nota: ${auditNote}</p>
          <div class="kpis">
            <div class="kpi"><div class="kpi-title">Productos Auditados</div><div class="kpi-value">${totalCounted}</div></div>
            <div class="kpi"><div class="kpi-title">Discrepancias</div><div class="kpi-value">${discrepancies.length}</div></div>
            <div class="kpi"><div class="kpi-title">Faltantes Totales</div><div class="kpi-value" style="color: #dc2626;">-${totalMissingQty} uds</div></div>
            <div class="kpi"><div class="kpi-title">Desbalance Económico</div><div class="kpi-value" style="color: ${netCostDiff < 0 ? '#dc2626' : '#16a34a'};">${formatMoney(netCostDiff)}</div></div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Producto</th>
                <th style="text-align: center;">Stock Sistema</th>
                <th style="text-align: center;">Físico Contado</th>
                <th style="text-align: center;">Diferencia</th>
                <th style="text-align: right;">Impacto ($)</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml || '<tr><td colspan="5" style="text-align: center; padding: 16px;">Sin discrepancias registradas</td></tr>'}
            </tbody>
          </table>
          <script>window.onload = function() { window.print(); }<\/script>
        </body>
      </html>
    `)
    printWindow.document.close()
  }

  return (
    <div className="space-y-4">
      {/* Barra de escaneo rápido continuo */}
      <div className="card space-y-3 p-4">
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
            <ScanLine className="h-4 w-4 text-primary" />
            Toma de Inventario (Pistoleo o Búsqueda)
          </label>
          <button
            onClick={() => setCameraOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-semibold text-primary hover:bg-blue-100 dark:bg-blue-900/40 dark:text-blue-300"
          >
            <Camera className="h-3.5 w-3.5" />
            Cámara
          </button>
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            handleScanOrSubmit(scanInput)
          }}
        >
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              ref={scanInputRef}
              type="text"
              placeholder="Escanea con lector USB o escribe nombre/código…"
              value={scanInput}
              onChange={(e) => setScanInput(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
          <Button type="submit" className="shrink-0">
            <Plus className="h-4 w-4" />
            Sumar
          </Button>
        </form>
        <p className="text-xs text-slate-400">
          💡 Cada lectura suma +1 al producto. También puedes ajustar el número directamente en la lista inferior.
        </p>
      </div>

      {/* KPI Cards de la Matriz de Discrepancias */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="card p-3">
          <p className="text-xs text-slate-400">Productos Contados</p>
          <p className="mt-1 text-lg font-bold text-slate-800 dark:text-slate-100">
            {totalCounted} <span className="text-xs font-normal text-slate-400">/ {products.length}</span>
          </p>
        </div>
        <div className="card p-3">
          <p className="text-xs text-slate-400">Faltantes</p>
          <p className="mt-1 text-lg font-bold text-rose-600 dark:text-rose-400">
            -{totalMissingQty} <span className="text-xs font-normal">uds</span>
          </p>
        </div>
        <div className="card p-3">
          <p className="text-xs text-slate-400">Sobrantes</p>
          <p className="mt-1 text-lg font-bold text-emerald-600 dark:text-emerald-400">
            +{totalExcessQty} <span className="text-xs font-normal">uds</span>
          </p>
        </div>
        <div className="card p-3">
          <p className="text-xs text-slate-400">Desbalance ($)</p>
          <p
            className={`mt-1 text-lg font-bold ${
              netCostDiff < 0
                ? 'text-rose-600 dark:text-rose-400'
                : netCostDiff > 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-slate-700 dark:text-slate-200'
            }`}
          >
            {formatMoney(netCostDiff)}
          </p>
        </div>
      </div>

      {/* Botones de acción general */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          <button
            onClick={() => setFilterMode('diferencias')}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              filterMode === 'diferencias'
                ? 'bg-primary text-white'
                : 'bg-white text-slate-600 border border-slate-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300'
            }`}
          >
            Con diferencias ({discrepancies.length})
          </button>
          <button
            onClick={() => setFilterMode('contados')}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              filterMode === 'contados'
                ? 'bg-primary text-white'
                : 'bg-white text-slate-600 border border-slate-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300'
            }`}
          >
            Solo contados ({totalCounted})
          </button>
          <button
            onClick={() => setFilterMode('todos')}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              filterMode === 'todos'
                ? 'bg-primary text-white'
                : 'bg-white text-slate-600 border border-slate-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300'
            }`}
          >
            Todos ({products.length})
          </button>
        </div>

        <div className="flex items-center gap-2">
          {totalCounted > 0 && (
            <button
              onClick={clearAllCounts}
              className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-red-600 dark:hover:text-red-400"
              title="Borrar sesión de conteo"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reiniciar
            </button>
          )}
          <button
            onClick={printAuditSummary}
            className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <Printer className="h-3.5 w-3.5" />
            Reporte
          </button>
          <Button
            disabled={discrepancies.length === 0}
            onClick={() => setConfirmModal(true)}
            className="btn-primary shrink-0 text-xs"
          >
            Aplicar Ajustes ({discrepancies.length})
          </Button>
        </div>
      </div>

      {/* Lista de Filas de la Matriz de Discrepancias */}
      {displayedRows.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 className="h-10 w-10 text-emerald-500" />}
          title={filterMode === 'diferencias' ? 'Sin discrepancias' : 'Sin productos'}
          hint={
            filterMode === 'diferencias'
              ? 'Todos los productos contados coinciden con el inventario teórico del sistema.'
              : 'Empieza a pistolear o busca productos arriba para iniciar el conteo.'
          }
        />
      ) : (
        <div className="space-y-2">
          {displayedRows.map((row) => {
            const p = row.product
            const isDiff = Math.abs(row.diff) > 0.0001
            return (
              <div
                key={p.id}
                className={`card p-3 transition-colors ${
                  row.isCounted
                    ? isDiff
                      ? row.diff < 0
                        ? 'border-l-4 border-l-rose-500'
                        : 'border-l-4 border-l-emerald-500'
                      : 'border-l-4 border-l-blue-400'
                    : 'opacity-70'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {p.name}
                    </p>
                    <p className="text-xs text-slate-400">
                      {p.barcode ? `Código: ${p.barcode} · ` : ''}
                      Sistema:{' '}
                      <b className="text-slate-700 dark:text-slate-200">
                        {formatQty(row.systemStock, p.unit)}
                      </b>{' '}
                      · Costo: {formatMoney(p.cost || 0)}
                    </p>
                  </div>

                  {/* Controles de conteo físico */}
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => updateCount(p, -1)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 active:scale-95 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
                      title="Restar 1"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      value={row.isCounted ? row.countedStock : ''}
                      placeholder={String(row.systemStock)}
                      onChange={(e) => setCountDirectly(p, e.target.value)}
                      className="w-18 rounded-lg border border-slate-300 py-1 text-center text-sm font-bold text-slate-800 focus:border-primary focus:outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                    />
                    <button
                      onClick={() => updateCount(p, 1)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white hover:bg-primary/90 active:scale-95"
                      title="Sumar 1"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                    {row.isCounted && (
                      <button
                        onClick={() => resetCountForProduct(p.id)}
                        className="ml-1 text-xs text-slate-400 hover:text-red-500"
                        title="Quitar de conteo"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                {/* Resumen de diferencia para esta fila */}
                {row.isCounted && (
                  <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2 text-xs dark:border-slate-700">
                    <span className="flex items-center gap-1.5">
                      {isDiff ? (
                        row.diff < 0 ? (
                          <span className="font-semibold text-rose-600 dark:text-rose-400">
                            🔻 Faltante: {row.diff} {p.unit}
                          </span>
                        ) : (
                          <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                            🔺 Sobrante: +{row.diff} {p.unit}
                          </span>
                        )
                      ) : (
                        <span className="text-slate-400">✓ Cuadra exacto</span>
                      )}
                    </span>
                    <span
                      className={`font-bold ${
                        row.costDiff < 0
                          ? 'text-rose-600 dark:text-rose-400'
                          : row.costDiff > 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-slate-400'
                      }`}
                    >
                      {row.costDiff > 0 ? '+' : ''}
                      {formatMoney(row.costDiff)}
                    </span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modal de confirmación para aplicar auditoría masiva */}
      <Modal open={confirmModal} onClose={() => setConfirmModal(false)} title="Aplicar Ajuste de Auditoría">
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Se ajustará automáticamente el stock de <b>{discrepancies.length} productos</b> con discrepancias para igualar el conteo físico real.
          </p>

          <div className="rounded-xl bg-slate-50 p-3 text-xs space-y-1.5 dark:bg-slate-800">
            <div className="flex justify-between">
              <span className="text-slate-500">Total productos a ajustar:</span>
              <span className="font-bold text-slate-800 dark:text-slate-100">{discrepancies.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Unidades faltantes:</span>
              <span className="font-bold text-rose-600">-{totalMissingQty} uds</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Unidades sobrantes:</span>
              <span className="font-bold text-emerald-600">+{totalExcessQty} uds</span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-1.5 dark:border-slate-700">
              <span className="font-semibold text-slate-700 dark:text-slate-200">Impacto Financiero Neto:</span>
              <span
                className={`font-bold ${
                  netCostDiff < 0 ? 'text-rose-600' : 'text-emerald-600'
                }`}
              >
                {formatMoney(netCostDiff)}
              </span>
            </div>
          </div>

          <Field label="Nota / Motivo de la auditoría">
            <Input
              value={auditNote}
              onChange={(e) => setAuditNote(e.target.value)}
              placeholder="Ej: Auditoría física estante pinturas septiembre"
            />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <Button className="btn-secondary" onClick={() => setConfirmModal(false)}>
              Cancelar
            </Button>
            <Button disabled={busy} onClick={() => void applyAudit()}>
              {busy ? 'Aplicando…' : 'Confirmar y Actualizar Stock'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Escáner de cámara */}
      <BarcodeScanner
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onScan={(code) => {
          handleScanOrSubmit(code)
          setCameraOpen(false)
        }}
      />
    </div>
  )
}

/* =========================================================================
   2.2 REGISTRO Y REPORTE DE MERMAS ESPECÍFICAS
   ========================================================================= */

function MermasView() {
  const products = useLiveQuery(() => db.products.toArray(), []) ?? []
  const movements = useLiveQuery(() => db.stockMovements.toArray(), []) ?? []

  const [productId, setProductId] = useState('')
  const [reason, setReason] = useState<MermaReason>('muestra_color')
  const [qty, setQty] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const product = products.find((p) => p.id === productId)
  const numQty = Math.max(0, Number(qty) || 0)
  const estimatedLoss = round2(numQty * (product?.cost || 0))

  // Mermas del mes actual
  const startOfMonth = useMemo(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1).getTime()
  }, [])

  const monthMermas = useMemo(() => {
    return movements
      .filter((m) => m.type === 'merma' && m.date >= startOfMonth)
      .sort((a, b) => b.date - a.date)
  }, [movements, startOfMonth])

  const totalMonthLoss = useMemo(() => {
    return round2(monthMermas.reduce((sum, m) => sum + (m.totalCost || Math.abs(m.qty) * (m.cost || 0)), 0))
  }, [monthMermas])

  const lossByReason = useMemo(() => {
    const map: Record<MermaReason, { total: number; count: number }> = {
      muestra_color: { total: 0, count: 0 },
      danado_derrame: { total: 0, count: 0 },
      caducado_secado: { total: 0, count: 0 },
      uso_interno: { total: 0, count: 0 },
      otro: { total: 0, count: 0 },
    }
    for (const m of monthMermas) {
      const r = m.mermaReason || 'otro'
      const cost = m.totalCost || Math.abs(m.qty) * (m.cost || 0)
      map[r].total = round2(map[r].total + cost)
      map[r].count++
    }
    return map
  }, [monthMermas])

  const handleRegisterMerma = async () => {
    if (!product) {
      toast.error('Selecciona un producto')
      return
    }
    if (numQty <= 0) {
      toast.error('Ingresa una cantidad mayor a cero')
      return
    }
    if (product.stock < numQty) {
      toast.error(`Stock insuficiente: solo hay ${formatQty(product.stock, product.unit)}`)
      return
    }

    setBusy(true)
    try {
      await registerMerma(product, numQty, reason, note.trim() || undefined)
      toast.success(`Merma de ${formatQty(numQty, product.unit)} registrada para ${product.name}`)
      setQty('')
      setNote('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al registrar merma')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Resumen mensual de pérdidas por mermas */}
      <div className="card bg-gradient-to-br from-rose-50 to-orange-50 p-4 dark:from-rose-950/20 dark:to-orange-950/20">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-rose-700 dark:text-rose-300">
              Pérdidas por Mermas este Mes
            </p>
            <p className="mt-1 text-2xl font-black text-rose-700 dark:text-rose-200">
              {formatMoney(totalMonthLoss)}
            </p>
          </div>
          <div className="rounded-full bg-rose-100 p-2.5 text-rose-600 dark:bg-rose-900/50 dark:text-rose-300">
            <Flame className="h-6 w-6" />
          </div>
        </div>

        {/* Desglose por motivo */}
        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-rose-200/60 pt-3 text-xs sm:grid-cols-4 dark:border-rose-900/40">
          {MERMA_REASONS.filter((r) => r.id !== 'otro').map((r) => {
            const data = lossByReason[r.id]
            return (
              <div key={r.id} className="rounded-lg bg-white/70 p-2 dark:bg-slate-900/50">
                <p className="truncate text-slate-500 dark:text-slate-400">
                  {r.icon} {r.label}
                </p>
                <p className="mt-0.5 font-bold text-slate-800 dark:text-slate-100">
                  {formatMoney(data.total)}{' '}
                  <span className="text-[10px] font-normal text-slate-400">({data.count})</span>
                </p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Formulario de registro de merma */}
      <div className="card space-y-4 p-4">
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
          Registrar Nueva Merma
        </h3>

        <Field label="Producto">
          <Select value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">Selecciona producto con merma…</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({formatQty(p.stock, p.unit)} disp.)
              </option>
            ))}
          </Select>
        </Field>

        {product && (
          <div className="rounded-xl bg-slate-50 p-2.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            Stock actual: <b>{formatQty(product.stock, product.unit)}</b> · Costo unitario: <b>{formatMoney(product.cost || 0)}</b>
          </div>
        )}

        {/* Selector de motivo de merma */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
            Motivo específico de la merma
          </label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {MERMA_REASONS.map((r) => {
              const active = reason === r.id
              return (
                <button
                  type="button"
                  key={r.id}
                  onClick={() => setReason(r.id)}
                  className={`flex items-start gap-2.5 rounded-xl border p-2.5 text-left transition-all ${
                    active
                      ? 'border-primary bg-primary/5 text-primary shadow-sm dark:bg-primary/10'
                      : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700/50'
                  }`}
                >
                  <span className="text-xl">{r.icon}</span>
                  <div className="min-w-0">
                    <p className={`text-xs font-bold ${active ? 'text-primary' : 'text-slate-800 dark:text-slate-100'}`}>
                      {r.label}
                    </p>
                    <p className="truncate text-[11px] text-slate-400">{r.desc}</p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={`Cantidad a dar de baja (${product ? product.unit : 'unidades'})`}>
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="Ej. 0.25, 1, 2…"
            />
          </Field>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Pérdida monetaria calculada
            </label>
            <div className="flex h-10 items-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-rose-600 dark:border-slate-700 dark:bg-slate-900 dark:text-rose-400">
              {formatMoney(estimatedLoss)}
            </div>
          </div>
        </div>

        <Field label="Observación / Detalle">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ej: Se abolló en descarga, cliente pidió muestra de azul rey, etc."
          />
        </Field>

        <Button
          className="w-full bg-rose-600 hover:bg-rose-700 text-white"
          disabled={busy || !product || numQty <= 0}
          onClick={() => void handleRegisterMerma()}
        >
          {busy ? 'Registrando…' : 'Dar de Baja por Merma'}
        </Button>
      </div>

      {/* Lista de mermas registradas */}
      <div>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">
          Mermas del Mes ({monthMermas.length})
        </h3>
        {monthMermas.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 className="h-10 w-10 text-emerald-500" />}
            title="Sin mermas este mes"
            hint="¡Excelente! No hay pérdidas registradas en el mes en curso."
          />
        ) : (
          <div className="space-y-2">
            {monthMermas.map((m) => {
              const r = MERMA_REASONS.find((x) => x.id === m.mermaReason)
              const cost = m.totalCost || Math.abs(m.qty) * (m.cost || 0)
              return (
                <div key={m.id} className="card flex items-center justify-between p-3">
                  <div className="mr-2 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-base">{r?.icon ?? '📦'}</span>
                      <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                        {m.productName}
                      </p>
                    </div>
                    <p className="text-xs text-slate-400">
                      {new Date(m.date).toLocaleDateString('es-MX')} · {r?.label ?? 'Merma'}
                      {m.note ? ` · ${m.note}` : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-rose-600 dark:text-rose-400">
                      -{formatQty(Math.abs(m.qty), m.unit)}
                    </p>
                    <p className="text-xs text-slate-400">-{formatMoney(cost)}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

/* =========================================================================
   2.3 KÁRDEX E HISTORIAL DE MOVIMIENTOS
   ========================================================================= */

function HistoryView() {
  const movements = useLiveQuery(() => db.stockMovements.toArray(), []) ?? []
  const [filter, setFilter] = useState<MovementType | ''>('')
  const [detail, setDetail] = useState<{
    id: string
    productName: string
    qty: number
    unit: string
    type: MovementType
    mermaReason?: MermaReason
    cost?: number
    totalCost?: number
    date: number
    note?: string
  } | null>(null)

  const sorted = useMemo(
    () => [...movements].sort((a, b) => b.date - a.date).filter((m) => !filter || m.type === filter),
    [movements, filter],
  )

  return (
    <div>
      <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
        {(['', 'venta', 'compra', 'merma', 'ajuste', 'devolucion'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
              filter === f
                ? 'bg-primary text-white'
                : 'bg-white border border-slate-200 text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300'
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
                <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                  {m.productName}
                </p>
                <p className="text-xs text-slate-400">
                  {new Date(m.date).toLocaleString('es-MX')}
                  {m.note ? ` · ${m.note}` : ''}
                </p>
              </div>
              <div className="text-right">
                <span
                  className={`text-sm font-bold ${
                    m.qty >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {m.qty >= 0 ? '+' : ''}
                  {formatQty(m.qty, m.unit)}
                </span>
                {m.totalCost ? (
                  <p className="text-[11px] text-slate-400">{formatMoney(Math.abs(m.totalCost))}</p>
                ) : null}
              </div>
              <button
                onClick={() =>
                  setDetail({
                    id: m.id,
                    productName: m.productName,
                    qty: m.qty,
                    unit: m.unit,
                    type: m.type,
                    mermaReason: m.mermaReason,
                    cost: m.cost,
                    totalCost: m.totalCost,
                    date: m.date,
                    note: m.note,
                  })
                }
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
          <div className="space-y-3 text-sm text-slate-700 dark:text-slate-200">
            <p>
              <b>Producto:</b> {detail.productName}
            </p>
            <p>
              <b>Tipo:</b>{' '}
              <span className={MOVEMENT_COLORS[detail.type]}>
                {MOVEMENT_LABELS[detail.type]}
              </span>
            </p>
            <p>
              <b>Cantidad:</b>{' '}
              <span className={detail.qty >= 0 ? 'text-emerald-600 font-bold' : 'text-red-600 font-bold'}>
                {detail.qty >= 0 ? '+' : ''}
                {formatQty(detail.qty, detail.unit as any)}
              </span>
            </p>
            {detail.cost != null && (
              <p>
                <b>Costo unitario:</b> {formatMoney(detail.cost)}
              </p>
            )}
            {detail.totalCost != null && (
              <p>
                <b>Impacto total ($):</b> {formatMoney(detail.totalCost)}
              </p>
            )}
            {detail.mermaReason && (
              <p>
                <b>Motivo de merma:</b>{' '}
                {MERMA_REASONS.find((r) => r.id === detail.mermaReason)?.label ?? detail.mermaReason}
              </p>
            )}
            <p>
              <b>Fecha:</b> {new Date(detail.date).toLocaleString('es-MX')}
            </p>
            <p>
              <b>Observación:</b> {detail.note || '—'}
            </p>
          </div>
        )}
      </Modal>
    </div>
  )
}
