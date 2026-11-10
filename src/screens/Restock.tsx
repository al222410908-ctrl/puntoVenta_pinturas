import { useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { toast } from 'sonner'
import {
  ShoppingBasket,
  Plus,
  Trash2,
  Truck,
  PackageCheck,
  Check,
  ScanLine,
  PhoneCall,
  FileText,
  Flame,
  Camera,
  CheckCircle2,
  Minus,
  Search,
  X,
  AlertTriangle,
} from 'lucide-react'
import { matchesSearch } from '../lib/utils'
import { db } from '../db/db'
import {
  cancelOrder,
  createOrder,
  purchaseFromOrder,
  receiveOrderWithScan,
  registerPurchase,
  restockSuggestions,
  type ReceivedItemInput,
} from '../db/repos'
import type { Container, Product, PurchaseItem, PurchaseOrder, PurchaseOrderItem, Supplier } from '../types'
import { formatMoney, round2, uid } from '../lib/utils'
import { formatQty, isLiquid, unitFactor, formatProductStock } from '../lib/units'
import { Button, EmptyState, Field, Input, Modal, SafeImage, Segmented, Select } from '../components/ui'
import { loadBusinessInfo } from '../lib/ticket'
import { openOwnerCallWhatsApp, downloadOwnerCallSheetPdf, type CallSheetGroup } from '../lib/callSheet'
import { BarcodeScanner } from '../components/BarcodeScanner'

type Tab = 'sugerencia' | 'ordenes' | 'compras'

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
    osc.frequency.setValueAtTime(success ? 880 : 330, ctx.currentTime)
    gain.gain.setValueAtTime(0.12, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12)
    osc.start()
    osc.stop(ctx.currentTime + 0.12)
  } catch {
    // Ignore audio restriction
  }
}

/** Línea de compra/orden: `selUnit` = 'base' (unidad del producto) o id de envase. */
interface DraftLine {
  key: string
  productId: string
  qty: string
  cost: string
  selUnit: string
}

function useContainers(): Container[] {
  const containers = useLiveQuery(() => db.containers.toArray(), []) ?? []
  return useMemo(() => [...containers].sort((a, b) => a.name.localeCompare(b.name)), [containers])
}

function lineContainer(p: Product | undefined, selUnit: string, containers: Container[]): Container | undefined {
  if (!p || selUnit === 'base' || !isLiquid(p.unit)) return undefined
  return containers.find((c) => c.id === selUnit)
}

function basePerSel(p: Product | undefined, sel: Container | undefined): number {
  return sel && p ? round2(sel.liters / unitFactor(p.unit)) : 1
}

function lineParts(p: Product | undefined, l: DraftLine, containers: Container[]) {
  const qty = Number(l.qty) || 0
  const sel = lineContainer(p, l.selUnit, containers)
  const basePer = basePerSel(p, sel)
  const isPkg = !sel && !!p?.isPackage
  const pkgUnits = p?.pkgUnits ?? 1
  const unitQty = sel ? round2(qty * basePer) : isPkg ? round2(qty * pkgUnits) : qty
  const fallbackCost = p
    ? sel
      ? round2((p.cost || 0) * basePer)
      : isPkg
        ? round2((p.cost || 0) * pkgUnits)
        : p.cost || 0
    : 0
  const shownCost = Number(l.cost) || fallbackCost
  const unitCostBase = sel
    ? basePer > 0
      ? round2(shownCost / basePer)
      : 0
    : isPkg
      ? round2(shownCost / pkgUnits)
      : shownCost
  return { qty, sel, basePer, unitQty, shownCost, unitCostBase, lineTotal: round2(qty * shownCost) }
}

export default function Restock() {
  const [tab, setTab] = useState<Tab>('sugerencia')

  // Datos reactivos para el Dashboard de KPIs
  const suggestions = useLiveQuery(() => restockSuggestions(), []) ?? []
  const products = useLiveQuery(() => db.products.toArray(), []) ?? []
  const orders = useLiveQuery(() => db.purchaseOrders.toArray(), []) ?? []

  // Métricas globales en tiempo real
  const kpis = useMemo(() => {
    const totalSuggestedCapital = round2(
      suggestions.reduce((acc, s) => acc + s.suggestedQty * (s.product.cost || 0), 0)
    )
    const outOfStockCount = products.filter((p) => p.stock <= 0).length
    const pendingOrders = orders.filter((o) => o.status === 'pendiente' || o.status === 'parcial')
    const transitValue = round2(pendingOrders.reduce((acc, o) => acc + o.total, 0))

    return {
      totalSuggestedCapital,
      outOfStockCount,
      pendingOrdersCount: pendingOrders.length,
      transitValue,
      totalSuggestions: suggestions.length,
    }
  }, [suggestions, products, orders])

  return (
    <div className="flex h-full flex-col">
      {/* ─── BANNER SUPERIOR DE KPIS DE RESURTIDO (ESTILO CONVEME) ─── */}
      <div className="p-3 bg-white/70 backdrop-blur-md border-b border-slate-200/80 dark:bg-slate-900/70 dark:border-slate-800">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-3">
          {/* KPI 1: Capital Requerido */}
          <div className="card p-2.5 sm:p-3 border border-slate-200/90 dark:border-slate-800 bg-white/90 dark:bg-slate-800/80 shadow-2xs flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
              <ShoppingBasket className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block truncate">
                Inversión Estimada
              </span>
              <span className="font-display text-sm sm:text-base font-black text-slate-900 dark:text-white tabular-nums">
                {formatMoney(kpis.totalSuggestedCapital)}
              </span>
            </div>
          </div>

          {/* KPI 2: Agotados Críticos */}
          <div className="card p-2.5 sm:p-3 border border-rose-200/90 dark:border-rose-900/40 bg-rose-50/40 dark:bg-rose-950/20 shadow-2xs flex items-center gap-3">
            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300">
              <AlertTriangle className="h-5 w-5" />
              {kpis.outOfStockCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
                </span>
              )}
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400 block truncate">
                En Ceros Crítico
              </span>
              <span className="font-display text-sm sm:text-base font-black text-rose-700 dark:text-rose-300 tabular-nums">
                {kpis.outOfStockCount} productos
              </span>
            </div>
          </div>

          {/* KPI 3: Órdenes en Tránsito */}
          <div className="card p-2.5 sm:p-3 border border-blue-200/90 dark:border-blue-900/40 bg-blue-50/40 dark:bg-blue-950/20 shadow-2xs flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
              <Truck className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 block truncate">
                Órdenes en Camino
              </span>
              <span className="font-display text-sm sm:text-base font-black text-blue-700 dark:text-blue-300 tabular-nums">
                {kpis.pendingOrdersCount} ({formatMoney(kpis.transitValue)})
              </span>
            </div>
          </div>

          {/* KPI 4: Sugeridos Totales */}
          <div className="card p-2.5 sm:p-3 border border-amber-200/90 dark:border-amber-900/40 bg-amber-50/40 dark:bg-amber-950/20 shadow-2xs flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
              <PackageCheck className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 block truncate">
                Por Resurtir
              </span>
              <span className="font-display text-sm sm:text-base font-black text-amber-700 dark:text-amber-300 tabular-nums">
                {kpis.totalSuggestions} sugeridos
              </span>
            </div>
          </div>
        </div>

        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'sugerencia', label: `Sugerencia Inteligente (${kpis.totalSuggestions})` },
            { value: 'ordenes', label: `Órdenes / En Camino (${kpis.pendingOrdersCount})` },
            { value: 'compras', label: 'Compras Directas' },
          ]}
        />
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-8">
        {tab === 'sugerencia' && <SuggestionView />}
        {tab === 'ordenes' && <OrdersView />}
        {tab === 'compras' && <PurchasesView />}
      </div>
    </div>
  )
}

