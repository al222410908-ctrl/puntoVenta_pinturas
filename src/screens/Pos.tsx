import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { toast } from 'sonner'
import {
  ScanLine,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  Search,
  Check,
  Undo2,
  Image as ImageIcon,
} from 'lucide-react'
import { db } from '../db/db'
import type { CartLine } from '../db/repos'
import { registerSale, undoLastSale } from '../db/repos'
import type { Product, Payment } from '../types'
import { formatMoney, round2 } from '../lib/utils'
import { formatQty } from '../lib/units'
import { BarcodeScanner } from '../components/BarcodeScanner'
import { Button, EmptyState, Input, Modal } from '../components/ui'

export default function Pos() {
  const products = useLiveQuery(() => db.products.toArray(), []) ?? []
  const categories = useLiveQuery(() => db.categories.toArray(), []) ?? []
  const sales = useLiveQuery(() => db.sales.toArray(), []) ?? []

  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState<string>('')
  const [visible, setVisible] = useState(80)
  const [cart, setCart] = useState<CartLine[]>([])
  const [cartOpen, setCartOpen] = useState(false)
  const [scanOpen, setScanOpen] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const [cash, setCash] = useState('')
  const [card, setCard] = useState('')

  const allFiltered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return products.filter((p) => !categoryId || p.categoryId === categoryId).filter(
      (p) =>
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.barcode ?? '').replace(/\s|-/g, '').includes(q.replace(/\s|-/g, '')),
    )
  }, [products, search, categoryId])

  const filtered = useMemo(() => allFiltered.slice(0, visible), [allFiltered, visible])

  useEffect(() => {
    setVisible(80)
  }, [search, categoryId])

  const cartTotal = round2(cart.reduce((s, l) => s + l.qty * l.unitPrice, 0))
  const cartCount = cart.reduce((s, l) => s + l.qty, 0)

  const topSellers = useMemo(() => {
    const since = Date.now() - 30 * 24 * 60 * 60 * 1000
    const byId = new Map(products.map((p) => [p.id, p]))
    const m = new Map<string, { p: Product; qty: number }>()
    for (const s of sales) {
      if (s.date < since) continue
      for (const it of s.items) {
        const p = byId.get(it.productId)
        if (!p) continue
        const cur = m.get(it.productId) ?? { p, qty: 0 }
        cur.qty += it.qty
        m.set(it.productId, cur)
      }
    }
    return [...m.values()].sort((a, b) => b.qty - a.qty).slice(0, 8)
  }, [sales, products])

  const addToCart = (p: Product) => {
    const inCart = cart.find((l) => l.productId === p.id)?.qty ?? 0
    const available = Math.max(0, p.stock - inCart)
    if (p.stock <= 0) {
      toast.error(`${p.name} está sin stock`)
      return
    }
    if (available <= 0) {
      toast.error(`Solo hay ${p.stock} ${formatQty(p.stock, p.unit)} de ${p.name}`)
      return
    }
    setCart((prev) => {
      const existing = prev.find((l) => l.productId === p.id)
      if (existing) {
        return prev.map((l) =>
          l.productId === p.id
            ? { ...l, qty: Math.min(p.stock, round2(l.qty + 1)) }
            : l,
        )
      }
      return [
        ...prev,
        {
          productId: p.id,
          name: p.name,
          unit: p.unit,
          fractional: p.fractional,
          qty: 1,
          unitPrice: p.price,
          cost: p.cost,
        },
      ]
    })
  }

  const setLineQty = (productId: string, qty: number) => {
    if (qty < 0) return
    const product = products.find((p) => p.id === productId)
    if (product && qty > product.stock) {
      toast.error(`Solo hay ${product.stock} ${formatQty(product.stock, product.unit)}`)
      setCart((prev) =>
        prev.map((l) => (l.productId === productId ? { ...l, qty: product.stock } : l)),
      )
      return
    }
    setCart((prev) =>
      prev.map((l) => (l.productId === productId ? { ...l, qty } : l)),
    )
  }

  const removeLine = (productId: string) =>
    setCart((prev) => prev.filter((l) => l.productId !== productId))

  const handleScan = (code: string) => {
    setScanOpen(false)
    const clean = code.replace(/\s|-/g, '')
    const product = products.find(
      (p) => (p.barcode ?? '').replace(/\s|-/g, '') === clean,
    )
    if (product) {
      addToCart(product)
      toast.success(`${product.name} agregado`)
    } else {
      toast.error(`No se encontró el código ${code}`)
    }
  }

  const handleUndo = async () => {
    const last = await undoLastSale()
    if (!last) {
      toast.error('No hay ventas para deshacer')
      return
    }
    toast.success(
      `Venta deshecha: ${last.items.length} artículo${last.items.length === 1 ? '' : 's'} (${formatMoney(last.total)})`,
    )
  }

  const openPayment = () => {
    setCash(String(cartTotal.toFixed(2)))
    setCard('')
    setPayOpen(true)
  }

  const cashNum = Math.max(0, Number(cash) || 0)
  const cardNum = Math.max(0, Number(card) || 0)
  const paid = round2(cashNum + cardNum)
  const change = round2(paid - cartTotal)

  const finishSale = async () => {
    let cashNumEff = cashNum
    let cardNumEff = cardNum
    let rest = change
    const fromCash = Math.min(rest, cashNumEff)
    cashNumEff -= fromCash
    rest -= fromCash
    cardNumEff -= Math.min(rest, cardNumEff)
    const payments: Payment[] = []
    if (cashNumEff > 0) payments.push({ type: 'efectivo', amount: round2(cashNumEff) })
    if (cardNumEff > 0) payments.push({ type: 'tarjeta', amount: round2(cardNumEff) })
    if (round2(cashNumEff + cardNumEff) < cartTotal) {
      toast.error('Registra al menos un pago')
      return
    }
    try {
      await registerSale(cart, payments)
      toast.success('Venta registrada')
      setCart([])
      setPayOpen(false)
      setCartOpen(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al registrar la venta')
    }
  }

  return (
    <div className="flex h-full flex-col lg:flex-row">
      <div className="flex-1 p-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <Input
              className="pl-9"
              placeholder="Buscar producto…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button onClick={() => setScanOpen(true)} className="shrink-0">
            <ScanLine className="h-5 w-5" />
            <span className="hidden sm:inline">Escanear</span>
          </Button>
        </div>

        {topSellers.length > 0 && (
          <div className="mt-3">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Más vendidos
            </p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {topSellers.map(({ p }) => (
                <button
                  key={p.id}
                  onClick={() => addToCart(p)}
                  className="shrink-0 rounded-full border border-primary-200 bg-white px-3 py-1 text-sm font-medium text-primary hover:bg-primary hover:text-white dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-primary dark:hover:text-white"
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setCategoryId('')}
            className={`shrink-0 rounded-full px-3 py-1 text-sm font-medium ${
              categoryId === '' ? 'bg-primary text-white' : 'bg-white text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
            }`}
          >
            Todos
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setCategoryId(c.id)}
              className={`shrink-0 rounded-full px-3 py-1 text-sm font-medium ${
                categoryId === c.id ? 'bg-primary text-white' : 'bg-white text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={<ShoppingCart className="h-10 w-10" />}
            title={search ? 'Sin resultados' : 'Agrega productos en Catálogo'}
            hint={search ? 'Prueba con otro nombre' : undefined}
          />
        ) : (
          <>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {filtered.map((p) => {
                const out = p.stock <= 0
                const low = !out && p.stock <= p.minStock
                return (
                  <button
                    key={p.id}
                    onClick={() => addToCart(p)}
                    className="card flex flex-col gap-1 p-2.5 text-left transition hover:border-primary-600 hover:shadow-md"
                  >
                    {p.photo ? (
                      <img
                        src={p.photo}
                        alt={p.name}
                        className="mb-1 h-16 w-full rounded-lg object-cover"
                      />
                    ) : (
                      <span className="mb-1 flex h-16 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-700">
                        <ImageIcon className="h-6 w-6 text-slate-400 dark:text-slate-500" />
                      </span>
                    )}
                    <span className="line-clamp-2 min-h-[2.4rem] text-sm font-medium text-slate-800 dark:text-slate-100">
                      {p.name}
                    </span>
                    <span className="text-base font-bold text-primary dark:text-blue-400">{formatMoney(p.price)}</span>
                    <span className="text-xs text-slate-400">{formatQty(1, p.unit)}</span>
                    <span
                      className={`chip ${
                        out ? 'chip-bad' : low ? 'chip-warn' : 'chip-ok'
                      }`}
                    >
                      {out ? 'Agotado' : `Stock ${formatQty(p.stock, p.unit)}`}
                    </span>
                  </button>
                )
              })}
            </div>
            {visible < allFiltered.length && (
              <button
                onClick={() => setVisible((v) => v + 80)}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white py-2 text-sm font-medium text-primary hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                Ver más ({allFiltered.length - visible} restantes)
              </button>
            )}
          </>
        )}
      </div>

      <div className="hidden w-80 shrink-0 flex-col border-l border-slate-200 bg-white lg:flex dark:border-slate-800 dark:bg-slate-900">
        <CartPanel
          cart={cart}
          cartTotal={cartTotal}
          setLineQty={setLineQty}
          removeLine={removeLine}
          onPay={openPayment}
          onUndo={() => void handleUndo()}
        />
      </div>

      {cartCount > 0 && (
        <button
          onClick={() => setCartOpen(true)}
          className="fixed bottom-16 left-3 right-3 z-30 flex items-center justify-between rounded-xl bg-primary px-4 py-3 text-white shadow-lg md:bottom-4 lg:hidden"
        >
          <span className="flex items-center gap-2 font-medium">
            <ShoppingCart className="h-5 w-5" />
            {cartCount} artículo{cartCount === 1 ? '' : 's'}
          </span>
          <span className="font-bold">{formatMoney(cartTotal)}</span>
        </button>
      )}

      <BarcodeScanner open={scanOpen} onClose={() => setScanOpen(false)} onScan={handleScan} />

      <Modal open={cartOpen} onClose={() => setCartOpen(false)} title="Venta actual" wide>
        <CartPanel
          cart={cart}
          cartTotal={cartTotal}
          setLineQty={setLineQty}
          removeLine={removeLine}
          onPay={openPayment}
          onUndo={() => void handleUndo()}
        />
      </Modal>

      <Modal open={payOpen} onClose={() => setPayOpen(false)} title="Cobrar">
        <div className="space-y-4">
          <div className="rounded-xl bg-slate-100 p-4 text-center dark:bg-slate-700">
            <p className="text-sm text-slate-500 dark:text-slate-400">Total a cobrar</p>
            <p className="font-display text-3xl font-semibold text-slate-900 dark:text-slate-100">{formatMoney(cartTotal)}</p>
          </div>
          <div>
            <label className="label">Efectivo</label>
            <Input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={cash}
              onChange={(e) => setCash(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Tarjeta (terminal)</label>
            <Input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={card}
              onChange={(e) => setCard(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setCash(String(cartTotal.toFixed(2)))} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">Exacto</button>
            {[50, 100, 200, 500].map((n) => (
              <button
                key={n}
                onClick={() => setCash(String((Math.ceil(cartTotal / n) * n).toFixed(2)))}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                ${n}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2 text-sm dark:bg-emerald-900/30">
            <span className="text-emerald-700 dark:text-emerald-300">Recibido</span>
            <span className="font-semibold text-emerald-700 dark:text-emerald-300">{formatMoney(paid)}</span>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-blue-50 px-3 py-2 text-sm dark:bg-blue-900/30">
            <span className="text-blue-700 dark:text-blue-300">Cambio (efectivo)</span>
            <span className="font-semibold text-blue-700 dark:text-blue-300">{change > 0 ? formatMoney(change) : '$0.00'}</span>
          </div>
          <Button
            className="w-full"
            disabled={paid < cartTotal}
            onClick={() => void finishSale()}
          >
            <Check className="h-5 w-5" />
            Registrar venta
          </Button>
        </div>
      </Modal>
    </div>
  )
}

function CartPanel({
  cart,
  cartTotal,
  setLineQty,
  removeLine,
  onPay,
  onUndo,
}: {
  cart: CartLine[]
  cartTotal: number
  setLineQty: (productId: string, qty: number) => void
  removeLine: (productId: string) => void
  onPay: () => void
  onUndo: () => void
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2.5 dark:border-slate-800">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Venta actual</p>
        <button
          onClick={() => {
            if (confirm('¿Deshacer la última venta registrada? Se repondrá el stock.')) onUndo()
          }}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <Undo2 className="h-4 w-4" />
          Deshacer última venta
        </button>
      </div>
      {cart.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-slate-400 dark:text-slate-500">Venta vacía</p>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto p-3">
            {cart.map((l) => (
              <div key={l.productId} className="border-b border-slate-100 py-2 last:border-0 dark:border-slate-700">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{l.name}</p>
                    <p className="text-xs text-slate-400">{formatMoney(l.unitPrice)} / {l.unit}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setLineQty(l.productId, round2(l.qty - 1))} className="rounded-md bg-slate-100 p-1 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"><Minus className="h-4 w-4" /></button>
                    <input
                      value={l.qty}
                      inputMode="decimal"
                      onChange={(e) => setLineQty(l.productId, Math.max(0, Number(e.target.value) || 0))}
                      className="w-14 rounded-md border border-slate-200 px-1 py-0.5 text-center text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                    />
                    <button onClick={() => setLineQty(l.productId, round2(l.qty + 1))} className="rounded-md bg-slate-100 p-1 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"><Plus className="h-4 w-4" /></button>
                  </div>
                  <span className="w-20 text-right text-sm font-semibold dark:text-slate-100">{formatMoney(round2(l.qty * l.unitPrice))}</span>
                  <button onClick={() => removeLine(l.productId)} className="rounded-md p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30"><Trash2 className="h-4 w-4" /></button>
                </div>
                {l.fractional && (
                  <div className="mt-1 flex gap-1">
                    {[0.5, 1, 2, 5].map((v) => (
                      <button
                        key={v}
                        onClick={() => setLineQty(l.productId, v)}
                        className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${
                          l.qty === v
                            ? 'border-primary bg-primary text-white'
                            : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                        }`}
                      >
                        {v} {l.unit}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="border-t border-slate-200 p-3 dark:border-slate-800">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-medium text-slate-600 dark:text-slate-300">Total</span>
              <span className="font-display text-xl font-semibold text-slate-900 dark:text-slate-100">{formatMoney(cartTotal)}</span>
            </div>
            <Button className="w-full" onClick={onPay}>Cobrar</Button>
          </div>
        </>
      )}
    </div>
  )
}
