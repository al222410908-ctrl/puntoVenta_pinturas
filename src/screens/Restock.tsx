import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { toast } from 'sonner'
import { AlertTriangle, ShoppingBasket, ClipboardList, Plus, Trash2, Truck, PackageCheck, Check, Search, Image as ImageIcon } from 'lucide-react'
import { db } from '../db/db'
import {
  cancelOrder,
  createOrder,
  packagesFromUnits,
  purchaseFromOrder,
  registerPurchase,
  restockSuggestions,
  suggestedQty,
  unitsFromPackages,
} from '../db/repos'
import type { Product, PurchaseItem, PurchaseOrderItem, Supplier } from '../types'
import { formatMoney, round2, uid } from '../lib/utils'
import { formatQty } from '../lib/units'
import { Button, EmptyState, Field, Input, Modal, Segmented, Select } from '../components/ui'

type Tab = 'sugerencia' | 'ordenes' | 'compras'

export default function Restock() {
  const [tab, setTab] = useState<Tab>('sugerencia')
  return (
    <div className="flex h-full flex-col">
      <div className="p-3">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'sugerencia', label: 'Sugerencia' },
            { value: 'ordenes', label: 'Órdenes' },
            { value: 'compras', label: 'Compras' },
          ]}
        />
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-6">
        {tab === 'sugerencia' && <Suggestion />}
        {tab === 'ordenes' && <Orders />}
        {tab === 'compras' && <Purchases />}
      </div>
    </div>
  )
}