/* =========================================================================
   1. SUGERENCIA INTELIGENTE CON CARDS POR PROVEEDOR Y HOJA DE LLAMADA
   ========================================================================= */

function SuggestionView() {
  const suggestions = useLiveQuery(() => restockSuggestions(), []) ?? []
  const suppliers = useLiveQuery(() => db.suppliers.toArray(), []) ?? []
  const business = useMemo(() => loadBusinessInfo(), [])
  const [overrides, setOverrides] = useState<Record<string, { qty?: number; cost?: number }>>({})
  const [filterType, setFilterType] = useState<'todos' | 'top' | 'agotados'>('todos')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('todos')
  const [busy, setBusy] = useState(false)

  // Combinar sugerencias con los valores editados
  const rows = useMemo(() => {
    return suggestions.map((s) => ({
      product: s.product,
      qty: overrides[s.product.id]?.qty ?? s.suggestedQty,
      cost: overrides[s.product.id]?.cost ?? (s.product.cost || 0),
      suggestion: s,
    }))
  }, [suggestions, overrides])

  const filteredRows = useMemo(() => {
    let list = rows
    if (filterType === 'top') list = list.filter((r) => r.suggestion.isTopSeller)
    if (filterType === 'agotados') list = list.filter((r) => r.product.stock <= 0)

    if (searchQuery.trim()) {
      list = list.filter((r) =>
        matchesSearch(searchQuery, [r.product.name, r.product.barcode, r.product.purchaseCode])
      )
    }

    if (selectedSupplierId !== 'todos') {
      list = list.filter((r) => (r.product.supplierId ?? 'none') === selectedSupplierId)
    }

    return list
  }, [rows, filterType, searchQuery, selectedSupplierId])

  const setQty = (product: Product, deltaOrVal: number | string) => {
    const prev = overrides[product.id]?.qty ?? (suggestions.find((s) => s.product.id === product.id)?.suggestedQty ?? 1)
    let next: number
    if (typeof deltaOrVal === 'number') {
      next = Math.max(0, round2(prev + deltaOrVal))
    } else {
      next = Math.max(0, Number(deltaOrVal) || 0)
    }
    setOverrides((o) => ({
      ...o,
      [product.id]: {
        ...o[product.id],
        qty: next,
      },
    }))
  }



  // Agrupar por proveedor
  const grouped = useMemo(() => {
    const map = new Map<string, { supplier: Supplier | undefined; rows: typeof filteredRows }>()
    for (const row of filteredRows) {
      const key = row.product.supplierId ?? 'none'
      if (!map.has(key)) {
        map.set(key, {
          supplier: suppliers.find((s) => s.id === row.product.supplierId),
          rows: [],
        })
      }
      map.get(key)!.rows.push(row)
    }
    return [...map.values()]
  }, [filteredRows, suppliers])

  const totalGlobalEstimated = useMemo(() => {
    return round2(rows.reduce((sum, r) => sum + r.qty * r.cost, 0))
  }, [rows])

  if (suggestions.length === 0) {
    return (
      <div className="pt-6">
        <EmptyState
          icon={<PackageCheck className="h-10 w-10 text-emerald-500" />}
          title="¡Inventario con existencias óptimas!"
          hint="Ningún producto está por debajo de su nivel de reorden ni en riesgo de quiebre."
        />
      </div>
    )
  }

  // Crear Orden de Compra formal para esperar el camión
  const handleCreateOrder = async (group: (typeof grouped)[number]) => {
    const itemsToOrder: PurchaseOrderItem[] = group.rows
      .filter((r) => r.qty > 0)
      .map((r) => ({
        productId: r.product.id,
        name: r.product.name,
        unit: r.product.unit,
        qty: r.qty,
        unitCost: r.cost,
        lineTotal: round2(r.qty * r.cost),
        receivedQty: 0,
      }))

    if (itemsToOrder.length === 0) {
      toast.error('Indica al menos una cantidad mayor a 0 para pedir')
      return
    }

    setBusy(true)
    try {
      const order = await createOrder(group.supplier?.id, itemsToOrder)
      toast.success(
        `Orden de compra creada para ${order.supplierName ?? 'Proveedor'}. Esperando entrega en la pestaña "Órdenes / En Camino".`,
        { duration: 4000 },
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al crear orden')
    } finally {
      setBusy(false)
    }
  }

  // Enviar Hoja de Llamada al Dueño por WhatsApp
  const handleSendToOwner = (group: (typeof grouped)[number]) => {
    const callGroup: CallSheetGroup = {
      supplier: group.supplier,
      supplierName: group.supplier?.name ?? 'Sin Proveedor',
      supplierContact: group.supplier?.contact,
      supplierPhone: group.supplier?.phone,
      leadTimeDays: group.supplier?.leadTimeDays,
      items: group.rows.map((r) => ({
        product: r.product,
        qty: r.qty,
        cost: r.cost,
        suggestion: r.suggestion,
      })),
      totalEstimated: round2(group.rows.reduce((s, r) => s + r.qty * r.cost, 0)),
    }

    openOwnerCallWhatsApp(callGroup, business, totalGlobalEstimated)
    toast.success('Abriendo WhatsApp con la hoja de llamada formateada para el dueño(a)')
  }

  // Descargar PDF de Hoja de Llamada
  const handleDownloadPdf = async (group: (typeof grouped)[number]) => {
    const callGroup: CallSheetGroup = {
      supplier: group.supplier,
      supplierName: group.supplier?.name ?? 'Sin Proveedor',
      supplierContact: group.supplier?.contact,
      supplierPhone: group.supplier?.phone,
      leadTimeDays: group.supplier?.leadTimeDays,
      items: group.rows.map((r) => ({
        product: r.product,
        qty: r.qty,
        cost: r.cost,
        suggestion: r.suggestion,
      })),
      totalEstimated: round2(group.rows.reduce((s, r) => s + r.qty * r.cost, 0)),
    }

    try {
      await downloadOwnerCallSheetPdf(callGroup, business)
      toast.success('PDF de hoja de llamada descargado')
    } catch {
      toast.error('Error al generar el PDF')
    }
  }

  return (
    <div className="space-y-4 pt-3">
      {/* Barra de Búsqueda Instantánea & Filtro por Proveedor */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 p-3 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/90 dark:border-slate-800 shadow-2xs">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <Input
              placeholder="Buscar por producto, clave o código de barras…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-8 h-9 text-xs bg-slate-50 dark:bg-slate-950/80"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <Select
            value={selectedSupplierId}
            onChange={(e) => setSelectedSupplierId(e.target.value)}
            className="h-9 text-xs sm:w-56 bg-slate-50 dark:bg-slate-950/80"
          >
            <option value="todos">Todos los proveedores ({suppliers.length})</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                🏢 {s.name}
              </option>
            ))}
            <option value="none">Sin proveedor asignado</option>
          </Select>
        </div>

        <div className="flex flex-wrap items-center justify-between lg:justify-end gap-2.5 pt-1 lg:pt-0 border-t lg:border-t-0 border-slate-100 dark:border-slate-800">
          <Segmented
            value={filterType}
            onChange={setFilterType}
            options={[
              { value: 'todos', label: `Todos (${filteredRows.length})` },
              { value: 'top', label: '🔥 Más Vendidos' },
              { value: 'agotados', label: '🚨 En Ceros' },
            ]}
          />
          <span className="text-xs text-slate-500 tabular-nums">
            Total lista: <strong className="text-slate-800 dark:text-slate-100 font-bold">{formatMoney(totalGlobalEstimated)}</strong>
          </span>
        </div>
      </div>

      {grouped.map((group, gi) => {
        const groupTotal = round2(group.rows.reduce((s, r) => s + r.qty * r.cost, 0))
        const supplierName = group.supplier?.name ?? 'Sin Proveedor Asignado'

        return (
          <div key={gi} className="card overflow-hidden shadow-sm border border-slate-200 dark:border-slate-700/80">
            {/* Cabecera del Proveedor con acciones de llamada y pedido */}
            <div className="bg-slate-50 dark:bg-slate-800/80 p-3.5 border-b border-slate-200 dark:border-slate-700 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Truck className="h-5 w-5 text-primary" />
                  <h3 className="font-display font-semibold text-base text-slate-800 dark:text-slate-100">
                    {supplierName}
                  </h3>
                  {group.supplier?.leadTimeDays && (
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">
                      Entrega: {group.supplier.leadTimeDays} días
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-x-3 text-xs text-slate-500 mt-1">
                  {group.supplier?.contact && <span>Agente: <strong>{group.supplier.contact}</strong></span>}
                  {group.supplier?.phone && <span>Tel: <strong>{group.supplier.phone}</strong></span>}
                  <span>Artículos a pedir: <strong>{group.rows.length}</strong></span>
                  <span>Monto estimado: <strong className="text-emerald-600 dark:text-emerald-400">{formatMoney(groupTotal)}</strong></span>
                </div>
              </div>

              {/* Botones de acción específicos para el Dueño y Pedido */}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  className="btn-secondary text-xs flex items-center gap-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
                  onClick={() => handleSendToOwner(group)}
                  title="Enviar la lista formateada para la llamada al WhatsApp del dueño"
                >
                  <PhoneCall className="h-3.5 w-3.5" />
                  Enviar al Dueño (WhatsApp)
                </Button>

                <Button
                  className="btn-secondary text-xs flex items-center gap-1.5"
                  onClick={() => void handleDownloadPdf(group)}
                  title="Descargar PDF de hoja de pedido"
                >
                  <FileText className="h-3.5 w-3.5" />
                  PDF Llamada
                </Button>

                <Button
                  className="text-xs flex items-center gap-1.5 shrink-0"
                  onClick={() => void handleCreateOrder(group)}
                  disabled={busy}
                >
                  <ShoppingBasket className="h-3.5 w-3.5" />
                  Crear Pedido
                </Button>
              </div>
            </div>

            {/* Grid de Cards de Producto con Foto */}
            <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-3 bg-white dark:bg-slate-900/40">
              {group.rows.map((r) => {
                const p = r.product
                const s = r.suggestion
                const isOutOfStock = p.stock <= 0
                const isBelowMin = p.stock <= p.minStock
                const stockPct = p.minStock > 0 ? Math.min(100, Math.round((p.stock / p.minStock) * 100)) : 0

                return (
                  <div
                    key={p.id}
                    className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 bg-white dark:bg-slate-800/60 shadow-sm flex flex-col justify-between gap-2.5 hover:border-primary/40 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      {/* Foto del producto */}
                      <div className="relative shrink-0">
                        <SafeImage
                          src={p.photo}
                          alt={p.name}
                          className="h-16 w-16 rounded-lg border border-slate-100 dark:border-slate-700 shadow-sm"
                        />
                        {s.isTopSeller && (
                          <span
                            className="absolute -top-1.5 -right-1.5 bg-amber-500 text-white rounded-full p-0.5 shadow-sm"
                            title="Producto de alta rotación (Top Ventas)"
                          >
                            <Flame className="h-3.5 w-3.5" />
                          </span>
                        )}
                      </div>

                      {/* Info del producto */}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5 mb-1">
                          {isOutOfStock ? (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300">
                              🚨 AGOTADO
                            </span>
                          ) : isBelowMin ? (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300">
                              ⚠️ STOCK BAJO
                            </span>
                          ) : null}

                          {s.isTopSeller && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-orange-100 text-orange-800 dark:bg-orange-950/70 dark:text-orange-300">
                              🔥 Top Vendido ({s.soldIn30Days} vend.)
                            </span>
                          )}
                        </div>

                        <p className="font-semibold text-sm text-slate-800 dark:text-slate-100 truncate" title={p.name}>
                          {p.name}
                        </p>

                        <p className="text-xs text-slate-400 mt-0.5 flex flex-wrap items-center gap-1.5">
                          {p.purchaseCode && <span>Cód: <strong className="text-slate-600 dark:text-slate-300">{p.purchaseCode}</strong></span>}
                          {p.barcode && <span>Barras: {p.barcode}</span>}
                          <span>· Unidad: {p.unit}</span>
                        </p>

                        {/* Barra de Stock actual vs mínimo */}
                        <div className="mt-2 space-y-1">
                          <div className="flex items-center justify-between text-[11px] text-slate-500">
                            <span>
                              Stock:{' '}
                              <strong className={isOutOfStock ? 'text-rose-600 font-bold' : 'text-slate-700 dark:text-slate-200'}>
                                {formatProductStock(p.stock, p.unit, p.fractional)}
                              </strong>{' '}
                              / mín: {formatQty(p.minStock, p.unit)}
                            </span>
                            <span>{s.daysRemaining !== null ? `Alcanza: ~${s.daysRemaining}d` : ''}</span>
                          </div>
                          <div className="w-full bg-slate-100 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                isOutOfStock ? 'bg-rose-500 w-0' : isBelowMin ? 'bg-amber-500' : 'bg-emerald-500'
                              }`}
                              style={{ width: `${Math.min(100, Math.max(5, stockPct))}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Presets Rápidos de Pedido */}
                    <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-700/60 text-[11px]">
                      <div className="flex items-center gap-1">
                        <span className="text-slate-400 text-[10.5px]">Presets:</span>
                        <button
                          type="button"
                          onClick={() => {
                            const def = Math.max(1, Math.round(p.minStock - p.stock))
                            setQty(p, def)
                            playBeep(true)
                          }}
                          className="px-2 py-0.5 rounded-lg border border-slate-200/80 bg-slate-50 text-[10px] font-bold text-slate-700 hover:bg-slate-100 transition active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                          title="Pedir la cantidad exacta para alcanzar el stock mínimo"
                        >
                          +Mínimo ({Math.max(1, Math.round(p.minStock - p.stock))})
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const lot = isLiquid(p.unit) ? 4 : 12
                            setQty(p, r.qty + lot)
                            playBeep(true)
                          }}
                          className="px-2 py-0.5 rounded-lg border border-slate-200/80 bg-slate-50 text-[10px] font-bold text-slate-700 hover:bg-slate-100 transition active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                          title={isLiquid(p.unit) ? "Agregar lote de 4 cubetas" : "Agregar lote de 12 unidades"}
                        >
                          +{isLiquid(p.unit) ? '4 Cub.' : '12 Pz.'}
                        </button>
                      </div>

                      {/* Margen de ganancia y alerta de costo */}
                      <div className="flex items-center gap-1.5">
                        {r.cost > (p.cost || 0) && (p.cost || 0) > 0 && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 font-bold text-[9.5px]">
                            ⚠️ Costo +{round2(((r.cost - p.cost!) / p.cost!) * 100)}%
                          </span>
                        )}
                        <span className="text-slate-400 text-[10.5px]">
                          Margen:{' '}
                          <strong className={p.price > 0 && ((p.price - r.cost) / p.price) * 100 < 20 ? 'text-rose-500 font-bold' : 'text-emerald-600 dark:text-emerald-400 font-bold'}>
                            {p.price > 0 ? `${round2(((p.price - r.cost) / p.price) * 100)}%` : '0%'}
                          </strong>
                        </span>
                      </div>
                    </div>

                    {/* Controles de Pedido y Costo */}
                    <div className="pt-1.5 flex items-center justify-between gap-2 text-xs">
                      {/* Cantidad con botones rápidos */}
                      <div className="flex items-center gap-1">
                        <span className="text-slate-500 font-medium mr-1">Pedir:</span>
                        <button
                          type="button"
                          onClick={() => setQty(p, -1)}
                          className="h-7 w-7 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 flex items-center justify-center text-slate-700 dark:text-slate-200 transition active:scale-90"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <input
                          type="number"
                          min="0"
                          value={r.qty}
                          onChange={(e) => setQty(p, e.target.value)}
                          className="w-14 text-center font-bold text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg h-7 text-slate-800 dark:text-slate-100 tabular-nums"
                        />
                        <button
                          type="button"
                          onClick={() => setQty(p, 1)}
                          className="h-7 w-7 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 flex items-center justify-center text-slate-700 dark:text-slate-200 transition active:scale-90"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                        <span className="text-slate-400 text-[11px] ml-1">{p.unit}s</span>
                      </div>

                      {/* Costo e importe */}
                      <div className="text-right">
                        <span className="text-[11px] text-slate-400 block tabular-nums">
                          Costo c/u: {formatMoney(r.cost)}
                        </span>
                        <span className="font-bold text-slate-800 dark:text-slate-100 tabular-nums">
                          {formatMoney(round2(r.qty * r.cost))}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* =========================================================================
   2. ÓRDENES / EN CAMINO CON RECEPCIÓN INTELIGENTE POR ESCÁNER
   ========================================================================= */

function OrdersView() {
  const orders = useLiveQuery(() => db.purchaseOrders.orderBy('date').reverse().toArray(), []) ?? []
  const products = useLiveQuery(() => db.products.toArray(), []) ?? []
  const [openForm, setOpenForm] = useState(false)
  const [scanOrderModal, setScanOrderModal] = useState<PurchaseOrder | null>(null)

  const productMap = useMemo(() => {
    const map = new Map<string, Product>()
    for (const p of products) map.set(p.id, p)
    return map
  }, [products])

  const pendingCount = orders.filter((o) => o.status === 'pendiente' || o.status === 'parcial').length

  const handleQuickReceive = async (orderId: string) => {
    if (!window.confirm('¿Recibir todos los productos completos de esta orden directamente sin escanear?')) return
    try {
      await purchaseFromOrder(orderId)
      toast.success('Orden recibida por completo y stock actualizado')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al recibir')
    }
  }

  const handleCancel = async (orderId: string) => {
    if (!window.confirm('¿Cancelar esta orden de compra?')) return
    await cancelOrder(orderId)
    toast.info('Orden cancelada')
  }

  return (
    <div className="space-y-4 pt-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          {pendingCount === 0 ? 'Sin órdenes en camino' : `${pendingCount} orden${pendingCount === 1 ? '' : 'es'} esperando entrega del proveedor`}
        </p>
        <Button className="btn-secondary text-xs flex items-center gap-1.5" onClick={() => setOpenForm(true)}>
          <Plus className="h-3.5 w-3.5" />
          Nueva Orden Manual
        </Button>
      </div>

      {orders.length === 0 ? (
        <EmptyState
          icon={<Truck className="h-10 w-10 text-slate-400" />}
          title="Sin órdenes de compra registradas"
          hint="Genera órdenes desde la pestaña 'Sugerencia Inteligente' o presiona 'Nueva Orden Manual'."
        />
      ) : (
        <div className="space-y-3">
          {orders.map((o) => {
            const isPending = o.status === 'pendiente'
            const isPartial = o.status === 'parcial'
            const isDone = o.status === 'comprada'

            return (
              <div
                key={o.id}
                className={`card p-4 space-y-3 border transition-colors ${
                  isPending || isPartial
                    ? 'border-blue-200 dark:border-blue-900/60 bg-blue-50/20 dark:bg-blue-950/10'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                {(() => {
                  const totalItemsQty = o.items.reduce((sum, i) => sum + i.qty, 0)
                  const totalReceivedQty = o.items.reduce((sum, i) => sum + (i.receivedQty || 0), 0)
                  const progressPct = totalItemsQty > 0 ? Math.min(100, Math.round((totalReceivedQty / totalItemsQty) * 100)) : 0

                  return (
                    <>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-700/60 pb-2.5">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-display font-semibold text-base text-slate-800 dark:text-slate-100">
                              {o.supplierName ?? 'Proveedor General'}
                            </span>
                            <span
                              className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                                isPending
                                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                                  : isPartial
                                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                    : isDone
                                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                      : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                              }`}
                            >
                              {isPending ? '⏳ En Camino / Pendiente' : isPartial ? '⚠️ Parcialmente Recibida' : isDone ? '✅ Recibida en Stock' : 'Cancelada'}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {o.folio ? `Folio: OC-${o.folio} · ` : `ID: ${o.id.slice(0, 8)} · `}
                            {new Date(o.date).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </p>
                        </div>

                        <div className="text-right">
                          <p className="text-sm font-bold text-slate-800 dark:text-slate-100 tabular-nums">{formatMoney(o.total)}</p>
                          <p className="text-[11px] text-slate-400">{o.items.length} productos pedidos ({totalReceivedQty}/{totalItemsQty} piezas)</p>
                        </div>
                      </div>

                      {/* Timeline Visual de 4 Fases estilo ConVeMe */}
                      <div className="py-1">
                        <div className="flex items-center justify-between text-[11px] font-bold gap-1 sm:gap-2">
                          <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950 text-[10px] font-black">
                              1
                            </span>
                            <span className="hidden sm:inline">Creada</span>
                          </div>
                          <div className="h-0.5 flex-1 bg-emerald-500 rounded" />

                          <div className={`flex items-center gap-1.5 ${isPending || isPartial || isDone ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'}`}>
                            <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black ${
                              isPending ? 'bg-blue-100 text-blue-700 animate-pulse' : 'bg-slate-100 dark:bg-slate-800'
                            }`}>
                              2
                            </span>
                            <span className="hidden sm:inline">En Camino</span>
                          </div>
                          <div className={`h-0.5 flex-1 rounded ${isPartial || isDone ? 'bg-amber-500' : 'bg-slate-200 dark:bg-slate-800'}`} />

                          <div className={`flex items-center gap-1.5 ${isPartial ? 'text-amber-600 dark:text-amber-400 font-black' : isDone ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                            <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black ${
                              isPartial ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 dark:bg-slate-800'
                            }`}>
                              3
                            </span>
                            <span className="hidden sm:inline">Recepción Parcial</span>
                          </div>
                          <div className={`h-0.5 flex-1 rounded ${isDone ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-800'}`} />

                          <div className={`flex items-center gap-1.5 ${isDone ? 'text-emerald-600 dark:text-emerald-400 font-black' : 'text-slate-400'}`}>
                            <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black ${
                              isDone ? 'bg-emerald-500 text-white' : 'bg-slate-100 dark:bg-slate-800'
                            }`}>
                              ✓
                            </span>
                            <span className="hidden sm:inline">En Stock</span>
                          </div>
                        </div>

                        {/* Barra de progreso de recepción */}
                        <div className="mt-2 w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden flex">
                          <div
                            className={`h-full transition-all duration-300 rounded-full ${
                              isDone ? 'bg-emerald-500' : isPartial ? 'bg-amber-500' : 'bg-blue-500'
                            }`}
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                      </div>
                    </>
                  )
                })()}

                {/* Lista de productos pedidos con avance */}
                <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {o.items.map((it) => {
                    const p = productMap.get(it.productId)
                    const received = it.receivedQty || 0
                    const isItemDone = received >= it.qty

                    return (
                      <div key={it.productId} className="py-2 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <SafeImage src={p?.photo} alt={it.name} className="h-8 w-8 rounded shrink-0 border border-slate-200 dark:border-slate-700" />
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-slate-800 dark:text-slate-100 truncate">{it.name}</p>
                            <p className="text-[11px] text-slate-400">
                              {p?.purchaseCode && `Ref: ${p.purchaseCode} · `}
                              Pedido: {formatQty(it.qty, it.unit)}
                            </p>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span
                            className={`font-semibold ${
                              isItemDone
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : received > 0
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-slate-400'
                            }`}
                          >
                            Recibido: {received} / {it.qty} {it.unit}s
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Botones de acción cuando el camión llega */}
                {(isPending || isPartial) && (
                  <div className="pt-2 flex flex-wrap items-center gap-2">
                    <Button
                      className="flex-1 text-xs flex items-center justify-center gap-1.5"
                      onClick={() => setScanOrderModal(o)}
                    >
                      <ScanLine className="h-4 w-4" />
                      Escanear para Recibir Mercancía
                    </Button>

                    <Button
                      className="btn-secondary text-xs flex items-center justify-center gap-1.5"
                      onClick={() => void handleQuickReceive(o.id)}
                      title="Recibir todo completo sin escanear"
                    >
                      <Check className="h-4 w-4" />
                      Recibir Todo
                    </Button>

                    <Button
                      className="btn-danger text-xs px-2.5"
                      onClick={() => void handleCancel(o.id)}
                      title="Cancelar orden"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {openForm && <OrderForm onClose={() => setOpenForm(false)} />}
      {scanOrderModal && (
        <ScanReceptionModal
          order={scanOrderModal}
          onClose={() => setScanOrderModal(null)}
        />
      )}
    </div>
  )
}

/* =========================================================================
   MODAL DE RECEPCIÓN POR ESCÁNER CUANDO LLEGA EL CAMIÓN
   ========================================================================= */

function ScanReceptionModal({
  order,
  onClose,
}: {
  order: PurchaseOrder
  onClose: () => void
}) {
  const products = useLiveQuery(() => db.products.toArray(), []) ?? []
  const [counts, setCounts] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {}
    for (const it of order.items) {
      initial[it.productId] = it.receivedQty || 0
    }
    return initial
  })

  const [costs, setCosts] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {}
    for (const it of order.items) {
      initial[it.productId] = it.unitCost
    }
    return initial
  })

  const [scanInput, setScanInput] = useState('')
  const [cameraOpen, setCameraOpen] = useState(false)
  const [closeRemaining, setCloseRemaining] = useState(false)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const productMap = useMemo(() => {
    const map = new Map<string, Product>()
    for (const p of products) map.set(p.id, p)
    return map
  }, [products])

  // Escaneo continuo (lector de código de barras o texto)
  const handleScan = (val: string) => {
    const query = val.trim().toLowerCase().replace(/\s|-/g, '')
    if (!query) return

    // Buscar si el producto escaneado pertenece a la orden
    const itemInOrder = order.items.find((it) => {
      const p = productMap.get(it.productId)
      const barcodeClean = (p?.barcode ?? '').replace(/\s|-/g, '').toLowerCase()
      const purchaseCodeClean = (p?.purchaseCode ?? '').replace(/\s|-/g, '').toLowerCase()
      const nameClean = it.name.replace(/\s|-/g, '').toLowerCase()
      return barcodeClean === query || purchaseCodeClean === query || nameClean.includes(query)
    })

    if (itemInOrder) {
      const cur = counts[itemInOrder.productId] ?? 0
      const next = round2(cur + 1)
      setCounts((prev) => ({ ...prev, [itemInOrder.productId]: next }))
      playBeep(true)

      if (next >= itemInOrder.qty) {
        toast.success(`✅ ${itemInOrder.name}: ¡Completado! (${next}/${itemInOrder.qty})`)
      } else {
        toast.success(`+1 ${itemInOrder.name} (${next}/${itemInOrder.qty})`, { duration: 1500 })
      }
      setScanInput('')
    } else {
      playBeep(false)
      toast.error(`⚠️ El producto escaneado "${val}" NO pertenece a esta orden de compra`, { duration: 3000 })
    }
    inputRef.current?.focus()
  }

  const updateCount = (productId: string, delta: number) => {
    const cur = counts[productId] ?? 0
    const next = Math.max(0, round2(cur + delta))
    setCounts((prev) => ({ ...prev, [productId]: next }))
    playBeep(true)
  }

  const totalOrdered = useMemo(() => order.items.reduce((s, i) => s + i.qty, 0), [order.items])
  const totalScanned = useMemo(() => Object.values(counts).reduce((s, v) => s + v, 0), [counts])
  const progressPct = totalOrdered > 0 ? Math.min(100, Math.round((totalScanned / totalOrdered) * 100)) : 0

  const handleFinish = async () => {
    const itemsToReceive: ReceivedItemInput[] = order.items
      .map((it) => {
        const totalSoFar = counts[it.productId] ?? 0
        const alreadyReceived = it.receivedQty || 0
        const newToReceive = Math.max(0, round2(totalSoFar - alreadyReceived))
        return {
          productId: it.productId,
          receivedQty: newToReceive,
          unitCost: costs[it.productId] || it.unitCost,
        }
      })
      .filter((i) => i.receivedQty > 0)

    if (itemsToReceive.length === 0) {
      toast.error('No has escaneado ninguna pieza nueva para recibir')
      return
    }

    setBusy(true)
    try {
      const res = await receiveOrderWithScan(order.id, itemsToReceive, { closeRemaining })
      if (res.fullyCompleted) {
        toast.success(`¡Orden completada! Se sumaron todas las existencias al stock de la tienda.`)
      } else {
        toast.success(`Recepción parcial guardada. Quedan piezas pendientes para la siguiente entrega.`)
      }
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al recibir mercancía')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={`Recepción por Escáner: ${order.supplierName ?? 'Orden'}`} wide>
      <div className="space-y-4">
        {/* Barra de progreso de la descarga */}
        <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-3.5 space-y-2 border border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-700 dark:text-slate-200">
              Avance de descarga: {totalScanned} de {totalOrdered} piezas
            </span>
            <strong className="text-primary">{progressPct}%</strong>
          </div>
          <div className="w-full bg-slate-200 dark:bg-slate-700 h-2.5 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                progressPct >= 100 ? 'bg-emerald-500' : 'bg-primary'
              }`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Input del Escáner */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                ref={inputRef}
                autoFocus
                type="text"
                value={scanInput}
                onChange={(e) => setScanInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleScan(scanInput)
                  }
                }}
                placeholder="Pistolea el código de barras o escribe para buscar…"
                className="input pl-9 pr-3 w-full font-mono text-sm"
              />
            </div>
            <Button
              className="btn-secondary text-xs flex items-center gap-1.5 shrink-0"
              onClick={() => setCameraOpen((v) => !v)}
            >
              <Camera className="h-4 w-4" />
              {cameraOpen ? 'Cerrar Cámara' : 'Cámara'}
            </Button>
          </div>

          {cameraOpen && (
            <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 p-2 bg-black/5 dark:bg-black/20">
              <BarcodeScanner
                open={cameraOpen}
                onClose={() => setCameraOpen(false)}
                onScan={(code) => {
                  handleScan(code)
                }}
              />
            </div>
          )}
        </div>

        {/* Checklist interactivo de productos de la orden */}
        <div className="space-y-2 max-h-[360px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 pr-1">
          {order.items.map((it) => {
            const p = productMap.get(it.productId)
            const count = counts[it.productId] ?? 0
            const isCompleted = count >= it.qty
            const isOver = count > it.qty

            return (
              <div
                key={it.productId}
                className={`py-2.5 flex items-center justify-between gap-3 transition-colors rounded-lg px-2 ${
                  isCompleted
                    ? 'bg-emerald-50/60 dark:bg-emerald-950/20'
                    : count > 0
                      ? 'bg-amber-50/40 dark:bg-amber-950/10'
                      : ''
                }`}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <SafeImage src={p?.photo} alt={it.name} className="h-10 w-10 rounded shrink-0 border border-slate-200 dark:border-slate-700" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm text-slate-800 dark:text-slate-100 truncate">{it.name}</p>
                    <p className="text-xs text-slate-400 flex flex-wrap items-center gap-2">
                      {p?.barcode && <span>Barras: {p.barcode}</span>}
                      {p?.purchaseCode && <span>Ref: {p.purchaseCode}</span>}
                      <span>Pedido: <strong>{it.qty} {it.unit}s</strong></span>
                    </p>
                    <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500">
                      <span>Costo c/u:</span>
                      <input
                        type="number"
                        min="0"
                        className="w-16 text-right px-1 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-[11px]"
                        value={costs[it.productId] ?? it.unitCost}
                        onChange={(e) =>
                          setCosts((prev) => ({
                            ...prev,
                            [it.productId]: Math.max(0, Number(e.target.value) || 0),
                          }))
                        }
                        title="Si el costo cambió en la factura del proveedor, modifícalo aquí"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {/* Botones de ajuste manual */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => updateCount(it.productId, -1)}
                      className="h-7 w-7 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span
                      className={`w-12 text-center font-bold text-sm ${
                        isCompleted
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : count > 0
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {count} / {it.qty}
                    </span>
                    <button
                      onClick={() => updateCount(it.productId, 1)}
                      className="h-7 w-7 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {isCompleted ? (
                    <span className="text-emerald-600 font-bold text-xs flex items-center gap-1">
                      <CheckCircle2 className="h-4 w-4" /> Listo
                    </span>
                  ) : isOver ? (
                    <span className="text-purple-600 font-bold text-xs">+ Extra</span>
                  ) : (
                    <span className="text-slate-400 text-xs">Faltan {it.qty - count}</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Opción si la entrega fue parcial */}
        {totalScanned < totalOrdered && (
          <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 pt-1 cursor-pointer">
            <input
              type="checkbox"
              checked={closeRemaining}
              onChange={(e) => setCloseRemaining(e.target.checked)}
              className="rounded text-primary"
            />
            <span>Cerrar la orden completa (no esperar las {totalOrdered - totalScanned} piezas faltantes en otro camión)</span>
          </label>
        )}

        {/* Botones finales */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
          <Button className="btn-secondary text-xs" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            className="text-xs flex items-center gap-1.5"
            onClick={() => void handleFinish()}
            disabled={busy || totalScanned === 0}
          >
            <CheckCircle2 className="h-4 w-4" />
            Finalizar Recepción y Sumar al Stock ({totalScanned} pzs)
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/* =========================================================================
   3. COMPRAS DIRECTAS (ENTRADAS DE FACTURAS)
   ========================================================================= */

function PurchasesView() {
  const purchases = useLiveQuery(() => db.purchases.orderBy('date').reverse().toArray(), []) ?? []
  const [open, setOpen] = useState(false)

  return (
    <div className="space-y-4 pt-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">{purchases.length} compras registradas en el historial</p>
        <Button className="text-xs flex items-center gap-1.5" onClick={() => setOpen(true)}>
          <Plus className="h-3.5 w-3.5" />
          Registrar Compra
        </Button>
      </div>

      {purchases.length === 0 ? (
        <EmptyState
          icon={<ShoppingBasket className="h-10 w-10 text-slate-400" />}
          title="Sin compras registradas"
          hint="Registra compras directas para cargar existencias y costos al inventario."
        />
      ) : (
        <div className="space-y-3">
          {purchases.map((p) => (
            <div key={p.id} className="card p-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-800 dark:text-slate-100">{p.supplierName ?? 'Sin proveedor'}</span>
                <span className="text-slate-400">{new Date(p.date).toLocaleString('es-MX')}</span>
              </div>
              <div className="text-xs divide-y divide-slate-100 dark:divide-slate-800">
                {p.items.map((i, idx) => (
                  <div key={idx} className="py-1 flex justify-between">
                    <span className="text-slate-600 dark:text-slate-300">{i.name} (x{formatQty(i.qty, i.unit)})</span>
                    <strong className="text-slate-800 dark:text-slate-100">{formatMoney(i.lineTotal)}</strong>
                  </div>
                ))}
              </div>
              <div className="flex justify-between items-center pt-1 border-t border-slate-100 dark:border-slate-800 text-xs">
                <span className="text-slate-400">{p.notes ?? ''}</span>
                <span className="font-bold text-slate-800 dark:text-slate-100 text-sm">Total: {formatMoney(p.total)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {open && <PurchaseForm onClose={() => setOpen(false)} />}
    </div>
  )
}

function OrderForm({ onClose }: { onClose: () => void }) {
  const products = useLiveQuery(() => db.products.toArray(), []) ?? []
  const suppliers = useLiveQuery(() => db.suppliers.toArray(), []) ?? []
  const containers = useContainers()
  const [supplierId, setSupplierId] = useState('')
  const [lines, setLines] = useState<DraftLine[]>([])
  const [busy, setBusy] = useState(false)

  const addLine = () =>
    setLines((l) => [...l, { key: uid(), productId: '', qty: '1', cost: '', selUnit: 'base' }])

  const setLine = (key: string, patch: Partial<DraftLine>) =>
    setLines((l) => l.map((x) => (x.key === key ? { ...x, ...patch } : x)))

  const total = lines.reduce((s, l) => {
    const p = products.find((x) => x.id === l.productId)
    return s + lineParts(p, l, containers).lineTotal
  }, 0)

  const save = async () => {
    const items: PurchaseOrderItem[] = []
    for (const l of lines) {
      const p = products.find((x) => x.id === l.productId)
      const parts = lineParts(p, l, containers)
      if (!p || parts.qty <= 0 || parts.shownCost <= 0) {
        toast.error('Revisa las líneas: faltan producto, cantidad o costo')
        return
      }
      items.push({
        productId: p.id,
        name: p.name,
        unit: p.unit,
        qty: parts.unitQty,
        unitCost: parts.unitCostBase,
        lineTotal: parts.lineTotal,
        receivedQty: 0,
      })
    }
    if (items.length === 0) {
      toast.error('Agrega al menos un producto')
      return
    }
    setBusy(true)
    try {
      const order = await createOrder(supplierId || undefined, items)
      toast.success(`Orden creada por ${formatMoney(order.total)}. Esperando entrega en "Órdenes / En Camino".`)
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Crear Orden de Compra Manual" wide>
      <div className="space-y-3">
        <Field label="Proveedor">
          <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">Sin proveedor asignado</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <div className="space-y-2">
          {lines.map((l) => {
            const p = products.find((x) => x.id === l.productId)
            const parts = lineParts(p, l, containers)
            return (
              <div key={l.key} className="flex flex-wrap items-center gap-2">
                <Select
                  className="min-w-40 flex-1"
                  value={l.productId}
                  onChange={(e) => {
                    const prod = products.find((x) => x.id === e.target.value)
                    setLine(l.key, {
                      productId: e.target.value,
                      selUnit: 'base',
                      cost: prod ? String(prod.cost || 0) : l.cost,
                    })
                  }}
                >
                  <option value="">Selecciona producto…</option>
                  {products.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </Select>
                <Input
                  className="w-20"
                  type="number"
                  min="0"
                  placeholder="Cant."
                  value={l.qty}
                  onChange={(e) => setLine(l.key, { qty: e.target.value })}
                />
                <Input
                  className="w-24"
                  type="number"
                  min="0"
                  placeholder="Costo"
                  value={l.cost}
                  onChange={(e) => setLine(l.key, { cost: e.target.value })}
                />
                <span className="w-20 text-right text-xs font-semibold text-slate-800 dark:text-slate-100">
                  {formatMoney(parts.lineTotal)}
                </span>
                <button onClick={() => setLines((arr) => arr.filter((x) => x.key !== l.key))} className="text-red-500 p-1">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )
          })}
        </div>
        <Button className="btn-secondary w-full text-xs" onClick={addLine}>
          <Plus className="h-3.5 w-3.5" /> Agregar producto
        </Button>
        <div className="flex justify-between items-center rounded bg-slate-100 dark:bg-slate-800 p-2 text-xs font-bold">
          <span>Total estimado orden:</span>
          <span>{formatMoney(total)}</span>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button className="btn-secondary text-xs" onClick={onClose}>Cancelar</Button>
          <Button className="text-xs" disabled={busy} onClick={() => void save()}>Guardar Orden</Button>
        </div>
      </div>
    </Modal>
  )
}

function PurchaseForm({ onClose }: { onClose: () => void }) {
  const products = useLiveQuery(() => db.products.toArray(), []) ?? []
  const suppliers = useLiveQuery(() => db.suppliers.toArray(), []) ?? []
  const containers = useContainers()
  const [supplierId, setSupplierId] = useState('')
  const [lines, setLines] = useState<DraftLine[]>([])
  const [busy, setBusy] = useState(false)

  const addLine = () =>
    setLines((l) => [...l, { key: uid(), productId: '', qty: '1', cost: '', selUnit: 'base' }])

  const setLine = (key: string, patch: Partial<DraftLine>) =>
    setLines((l) => l.map((x) => (x.key === key ? { ...x, ...patch } : x)))

  const total = lines.reduce((s, l) => {
    const p = products.find((x) => x.id === l.productId)
    return s + lineParts(p, l, containers).lineTotal
  }, 0)

  const save = async () => {
    const items: PurchaseItem[] = []
    for (const l of lines) {
      const p = products.find((x) => x.id === l.productId)
      const parts = lineParts(p, l, containers)
      if (!p || parts.qty <= 0 || parts.shownCost <= 0) {
        toast.error('Revisa las líneas: faltan producto, cantidad o costo')
        return
      }
      items.push({
        productId: p.id,
        name: p.name,
        unit: p.unit,
        qty: parts.unitQty,
        unitCost: parts.unitCostBase,
        lineTotal: parts.lineTotal,
      })
    }
    if (items.length === 0) {
      toast.error('Agrega al menos un producto')
      return
    }
    setBusy(true)
    try {
      const purchase = await registerPurchase(supplierId || undefined, items)
      toast.success(`Compra registrada por ${formatMoney(purchase.total)} y stock sumado`)
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Registrar Compra Directa" wide>
      <div className="space-y-3">
        <Field label="Proveedor">
          <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">Sin proveedor</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <div className="space-y-2">
          {lines.map((l) => {
            const p = products.find((x) => x.id === l.productId)
            const parts = lineParts(p, l, containers)
            return (
              <div key={l.key} className="flex flex-wrap items-center gap-2">
                <Select
                  className="min-w-40 flex-1"
                  value={l.productId}
                  onChange={(e) => {
                    const prod = products.find((x) => x.id === e.target.value)
                    setLine(l.key, {
                      productId: e.target.value,
                      selUnit: 'base',
                      cost: prod ? String(prod.cost || 0) : l.cost,
                    })
                  }}
                >
                  <option value="">Selecciona producto…</option>
                  {products.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </Select>
                <Input
                  className="w-20"
                  type="number"
                  min="0"
                  placeholder="Cant."
                  value={l.qty}
                  onChange={(e) => setLine(l.key, { qty: e.target.value })}
                />
                <Input
                  className="w-24"
                  type="number"
                  min="0"
                  placeholder="Costo"
                  value={l.cost}
                  onChange={(e) => setLine(l.key, { cost: e.target.value })}
                />
                <span className="w-20 text-right text-xs font-semibold text-slate-800 dark:text-slate-100">
                  {formatMoney(parts.lineTotal)}
                </span>
                <button onClick={() => setLines((arr) => arr.filter((x) => x.key !== l.key))} className="text-red-500 p-1">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )
          })}
        </div>
        <Button className="btn-secondary w-full text-xs" onClick={addLine}>
          <Plus className="h-3.5 w-3.5" /> Agregar producto
        </Button>
        <div className="flex justify-between items-center rounded bg-slate-100 dark:bg-slate-800 p-2 text-xs font-bold">
          <span>Total compra:</span>
          <span>{formatMoney(total)}</span>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button className="btn-secondary text-xs" onClick={onClose}>Cancelar</Button>
          <Button className="text-xs" disabled={busy} onClick={() => void save()}>Guardar Compra</Button>
        </div>
      </div>
    </Modal>
  )
}
