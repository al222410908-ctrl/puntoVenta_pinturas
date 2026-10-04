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
  Package,
  X,
  Sparkles,
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
import { Button, EmptyState, Input, Modal, SafeImage } from '../components/ui'
import { loadScannerSettings, useBarcodeScanner } from '../lib/scanner'



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

  const setLineUnitAndQty = (productId: string, fromUnit: Unit, toUnit: Unit, qty: number) => {
    if (qty <= 0) return
    const product = products.find((p) => p.id === productId)
    if (!product) return
    const factor = factorOf(product, toUnit)
    const nextBase = toBaseQty(qty, factor)

    setCart((prev) => {
      const otherBase = prev.reduce(
        (s, l) => (l.productId === productId && l.saleUnit !== fromUnit ? s + l.baseQty : s),
        0,
      )
      if (round2(otherBase + nextBase) > product.stock) {
        toast.error(`Stock insuficiente. Solo hay ${formatQty(product.stock, product.unit)}`)
        return prev
      }

      const salePrice = presentationsOf(product).find((s) => s.unit === toUnit)?.price
      return prev.map((l) => {
        if (l.productId === productId && l.saleUnit === fromUnit) {
          return {
            ...l,
            saleUnit: toUnit,
            qty,
            baseQty: nextBase,
            salePrice,
          }
        }
        return l
      })
    })
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
        <div className="p-3 pb-2 bg-white/70 backdrop-blur-md border-b border-slate-200/80 dark:bg-slate-900/70 dark:border-slate-800">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <Input
                id="pos-search"
                className="pl-10 pr-9 bg-white/90 dark:bg-slate-950/80 shadow-2xs"
                placeholder="Buscar por nombre o código de barras…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                  aria-label="Limpiar búsqueda"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <Button onClick={() => setScanOpen(true)} className="btn-secondary shrink-0 shadow-2xs" title="Escanear con cámara (celular)">
              <ScanLine className="h-4.5 w-4.5 text-primary dark:text-emerald-400" />
              <span className="hidden sm:inline">Escanear</span>
            </Button>
          </div>
          {scannerActive && (
            <div className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Lector de barras físico activo (escanea directo para agregar)</span>
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 sm:px-4 pb-24 lg:pb-3">
          {topSellers.length > 0 && (
            <div className="mt-3">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Más vendidos
                </p>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                {topSellers.map(({ p }) => (
                  <button
                    key={p.id}
                    onClick={() => addToCart(p)}
                    className="shrink-0 rounded-full border border-amber-300/80 bg-gradient-to-b from-amber-50 to-amber-100/60 px-3 py-1 text-xs font-bold text-amber-900 shadow-2xs hover:border-amber-400 hover:from-amber-100 hover:to-amber-200/80 transition active:scale-95 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-900/60"
                  >
                    ★ {p.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-2.5 flex gap-1.5 overflow-x-auto pb-1">
            <button
              onClick={() => setCategoryId('')}
              className={`shrink-0 rounded-xl px-3.5 py-1.5 text-xs font-bold tracking-tight transition-all shadow-2xs ${
                categoryId === ''
                  ? 'bg-gradient-to-r from-primary-600 to-primary text-white shadow-sm shadow-primary/25'
                  : 'bg-white text-slate-700 border border-slate-200/90 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
              }`}
            >
              Todos
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setCategoryId(c.id)}
                className={`shrink-0 rounded-xl px-3.5 py-1.5 text-xs font-bold tracking-tight transition-all shadow-2xs ${
                  categoryId === c.id
                    ? 'bg-gradient-to-r from-primary-600 to-primary text-white shadow-sm shadow-primary/25'
                    : 'bg-white text-slate-700 border border-slate-200/90 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={<ShoppingCart className="h-7 w-7" />}
              title={search ? 'Sin resultados' : 'Catálogo sin productos'}
              hint={search ? 'Prueba con otro nombre o código' : 'Agrega productos en la pestaña de Catálogo'}
            />
          ) : (
            <>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {filtered.map((p) => {
                  const out = p.stock <= 0
                  const low = !out && p.stock <= p.minStock
                  return (
                    <button
                      key={p.id}
                      onClick={() => addToCart(p)}
                      disabled={out}
                      className="group card relative flex min-w-0 flex-col justify-between overflow-hidden p-2.5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md active:scale-[0.98] disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-none"
                    >
                      <div className="relative mb-2 aspect-4/3 w-full overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800">
                        <SafeImage
                          src={p.photo}
                          alt={p.name}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                          fallbackIcon={<Package className="h-7 w-7 text-slate-300 dark:text-slate-600" />}
                        />
                        <span
                          className={`chip absolute bottom-1.5 right-1.5 text-[10px] shadow-2xs backdrop-blur-md ${
                            out ? 'chip-bad' : low ? 'chip-warn' : 'chip-ok'
                          }`}
                        >
                          {out ? 'Agotado' : `${formatQty(p.stock, p.unit)}`}
                        </span>
                      </div>
                      <div className="flex flex-1 flex-col justify-between">
                        <p className="line-clamp-2 text-xs font-bold leading-snug text-slate-800 transition-colors group-hover:text-primary dark:text-slate-100 dark:group-hover:text-emerald-400">
                          {p.name}
                        </p>
                        <div className="mt-2 flex items-baseline justify-between border-t border-slate-100 pt-1.5 dark:border-slate-800/80">
                          <span className="font-display text-base font-extrabold text-primary tabular-nums dark:text-emerald-400">
                            {formatMoney(p.price)}
                          </span>
                          <span className="text-[11px] font-medium text-slate-400">/{UNIT_LABELS[p.unit]}</span>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
              {visible < allFiltered.length && (
                <button
                  onClick={() => setVisible((v) => v + 80)}
                  className="mt-3 w-full rounded-xl border border-slate-200/90 bg-white py-2.5 text-sm font-semibold text-primary shadow-2xs hover:bg-slate-50 transition active:scale-[0.99] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  Ver más productos ({allFiltered.length - visible} restantes)
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
          setLineUnitAndQty={setLineUnitAndQty}
          removeLine={removeLine}
          onPay={openPayment}
          onUndo={() => void handleUndo()}
        />
      </div>

      {cartCount > 0 && (
        <button
          onClick={() => setCartOpen(true)}
          className="fixed bottom-16 left-3 right-3 z-30 flex items-center justify-between rounded-2xl bg-gradient-to-r from-amber-400 to-amber-500 px-5 py-3.5 text-slate-950 font-bold shadow-xl shadow-amber-500/25 ring-1 ring-amber-300/40 md:bottom-4 lg:hidden active:scale-98 transition-all"
        >
          <span className="flex items-center gap-2.5 text-sm font-extrabold">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-950 text-amber-400 text-xs font-black">
              {cartCount}
            </span>
            <span>{cartCount === 1 ? 'artículo en venta' : 'artículos en venta'}</span>
          </span>
          <span className="font-display text-xl font-black tracking-tight tabular-nums">{formatMoney(cartTotal)}</span>
        </button>
      )}

      <BarcodeScanner open={scanOpen} onClose={() => setScanOpen(false)} onScan={handleScan} />

      <Modal open={cartOpen} onClose={() => setCartOpen(false)} title="Venta actual" wide>
        <CartPanel
          cart={cart}
          cartTotal={cartTotal}
          setLineQty={setLineQty}
          setLineUnitAndQty={setLineUnitAndQty}
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
  setLineUnitAndQty,
  removeLine,
  onPay,
  onUndo,
}: {
  cart: CartLine[]
  cartTotal: number
  setLineQty: (productId: string, saleUnit: Unit, qty: number) => void
  setLineUnitAndQty: (productId: string, fromUnit: Unit, toUnit: Unit, qty: number) => void
  removeLine: (productId: string, saleUnit: Unit) => void
  onPay: () => void
  onUndo: () => void
}) {
  const applyPreset = (l: CartLine, b: { unit: Unit; qty: number }) => {
    const isSelected = l.saleUnit === b.unit && Math.abs(l.qty - b.qty) < 1e-6
    if (isSelected) {
      // Si ya está seleccionada y se vuelve a presionar, se deselecciona:
      // regresa a la unidad base del producto con cantidad 1
      setLineUnitAndQty(l.productId, l.saleUnit, l.unit, 1)
      toast.info(`Restablecido a 1 ${UNIT_LABELS[l.unit]}`)
    } else {
      setLineUnitAndQty(l.productId, l.saleUnit, b.unit, b.qty)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2.5 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <p className="text-sm font-bold text-slate-800 dark:text-slate-200">Venta actual</p>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary dark:bg-emerald-950/40 dark:text-emerald-400">
            {cart.length} {cart.length === 1 ? 'producto' : 'productos'}
          </span>
        </div>
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
        <div className="flex flex-1 items-center justify-center p-6 text-center">
          <p className="text-sm text-slate-400 dark:text-slate-500">Venta vacía. Selecciona productos del catálogo para agregar.</p>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {cart.map((l, index) => {
              const key = `${l.productId}:${l.saleUnit}`
              return (
                <div key={key} className="rounded-xl border border-slate-200/80 bg-white p-2.5 shadow-2xs dark:border-slate-800 dark:bg-slate-900/60">
                  <div className="flex items-start gap-2.5">
                    {/* Enumeración de cada producto */}
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      #{index + 1}
                    </span>

                    {/* Foto del producto */}
                    <SafeImage
                      src={l.photo}
                      alt={l.name}
                      className="h-11 w-11 shrink-0 rounded-lg border border-slate-200 object-cover dark:border-slate-700"
                      fallbackIcon={<Package className="h-5 w-5 text-slate-400 dark:text-slate-500" />}
                    />

                    {/* Nombre completo sin recortar y detalles */}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold leading-snug text-slate-800 break-words dark:text-slate-100">
                        {l.name}
                      </p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-semibold text-primary dark:text-emerald-400">
                          {formatMoney(l.salePrice ?? l.unitPrice)}
                        </span>
                        <span>/ {UNIT_LABELS[l.salePrice != null ? l.saleUnit : l.unit]}</span>
                        {!isLiquid(l.unit) && l.presentations.length > 1 && (
                          <select
                            value={l.saleUnit}
                            onChange={(e) => setLineUnitAndQty(l.productId, l.saleUnit, e.target.value as Unit, 1)}
                            className="ml-1 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs font-medium dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                          >
                            {l.presentations.map((s) => (
                              <option key={s.unit} value={s.unit}>{UNIT_LABELS[s.unit]}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>

                    {/* Quitar producto de la venta */}
                    <button
                      onClick={() => removeLine(l.productId, l.saleUnit)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 transition dark:hover:bg-red-950/30 dark:hover:text-red-400"
                      title="Quitar producto de la venta"
                      aria-label="Quitar producto"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Controles de cantidad y total de la línea */}
                  <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 pt-2 dark:border-slate-800/80">
                    <div className="flex items-center gap-1.5">
                      {l.saleUnit === 'kg' && l.fractional ? (
                        <>
                          <button
                            onClick={() => setLineQty(l.productId, l.saleUnit, Math.max(0, round2(l.qty - 0.1)))}
                            className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <input
                            value={Math.round(l.qty * 1000)}
                            inputMode="numeric"
                            onChange={(e) =>
                              setLineQty(l.productId, l.saleUnit, (Math.max(0, Number(e.target.value) || 0)) / 1000)
                            }
                            className="w-16 rounded-lg border border-slate-200 px-1 py-1 text-center text-xs font-semibold dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                          />
                          <span className="text-xs font-semibold text-slate-400">g</span>
                          <button
                            onClick={() => setLineQty(l.productId, l.saleUnit, round2(l.qty + 0.1))}
                            className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => setLineQty(l.productId, l.saleUnit, round2(l.qty - 1))}
                            className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <input
                            value={l.qty}
                            inputMode="decimal"
                            onChange={(e) => setLineQty(l.productId, l.saleUnit, Math.max(0, Number(e.target.value) || 0))}
                            className="w-12 rounded-lg border border-slate-200 px-1 py-1 text-center text-xs font-semibold dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                          />
                          <button
                            onClick={() => setLineQty(l.productId, l.saleUnit, round2(l.qty + 1))}
                            className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>

                    <span className="font-display text-base font-bold text-slate-900 tabular-nums dark:text-slate-100">
                      {formatMoney(lineTotal(l))}
                    </span>
                  </div>

                  {/* Disponibilidad */}
                  <div className="mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[11px] text-slate-400">
                    {l.saleUnit === 'kg' || l.saleUnit !== l.unit ? (
                      <span>≡ {formatQty(l.baseQty, l.unit)}</span>
                    ) : null}
                    {(() => {
                      const factor = l.presentations.find((s) => s.unit === l.saleUnit)?.factor ?? 1
                      if (l.stock == null || factor <= 0) return null
                      const avail = fromBaseQty(l.stock, factor)
                      return (
                        <span>
                          Disponible: {formatQty(avail, l.saleUnit)}
                          {l.saleUnit !== l.unit && ` (${formatQty(l.stock, l.unit)})`}
                        </span>
                      )
                    })()}
                  </div>

                  {/* Botones de presentación / unidades rápidas seleccionables y deseleccionables */}
                  {quickButtons(l).length > 0 && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-slate-100/60 pt-1.5 dark:border-slate-800/60">
                      {quickButtons(l).map((b) => {
                        const isSelected = l.saleUnit === b.unit && Math.abs(l.qty - b.qty) < 1e-6
                        return (
                          <button
                            key={b.label}
                            type="button"
                            onClick={() => applyPreset(l, b)}
                            className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition active:scale-95 ${
                              isSelected
                                ? 'border-primary bg-primary text-white shadow-xs ring-1 ring-primary/40'
                                : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                            }`}
                            title={isSelected ? `Toca para deseleccionar y volver a 1 ${UNIT_LABELS[l.unit]}` : `Seleccionar ${b.label}`}
                          >
                            {isSelected ? `✓ ${b.label}` : b.label}
                          </button>
                        )
                      })}
                      {l.saleUnit !== l.unit && (
                        <button
                          type="button"
                          onClick={() => {
                            setLineUnitAndQty(l.productId, l.saleUnit, l.unit, 1)
                            toast.info(`Restablecido a 1 ${UNIT_LABELS[l.unit]}`)
                          }}
                          className="text-[11px] font-semibold text-slate-400 hover:text-primary hover:underline dark:hover:text-emerald-400"
                        >
                          ↺ Deseleccionar
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <div className="border-t border-slate-200/90 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/80">
            <div className="mb-3 flex items-baseline justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Total a liquidar</span>
              <span className="font-display text-2xl font-extrabold text-slate-900 tabular-nums dark:text-slate-100">
                {formatMoney(cartTotal)}
              </span>
            </div>
            <button
              onClick={onPay}
              className="btn-accent flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-base font-extrabold shadow-md transition-all active:scale-[0.98]"
            >
              <Banknote className="h-5 w-5" />
              <span>Cobrar {formatMoney(cartTotal)}</span>
            </button>
          </div>
        </>
      )}
    </div>
  )
}