function Suggestion() {
  const suggestions = useLiveQuery(() => restockSuggestions(), []) ?? []
  const suppliers = useLiveQuery(() => db.suppliers.toArray(), []) ?? []
  const [overrides, setOverrides] = useState<Record<string, { qty?: number; cost?: number }>>({})
  const [busy, setBusy] = useState(false)

  const rows = useMemo(
    () =>
      suggestions.map((s) => ({
        product: s.product,
        qty: overrides[s.product.id]?.qty ?? suggestedQty(s.product),
        cost: overrides[s.product.id]?.cost ?? s.product.cost,
      })),
    [suggestions, overrides],
  )

  const setQty = (product: Product, value: string) => {
    const qty = Math.max(0, Number(value) || 0)
    setOverrides((o) => ({
      ...o,
      [product.id]: {
        ...o[product.id],
        qty: product.isPackage ? unitsFromPackages(product, qty) : qty,
      },
    }))
  }
  const setCost = (product: Product, value: string) => {
    const cost = Math.max(0, Number(value) || 0)
    setOverrides((o) => ({
      ...o,
      [product.id]: {
        ...o[product.id],
        cost: product.isPackage ? round2(cost / (product.pkgUnits ?? 1)) : cost,
      },
    }))
  }

  const displayQty = (r: (typeof rows)[number]) =>
    r.product.isPackage ? packagesFromUnits(r.product, r.qty) : r.qty
  const displayCost = (r: (typeof rows)[number]) =>
    r.product.isPackage ? round2(r.cost * (r.product.pkgUnits ?? 1)) : r.cost

  const grouped = useMemo(() => {
    const map = new Map<string, { supplier: Supplier | undefined; rows: typeof rows }>()
    for (const row of rows) {
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
  }, [rows, suppliers])

  if (suggestions.length === 0) {
    return (
      <EmptyState
        icon={<PackageCheck className="h-10 w-10" />}
        title="Todo en nivel"
        hint="Los productos por debajo de su stock mínimo aparecerán aquí"
      />
    )
  }

  const run = async (kind: 'orden' | 'compra', supplier: Supplier | undefined, rowsForGroup: typeof rows) => {
    setBusy(true)
    try {
      const items: PurchaseOrderItem[] = rowsForGroup
        .filter((r) => r.qty > 0)
        .map((r) => ({
          productId: r.product.id,
          name: r.product.name,
          unit: r.product.unit,
          qty: r.qty,
          unitCost: r.cost,
          lineTotal: round2(r.qty * r.cost),
        }))
      if (items.length === 0) {
        toast.error('Ninguna cantidad por pedir')
        return
      }
      if (kind === 'orden') {
        const order = await createOrder(supplier?.id, items)
        toast.success(`Orden creada para ${order.supplierName ?? 'proveedor'}`)
      } else {
        const purchase = await registerPurchase(
          supplier?.id,
          items.map((i) => ({ ...i })),
        )
        toast.success(`Compra registrada por ${formatMoney(purchase.total)}`)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
        <AlertTriangle className="h-5 w-5 shrink-0" />
        {suggestions.length} producto{suggestions.length === 1 ? '' : 's'} con stock bajo el mínimo.
        Ajusta las cantidades y arma tu pedido por proveedor.
      </div>
      {grouped.map((group, gi) => (
        <div key={gi} className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-700/50">
            <span className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-100">
              <Truck className="h-4 w-4 text-primary" />
              {group.supplier?.name ?? 'Sin proveedor'}
            </span>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {group.rows.map((r) => {
              const isPkg = !!r.product.isPackage
              const unitLabel = isPkg ? 'paquete' : r.product.unit
              return (
                <div key={r.product.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                      {r.product.name}
                      {r.product.purchaseCode && (
                        <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-500 dark:bg-slate-700 dark:text-slate-300">
                          Compra {r.product.purchaseCode}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-slate-400">
                      Stock {formatQty(r.product.stock, r.product.unit)} · Mínimo {formatQty(r.product.minStock, r.product.unit)}
                      {isPkg && r.product.pkgUnits ? ` · ${r.product.pkgUnits} pza/paquete` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      value={displayQty(r)}
                      onChange={(e) => setQty(r.product, e.target.value)}
                      className="w-20 rounded-md border border-slate-200 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                      title={`Cantidad en ${unitLabel}`}
                    />
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      value={displayCost(r)}
                      onChange={(e) => setCost(r.product, e.target.value)}
                      className="w-24 rounded-md border border-slate-200 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                      title={isPkg ? 'Costo por paquete' : 'Costo unitario'}
                    />
                  </div>
                  <span className="w-24 text-right text-sm font-semibold text-slate-700 dark:text-slate-200">
                    {formatMoney(round2(r.qty * r.cost))}
                  </span>
                </div>
              )
            })}
          </div>
          <div className="flex gap-2 border-t border-slate-200 p-3 dark:border-slate-700">
            <Button className="flex-1 btn-secondary" disabled={busy} onClick={() => void run('orden', group.supplier, group.rows)}>
              <ClipboardList className="h-4 w-4" />Crear orden
            </Button>
            <Button className="flex-1" disabled={busy} onClick={() => void run('compra', group.supplier, group.rows)}>
              <ShoppingBasket className="h-4 w-4" />Registrar compra
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}

function Orders() {
  const orders = useLiveQuery(() => db.purchaseOrders.toArray(), []) ?? []
  const products = useLiveQuery(() => db.products.toArray(), []) ?? []
  const [open, setOpen] = useState(false)
  const sorted = useMemo(() => [...orders].sort((a, b) => b.date - a.date), [orders])
  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])

  const receive = async (id: string) => {
    try {
      const p = await purchaseFromOrder(id)
      toast.success(`Compra recibida: ${formatMoney(p.total)}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
    }
  }

  return (
    <div>
      <div className="mb-3">
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" />Nueva orden</Button>
      </div>
      {sorted.length === 0 ? (
        <EmptyState icon={<ClipboardList className="h-10 w-10" />} title="Sin órdenes" hint="Crea órdenes aquí o desde la pestaña Sugerencia" />
      ) : (
        <div className="space-y-2">
          {sorted.map((o) => (
            <div key={o.id} className="card p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-slate-800 dark:text-slate-100">{o.supplierName ?? 'Sin proveedor'}</p>
                  <p className="text-xs text-slate-400">
                    {new Date(o.date).toLocaleString('es-MX')} · {o.items.length} artículo{o.items.length === 1 ? '' : 's'}
                  </p>
                </div>
                <span
                  className={`chip ${
                    o.status === 'pendiente'
                      ? 'chip-warn'
                      : o.status === 'comprada'
                        ? 'chip-ok'
                        : 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-300'
                  }`}
                >
                  {o.status === 'pendiente' ? 'Pendiente' : o.status === 'comprada' ? 'Recibida' : 'Cancelada'}
                </span>
              </div>
              <p className="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Total: {formatMoney(o.total)}</p>
              <div className="mt-2 divide-y divide-slate-100 dark:divide-slate-700">
                {o.items.map((it) => {
                  const p = productMap.get(it.productId)
                  return (
                    <div key={it.productId} className="flex items-center gap-2 py-1.5">
                      {p?.photo ? (
                        <img src={p.photo} alt={it.name} className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                      ) : (
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-700">
                          <ImageIcon className="h-5 w-5 text-slate-400 dark:text-slate-500" />
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-slate-700 dark:text-slate-200">{it.name}</p>
                        <p className="text-xs text-slate-400">
                          {p?.purchaseCode && `Compra ${p.purchaseCode} · `}
                          {p?.barcode && `${p.barcode} · `}
                          {formatQty(it.qty, it.unit)}
                        </p>
                      </div>
                      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{formatMoney(it.lineTotal)}</span>
                    </div>
                  )
                })}
              </div>
              {o.status === 'pendiente' && (
                <div className="mt-2 flex gap-2">
                  <Button className="flex-1" onClick={() => void receive(o.id)}><Check className="h-4 w-4" />Recibir</Button>
                  <Button className="flex-1 btn-danger" onClick={() => void cancelOrder(o.id)}>Cancelar</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {open && <OrderForm onClose={() => setOpen(false)} />}
    </div>
  )
}

function OrderForm({ onClose }: { onClose: () => void }) {
  const products = useLiveQuery(() => db.products.toArray(), []) ?? []
  const suppliers = useLiveQuery(() => db.suppliers.toArray(), []) ?? []
  const [supplierId, setSupplierId] = useState('')
  const [productQuery, setProductQuery] = useState('')
  const [lines, setLines] = useState<{ key: string; productId: string; qty: string; cost: string }[]>([])
  const [busy, setBusy] = useState(false)

  const matches = useMemo(() => {
    const q = productQuery.trim().toLowerCase().replace(/\s|-/g, '')
    if (!q) return []
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.barcode ?? '').replace(/\s|-/g, '').includes(q) ||
          (p.purchaseCode ?? '').replace(/\s|-/g, '').includes(q),
      )
      .slice(0, 10)
  }, [products, productQuery])

  const addProduct = (p: Product) => {
    if (lines.some((l) => l.productId === p.id)) {
      toast.error(`${p.name} ya está en la lista`)
      return
    }
    setLines((l) => [
      ...l,
      {
        key: uid(),
        productId: p.id,
        qty: p.isPackage ? String(packagesFromUnits(p, suggestedQty(p))) : String(suggestedQty(p)),
        cost: p.isPackage ? String(round2((p.cost ?? 0) * (p.pkgUnits ?? 1))) : String(p.cost),
      },
    ])
    setProductQuery('')
  }

  const setLine = (key: string, patch: Partial<{ productId: string; qty: string; cost: string }>) =>
    setLines((l) => l.map((x) => (x.key === key ? { ...x, ...patch } : x)))

  const total = lines.reduce((s, l) => {
    const p = products.find((x) => x.id === l.productId)
    const qty = Number(l.qty) || 0
    const cost = Number(l.cost) || p?.cost || 0
    const unitQty = p?.isPackage ? qty * (p.pkgUnits ?? 1) : qty
    const unitCost = p?.isPackage ? cost / (p.pkgUnits ?? 1) : cost
    return s + unitQty * unitCost
  }, 0)

  const save = async () => {
    const items: PurchaseOrderItem[] = []
    for (const l of lines) {
      const p = products.find((x) => x.id === l.productId)
      const qty = Number(l.qty) || 0
      const cost = Number(l.cost) || p?.cost || 0
      if (!p || qty <= 0 || cost <= 0) {
        toast.error('Revisa las líneas: faltan producto, cantidad o costo')
        return
      }
      const unitQty = p.isPackage ? round2(qty * (p.pkgUnits ?? 1)) : qty
      const unitCost = p.isPackage ? round2(cost / (p.pkgUnits ?? 1)) : cost
      items.push({
        productId: p.id,
        name: p.name,
        unit: p.unit,
        qty: unitQty,
        unitCost,
        lineTotal: round2(unitQty * unitCost),
      })
    }
    if (items.length === 0) {
      toast.error('Agrega al menos un producto')
      return
    }
    setBusy(true)
    try {
      const order = await createOrder(supplierId || undefined, items)
      toast.success(`Orden creada para ${order.supplierName ?? 'proveedor'}`)
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Nueva orden de compra" wide>
      <div className="space-y-3">
        <Field label="Proveedor">
          <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">Sin proveedor</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>

        <Field label="Buscar producto (nombre, código de barras o de compra)">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <Input
              className="pl-9"
              placeholder="Ej. 8762378 o esmalte…"
              value={productQuery}
              onChange={(e) => setProductQuery(e.target.value)}
              autoCapitalize="off"
              autoCorrect="off"
            />
          </div>
          {matches.length > 0 && (
            <div className="mt-1 space-y-1">
              {matches.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => addProduct(p)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{p.name}</p>
                    <p className="text-xs text-slate-400">
                      {[p.purchaseCode && `Compra ${p.purchaseCode}`, p.barcode && `Barras ${p.barcode}`, p.isPackage && p.pkgUnits ? `${p.pkgUnits} pza/paquete` : ''].filter(Boolean).join(' · ') || p.unit}
                    </p>
                  </div>
                  <span className="shrink-0 font-semibold text-primary">Agregar</span>
                </button>
              ))}
            </div>
          )}
        </Field>

        <div className="space-y-2">
          {lines.map((l) => {
            const p = products.find((x) => x.id === l.productId)
            const isPkg = !!p?.isPackage
            return (
              <div key={l.key} className="rounded-lg border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-800/50">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{p?.name ?? 'Producto?'}</p>
                    <p className="text-xs text-slate-400">
                      {p?.purchaseCode ? `Compra ${p.purchaseCode}` : p?.barcode ? `Barras ${p.barcode}` : p?.unit ?? ''}
                    </p>
                  </div>
                  <button onClick={() => setLines((arr) => arr.filter((x) => x.key !== l.key))} className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Input
                    className="w-20"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    placeholder={isPkg ? 'Paq.' : 'Cant.'}
                    title={isPkg ? 'Cantidad de paquetes' : 'Cantidad'}
                    value={l.qty}
                    onChange={(e) => setLine(l.key, { qty: e.target.value })}
                  />
                  <Input
                    className="w-24"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    placeholder="Costo"
                    title={isPkg ? 'Costo por paquete' : 'Costo unitario'}
                    value={l.cost}
                    onChange={(e) => setLine(l.key, { cost: e.target.value })}
                  />
                  <span className="ml-auto w-20 text-right text-sm font-semibold dark:text-slate-100">
                    {formatMoney((Number(l.qty) || 0) * (Number(l.cost) || p?.cost || 0))}
                  </span>
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2 dark:bg-emerald-900/30">
          <span className="font-medium text-emerald-700 dark:text-emerald-300">Total orden</span>
          <span className="font-bold text-emerald-700 dark:text-emerald-300">{formatMoney(total)}</span>
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Al recibir la orden se registrará la compra y se repondrá el stock.
        </p>
        <div className="flex justify-end gap-2 pt-1">
          <Button className="btn-secondary" onClick={onClose}>Cancelar</Button>
          <Button disabled={busy} onClick={() => void save()}>Guardar orden</Button>
        </div>
      </div>
    </Modal>
  )
}

function Purchases() {
  const purchases = useLiveQuery(() => db.purchases.toArray(), []) ?? []
  const sorted = useMemo(() => [...purchases].sort((a, b) => b.date - a.date), [purchases])
  const [open, setOpen] = useState(false)

  return (
    <div>
      <div className="mb-3">
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" />Registrar compra</Button>
      </div>
      {sorted.length === 0 ? (
        <EmptyState icon={<ShoppingBasket className="h-10 w-10" />} title="Sin compras registradas" />
      ) : (
        <div className="space-y-2">
          {sorted.map((p) => (
            <div key={p.id} className="card p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-slate-800 dark:text-slate-100">{p.supplierName ?? 'Sin proveedor'}</p>
                  <p className="text-xs text-slate-400">
                    {new Date(p.date).toLocaleString('es-MX')} · {p.items.length} artículo{p.items.length === 1 ? '' : 's'}
                  </p>
                </div>
                <span className="font-bold text-emerald-700 dark:text-emerald-300">{formatMoney(p.total)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      {open && <PurchaseForm onClose={() => setOpen(false)} />}
    </div>
  )
}

function PurchaseForm({ onClose }: { onClose: () => void }) {
  const products = useLiveQuery(() => db.products.toArray(), []) ?? []
  const suppliers = useLiveQuery(() => db.suppliers.toArray(), []) ?? []
  const [supplierId, setSupplierId] = useState('')
  const [lines, setLines] = useState<{ key: string; productId: string; qty: string; cost: string }[]>([])
  const [busy, setBusy] = useState(false)

  const addLine = () =>
    setLines((l) => [...l, { key: uid(), productId: '', qty: '1', cost: '' }])

  const setLine = (key: string, patch: Partial<{ productId: string; qty: string; cost: string }>) =>
    setLines((l) => l.map((x) => (x.key === key ? { ...x, ...patch } : x)))

  const lineUnits = (p: Product | undefined, qty: number) =>
    p?.isPackage ? round2(qty * (p.pkgUnits ?? 1)) : qty
  const lineUnitCost = (p: Product | undefined, cost: number) =>
    p?.isPackage ? round2(cost / (p.pkgUnits ?? 1)) : cost

  const total = lines.reduce((s, l) => {
    const p = products.find((x) => x.id === l.productId)
    const qty = Number(l.qty) || 0
    const cost = Number(l.cost) || p?.cost || 0
    return s + lineUnits(p, qty) * lineUnitCost(p, cost)
  }, 0)

  const save = async () => {
    const items: PurchaseItem[] = []
    for (const l of lines) {
      const p = products.find((x) => x.id === l.productId)
      const qty = Number(l.qty) || 0
      const cost = Number(l.cost) || p?.cost || 0
      if (!p || qty <= 0 || cost <= 0) {
        toast.error('Revisa las líneas: faltan producto, cantidad o costo')
        return
      }
      const unitQty = lineUnits(p, qty)
      const unitCost = lineUnitCost(p, cost)
      items.push({
        productId: p.id,
        name: p.name,
        unit: p.unit,
        qty: unitQty,
        unitCost,
        lineTotal: round2(unitQty * unitCost),
      })
    }
    if (items.length === 0) {
      toast.error('Agrega al menos un producto')
      return
    }
    setBusy(true)
    try {
      const purchase = await registerPurchase(supplierId || undefined, items)
      toast.success(`Compra registrada por ${formatMoney(purchase.total)}`)
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Registrar compra" wide>
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
            const isPkg = !!p?.isPackage
            return (
              <div key={l.key} className="flex flex-wrap items-center gap-2">
                <Select
                  className="min-w-40 flex-1"
                  value={l.productId}
                  onChange={(e) => {
                    const prod = products.find((x) => x.id === e.target.value)
                    setLine(l.key, {
                      productId: e.target.value,
                      cost: prod
                        ? String(round2(prod.isPackage ? (prod.cost ?? 0) * (prod.pkgUnits ?? 1) : (prod.cost ?? 0)))
                        : l.cost,
                    })
                  }}
                >
                  <option value="">Selecciona producto…</option>
                  {products.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </Select>
                <Input
                  className="w-20"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  placeholder={isPkg ? 'Paq.' : 'Cant.'}
                  title={isPkg ? 'Cantidad de paquetes' : 'Cantidad'}
                  value={l.qty}
                  onChange={(e) => setLine(l.key, { qty: e.target.value })}
                />
                <Input
                  className="w-24"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  placeholder={p ? `Costo ${round2((p.isPackage ? (p.cost ?? 0) * (p.pkgUnits ?? 1) : p.cost ?? 0))}` : 'Costo'}
                  title={isPkg ? 'Costo por paquete' : 'Costo unitario'}
                  value={l.cost}
                  onChange={(e) => setLine(l.key, { cost: e.target.value })}
                />
                <span className="w-20 text-right text-sm font-semibold dark:text-slate-100">
                  {formatMoney((Number(l.qty) || 0) * (Number(l.cost) || p?.cost || 0))}
                </span>
                <button onClick={() => setLines((arr) => arr.filter((x) => x.key !== l.key))} className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )
          })}
        </div>
        <Button className="btn-secondary w-full" onClick={addLine}><Plus className="h-4 w-4" />Agregar producto</Button>
        <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2 dark:bg-emerald-900/30">
          <span className="font-medium text-emerald-700 dark:text-emerald-300">Total compra</span>
          <span className="font-bold text-emerald-700 dark:text-emerald-300">{formatMoney(total)}</span>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button className="btn-secondary" onClick={onClose}>Cancelar</Button>
          <Button disabled={busy} onClick={() => void save()}>Guardar compra</Button>
        </div>
      </div>
    </Modal>
  )
}
