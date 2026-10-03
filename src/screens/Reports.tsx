import { useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { toast } from 'sonner'
import {
  BarChart3,
  Download,
  Upload,
  Wallet,
  CreditCard,
  TrendingUp,
  Coins,
  PackageOpen,
  RefreshCw,
  PieChart,
  FileSpreadsheet,
  AlertTriangle,
  Layers,
  Sparkles,
  Archive,
  ArrowUpRight,
  ShieldAlert,
} from 'lucide-react'
import { db } from '../db/db'
import { exportBackup, restoreBackup } from '../db/repos'
import type { Backup } from '../types'
import { formatMoney, round2 } from '../lib/utils'
import { formatQty } from '../lib/units'
import { Button, EmptyState, Segmented } from '../components/ui'
import { syncNow, lastSyncAt } from '../lib/sync'

type MainTab = 'ventas' | 'categorias' | 'stock_muerto' | 'exportar' | 'sistema'
type Range = 'hoy' | 'semana' | 'mes' | 'todo'
type DeadStockPeriod = '45' | '60' | '90' | 'nunca'

const RANGES: { value: Range; label: string }[] = [
  { value: 'hoy', label: 'Hoy' },
  { value: 'semana', label: 'Semana' },
  { value: 'mes', label: 'Mes' },
  { value: 'todo', label: 'Todo' },
]

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows
    .map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\r\n')
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function Reports() {
  const [activeTab, setActiveTab] = useState<MainTab>('ventas')
  const [range, setRange] = useState<Range>('mes')
  const [deadStockPeriod, setDeadStockPeriod] = useState<DeadStockPeriod>('60')
  const [syncing, setSyncing] = useState(false)
  const [, setLast] = useState(lastSyncAt())
  const fileRef = useRef<HTMLInputElement>(null)

  // Consultas reactivas en Dexie
  const sales = useLiveQuery(() => db.sales.toArray(), []) ?? []
  const products = useLiveQuery(() => db.products.toArray(), []) ?? []
  const categories = useLiveQuery(() => db.categories.toArray(), []) ?? []
  const suppliers = useLiveQuery(() => db.suppliers.toArray(), []) ?? []
  const purchases = useLiveQuery(() => db.purchases.toArray(), []) ?? []
  const cashEntries = useLiveQuery(() => db.cashEntries.toArray(), []) ?? []

  // Mapeos auxiliares
  const categoryMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of categories) map.set(c.id, c.name)
    return map
  }, [categories])

  const supplierMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const s of suppliers) map.set(s.id, s.name)
    return map
  }, [suppliers])

  const productMap = useMemo(() => {
    const map = new Map<string, (typeof products)[0]>()
    for (const p of products) map.set(p.id, p)
    return map
  }, [products])

  // Rango de fechas
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

  // =========================================================================
  // 3.1 ANÁLISIS DE VENTAS Y RENTABILIDAD POR PRODUCTO Y CATEGORÍA
  // =========================================================================
  const totals = useMemo(() => {
    let count = 0
    let cash = 0
    let card = 0
    let transfer = 0
    let profit = 0
    let totalSales = 0

    const byProduct = new Map<string, { name: string; qty: number; sales: number; profit: number; catName: string }>()
    const byCategory = new Map<string, { id: string; name: string; sales: number; cost: number; profit: number; qty: number }>()

    for (const s of filtered) {
      count++
      totalSales += s.total
      for (const p of s.payments) {
        if (p.type === 'efectivo') cash += p.amount
        else if (p.type === 'tarjeta') card += p.amount
        else if (p.type === 'transferencia') transfer += p.amount
      }

      for (const it of s.items) {
        const itemProfit = (it.unitPrice - it.cost) * it.qty
        profit += itemProfit

        // Por producto
        const prod = productMap.get(it.productId)
        const catName = prod?.categoryId ? (categoryMap.get(prod.categoryId) ?? 'Sin categoría') : 'Sin categoría'
        const catId = prod?.categoryId ?? 'sin_categoria'

        const curProd = byProduct.get(it.productId) ?? { name: it.name, qty: 0, sales: 0, profit: 0, catName }
        curProd.qty += it.qty
        curProd.sales += it.lineTotal
        curProd.profit += itemProfit
        byProduct.set(it.productId, curProd)

        // Por categoría (3.1)
        const curCat = byCategory.get(catId) ?? { id: catId, name: catName, sales: 0, cost: 0, profit: 0, qty: 0 }
        curCat.sales += it.lineTotal
        curCat.cost += it.cost * it.qty
        curCat.profit += itemProfit
        curCat.qty += it.qty
        byCategory.set(catId, curCat)
      }
    }

    const totalProfit = round2(profit)
    const totalSalesRounded = round2(totalSales)

    // Lista por categoría ordenada por ganancia total descendente
    const categoryMetrics = [...byCategory.values()].map((c) => {
      const salesR = round2(c.sales)
      const profitR = round2(c.profit)
      const marginPct = salesR > 0 ? round2((profitR / salesR) * 100) : 0
      const shareOfProfitPct = totalProfit > 0 ? round2((profitR / totalProfit) * 100) : 0
      return {
        ...c,
        sales: salesR,
        profit: profitR,
        cost: round2(c.cost),
        marginPct,
        shareOfProfitPct,
      }
    }).sort((a, b) => b.profit - a.profit)

    const list = [...byProduct.values()].sort((a, b) => b.profit - a.profit)

    return {
      count,
      cash: round2(cash),
      card: round2(card),
      transfer: round2(transfer),
      total: totalSalesRounded,
      profit: totalProfit,
      marginPct: totalSalesRounded > 0 ? round2((totalProfit / totalSalesRounded) * 100) : 0,
      list,
      categoryMetrics,
    }
  }, [filtered, productMap, categoryMap])

  // Gráfica últimos 7 días
  const last7 = useMemo(() => {
    const now = new Date()
    const days: { label: string; total: number }[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
      const sDate = d.getTime()
      const eDate = sDate + 86_400_000
      days.push({
        label: d.toLocaleDateString('es-MX', { weekday: 'short' }),
        total: round2(sales.filter((s) => s.date >= sDate && s.date < eDate).reduce((sum, s) => sum + s.total, 0)),
      })
    }
    return days
  }, [sales])
  const last7Max = Math.max(...last7.map((d) => d.total), 0)

  const topByQty = useMemo(() => [...totals.list].sort((a, b) => b.qty - a.qty).slice(0, 5), [totals.list])
  const fmtCompact = (n: number) =>
    new Intl.NumberFormat('es-MX', { notation: 'compact', maximumFractionDigits: 1 }).format(n)

  // =========================================================================
  // 3.2 DETECCIÓN DE STOCK MUERTO (BAJA ROTACIÓN)
  // =========================================================================
  const deadStockAnalysis = useMemo(() => {
    const now = Date.now()
    const lastSaleDateByProduct = new Map<string, number>()

    for (const s of sales) {
      for (const it of s.items) {
        const prev = lastSaleDateByProduct.get(it.productId) ?? 0
        if (s.date > prev) {
          lastSaleDateByProduct.set(it.productId, s.date)
        }
      }
    }

    const thresholdDays = deadStockPeriod === 'nunca' ? 0 : Number(deadStockPeriod)

    let totalLockedCapital = 0
    let totalPotentialRetail = 0

    const items = products
      .filter((p) => p.stock > 0)
      .map((p) => {
        const lastDate = lastSaleDateByProduct.get(p.id)
        const daysSince = lastDate ? Math.floor((now - lastDate) / 86_400_000) : null
        const lockedCapital = round2(p.stock * (p.cost || 0))
        const potentialRetail = round2(p.stock * (p.price || 0))
        const categoryName = p.categoryId ? (categoryMap.get(p.categoryId) ?? 'Sin categoría') : 'Sin categoría'
        const supplierName = p.supplierId ? (supplierMap.get(p.supplierId) ?? 'Sin proveedor') : 'Sin proveedor'

        return {
          product: p,
          categoryName,
          supplierName,
          lastDate,
          daysSince,
          neverSold: !lastDate,
          lockedCapital,
          potentialRetail,
        }
      })
      .filter((item) => {
        if (deadStockPeriod === 'nunca') return item.neverSold
        if (item.neverSold) return true
        return (item.daysSince ?? 0) >= thresholdDays
      })
      .sort((a, b) => b.lockedCapital - a.lockedCapital)

    for (const it of items) {
      totalLockedCapital += it.lockedCapital
      totalPotentialRetail += it.potentialRetail
    }

    return {
      items,
      count: items.length,
      totalLockedCapital: round2(totalLockedCapital),
      totalPotentialRetail: round2(totalPotentialRetail),
      thresholdDays,
    }
  }, [products, sales, deadStockPeriod, categoryMap, supplierMap])

  // =========================================================================
  // 3.3 EXPORTACIONES CONTABLES A EXCEL / CSV
  // =========================================================================
  const handleExportDetailedSalesCsv = () => {
    if (sales.length === 0) {
      toast.error('No hay ventas registradas para exportar')
      return
    }
    const rows: (string | number)[][] = [
      [
        'Folio / ID',
        'Fecha y Hora',
        'Producto',
        'Categoría',
        'Cantidad',
        'Unidad',
        'Precio Unitario',
        'Subtotal Línea',
        'Costo Unitario',
        'Costo Total Línea',
        'Utilidad Línea',
        'Margen %',
        'Total Ticket',
        'Efectivo',
        'Tarjeta',
        'Transferencia',
        'Notas de Venta',
      ],
    ]

    for (const s of sales) {
      const folioStr = s.folio ? `F-${s.folio}` : s.id.slice(0, 8)
      const dateStr = new Date(s.date).toLocaleString('es-MX')
      let cash = 0
      let card = 0
      let transfer = 0
      for (const p of s.payments) {
        if (p.type === 'efectivo') cash += p.amount
        else if (p.type === 'tarjeta') card += p.amount
        else if (p.type === 'transferencia') transfer += p.amount
      }

      for (const it of s.items) {
        const prod = productMap.get(it.productId)
        const catName = prod?.categoryId ? (categoryMap.get(prod.categoryId) ?? 'Sin categoría') : 'Sin categoría'
        const totalLineCost = round2(it.cost * it.qty)
        const lineProfit = round2(it.lineTotal - totalLineCost)
        const marginPct = it.lineTotal > 0 ? round2((lineProfit / it.lineTotal) * 100) : 0

        rows.push([
          folioStr,
          dateStr,
          it.name,
          catName,
          it.qty,
          it.unit,
          it.unitPrice.toFixed(2),
          it.lineTotal.toFixed(2),
          it.cost.toFixed(2),
          totalLineCost.toFixed(2),
          lineProfit.toFixed(2),
          `${marginPct}%`,
          s.total.toFixed(2),
          cash.toFixed(2),
          card.toFixed(2),
          transfer.toFixed(2),
          s.notes ?? '',
        ])
      }
    }

    downloadCsv(`reporte-ventas-detallado-${new Date().toISOString().slice(0, 10)}.csv`, rows)
    toast.success('Reporte de ventas detallado descargado')
  }

  const handleExportPurchasesAndExpensesCsv = () => {
    const rows: (string | number)[][] = [
      ['Tipo', 'Fecha y Hora', 'Concepto / Proveedor', 'Categoría / Subcategoría', 'Monto ($)', 'Notas / Detalle'],
    ]

    // Compras a proveedores
    for (const p of purchases) {
      rows.push([
        'COMPRA MERCANCÍA',
        new Date(p.date).toLocaleString('es-MX'),
        p.supplierName ?? (p.supplierId ? (supplierMap.get(p.supplierId) ?? 'Proveedor') : 'Proveedor general'),
        'Reabastecimiento de inventario',
        p.total.toFixed(2),
        p.items.map((i) => `${i.name} (x${i.qty} ${i.unit})`).join('; ') + (p.notes ? ` | Notas: ${p.notes}` : ''),
      ])
    }

    // Movimientos de caja chica
    for (const c of cashEntries) {
      const typeLabel = c.type === 'ingreso' ? 'INGRESO DE CAJA' : 'EGRESO DE CAJA'
      let catLabel = c.subCategory ?? c.category ?? 'General'
      if (catLabel === 'operativo') catLabel = 'Gasto operativo (luz, flete, comida, papelería)'
      else if (catLabel === 'proveedor') catLabel = 'Pago a proveedor de contado'
      else if (catLabel === 'retiro_seguro') catLabel = 'Retiro seguro (caja fuerte o banco)'
      else if (catLabel === 'fondo_inicial') catLabel = 'Fondo inicial de turno'
      else if (catLabel === 'aportacion') catLabel = 'Aportación a caja'

      rows.push([
        typeLabel,
        new Date(c.date).toLocaleString('es-MX'),
        c.concept,
        catLabel,
        (c.type === 'egreso' ? -c.amount : c.amount).toFixed(2),
        c.note ?? '',
      ])
    }

    downloadCsv(`reporte-compras-y-gastos-${new Date().toISOString().slice(0, 10)}.csv`, rows)
    toast.success('Reporte contable de compras y gastos descargado')
  }

  const handleExportInventoryValuationCsv = () => {
    if (products.length === 0) {
      toast.error('No hay productos en inventario')
      return
    }

    const rows: (string | number)[][] = [
      [
        'Código / Barras',
        'Producto',
        'Categoría',
        'Proveedor',
        'Unidad',
        'Stock Actual',
        'Stock Mínimo',
        'Costo Unitario ($)',
        'Valuación a Costo Total ($)',
        'Precio Venta Unitario ($)',
        'Valuación a Precio Venta Total ($)',
        'Utilidad Teórica Potencial ($)',
        'Margen Teórico %',
      ],
    ]

    let totalCostValuation = 0
    let totalRetailValuation = 0

    for (const p of products) {
      const catName = p.categoryId ? (categoryMap.get(p.categoryId) ?? 'Sin categoría') : 'Sin categoría'
      const supName = p.supplierId ? (supplierMap.get(p.supplierId) ?? 'Sin proveedor') : 'Sin proveedor'
      const costVal = round2(p.stock * (p.cost || 0))
      const retailVal = round2(p.stock * (p.price || 0))
      const potentialProfit = round2(retailVal - costVal)
      const marginPct = retailVal > 0 ? round2((potentialProfit / retailVal) * 100) : 0

      totalCostValuation += costVal
      totalRetailValuation += retailVal

      rows.push([
        p.barcode || p.purchaseCode || p.id.slice(0, 8),
        p.name,
        catName,
        supName,
        p.unit,
        p.stock,
        p.minStock,
        (p.cost || 0).toFixed(2),
        costVal.toFixed(2),
        p.price.toFixed(2),
        retailVal.toFixed(2),
        potentialProfit.toFixed(2),
        `${marginPct}%`,
      ])
    }

    // Fila resumen total
    rows.push([
      'TOTAL GENERAL',
      `${products.length} productos`,
      '--',
      '--',
      '--',
      '--',
      '--',
      '--',
      totalCostValuation.toFixed(2),
      '--',
      totalRetailValuation.toFixed(2),
      (totalRetailValuation - totalCostValuation).toFixed(2),
      totalRetailValuation > 0
        ? `${round2(((totalRetailValuation - totalCostValuation) / totalRetailValuation) * 100)}%`
        : '0%',
    ])

    downloadCsv(`valuacion-inventario-${new Date().toISOString().slice(0, 10)}.csv`, rows)
    toast.success('Valuación completa de inventario descargada')
  }

  const handleExportDeadStockCsv = () => {
    if (deadStockAnalysis.items.length === 0) {
      toast.error('No hay artículos en stock muerto bajo este criterio')
      return
    }

    const rows: (string | number)[][] = [
      [
        'Código / Barras',
        'Producto',
        'Categoría',
        'Proveedor',
        'Stock Parado',
        'Unidad',
        'Costo Unitario ($)',
        'Capital Estancado a Costo ($)',
        'Precio Venta Unitario ($)',
        'Valor Proyectado a Venta ($)',
        'Días Sin Venta',
        'Última Venta Registrada',
        'Estrategia Sugerida',
      ],
    ]

    for (const it of deadStockAnalysis.items) {
      const p = it.product
      const lastStr = it.lastDate ? new Date(it.lastDate).toLocaleDateString('es-MX') : 'Sin historial'
      const daysStr = it.neverSold ? 'Nunca vendido' : `${it.daysSince} días`
      const action = it.neverSold
        ? 'Revisar exhibición / Paquete de introducción'
        : (it.daysSince ?? 0) > 90
          ? 'Liquidación urgente / Descuento agresivo'
          : 'Promoción 2x1 o combo con pintura base'

      rows.push([
        p.barcode || p.purchaseCode || p.id.slice(0, 8),
        p.name,
        it.categoryName,
        it.supplierName,
        p.stock,
        p.unit,
        (p.cost || 0).toFixed(2),
        it.lockedCapital.toFixed(2),
        p.price.toFixed(2),
        it.potentialRetail.toFixed(2),
        daysStr,
        lastStr,
        action,
      ])
    }

    downloadCsv(`alerta-stock-muerto-${deadStockPeriod}-dias.csv`, rows)
    toast.success('Reporte de stock muerto descargado')
  }

  // Backup / Restore
  const handleExport = async () => {
    const data = await exportBackup()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pinturas-pos-respaldo-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Respaldo exportado correctamente')
  }

  const handleImport = async (file: File) => {
    try {
      const text = await file.text()
      const data = JSON.parse(text) as Backup
      if (data.version !== 2 && (data as { version?: unknown }).version !== 1) throw new Error('Formato no válido')
      if (!window.confirm('Esto REEMPLAZARÁ todos los datos actuales con los del respaldo. ¿Continuar?')) return
      await restoreBackup(data)
      toast.success('Respaldo restaurado correctamente')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Archivo no válido')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const doSync = async () => {
    if (syncing) return
    setSyncing(true)
    try {
      const r = await syncNow({ full: true })
      setLast(Date.now())
      toast.success(r.down > 0 || r.up > 0 ? `Sincronizado (${r.down} recibidos, ${r.up} enviados)` : 'Todo al día y sincronizado')
    } catch (e) {
      toast.error(e instanceof Error && e.message === 'Failed to fetch' ? 'Sin conexión con el servidor de sincronización' : 'Error al sincronizar')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Navegación interna de la Fase 3 */}
      <div className="p-3 pb-1 border-b border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm">
        <Segmented
          value={activeTab}
          onChange={setActiveTab}
          options={[
            { value: 'ventas', label: 'Ventas' },
            { value: 'categorias', label: 'Margen x Categoría' },
            { value: 'stock_muerto', label: 'Stock Muerto' },
            { value: 'exportar', label: 'Exportar Excel' },
            { value: 'sistema', label: 'Respaldo' },
          ]}
        />
      </div>

      <div className="flex-1 overflow-y-auto p-3 pb-8 space-y-4">
        {/* =========================================================================
            TAB 1: VENTAS & UTILIDAD GENERAL
           ========================================================================= */}
        {activeTab === 'ventas' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex-1">
                <Segmented value={range} onChange={setRange} options={RANGES} />
              </div>
              <Button
                className="btn-secondary shrink-0 text-xs flex items-center gap-1.5"
                onClick={handleExportDetailedSalesCsv}
                title="Descargar ventas en CSV compatible con Excel"
              >
                <Download className="h-3.5 w-3.5" />
                Ventas CSV
              </Button>
            </div>

            {totals.count === 0 ? (
              <EmptyState icon={<BarChart3 className="h-10 w-10" />} title="Sin ventas en este periodo" />
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <StatCard icon={<Wallet className="h-5 w-5" />} label="Ventas totales" value={formatMoney(totals.total)} accent="text-primary" />
                  <StatCard icon={<TrendingUp className="h-5 w-5" />} label="Utilidad neta" value={formatMoney(totals.profit)} accent="text-emerald-600" />
                  <StatCard icon={<PieChart className="h-5 w-5" />} label="Margen global" value={`${totals.marginPct}%`} accent="text-indigo-600" />
                  <StatCard icon={<Coins className="h-5 w-5" />} label="Efectivo en caja" value={formatMoney(totals.cash)} accent="text-amber-600" />
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="card p-2.5 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-slate-500"><CreditCard className="h-4 w-4" /> Tarjeta / Terminal</span>
                    <strong className="text-slate-800 dark:text-slate-100">{formatMoney(totals.card)}</strong>
                  </div>
                  <div className="card p-2.5 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-slate-500"><Coins className="h-4 w-4" /> Transferencia / SPEI</span>
                    <strong className="text-slate-800 dark:text-slate-100">{formatMoney(totals.transfer)}</strong>
                  </div>
                </div>
              </>
            )}

            {/* Gráfica últimos 7 días */}
            <div className="card p-4">
              <p className="font-display text-sm font-semibold text-slate-800 dark:text-slate-100">Tendencia de ventas (últimos 7 días)</p>
              <div className="mt-4 flex h-32 items-end gap-1.5">
                {last7.map((d) => {
                  const pct = last7Max > 0 ? Math.max(6, Math.round((d.total / last7Max) * 100)) : 0
                  return (
                    <div key={d.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                      <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                        {d.total > 0 ? fmtCompact(d.total) : ''}
                      </span>
                      <div className="w-full rounded-t-md bg-primary/85 transition-all hover:bg-primary" style={{ height: `${pct}%` }} />
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">{d.label}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Top vendidos */}
            <div className="card overflow-hidden">
              <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 font-display text-sm font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-700/50 dark:text-slate-100">
                Top 5 productos más vendidos en el periodo
              </div>
              {topByQty.length === 0 ? (
                <p className="p-4 text-xs text-slate-400">Sin ventas en este periodo</p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-700">
                  {topByQty.map((r, i) => (
                    <div key={r.name} className="flex items-center gap-2.5 px-3 py-2.5">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{r.name}</p>
                        <p className="text-xs text-slate-400">{r.qty} unidades · {formatMoney(r.sales)}</p>
                      </div>
                      <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                        +{formatMoney(round2(r.profit))} util.
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 2: FASE 3.1 RENTABILIDAD Y MARGEN REAL POR CATEGORÍA
           ========================================================================= */}
        {activeTab === 'categorias' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex-1">
                <Segmented value={range} onChange={setRange} options={RANGES} />
              </div>
            </div>

            <div className="card p-3 bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-slate-800 dark:to-slate-800/80 border-indigo-100 dark:border-slate-700">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 shrink-0">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Inteligencia de Márgenes en Pintura</h3>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">
                    Las pinturas base suelen tener márgenes del <strong>20% al 30%</strong>, mientras que los accesorios (brochas, felpas, lijas, cintas masking) generan entre <strong>40% y 60%</strong> de margen bruto. Usa esta tabla para asegurar que cada venta de pintura incluya complementos de alto margen.
                  </p>
                </div>
              </div>
            </div>

            {totals.categoryMetrics.length === 0 ? (
              <EmptyState icon={<Layers className="h-10 w-10" />} title="Sin datos de categorías en este periodo" />
            ) : (
              <div className="space-y-3">
                {totals.categoryMetrics.map((cat) => {
                  const isHighMargin = cat.marginPct >= 35
                  return (
                    <div key={cat.id} className="card p-3.5 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-800 dark:text-slate-100 text-sm">
                              {cat.name}
                            </span>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                isHighMargin
                                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                  : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                              }`}
                            >
                              {cat.marginPct}% Margen Bruto
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {cat.qty} unidades vendidas en este periodo
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                            +{formatMoney(cat.profit)}
                          </p>
                          <p className="text-[11px] text-slate-400">
                            de {formatMoney(cat.sales)} venta
                          </p>
                        </div>
                      </div>

                      {/* Barra de progreso de participación en la ganancia global */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px] text-slate-500">
                          <span>Aporte a la ganancia de la tienda:</span>
                          <strong className="text-slate-700 dark:text-slate-300">{cat.shareOfProfitPct}%</strong>
                        </div>
                        <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              isHighMargin ? 'bg-emerald-500' : 'bg-primary'
                            }`}
                            style={{ width: `${Math.min(100, Math.max(3, cat.shareOfProfitPct))}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* =========================================================================
            TAB 3: FASE 3.2 ALERTA DE STOCK MUERTO (BAJA ROTACIÓN)
           ========================================================================= */}
        {activeTab === 'stock_muerto' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
              <div className="flex-1">
                <Segmented
                  value={deadStockPeriod}
                  onChange={setDeadStockPeriod}
                  options={[
                    { value: '45', label: 'Sin venta > 45d' },
                    { value: '60', label: 'Sin venta > 60d' },
                    { value: '90', label: 'Sin venta > 90d' },
                    { value: 'nunca', label: 'Nunca vendido' },
                  ]}
                />
              </div>
              <Button
                className="btn-secondary text-xs flex items-center justify-center gap-1.5 shrink-0"
                onClick={handleExportDeadStockCsv}
                title="Descargar lista de stock muerto en Excel/CSV"
              >
                <Download className="h-3.5 w-3.5" />
                Exportar Lista CSV
              </Button>
            </div>

            {/* KPIs de Capital Inmovilizado */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="card p-3 border-rose-200 dark:border-rose-900/50 bg-rose-50/50 dark:bg-rose-950/20">
                <p className="flex items-center gap-1.5 text-xs font-medium text-rose-700 dark:text-rose-400">
                  <ShieldAlert className="h-4 w-4" />
                  Capital Estancado (a Costo)
                </p>
                <p className="font-display mt-1 text-xl font-bold text-rose-700 dark:text-rose-400">
                  {formatMoney(deadStockAnalysis.totalLockedCapital)}
                </p>
                <p className="text-[11px] text-rose-600/80 dark:text-rose-400/70 mt-0.5">
                  Dinero físico detenido en anaqueles
                </p>
              </div>

              <div className="card p-3">
                <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                  <Archive className="h-4 w-4" />
                  Artículos sin movimiento
                </p>
                <p className="font-display mt-1 text-xl font-bold text-slate-800 dark:text-slate-100">
                  {deadStockAnalysis.count} producto{deadStockAnalysis.count === 1 ? '' : 's'}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Con stock disponible sin vender
                </p>
              </div>

              <div className="card p-3">
                <p className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400">
                  <ArrowUpRight className="h-4 w-4" />
                  Recuperación Potencial (Venta)
                </p>
                <p className="font-display mt-1 text-xl font-bold text-indigo-600 dark:text-indigo-400">
                  {formatMoney(deadStockAnalysis.totalPotentialRetail)}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Ingreso total si se liquida al precio actual
                </p>
              </div>
            </div>

            {deadStockAnalysis.items.length === 0 ? (
              <div className="card p-6 text-center space-y-2">
                <div className="inline-flex p-3 rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
                  <Sparkles className="h-6 w-6" />
                </div>
                <h4 className="font-semibold text-slate-800 dark:text-slate-100 text-sm">¡Inventario Saludable!</h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  No hay productos con stock estancado bajo el filtro seleccionado ({deadStockPeriod === 'nunca' ? 'nunca vendidos' : `más de ${deadStockPeriod} días sin ventas`}).
                </p>
              </div>
            ) : (
              <div className="card overflow-hidden">
                <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 font-display text-sm font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-700/50 dark:text-slate-100 flex items-center justify-between">
                  <span>Productos inmovilizados ({deadStockAnalysis.items.length})</span>
                  <span className="text-xs font-normal text-slate-400">Ordenado por mayor capital atrapado</span>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-700 max-h-[460px] overflow-y-auto">
                  {deadStockAnalysis.items.map((it) => (
                    <div key={it.product.id} className="p-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm text-slate-800 dark:text-slate-100 truncate">
                            {it.product.name}
                          </p>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-400 mt-0.5">
                            <span>Cat: <strong className="text-slate-600 dark:text-slate-300">{it.categoryName}</strong></span>
                            <span>·</span>
                            <span>Stock: <strong className="text-slate-700 dark:text-slate-200">{formatQty(it.product.stock, it.product.unit)}</strong></span>
                            <span>·</span>
                            <span>Costo c/u: {formatMoney(it.product.cost || 0)}</span>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold text-rose-600 dark:text-rose-400">
                            {formatMoney(it.lockedCapital)}
                          </p>
                          <p className="text-[11px] text-slate-400">capital inmovilizado</p>
                        </div>
                      </div>

                      <div className="mt-2.5 flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-700/60 text-xs">
                        <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400 font-medium">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          {it.neverSold ? 'Nunca se ha vendido' : `Última venta: hace ${it.daysSince} días`}
                        </span>
                        <span className="text-[11px] text-slate-500">
                          {it.neverSold
                            ? 'Sugerencia: Exhibir en mostrador'
                            : (it.daysSince ?? 0) > 90
                              ? 'Sugerencia: Liquidación / Remate'
                              : 'Sugerencia: Combo o descuento'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* =========================================================================
            TAB 4: FASE 3.3 CENTRO DE EXPORTACIÓN CONTABLE (EXCEL / CSV)
           ========================================================================= */}
        {activeTab === 'exportar' && (
          <div className="space-y-4">
            <div className="card p-3.5 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-slate-800 dark:to-slate-800/80 border-emerald-100 dark:border-slate-700">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
                  <FileSpreadsheet className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Exportación Contable para Microsoft Excel</h3>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">
                    Descarga archivos tabulares con codificación UTF-8 internacional (BOM) listos para abrir sin descuadres en Microsoft Excel, Google Sheets o para entregar directamente al contador.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Reporte 1: Ventas */}
              <div className="card p-4 flex flex-col justify-between space-y-3">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-primary font-semibold text-sm">
                    <FileSpreadsheet className="h-4 w-4" />
                    <h4>Reporte de Ventas Detallado</h4>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    Ticket por ticket y renglón por renglón: folios, productos, categorías, subtotales, costos, utilidades y desglose de formas de pago.
                  </p>
                </div>
                <Button className="w-full text-xs flex items-center justify-center gap-2" onClick={handleExportDetailedSalesCsv}>
                  <Download className="h-4 w-4" />
                  Descargar Ventas (.csv)
                </Button>
              </div>

              {/* Reporte 2: Compras y Gastos */}
              <div className="card p-4 flex flex-col justify-between space-y-3">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-semibold text-sm">
                    <Coins className="h-4 w-4" />
                    <h4>Compras & Gastos de Caja</h4>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    Control financiero de egresos: compras a proveedores, gastos operativos (luz, fletes, comida) y retiros de efectivo seguro.
                  </p>
                </div>
                <Button className="btn-secondary w-full text-xs flex items-center justify-center gap-2" onClick={handleExportPurchasesAndExpensesCsv}>
                  <Download className="h-4 w-4" />
                  Descargar Gastos (.csv)
                </Button>
              </div>

              {/* Reporte 3: Valuación de Inventario */}
              <div className="card p-4 flex flex-col justify-between space-y-3">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-semibold text-sm">
                    <Layers className="h-4 w-4" />
                    <h4>Valuación Total de Inventario</h4>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    Auditoría de activos: catálogo completo con existencias, valuación contable a costo y valor proyectado a precio de venta con margen.
                  </p>
                </div>
                <Button className="btn-secondary w-full text-xs flex items-center justify-center gap-2" onClick={handleExportInventoryValuationCsv}>
                  <Download className="h-4 w-4" />
                  Descargar Valuación (.csv)
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 5: RESPALDO Y SINCRONIZACIÓN
           ========================================================================= */}
        {activeTab === 'sistema' && (
          <div className="space-y-4">
            <div className="card space-y-3 p-4">
              <p className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-100 text-sm">
                <PackageOpen className="h-4 w-4" />
                Respaldo de la Base de Datos Local
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button className="btn-secondary text-xs flex items-center justify-center gap-1.5" onClick={() => void handleExport()}>
                  <Download className="h-4 w-4" />
                  Exportar Respaldo JSON
                </Button>
                <Button className="btn-secondary text-xs flex items-center justify-center gap-1.5" onClick={() => fileRef.current?.click()}>
                  <Upload className="h-4 w-4" />
                  Restaurar Respaldo
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
              <p className="text-xs text-slate-400">
                Toda la información vive localmente en este navegador. Exporta un respaldo periódicamente para guardarlo en una memoria USB o disco externo.
              </p>
            </div>

            <div className="card space-y-3 p-4">
              <p className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-100 text-sm">
                <RefreshCw className="h-4 w-4" />
                Sincronización en la Nube (Opcional)
              </p>
              <Button
                onClick={() => void doSync()}
                disabled={syncing}
                className="w-full text-xs flex items-center justify-center gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Sincronizando…' : 'Sincronizar ahora'}
              </Button>
              <p className="text-xs text-slate-400">
                {lastSyncAt() > 0
                  ? `Última sincronización: ${new Date(lastSyncAt()).toLocaleString('es-MX')}`
                  : 'Aún no se ha sincronizado con el servidor de respaldo en la nube.'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent: string }) {
  return (
    <div className="card p-3">
      <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
        <span className={accent}>{icon}</span>
        {label}
      </p>
      <p className={`font-display mt-1 text-lg font-semibold ${accent}`}>{value}</p>
    </div>
  )
}
