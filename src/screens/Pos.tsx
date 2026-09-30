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
  Banknote,
  CreditCard,
  Smartphone,
} from 'lucide-react'
import { db } from '../db/db'
import type { CartLine } from '../db/repos'
import { registerSale, undoLastSale } from '../db/repos'
import type { Product, Payment, Unit, SalePresentation, Sale } from '../types'
import { formatMoney, round2 } from '../lib/utils'
import {
  UNIT_LABELS,
  formatQty,
  productPresentations,
  presentationFactor,
  toBaseQty,
  fromBaseQty,
  isLiquid,
} from '../lib/units'
import { BarcodeScanner } from '../components/BarcodeScanner'
import { SaleNoteModal } from '../components/SaleNoteModal'
import { Button, EmptyState, Input, Modal } from '../components/ui'
import { loadScannerSettings, useBarcodeScanner } from '../lib/scanner'

const SWATCH_GRADIENTS = [
  'from-[#1f5d4a] to-[#123c31] text-[#eeeee6]',
  'from-[#c9952d] to-[#9a6815] text-[#fcf5e8]',
  'from-[#27656a] to-[#1d413d] text-[#eef4f3]',
  'from-[#bd4e2c] to-[#8c351c] text-[#fdf1ec]',
  'from-[#48534b] to-[#212c26] text-[#f7f6f2]',
  'from-[#3f8a52] to-[#1a5233] text-[#edf5ee]',
  'from-[#7c558f] to-[#3f2b47] text-[#f6f1f8]',
]

function getSwatch(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  const grad = SWATCH_GRADIENTS[Math.abs(hash) % SWATCH_GRADIENTS.length]
  const words = name.trim().split(/\s+/)
  const initials = words.length === 1 ? words[0].slice(0, 2).toUpperCase() : (words[0][0] + words[1][0]).toUpperCase()
  return { grad, initials }
}

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
  const [transfer, setTransfer] = useState('')
  const [noteSale, setNoteSale] = useState<Sale | null>(null)
  const [scanner] = useState<{ enabled: boolean; suffix: 'Enter' | 'Tab' }>(() => {
    const s = loadScannerSettings()
    return { enabled: s.enabled, suffix: s.suffix }
  })

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

  const cartTotal = round2(cart.reduce((s, l) => s + lineTotal(l), 0))
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

  const presentationsOf = (p: Product): SalePresentation[] => productPresentations(p)

  const factorOf = (p: Product, saleUnit: Unit): number => presentationFactor(p, saleUnit)

  const makeLine = (p: Product, saleUnit: Unit, qty: number): CartLine => ({
    productId: p.id,
    name: p.name,
    photo: p.photo,
    unit: p.unit,
    fractional: p.fractional,
    presentations: presentationsOf(p),
    saleUnit,
    qty,
    baseQty: toBaseQty(qty, factorOf(p, saleUnit)),
    stock: p.stock,
    unitPrice: p.price,
    salePrice: presentationsOf(p).find((s) => s.unit === saleUnit)?.price,
    cost: p.cost,
  })

  const addToCart = (p: Product) => {
    const pres = presentationsOf(p)
    const saleUnit = pres.some((s) => s.unit === p.unit) ? p.unit : pres[0]?.unit ?? p.unit
    const factor = factorOf(p, saleUnit)
    setCart((prev) => {
      if (p.stock <= 0) {
        toast.error(`${p.name} está sin stock`)
        return prev
      }
      const existing = prev.find((l) => l.productId === p.id && l.saleUnit === saleUnit)
      const otherBase = prev.reduce((s, l) => (l.productId === p.id && l.saleUnit !== saleUnit ? s + l.baseQty : s), 0)
      const nextQty = round2((existing?.qty ?? 0) + 1)
      const nextBase = toBaseQty(nextQty, factor)
      const totalBase = round2(otherBase + nextBase)
      if (totalBase > p.stock) {
        const maxBase = Math.max(0, round2(p.stock - otherBase))
        const maxQty = fromBaseQty(maxBase, factor)
        if (maxBase <= 0) {
          toast.error(`${p.name} está sin stock`)
          return prev
        }
        toast.error(`Solo hay ${formatQty(p.stock, p.unit)} de ${p.name}, se agregó lo disponible`)
        if (existing) {
          return prev.map((l) =>
            l.productId === p.id && l.saleUnit === saleUnit ? { ...l, qty: maxQty, baseQty: maxBase } : l,
          )
        }
        return [...prev, makeLine(p, saleUnit, maxQty)]
      }
      if (existing) {
        return prev.map((l) =>
          l.productId === p.id && l.saleUnit === saleUnit ? { ...l, qty: nextQty, baseQty: nextBase } : l,
        )
      }
      return [...prev, makeLine(p, saleUnit, 1)]
    })
  }

  const setLineQty = (productId: string, saleUnit: Unit, qty: number) => {
    if (qty < 0) return
    const product = products.find((p) => p.id === productId)
    const factor = product ? factorOf(product, saleUnit) : 1
    setCart((prev) => {
      const otherBase = prev.reduce(
        (s, l) => (l.productId === productId && l.saleUnit !== saleUnit ? s + l.baseQty : s),
        0,
      )
      const nextBase = toBaseQty(qty, factor)
      if (product && round2(otherBase + nextBase) > product.stock) {
        toast.error(`Solo hay ${formatQty(product.stock, product.unit)}`)
        const maxBase = Math.max(0, round2(product.stock - otherBase))
        const maxQty = fromBaseQty(maxBase, factor)
        return prev.map((l) =>
          l.productId === productId && l.saleUnit === saleUnit ? { ...l, qty: maxQty, baseQty: maxBase } : l,
        )
      }
      return prev.map((l) =>
        l.productId === productId && l.saleUnit === saleUnit ? { ...l, qty, baseQty: nextBase } : l,
      )
    })
  }

  const setLineSale = (productId: string, saleUnit: Unit) => {
    const product = products.find((p) => p.id === productId)
    if (!product) return
    setCart((prev) =>
      prev.map((l) => {
        if (l.productId !== productId) return l
        const otherBase = prev.reduce(
          (s, x) => (x.productId === productId && x.saleUnit !== l.saleUnit ? s + x.baseQty : s),
          0,
        )
        const baseQty = Math.min(l.baseQty, Math.max(0, round2(product.stock - otherBase)))
        const factor = factorOf(product, saleUnit)
        const qty = fromBaseQty(baseQty, factor) || 1
        const salePrice = presentationsOf(product).find((s) => s.unit === saleUnit)?.price
        return { ...l, saleUnit, qty, baseQty: toBaseQty(qty, factor), salePrice }
      }),
    )
  }

  const removeLine = (productId: string, saleUnit: Unit) =>
    setCart((prev) => prev.filter((l) => !(l.productId === productId && l.saleUnit === saleUnit)))

  const handleScan = (code: string) => {
    setScanOpen(false)
    const clean = code.replace(/\s|-/g, '')
    const product = products.find(
      (p) =>
        (p.barcode ?? '').replace(/\s|-/g, '') === clean ||
        (p.purchaseCode ?? '').replace(/\s|-/g, '') === clean,
    )
    if (product) {
      addToCart(product)
      toast.success(`${product.name} agregado`)
    } else {
      toast.error(`No se encontró el código ${code}`)
    }
  }

  const scannerActive = scanner.enabled && !payOpen && !scanOpen
  useBarcodeScanner(handleScan, scannerActive, scanner.suffix, true)

  useEffect(() => {
    const onExternalAdd = (e: Event) => {
      const custom = e as CustomEvent<Product>
      if (custom.detail) {
        addToCart(custom.detail)
      }
    }
    window.addEventListener('pos:add_to_cart', onExternalAdd)
    return () => window.removeEventListener('pos:add_to_cart', onExternalAdd)
  }, [addToCart])


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
    setTransfer('')
    setPayOpen(true)
  }

  const cashNum = Math.max(0, Number(cash) || 0)
  const cardNum = Math.max(0, Number(card) || 0)
  const transferNum = Math.max(0, Number(transfer) || 0)
  const paid = round2(cashNum + cardNum + transferNum)
  const change = round2(paid - cartTotal)

  const finishSale = async () => {
    let cashNumEff = cashNum
    let cardNumEff = cardNum
    let transferNumEff = transferNum
    let rest = change

    const fromCash = Math.min(rest, cashNumEff)
    cashNumEff -= fromCash
    rest -= fromCash

    const fromTransfer = Math.min(rest, transferNumEff)
    transferNumEff -= fromTransfer
    rest -= fromTransfer

    cardNumEff -= Math.min(rest, cardNumEff)

    const payments: Payment[] = []
    if (cashNumEff > 0) payments.push({ type: 'efectivo', amount: round2(cashNumEff) })
    if (cardNumEff > 0) payments.push({ type: 'tarjeta', amount: round2(cardNumEff) })
    if (transferNumEff > 0) payments.push({ type: 'transferencia', amount: round2(transferNumEff) })

    if (round2(cashNumEff + cardNumEff + transferNumEff) < cartTotal) {
      toast.error('Registra al menos un pago')
      return
    }
    try {
      const sale = await registerSale(cart, payments)
      toast.success('Venta registrada')
      setCart([])
      setPayOpen(false)
      setCartOpen(false)
      setNoteSale(sale)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al registrar la venta')
    }
  }

  return (
    <div className="flex h-full min-w-0 flex-col lg:flex-row">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="p-3 pb-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <Input
                id="pos-search"
                className="pl-9"
                placeholder="Buscar producto…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Button onClick={() => setScanOpen(true)} className="shrink-0" title="Escanear con cámara (celular)">
              <ScanLine className="h-5 w-5" />
              <span className="hidden sm:inline">Escanear</span>
            </Button>
          </div>
          {scannerActive && (
            <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
              Lector de barras (PC) activo: escanea directo para agregar productos.
            </p>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-24 lg:pb-3">
          {topSellers.length > 0 && (
            <div className="mt-2">
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                ★ Más vendidos
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {topSellers.map(({ p }) => (
                  <button
                    key={p.id}
                    onClick={() => addToCart(p)}
                    className="shrink-0 rounded-full border border-amber-200/90 bg-amber-50/70 px-3 py-1 text-xs font-semibold text-amber-900 shadow-2xs hover:bg-amber-100 hover:border-amber-300 dark:border-amber-800/50 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-900/60 transition"
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
            <button
              onClick={() => setCategoryId('')}
              className={`shrink-0 rounded-xl px-3.5 py-1.5 text-xs font-bold tracking-tight transition shadow-2xs ${
                categoryId === ''
                  ? 'bg-gradient-to-r from-primary-600 to-primary text-white shadow-primary/20'
                  : 'bg-white text-slate-700 border border-slate-200/90 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
              }`}
            >
              Todos
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setCategoryId(c.id)}
                className={`shrink-0 rounded-xl px-3.5 py-1.5 text-xs font-bold tracking-tight transition shadow-2xs ${
                  categoryId === c.id
                    ? 'bg-gradient-to-r from-primary-600 to-primary text-white shadow-primary/20'
                    : 'bg-white text-slate-700 border border-slate-200/90 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
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
              <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                {filtered.map((p) => {
                  const out = p.stock <= 0
                  const low = !out && p.stock <= p.minStock
                  const swatch = getSwatch(p.name)
                  return (
                    <button
                      key={p.id}
                      onClick={() => addToCart(p)}
                      className="card group flex min-w-0 flex-col gap-1 p-2.5 text-left transition hover:border-primary-600/50 hover:shadow-md hover:-translate-y-0.5 cursor-pointer"
                    >
                      {p.photo ? (
                        <img
                          src={p.photo}
                          alt={p.name}
                          className="mb-1 h-18 w-full min-w-0 rounded-xl object-cover ring-1 ring-black/5"
                        />
                      ) : (
                        <div className={`relative mb-1 flex h-18 w-full items-center justify-center rounded-xl bg-gradient-to-br ${swatch.grad} shadow-2xs overflow-hidden`}>
                          <div className="absolute inset-0 bg-white/5 backdrop-blur-[1px]" />
                          <span className="font-display text-base font-extrabold tracking-widest uppercase">
                            {swatch.initials}
                          </span>
                          <span className="absolute bottom-1 right-1.5 h-1.5 w-1.5 rounded-full bg-white/50" />
                        </div>
                      )}
                      <span className="line-clamp-2 min-h-[2.4rem] text-xs sm:text-sm font-semibold text-slate-800 group-hover:text-primary dark:text-slate-100 dark:group-hover:text-emerald-400 leading-snug">
                        {p.name}
                      </span>
                      <div className="flex items-baseline justify-between mt-auto pt-1">
                        <span className="font-display text-base font-extrabold text-primary dark:text-emerald-400 tabular-nums">
                          {formatMoney(p.price)}
                        </span>
                        <span className="text-[11px] font-medium text-slate-400">/{UNIT_LABELS[p.unit]}</span>
                      </div>
                      <span
                        className={`chip text-[10px] py-0.5 justify-center ${
                          out ? 'chip-bad' : low ? 'chip-warn' : 'chip-ok'
                        }`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${out ? 'bg-red-500' : low ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                        {out ? 'Agotado' : `${formatQty(p.stock, p.unit)}`}
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
      </div>

      <div className="hidden w-80 shrink-0 flex-col border-l border-slate-200 bg-white lg:flex dark:border-slate-800 dark:bg-slate-900">
        <CartPanel
          cart={cart}
          cartTotal={cartTotal}
          setLineQty={setLineQty}
          setLineSale={setLineSale}
          removeLine={removeLine}
          onPay={openPayment}
          onUndo={() => void handleUndo()}
        />
      </div>

      {cartCount > 0 && (
        <button
          onClick={() => setCartOpen(true)}
          className="fixed bottom-16 left-3 right-3 z-30 flex items-center justify-between rounded-2xl bg-gradient-to-r from-primary-600 to-primary px-4 py-3 text-white shadow-xl shadow-primary/30 ring-1 ring-white/10 md:bottom-4 lg:hidden active:scale-98 transition"
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-xs font-bold">
              {cartCount}
            </span>
            {cartCount === 1 ? 'artículo en venta' : 'artículos en venta'}
          </span>
          <span className="font-display text-lg font-extrabold tracking-tight tabular-nums">{formatMoney(cartTotal)}</span>
        </button>
      )}

      <BarcodeScanner open={scanOpen} onClose={() => setScanOpen(false)} onScan={handleScan} />

      <Modal open={cartOpen} onClose={() => setCartOpen(false)} title="Venta actual" wide>
        <CartPanel
          cart={cart}
          cartTotal={cartTotal}
          setLineQty={setLineQty}
          setLineSale={setLineSale}
          removeLine={removeLine}
          onPay={openPayment}
          onUndo={() => void handleUndo()}
        />
      </Modal>

      <Modal open={payOpen} onClose={() => setPayOpen(false)} title="Cobrar venta">
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-b from-slate-50 to-white p-4 text-center dark:border-slate-800 dark:from-slate-800/80 dark:to-slate-900 shadow-2xs">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider dark:text-slate-400">Total a liquidar</p>
            <p className="font-display text-3xl font-extrabold text-primary dark:text-emerald-400 tabular-nums mt-0.5">{formatMoney(cartTotal)}</p>
          </div>

          <div className="space-y-3">
            <div className="rounded-xl border border-slate-200/80 p-3 dark:border-slate-800 bg-white/50 dark:bg-slate-900/40">
              <div className="flex items-center justify-between mb-1.5">
                <span className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                  <Banknote className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  Efectivo recibido
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setCash(String(cartTotal.toFixed(2)))
                    setCard('')
                    setTransfer('')
                  }}
                  className="text-[11px] font-bold text-primary hover:underline dark:text-emerald-400"
                >
                  Exacto ({formatMoney(cartTotal)})
                </button>
              </div>
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={cash}
                onChange={(e) => setCash(e.target.value)}
                placeholder="0.00"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[50, 100, 200, 500].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setCash(String((Math.ceil(cartTotal / n) * n).toFixed(2)))}
                    className="rounded-lg border border-slate-200/90 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    ${n}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200/80 p-3 dark:border-slate-800 bg-white/50 dark:bg-slate-900/40">
              <div className="flex items-center justify-between mb-1.5">
                <span className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                  <CreditCard className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                  Tarjeta / Terminal
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setCard(String(cartTotal.toFixed(2)))
                    setCash('')
                    setTransfer('')
                  }}
                  className="text-[11px] font-bold text-sky-600 hover:underline dark:text-sky-400"
                >
                  Todo con tarjeta
                </button>
              </div>
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={card}
                onChange={(e) => setCard(e.target.value)}
                placeholder="0.00"
              />
            </div>

            <div className="rounded-xl border border-slate-200/80 p-3 dark:border-slate-800 bg-white/50 dark:bg-slate-900/40">
              <div className="flex items-center justify-between mb-1.5">
                <span className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                  <Smartphone className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                  Transferencia / SPEI
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setTransfer(String(cartTotal.toFixed(2)))
                    setCash('')
                    setCard('')
                  }}
                  className="text-[11px] font-bold text-violet-600 hover:underline dark:text-violet-400"
                >
                  Todo con transferencia
                </button>
              </div>
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={transfer}
                onChange={(e) => setTransfer(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl bg-emerald-50/80 border border-emerald-200/80 px-3.5 py-2.5 text-sm dark:bg-emerald-950/40 dark:border-emerald-800/40">
            <span className="font-medium text-emerald-800 dark:text-emerald-300">Total recibido</span>
            <span className="font-display font-bold text-emerald-800 dark:text-emerald-300 tabular-nums">{formatMoney(paid)}</span>
          </div>

          {paid < cartTotal ? (
            <div className="flex items-center justify-between rounded-xl bg-amber-50/80 border border-amber-200/80 px-3.5 py-2.5 text-sm dark:bg-amber-950/40 dark:border-amber-800/40">
              <span className="font-medium text-amber-800 dark:text-amber-300">Resta por cubrir</span>
              <span className="font-display font-bold text-amber-700 dark:text-amber-400 tabular-nums">{formatMoney(round2(cartTotal - paid))}</span>
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-xl bg-primary/5 border border-primary/15 px-3.5 py-2.5 text-sm dark:bg-slate-800 dark:border-slate-700">
              <span className="font-medium text-slate-700 dark:text-slate-300">Cambio (efectivo)</span>
              <span className="font-display text-lg font-extrabold text-primary dark:text-emerald-400 tabular-nums">{change > 0 ? formatMoney(change) : '$0.00'}</span>
            </div>
          )}

          <Button
            className="w-full py-3 text-base shadow-sm shadow-primary/20"
            disabled={paid < cartTotal}
            onClick={() => void finishSale()}
          >
            <Check className="h-5 w-5" />
            Completar venta ({formatMoney(cartTotal)})
          </Button>
        </div>
      </Modal>

      <SaleNoteModal sale={noteSale} onClose={() => setNoteSale(null)} />
    </div>
  )
}

function lineTotal(l: CartLine): number {
  return l.salePrice != null ? round2(l.qty * l.salePrice) : round2(l.baseQty * l.unitPrice)
}

function quickButtons(l: CartLine): { unit: Unit; qty: number; label: string }[] {
  if (l.saleUnit === 'kg' && l.fractional) {
    return [
      { unit: 'kg', qty: 0.25, label: '250 g (¼ kg)' },
      { unit: 'kg', qty: 0.5, label: '500 g (½ kg)' },
      { unit: 'kg', qty: 1, label: '1 kg' },
      { unit: 'kg', qty: 2, label: '2 kg' },
    ]
  }
  if (isLiquid(l.unit) && l.fractional) {
    return [
      { unit: 'cuarto', qty: 1, label: '1 cuarto' },
      { unit: 'medio', qty: 1, label: '1 medio' },
      { unit: 'litro', qty: 1, label: '1 L' },
      { unit: 'litro', qty: 2, label: '2 L' },
    ]
  }
  if (isLiquid(l.unit)) return []
  if (!l.fractional && l.presentations.length <= 1) return []
  const presets = l.fractional ? [0.5, 1, 2, 5] : [1, 2, 5, 10]
  return presets.map((v) => ({ unit: l.saleUnit, qty: v, label: formatQty(v, l.saleUnit) }))
}

function CartPanel({
  cart,
  cartTotal,
  setLineQty,
  setLineSale,
  removeLine,
  onPay,
  onUndo,
}: {
  cart: CartLine[]
  cartTotal: number
  setLineQty: (productId: string, saleUnit: Unit, qty: number) => void
  setLineSale: (productId: string, saleUnit: Unit) => void
  removeLine: (productId: string, saleUnit: Unit) => void
  onPay: () => void
  onUndo: () => void
}) {
  const applyPreset = (l: CartLine, b: { unit: Unit; qty: number }) => {
    const isSelected = l.saleUnit === b.unit && Math.abs(l.qty - b.qty) < 1e-6
    if (isSelected) {
      // Si ya está seleccionada y se vuelve a presionar, se deselecciona:
      // regresa a la unidad base del producto con cantidad 1
      if (l.saleUnit !== l.unit) {
        setLineSale(l.productId, l.unit)
      }
      setLineQty(l.productId, l.unit, 1)
    } else {
      if (b.unit === l.saleUnit) {
        setLineQty(l.productId, l.saleUnit, b.qty)
      } else {
        setLineSale(l.productId, b.unit)
        setLineQty(l.productId, b.unit, b.qty)
      }
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-slate-200/80 px-4 py-3 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <p className="font-display text-sm font-bold tracking-tight text-slate-800 dark:text-slate-200">Venta en curso</p>
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary dark:bg-emerald-950/60 dark:text-emerald-300">
            {cart.length}
          </span>
        </div>
        <button
          onClick={() => {
            if (confirm('¿Deshacer la última venta registrada? Se repondrá el stock.')) onUndo()
          }}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 transition"
        >
          <Undo2 className="h-3.5 w-3.5" />
          Deshacer última
        </button>
      </div>
      {cart.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-6 text-center">
          <div>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800">
              <ShoppingCart className="h-6 w-6" />
            </div>
            <p className="font-display text-sm font-semibold text-slate-500 dark:text-slate-400">Carrito vacío</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Toca o escanea productos para agregarlos</p>
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto p-3 divide-y divide-slate-100 dark:divide-slate-800/80">
            {cart.map((l, index) => {
              const key = `${l.productId}:${l.saleUnit}`
              const swatch = getSwatch(l.name)
              return (
                <div key={key} className="py-3 first:pt-1 last:pb-1">
                  <div className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {index + 1}
                    </span>

                    {l.photo ? (
                      <img
                        src={l.photo}
                        alt={l.name}
                        className="h-11 w-11 shrink-0 rounded-xl border border-slate-200/80 object-cover dark:border-slate-700"
                      />
                    ) : (
                      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${swatch.grad} font-display text-xs font-bold uppercase shadow-2xs`}>
                        {swatch.initials}
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <p className="text-xs sm:text-sm font-semibold leading-snug text-slate-900 break-words dark:text-slate-100">
                        {l.name}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {formatMoney(l.salePrice ?? l.unitPrice)} / {UNIT_LABELS[l.salePrice != null ? l.saleUnit : l.unit]}
                        {!isLiquid(l.unit) && l.presentations.length > 1 && (
                          <select
                            value={l.saleUnit}
                            onChange={(e) => setLineSale(l.productId, e.target.value as Unit)}
                            className="ml-1 rounded-lg border border-slate-200 bg-white px-1.5 py-0.5 text-xs font-medium dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                          >
                            {l.presentations.map((s) => (
                              <option key={s.unit} value={s.unit}>{UNIT_LABELS[s.unit]}</option>
                            ))}
                          </select>
                        )}
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <div className="flex items-center gap-1">
                        {l.saleUnit === 'kg' && l.fractional ? (
                          <>
                            <button onClick={() => setLineQty(l.productId, l.saleUnit, Math.max(0, round2(l.qty - 0.1)))} className="rounded-lg bg-slate-100 p-1 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200"><Minus className="h-3.5 w-3.5" /></button>
                            <input
                              value={Math.round(l.qty * 1000)}
                              inputMode="numeric"
                              onChange={(e) =>
                                setLineQty(l.productId, l.saleUnit, (Math.max(0, Number(e.target.value) || 0)) / 1000)
                              }
                              className="w-14 rounded-lg border border-slate-200 px-1 py-0.5 text-center text-xs font-semibold tabular-nums dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                            />
                            <span className="text-[10px] font-semibold text-slate-400">g</span>
                            <button onClick={() => setLineQty(l.productId, l.saleUnit, round2(l.qty + 0.1))} className="rounded-lg bg-slate-100 p-1 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200"><Plus className="h-3.5 w-3.5" /></button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => setLineQty(l.productId, l.saleUnit, round2(l.qty - 1))} className="rounded-lg bg-slate-100 p-1 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200"><Minus className="h-3.5 w-3.5" /></button>
                            <input
                              value={l.qty}
                              inputMode="decimal"
                              onChange={(e) => setLineQty(l.productId, l.saleUnit, Math.max(0, Number(e.target.value) || 0))}
                              className="w-12 rounded-lg border border-slate-200 px-1 py-0.5 text-center text-xs font-semibold tabular-nums dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                            />
                            <button onClick={() => setLineQty(l.productId, l.saleUnit, round2(l.qty + 1))} className="rounded-lg bg-slate-100 p-1 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200"><Plus className="h-3.5 w-3.5" /></button>
                          </>
                        )}
                        <button onClick={() => removeLine(l.productId, l.saleUnit)} className="ml-0.5 rounded-lg p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40" title="Eliminar"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                      <span className="font-display text-sm font-bold text-slate-900 dark:text-slate-100 tabular-nums">{formatMoney(lineTotal(l))}</span>
                    </div>
                  </div>

                  <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-slate-400 pl-7">
                    {l.saleUnit === 'kg' || l.saleUnit !== l.unit ? (
                      <span>≡ {formatQty(l.baseQty, l.unit)}</span>
                    ) : null}
                    {(() => {
                      const factor = l.presentations.find((s) => s.unit === l.saleUnit)?.factor ?? 1
                      if (l.stock == null || factor <= 0) return null
                      const avail = fromBaseQty(l.stock, factor)
                      return (
                        <span>
                          Disp: {formatQty(avail, l.saleUnit)}
                          {l.saleUnit !== l.unit && ` (${formatQty(l.stock, l.unit)})`}
                        </span>
                      )
                    })()}
                  </div>

                  {quickButtons(l).length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5 pl-7">
                      {quickButtons(l).map((b) => {
                        const isSelected = l.saleUnit === b.unit && Math.abs(l.qty - b.qty) < 1e-6
                        return (
                          <button
                            key={b.label}
                            onClick={() => applyPreset(l, b)}
                            title={isSelected ? 'Toca para deseleccionar' : `Seleccionar ${b.label}`}
                            className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[11px] font-bold transition active:scale-95 ${
                              isSelected
                                ? 'border-primary bg-primary text-white shadow-2xs'
                                : 'border-amber-200/90 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-800/50 dark:bg-amber-950/40 dark:text-amber-300'
                            }`}
                          >
                            {isSelected && <span className="text-[10px]">✓</span>}
                            {b.label}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <div className="border-t border-slate-200/80 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
            <div className="mb-3 flex items-baseline justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider dark:text-slate-400">Total a liquidar</span>
              <span className="font-display text-2xl font-extrabold text-primary dark:text-emerald-400 tabular-nums">{formatMoney(cartTotal)}</span>
            </div>
            <Button className="w-full py-3 text-base shadow-sm shadow-primary/25" onClick={onPay}>
              Cobrar {formatMoney(cartTotal)}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
