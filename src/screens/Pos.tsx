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
  Receipt,
  User,
  FileSpreadsheet,
  Keyboard,
  PauseCircle,
  Volume2,
  VolumeX,
  Coins,
  Split,
  Maximize2,
  Minimize2,
} from 'lucide-react'
import { db } from '../db/db'
import type { CartLine } from '../db/repos'
import { registerSale, undoLastSale, createQuote, quoteToCartLines } from '../db/repos'
import type { Product, Payment, Unit, SalePresentation, Sale, Quote } from '../types'
import { formatMoney, round2, matchesSearch, normalizeSearch, calculateChangeBreakdown } from '../lib/utils'
import { HighlightText } from '../components/HighlightText'
import {
  UNIT_LABELS,
  formatQty,
  formatProductStock,
  productPresentations,
  presentationFactor,
  toBaseQty,
  fromBaseQty,
  isLiquid,
  toExactLiters,
  exactAvailableInUnit,
  unitPlural,
  unitFactor,
} from '../lib/units'
import { BarcodeScanner } from '../components/BarcodeScanner'
import { SaleNoteModal } from '../components/SaleNoteModal'
import { SalesHistory } from '../components/SalesHistory'
import { QuoteModal } from '../components/QuoteModal'
import { QuotesHistory } from '../components/QuotesHistory'
import { quoteFolioLabel } from '../lib/ticket'
import { Button, EmptyState, Input, Modal, SafeImage } from '../components/ui'
import { loadScannerSettings, useBarcodeScanner } from '../lib/scanner'
import { sound } from '../lib/sound'
import { getHeldSales, holdSale, removeHeldSale, type HeldSale } from '../lib/heldSales'
import { HeldSalesModal } from '../components/HeldSalesModal'
import { KeyboardShortcutsModal } from '../components/KeyboardShortcutsModal'



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
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [saleNotes, setSaleNotes] = useState('')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [quoteCreateOpen, setQuoteCreateOpen] = useState(false)
  const [quoteCustomerName, setQuoteCustomerName] = useState('')
  const [quoteCustomerPhone, setQuoteCustomerPhone] = useState('')
  const [quoteValidityDays, setQuoteValidityDays] = useState('15')
  const [quoteNotes, setQuoteNotes] = useState('')
  const [activeQuote, setActiveQuote] = useState<Quote | null>(null)
  const [quotesListOpen, setQuotesListOpen] = useState(false)
  const [heldSales, setHeldSales] = useState<HeldSale[]>(() => getHeldSales())
  const [heldModalOpen, setHeldModalOpen] = useState(false)
  const [shortcutsModalOpen, setShortcutsModalOpen] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(() => sound.isEnabled())
  const [scanner] = useState<{ enabled: boolean; suffix: 'Enter' | 'Tab' }>(() => {
    const s = loadScannerSettings()
    return { enabled: s.enabled, suffix: s.suffix }
  })
  const [isFullscreen, setIsFullscreen] = useState(() => typeof document !== 'undefined' && !!document.fullscreenElement)

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen()
          sound.beep(900, 0.05)
          toast.success('Modo caja pantalla completa activado [F11]')
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen()
          sound.beep(600, 0.05)
        }
      }
    } catch {
      // Fallback
    } finally {
      window.dispatchEvent(new CustomEvent('pos:toggle_kiosk'))
    }
  }

  const allFiltered = useMemo(() => {
    return products
      .filter((p) => !categoryId || p.categoryId === categoryId)
      .filter((p) => matchesSearch(search, [p.name, p.barcode, p.purchaseCode]))
  }, [products, search, categoryId])

  const filtered = useMemo(() => allFiltered.slice(0, visible), [allFiltered, visible])

  useEffect(() => {
    setVisible(80)
  }, [search, categoryId])

  const cartTotal = round2(cart.reduce((s, l) => s + lineTotal(l), 0))
  const cartCount = cart.reduce((s, l) => s + l.qty, 0)

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const p of products) {
      if (p.categoryId) {
        counts[p.categoryId] = (counts[p.categoryId] || 0) + 1
      }
    }
    return counts
  }, [products])

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
    baseQty: toBaseQty(qty, factorOf(p, saleUnit), saleUnit, p.unit),
    stock: p.stock,
    unitPrice: p.price,
    salePrice: presentationsOf(p).find((s) => s.unit === saleUnit)?.price,
    cost: p.cost,
  })

  const addToCart = (p: Product) => {
    const pres = presentationsOf(p)
    const availLiters = isLiquid(p.unit) ? toExactLiters(p.stock, p.unit) : p.stock
    // Si la unidad base es cubeta o galón pero no hay suficiente para una unidad cerrada completa (ej. 1.5 L restantes),
    // la presentación por defecto para venta DEBE ser 'litro':
    let defaultUnit = pres.some((s) => s.unit === p.unit) ? p.unit : pres[0]?.unit ?? p.unit
    if (isLiquid(p.unit) && p.fractional && availLiters < unitFactor(p.unit)) {
      defaultUnit = pres.some((s) => s.unit === 'litro') ? 'litro' : pres[0]?.unit ?? p.unit
    }
    const saleUnit = defaultUnit
    const factor = factorOf(p, saleUnit)
    setCart((prev) => {
      if (p.stock <= 0) {
        toast.error(`${p.name} está sin stock`)
        return prev
      }
      const existing = prev.find((l) => l.productId === p.id && l.saleUnit === saleUnit)
      const otherBase = prev.reduce((s, l) => (l.productId === p.id && l.saleUnit !== saleUnit ? s + l.baseQty : s), 0)
      const nextQty = round2((existing?.qty ?? 0) + 1)
      const nextBase = toBaseQty(nextQty, factor, saleUnit, p.unit)

      if (isLiquid(p.unit)) {
        const currentLiters = toExactLiters(p.stock, p.unit)
        const neededLiters = toExactLiters(otherBase, p.unit) + toExactLiters(nextQty, saleUnit)
        if (neededLiters > currentLiters + 1e-4) {
          const availLitersRemaining = Math.max(0, currentLiters - toExactLiters(otherBase, p.unit))
          let effSaleUnit = saleUnit
          if ((effSaleUnit === 'cubeta' || effSaleUnit === 'galon') && availLitersRemaining < unitFactor(effSaleUnit)) {
            effSaleUnit = 'litro'
          }
          const maxQty = exactAvailableInUnit(availLitersRemaining, 'litro', effSaleUnit)
          if (maxQty <= 0) {
            toast.error(`${p.name} está sin stock`)
            return prev
          }
          toast.error(`Solo hay ${formatProductStock(p.stock, p.unit, p.fractional)} de ${p.name}, se agregó lo disponible`)
          const effFactor = factorOf(p, effSaleUnit)
          const maxBase = toBaseQty(maxQty, effFactor, effSaleUnit, p.unit)
          if (existing && existing.saleUnit === effSaleUnit) {
            return prev.map((l) =>
              l.productId === p.id && l.saleUnit === effSaleUnit ? { ...l, qty: maxQty, baseQty: maxBase } : l,
            )
          }
          return [...prev, makeLine(p, effSaleUnit, maxQty)]
        }
      } else {
        const totalBase = round2(otherBase + nextBase)
        if (totalBase > p.stock) {
          const maxBase = Math.max(0, round2(p.stock - otherBase))
          const maxQty = fromBaseQty(maxBase, factor, p.unit, saleUnit)
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
      }

      if (existing) {
        return prev.map((l) =>
          l.productId === p.id && l.saleUnit === saleUnit ? { ...l, qty: nextQty, baseQty: nextBase } : l,
        )
      }
      sound.beep(1100, 0.06)
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
      const nextBase = toBaseQty(qty, factor, saleUnit, product?.unit)
      if (product) {
        if (isLiquid(product.unit)) {
          const currentLiters = toExactLiters(product.stock, product.unit)
          const neededLiters = toExactLiters(otherBase, product.unit) + toExactLiters(qty, saleUnit)
          if (neededLiters > currentLiters + 1e-4) {
            const availLiters = Math.max(0, currentLiters - toExactLiters(otherBase, product.unit))
            if ((saleUnit === 'cubeta' || saleUnit === 'galon') && availLiters < unitFactor(saleUnit)) {
              toast.error(
                `No hay ${UNIT_LABELS[saleUnit]}s completas cerradas (solo quedan ${formatProductStock(product.stock, product.unit, product.fractional)}). Selecciona Litro, Medio o Cuarto.`,
              )
              return prev
            }
            toast.error(`Solo hay ${formatProductStock(product.stock, product.unit, product.fractional)}`)
            const maxQty = exactAvailableInUnit(availLiters, 'litro', saleUnit)
            const maxBase = toBaseQty(maxQty, factor, saleUnit, product.unit)
            return prev.map((l) =>
              l.productId === productId && l.saleUnit === saleUnit ? { ...l, qty: maxQty, baseQty: maxBase } : l,
            )
          }
        } else if (round2(otherBase + nextBase) > product.stock) {
          toast.error(`Solo hay ${formatQty(product.stock, product.unit)}`)
          const maxBase = Math.max(0, round2(product.stock - otherBase))
          const maxQty = fromBaseQty(maxBase, factor, product.unit, saleUnit)
          return prev.map((l) =>
            l.productId === productId && l.saleUnit === saleUnit ? { ...l, qty: maxQty, baseQty: maxBase } : l,
          )
        }
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
    const nextBase = toBaseQty(qty, factor, toUnit, product.unit)

    setCart((prev) => {
      const otherBase = prev.reduce(
        (s, l) => (l.productId === productId && l.saleUnit !== fromUnit ? s + l.baseQty : s),
        0,
      )
      if (isLiquid(product.unit)) {
        const currentLiters = toExactLiters(product.stock, product.unit)
        const neededLiters = toExactLiters(otherBase, product.unit) + toExactLiters(qty, toUnit)
        if (neededLiters > currentLiters + 1e-4) {
          toast.error(`Stock insuficiente. Solo hay ${formatProductStock(product.stock, product.unit, product.fractional)}`)
          return prev
        }
      } else if (round2(otherBase + nextBase) > product.stock) {
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
    const clean = normalizeSearch(code).replace(/[\s\-_/.]/g, '')
    const product = products.find(
      (p) =>
        normalizeSearch(p.barcode ?? '').replace(/[\s\-_/.]/g, '') === clean ||
        normalizeSearch(p.purchaseCode ?? '').replace(/[\s\-_/.]/g, '') === clean ||
        matchesSearch(code, p.name),
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
  const changeBreakdown = useMemo(() => calculateChangeBreakdown(change), [change])

  const handleSplit5050CashCard = () => {
    sound.beep(750, 0.05)
    const half1 = round2(cartTotal / 2)
    const half2 = round2(cartTotal - half1)
    setCash(String(half1.toFixed(2)))
    setCard(String(half2.toFixed(2)))
    setTransfer('')
  }

  const handleSplit5050CashTransfer = () => {
    sound.beep(750, 0.05)
    const half1 = round2(cartTotal / 2)
    const half2 = round2(cartTotal - half1)
    setCash(String(half1.toFixed(2)))
    setTransfer(String(half2.toFixed(2)))
    setCard('')
  }

  const handleAllCash = () => {
    sound.beep(800, 0.05)
    setCash(String(cartTotal.toFixed(2)))
    setCard('')
    setTransfer('')
  }

  const handleAllCard = () => {
    sound.beep(800, 0.05)
    setCard(String(cartTotal.toFixed(2)))
    setCash('')
    setTransfer('')
  }

  const handleAllTransfer = () => {
    sound.beep(800, 0.05)
    setTransfer(String(cartTotal.toFixed(2)))
    setCash('')
    setCard('')
  }

  const handleOpenQuoteCreate = () => {
    if (cart.length === 0) {
      toast.error('Agrega productos al carrito para generar una cotización')
      return
    }
    setQuoteCustomerName(customerName)
    setQuoteCustomerPhone(customerPhone)
    setQuoteNotes(saleNotes)
    setQuoteCreateOpen(true)
  }

  const handleConfirmCreateQuote = async () => {
    if (cart.length === 0) return
    try {
      const q = await createQuote(
        cart,
        quoteCustomerName,
        quoteCustomerPhone,
        quoteNotes,
        parseInt(quoteValidityDays, 10) || 15
      )
      toast.success(`Cotización ${quoteFolioLabel(q)} generada con éxito`)
      setQuoteCreateOpen(false)
      setActiveQuote(q)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al generar la cotización')
    }
  }

  const handleLoadQuoteToCart = async (q: Quote) => {
    if (cart.length > 0) {
      if (!confirm('Tu carrito actual tiene productos. ¿Deseas reemplazarlos por los de esta cotización?')) {
        return
      }
    }
    try {
      const lines = await quoteToCartLines(q)
      setCart(lines)
      if (q.customerName) setCustomerName(q.customerName)
      if (q.customerPhone) setCustomerPhone(q.customerPhone)
      if (q.notes) setSaleNotes(`Cotización ${quoteFolioLabel(q)}: ${q.notes}`)
      setQuotesListOpen(false)
      toast.success(`Cotización ${quoteFolioLabel(q)} cargada al carrito`)
    } catch {
      toast.error('No se pudo cargar la cotización al carrito')
    }
  }

  const handleInputFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setTimeout(() => {
      e.target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 300)
  }

  const handleHoldSale = () => {
    if (cart.length === 0) {
      toast.error('El carrito está vacío, no hay nada que pausar')
      return
    }
    holdSale(cart, customerName, saleNotes)
    sound.beep(650, 0.08)
    toast.success('Venta pausada y guardada en espera [F9]')
    setCart([])
    setCustomerName('')
    setCustomerPhone('')
    setSaleNotes('')
    setCartOpen(false)
  }

  const handleResumeHeldSale = (held: HeldSale) => {
    if (cart.length > 0) {
      if (!confirm('Tu carrito actual tiene productos. ¿Deseas reemplazarlo con la venta pausada?')) {
        return
      }
    }
    setCart(held.cart)
    if (held.customerName) setCustomerName(held.customerName)
    if (held.notes) setSaleNotes(held.notes)
    removeHeldSale(held.id)
    setHeldModalOpen(false)
    sound.beep(1200, 0.08)
    toast.success('Venta reanudada')
  }

  useEffect(() => {
    const refreshHeld = () => setHeldSales(getHeldSales())
    window.addEventListener('pos:held_sales_updated', refreshHeld)
    return () => window.removeEventListener('pos:held_sales_updated', refreshHeld)
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const isEditing =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT')

      if (e.key === 'Escape') {
        if (payOpen) setPayOpen(false)
        else if (quoteCreateOpen) setQuoteCreateOpen(false)
        else if (quotesListOpen) setQuotesListOpen(false)
        else if (historyOpen) setHistoryOpen(false)
        else if (heldModalOpen) setHeldModalOpen(false)
        else if (shortcutsModalOpen) setShortcutsModalOpen(false)
        else if (cartOpen) setCartOpen(false)
        else if (scanOpen) setScanOpen(false)
        else if (search) setSearch('')
        return
      }

      if (e.key === 'F2' || (!isEditing && e.key === '/')) {
        e.preventDefault()
        const searchEl = document.getElementById('pos-search') as HTMLInputElement | null
        if (searchEl) {
          searchEl.focus()
          searchEl.select()
        }
        return
      }

      if (e.key === 'F4') {
        e.preventDefault()
        if (cart.length > 0 && !payOpen && !quoteCreateOpen) {
          openPayment()
        } else if (cart.length === 0) {
          toast.error('Agrega productos al carrito para cobrar [F4]')
        }
        return
      }

      if (e.key === 'F7') {
        e.preventDefault()
        if (cart.length > 0 && !payOpen && !quoteCreateOpen) {
          handleOpenQuoteCreate()
        } else if (cart.length === 0) {
          toast.error('Agrega productos al carrito para cotizar [F7]')
        }
        return
      }

      if (e.key === 'F9') {
        e.preventDefault()
        if (cart.length > 0) {
          handleHoldSale()
        } else {
          toast.error('El carrito está vacío para pausar [F9]')
        }
        return
      }

      if (e.key === 'F11') {
        e.preventDefault()
        void toggleFullscreen()
        return
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    cart,
    payOpen,
    quoteCreateOpen,
    quotesListOpen,
    historyOpen,
    heldModalOpen,
    shortcutsModalOpen,
    cartOpen,
    scanOpen,
    search,
    customerName,
    saleNotes,
  ])

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
      const sale = await registerSale(cart, payments, saleNotes, customerName, customerPhone)
      sound.success()
      toast.success('Venta registrada')
      setCart([])
      setCustomerName('')
      setCustomerPhone('')
      setSaleNotes('')
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
          <div className="flex items-center gap-1.5 sm:gap-2">
            <div className="relative flex-1 min-w-[160px]">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none" />
              <Input
                id="pos-search"
                className="pl-10 pr-10 bg-white/90 dark:bg-slate-950/80 shadow-2xs h-10 text-sm"
                placeholder="Buscar por nombre o código de barras…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                  aria-label="Limpiar búsqueda"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : (
                <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden md:inline-flex items-center px-1.5 py-0.5 rounded border border-slate-200 bg-slate-100 font-mono text-[10px] text-slate-400 dark:border-slate-800 dark:bg-slate-900 pointer-events-none">
                  F2
                </kbd>
              )}
            </div>
            <button
              type="button"
              onClick={() => setScanOpen(true)}
              className="btn-secondary h-10 w-10 sm:w-auto sm:px-2.5 flex items-center justify-center gap-1.5 rounded-xl shrink-0 shadow-2xs"
              title="Escanear código con cámara [Celular/Webcam]"
            >
              <ScanLine className="h-4.5 w-4.5 text-primary dark:text-emerald-400 shrink-0" />
              <span className="hidden 2xl:inline text-xs font-semibold">Escanear</span>
            </button>
            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              className="btn-secondary h-10 w-10 sm:w-auto sm:px-2.5 flex items-center justify-center gap-1.5 rounded-xl shrink-0 shadow-2xs"
              title="Historial de notas de venta y comprobantes"
            >
              <Receipt className="h-4.5 w-4.5 text-primary dark:text-emerald-400 shrink-0" />
              <span className="hidden 2xl:inline text-xs font-semibold">Notas</span>
            </button>
            <button
              type="button"
              onClick={() => setQuotesListOpen(true)}
              className="btn-secondary h-10 w-10 sm:w-auto sm:px-2.5 flex items-center justify-center gap-1.5 rounded-xl shrink-0 shadow-2xs"
              title="Cotizaciones y presupuestos guardados"
            >
              <FileSpreadsheet className="h-4.5 w-4.5 text-amber-600 dark:text-amber-400 shrink-0" />
              <span className="hidden 2xl:inline text-xs font-semibold">Cotizaciones</span>
            </button>
            {heldSales.length > 0 && (
              <button
                type="button"
                onClick={() => setHeldModalOpen(true)}
                className="h-10 px-2.5 flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-100/90 text-amber-950 text-xs font-bold shadow-xs hover:bg-amber-200 transition animate-pulse dark:bg-amber-950/60 dark:border-amber-700 dark:text-amber-200 shrink-0"
                title="Ver ventas pausadas en espera [F9]"
              >
                <PauseCircle className="h-4.5 w-4.5 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>{heldSales.length}</span>
                <span className="hidden sm:inline">en espera</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setShortcutsModalOpen(true)}
              className="btn-secondary h-10 w-10 sm:w-auto sm:px-2.5 flex items-center justify-center gap-1.5 rounded-xl shrink-0 shadow-2xs"
              title="Guía rápida de atajos de teclado [F2, F4, F7, F9, Esc]"
            >
              <Keyboard className="h-4.5 w-4.5 text-slate-600 dark:text-slate-300 shrink-0" />
              <span className="hidden 2xl:inline text-xs font-semibold">Atajos</span>
            </button>
            <button
              type="button"
              onClick={() => setSoundEnabled(sound.toggle())}
              className="rounded-xl border border-slate-200/90 bg-white h-10 w-10 flex items-center justify-center text-slate-600 hover:bg-slate-50 transition shadow-2xs dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 shrink-0"
              title={soundEnabled ? 'Sonido activado (clic para silenciar)' : 'Sonido silenciado (clic para activar)'}
            >
              {soundEnabled ? (
                <Volume2 className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <VolumeX className="h-4.5 w-4.5 text-slate-400" />
              )}
            </button>
            <button
              type="button"
              onClick={() => void toggleFullscreen()}
              className={`rounded-xl border h-10 w-10 flex items-center justify-center transition shadow-2xs shrink-0 ${
                isFullscreen
                  ? 'border-primary bg-primary text-white shadow-xs ring-2 ring-primary/20'
                  : 'border-slate-200/90 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
              }`}
              title={isFullscreen ? 'Salir de pantalla completa [F11 o Esc]' : 'Modo caja pantalla completa [F11]'}
            >
              {isFullscreen ? (
                <Minimize2 className="h-4.5 w-4.5" />
              ) : (
                <Maximize2 className="h-4.5 w-4.5" />
              )}
            </button>
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

          <div className="mt-2.5 flex items-center gap-1.5 overflow-x-auto pb-1.5 scrollbar-thin">
            <button
              onClick={() => setCategoryId('')}
              className={`shrink-0 flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-bold tracking-tight transition-all shadow-2xs active:scale-95 ${
                categoryId === ''
                  ? 'bg-gradient-to-r from-primary-600 to-primary text-white shadow-sm shadow-primary/25 ring-2 ring-primary/20'
                  : 'bg-white text-slate-700 border border-slate-200/90 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
              }`}
            >
              <span>Todos</span>
              <span
                className={`rounded-full px-1.5 py-0.2 text-[10px] font-black ${
                  categoryId === ''
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                }`}
              >
                {products.length}
              </span>
            </button>
            {categories.map((c) => {
              const count = categoryCounts[c.id] || 0
              const active = categoryId === c.id
              return (
                <button
                  key={c.id}
                  onClick={() => setCategoryId(c.id)}
                  className={`shrink-0 flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-bold tracking-tight transition-all shadow-2xs active:scale-95 ${
                    active
                      ? 'bg-gradient-to-r from-primary-600 to-primary text-white shadow-sm shadow-primary/25 ring-2 ring-primary/20'
                      : 'bg-white text-slate-700 border border-slate-200/90 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                  }`}
                >
                  <span>{c.name}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.2 text-[10px] font-black ${
                      active
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              )
            })}
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={<ShoppingCart className="h-7 w-7" />}
              title={search ? 'Sin resultados' : 'Catálogo sin productos'}
              hint={search ? 'Prueba con otro nombre o código' : 'Agrega productos en la pestaña de Catálogo'}
            />
          ) : (
            <>
              <div className="mt-3 grid grid-cols-2 gap-2.5 sm:gap-3 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {filtered.map((p) => {
                  const out = p.stock <= 0
                  const low = !out && p.stock <= p.minStock
                  return (
                    <button
                      key={p.id}
                      onClick={() => addToCart(p)}
                      disabled={out}
                      className={`group card relative flex min-w-0 flex-col justify-between overflow-hidden p-3 text-left transition-all duration-200 active:scale-[0.98] ${
                        out
                          ? 'border-slate-200/60 bg-slate-50/60 dark:border-slate-800/60 dark:bg-slate-900/40 cursor-not-allowed opacity-75'
                          : low
                          ? 'border-amber-300/90 bg-gradient-to-b from-amber-50/40 via-white to-white dark:border-amber-700/60 dark:from-amber-950/20 dark:to-slate-900 hover:-translate-y-1 hover:border-amber-400 hover:shadow-md'
                          : 'border-slate-200/90 bg-white dark:border-slate-800 dark:bg-slate-900 hover:-translate-y-1 hover:border-primary/50 hover:shadow-md'
                      }`}
                    >
                      <div className="relative mb-2 aspect-4/3 w-full overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-100 dark:border-slate-800/60">
                        <SafeImage
                          src={p.photo}
                          alt={p.name}
                          className={`h-full w-full object-cover transition-transform duration-300 group-hover:scale-105 ${
                            out ? 'grayscale contrast-75 opacity-60' : ''
                          }`}
                          fallbackIcon={<Package className="h-7 w-7 text-slate-300 dark:text-slate-600" />}
                        />
                        {out ? (
                          <div className="absolute inset-0 bg-slate-950/35 backdrop-blur-[0.5px] flex items-center justify-center">
                            <span className="px-2.5 py-1 rounded-lg bg-rose-600/95 text-white font-black text-[10.5px] shadow-sm tracking-wider uppercase">
                              Agotado
                            </span>
                          </div>
                        ) : low ? (
                          <span className="absolute top-1.5 left-1.5 z-10 inline-flex items-center gap-1 rounded-md bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 px-1.5 py-0.5 text-[9.5px] font-black shadow-xs ring-1 ring-amber-300/60 animate-pulse">
                            ⚠️ ¡Quedan {formatProductStock(p.stock, p.unit, p.fractional, true)}!
                          </span>
                        ) : null}

                        <span
                          className={`chip absolute bottom-1.5 right-1.5 text-[10px] shadow-2xs backdrop-blur-md ${
                            out ? 'chip-bad' : low ? 'chip-warn' : 'chip-ok'
                          }`}
                        >
                          {!out && !low && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 mr-1 inline-block" />}
                          {out ? 'Sin stock' : formatProductStock(p.stock, p.unit, p.fractional, true)}
                        </span>
                      </div>
                      <div className="flex flex-1 flex-col justify-between">
                        <div>
                          <p className="line-clamp-2 text-xs font-bold leading-snug text-slate-800 transition-colors group-hover:text-primary dark:text-slate-100 dark:group-hover:text-emerald-400 min-h-[30px]">
                            <HighlightText text={p.name} query={search} />
                          </p>
                          {search.trim() && (matchesSearch(search, p.barcode || '') || matchesSearch(search, p.purchaseCode || '')) && (
                            <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                              {p.barcode && matchesSearch(search, p.barcode || '') && (
                                <span className="rounded bg-slate-100 px-1 py-0.2 dark:bg-slate-800">
                                  Cód: <HighlightText text={p.barcode} query={search} />
                                </span>
                              )}
                              {p.purchaseCode && matchesSearch(search, p.purchaseCode || '') && (
                                <span className="rounded bg-slate-100 px-1 py-0.2 dark:bg-slate-800">
                                  Clave: <HighlightText text={p.purchaseCode} query={search} />
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-1.5 dark:border-slate-800/80">
                          <div>
                            <span className="font-display text-base sm:text-lg font-black text-slate-900 dark:text-white tabular-nums">
                              {formatMoney(p.price)}
                            </span>
                            <span className="text-[10.5px] font-semibold text-slate-400 ml-0.5">/{UNIT_LABELS[p.unit]}</span>
                          </div>
                          <div
                            className={`flex h-7 w-7 items-center justify-center rounded-lg transition-all ${
                              out
                                ? 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-600'
                                : 'bg-emerald-50 text-primary transition-all group-hover:bg-primary group-hover:text-white group-hover:shadow-2xs group-hover:scale-105 active:scale-90 dark:bg-emerald-950/40 dark:text-emerald-400 dark:group-hover:bg-emerald-500 dark:group-hover:text-slate-950'
                            }`}
                          >
                            <Plus className="h-4 w-4 stroke-[2.5]" />
                          </div>
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

      <div className="hidden w-[400px] xl:w-[460px] 2xl:w-[500px] shrink-0 flex-col border-l border-slate-200 bg-white lg:flex dark:border-slate-800 dark:bg-slate-900 shadow-sm">
        <CartPanel
          cart={cart}
          cartTotal={cartTotal}
          setLineQty={setLineQty}
          setLineUnitAndQty={setLineUnitAndQty}
          removeLine={removeLine}
          onPay={openPayment}
          onQuote={handleOpenQuoteCreate}
          onHold={handleHoldSale}
          onUndo={() => void handleUndo()}
          onClear={() => setCart([])}
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
          onQuote={handleOpenQuoteCreate}
          onHold={handleHoldSale}
          onUndo={() => void handleUndo()}
          onClear={() => setCart([])}
        />
      </Modal>

      <Modal open={payOpen} onClose={() => setPayOpen(false)} title="Cobrar venta" size="3xl">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
          {/* Columna Izquierda: Total, Resumen de Artículos y Cambio */}
          <div className="md:col-span-5 space-y-3">
            <div className="rounded-2xl border border-slate-200/90 bg-gradient-to-b from-slate-50 to-white p-4 text-center dark:border-slate-800 dark:from-slate-800/80 dark:to-slate-900 shadow-2xs">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider dark:text-slate-400">
                Total a liquidar
              </p>
              <p className="font-display text-3xl lg:text-4xl font-extrabold text-primary dark:text-emerald-400 tabular-nums mt-1">
                {formatMoney(cartTotal)}
              </p>
              <p className="text-xs text-slate-400 mt-0.5 font-medium">
                {cartCount} {cartCount === 1 ? 'artículo en la nota' : 'artículos en la nota'}
              </p>
            </div>

            {/* Desglose rápido de lo que se lleva el cliente para confirmación en mostrador */}
            <div className="hidden md:block rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 text-xs dark:border-slate-800 dark:bg-slate-900/40">
              <p className="font-bold text-slate-600 dark:text-slate-300 mb-1.5 flex items-center justify-between">
                <span>Resumen de nota</span>
                <span className="text-[11px] font-normal text-slate-400">Verificación</span>
              </p>
              <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                {cart.map((l, i) => (
                  <div key={i} className="flex justify-between items-center text-[11.5px]">
                    <span className="truncate pr-2 text-slate-700 dark:text-slate-300">
                      {formatQty(l.qty, l.saleUnit)} {l.name}
                    </span>
                    <span className="font-semibold text-slate-900 dark:text-slate-100 tabular-nums shrink-0">
                      {formatMoney(lineTotal(l))}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Estado de Pagos y Cambio */}
            <div className="space-y-2">
              <div className="flex items-center justify-between rounded-xl bg-slate-100/80 border border-slate-200/80 px-3.5 py-2.5 text-xs dark:bg-slate-800/80 dark:border-slate-700">
                <span className="font-medium text-slate-600 dark:text-slate-300">Total recibido:</span>
                <span className="font-display font-bold text-slate-900 dark:text-slate-100 tabular-nums text-sm">
                  {formatMoney(paid)}
                </span>
              </div>

              {paid < cartTotal ? (
                <div className="flex items-center justify-between rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-2.5 text-xs dark:bg-amber-950/40 dark:border-amber-800">
                  <span className="font-bold text-amber-800 dark:text-amber-300">Resta por cubrir:</span>
                  <span className="font-display font-extrabold text-amber-700 dark:text-amber-400 tabular-nums text-base">
                    {formatMoney(round2(cartTotal - paid))}
                  </span>
                </div>
              ) : (
                <div className="rounded-xl bg-emerald-50/90 border border-emerald-200 p-3 text-xs dark:bg-emerald-950/40 dark:border-emerald-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="block font-bold text-emerald-900 dark:text-emerald-300 text-xs uppercase tracking-wider">
                        Cambio a entregar
                      </span>
                      <span className="text-[11px] text-emerald-700 dark:text-emerald-400">
                        {change > 0 ? 'Entregar en efectivo al cliente' : 'Pago exacto cubierto'}
                      </span>
                    </div>
                    <span className="font-display text-2xl sm:text-3xl font-black text-emerald-700 dark:text-emerald-300 tabular-nums">
                      {change > 0 ? formatMoney(change) : '$0.00'}
                    </span>
                  </div>

                  {changeBreakdown.length > 0 && (
                    <div className="pt-2 border-t border-emerald-200/80 dark:border-emerald-800/80">
                      <div className="flex items-center justify-between text-[11px] font-bold text-emerald-900 dark:text-emerald-300 mb-1.5">
                        <span className="flex items-center gap-1">
                          <Coins className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                          Desglose sugerido de billetes y monedas:
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {changeBreakdown.map((item, idx) => (
                          <span
                            key={idx}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-black shadow-2xs ${
                              item.isCoin
                                ? 'bg-amber-100/90 border border-amber-300 text-amber-950 dark:bg-amber-950/50 dark:border-amber-700 dark:text-amber-200'
                                : 'bg-emerald-100 border border-emerald-300 text-emerald-950 dark:bg-emerald-900/60 dark:border-emerald-700 dark:text-emerald-200'
                            }`}
                          >
                            <span className="text-[10px] opacity-75 font-semibold">{item.count}×</span>
                            <span>{item.label}</span>
                            <span className="text-[9px] font-normal opacity-60">
                              ({item.isCoin ? 'moneda' : 'billete'})
                            </span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Columna Derecha: Formas de Pago, Datos del Cliente y Botón Final */}
          <div className="md:col-span-7 space-y-3">
            {/* Barra de División Rápida */}
            <div className="rounded-xl border border-slate-200/90 bg-slate-50/80 p-2.5 dark:border-slate-800 dark:bg-slate-900/50">
              <div className="flex items-center justify-between mb-1.5">
                <span className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                  <Split className="h-3.5 w-3.5 text-primary dark:text-emerald-400" />
                  División rápida del total ({formatMoney(cartTotal)})
                </span>
                <span className="text-[10px] text-slate-400">1 toque</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                <button
                  type="button"
                  onClick={handleAllCash}
                  className="rounded-lg border border-emerald-200 bg-emerald-50/90 hover:bg-emerald-100 px-2 py-1.5 text-center text-xs font-bold text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 transition active:scale-95 shadow-2xs"
                >
                  Todo Efvo
                </button>
                <button
                  type="button"
                  onClick={handleAllCard}
                  className="rounded-lg border border-sky-200 bg-sky-50/90 hover:bg-sky-100 px-2 py-1.5 text-center text-xs font-bold text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300 transition active:scale-95 shadow-2xs"
                >
                  Todo Tarjeta
                </button>
                <button
                  type="button"
                  onClick={handleAllTransfer}
                  className="rounded-lg border border-violet-200 bg-violet-50/90 hover:bg-violet-100 px-2 py-1.5 text-center text-xs font-bold text-violet-900 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300 transition active:scale-95 shadow-2xs"
                >
                  Todo Transf
                </button>
                <button
                  type="button"
                  onClick={handleSplit5050CashCard}
                  className="rounded-lg border border-slate-200 bg-white hover:bg-slate-100 px-2 py-1.5 text-center text-xs font-bold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 transition active:scale-95 shadow-2xs"
                  title="50% Efectivo + 50% Tarjeta"
                >
                  ½ Efvo + ½ Tarjeta
                </button>
                <button
                  type="button"
                  onClick={handleSplit5050CashTransfer}
                  className="col-span-2 sm:col-span-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 px-2 py-1.5 text-center text-xs font-bold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 transition active:scale-95 shadow-2xs"
                  title="50% Efectivo + 50% Transferencia"
                >
                  ½ Efvo + ½ Transf
                </button>
              </div>
            </div>

            <div className="space-y-2.5">
              {/* Efectivo */}
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
                  onFocus={handleInputFocus}
                  onChange={(e) => setCash(e.target.value)}
                  placeholder="0.00"
                />
                <div className="mt-2.5 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    <span>Billetes rápidos (MXN):</span>
                    <span className="text-[10px] text-slate-400">Toca para fijar pago</span>
                  </div>
                  <div className="grid grid-cols-5 gap-1.5">
                  {[
                    { val: 50, label: '$50', style: 'border-pink-300/90 bg-pink-50 text-pink-700 hover:bg-pink-100 dark:border-pink-800 dark:bg-pink-950/40 dark:text-pink-300' },
                    { val: 100, label: '$100', style: 'border-rose-300/90 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300' },
                    { val: 200, label: '$200', style: 'border-emerald-300/90 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300' },
                    { val: 500, label: '$500', style: 'border-blue-300/90 bg-blue-50 text-blue-800 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300' },
                    { val: 1000, label: '$1,000', style: 'border-amber-300/90 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300' },
                  ].map((b) => (
                    <button
                      key={b.val}
                      type="button"
                      onClick={() => {
                        sound.beep(850, 0.05)
                        const target = b.val >= cartTotal ? b.val : Math.ceil(cartTotal / b.val) * b.val
                        setCash(String(target.toFixed(2)))
                      }}
                      className={`flex items-center justify-center rounded-xl border py-2 px-1 text-xs font-black shadow-2xs transition active:scale-95 ${b.style}`}
                      title={`Pagar con billete de ${b.label}`}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
                </div>
              </div>

              {/* Tarjeta y Transferencia en Grid de 2 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* Tarjeta */}
                <div className="rounded-xl border border-slate-200/80 p-3 dark:border-slate-800 bg-white/50 dark:bg-slate-900/40">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                      <CreditCard className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                      Tarjeta
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
                      Todo
                    </button>
                  </div>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={card}
                    onFocus={handleInputFocus}
                    onChange={(e) => setCard(e.target.value)}
                    placeholder="0.00"
                  />
                </div>

                {/* Transferencia */}
                <div className="rounded-xl border border-slate-200/80 p-3 dark:border-slate-800 bg-white/50 dark:bg-slate-900/40">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                      <Smartphone className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                      Transferencia
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
                      Todo
                    </button>
                  </div>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={transfer}
                    onFocus={handleInputFocus}
                    onChange={(e) => setTransfer(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              </div>
            </div>

            {/* Datos del Cliente y Notas opcionales */}
            <div className="rounded-xl border border-slate-200/90 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-900/60 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                <User className="h-3.5 w-3.5 text-primary dark:text-emerald-400" />
                <span>Cliente y comprobante (opcional)</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Input
                  placeholder="Nombre del cliente…"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  maxLength={60}
                  className="text-xs bg-white dark:bg-slate-900"
                />
                <Input
                  type="tel"
                  inputMode="tel"
                  placeholder="WhatsApp (10 dígitos)"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  maxLength={15}
                  className="text-xs bg-white dark:bg-slate-900"
                />
              </div>
              <Input
                placeholder="Nota de venta (ej. color preparado, factura pendiente...)"
                value={saleNotes}
                onChange={(e) => setSaleNotes(e.target.value)}
                maxLength={120}
                className="text-xs bg-white dark:bg-slate-900"
              />
            </div>

            <Button
              className="w-full py-3.5 text-base font-bold shadow-md shadow-primary/20"
              disabled={paid < cartTotal}
              onClick={() => void finishSale()}
            >
              <Check className="h-5 w-5 mr-1.5 inline" />
              Completar venta ({formatMoney(cartTotal)})
            </Button>
          </div>
        </div>
      </Modal>

      <SaleNoteModal sale={noteSale} onClose={() => setNoteSale(null)} />

      {/* Modal de Historial y Verificación de Notas */}
      <Modal open={historyOpen} onClose={() => setHistoryOpen(false)} title="Historial de Ventas / Búsqueda de Notas">
        <div className="max-h-[75vh] flex flex-col">
          <SalesHistory compact />
        </div>
      </Modal>

      {/* Modal para Crear Cotización */}
      <Modal open={quoteCreateOpen} onClose={() => setQuoteCreateOpen(false)} title="Generar Cotización / Presupuesto">
        <div className="space-y-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs dark:border-amber-900/60 dark:bg-amber-950/20">
            <div className="flex justify-between items-center font-bold text-amber-900 dark:text-amber-300">
              <span>Total a cotizar ({cartCount} artículos):</span>
              <span className="font-display text-base tabular-nums">{formatMoney(cartTotal)}</span>
            </div>
            <p className="mt-0.5 text-[11px] text-amber-700/80 dark:text-amber-400">
              Esta cotización no reserva existencias ni descuenta producto del almacén.
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <span className="label">Nombre del cliente</span>
              <Input
                placeholder="Ej: Arq. Juan Pérez / Contratista"
                value={quoteCustomerName}
                onChange={(e) => setQuoteCustomerName(e.target.value)}
                maxLength={60}
                autoFocus
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <span className="label">WhatsApp (opcional)</span>
                <Input
                  type="tel"
                  inputMode="tel"
                  placeholder="10 dígitos ej: 5512345678"
                  value={quoteCustomerPhone}
                  onChange={(e) => setQuoteCustomerPhone(e.target.value)}
                  maxLength={15}
                />
              </div>
              <div>
                <span className="label">Vigencia (días)</span>
                <select
                  value={quoteValidityDays}
                  onChange={(e) => setQuoteValidityDays(e.target.value)}
                  className="input w-full"
                >
                  <option value="7">7 días</option>
                  <option value="15">15 días (recomendado)</option>
                  <option value="30">30 días</option>
                  <option value="60">60 días</option>
                </select>
              </div>
            </div>

            <div>
              <span className="label">Notas / Observaciones (opcional)</span>
              <Input
                placeholder="Ej: Precios válidos por volumen, flete incluido..."
                value={quoteNotes}
                onChange={(e) => setQuoteNotes(e.target.value)}
                maxLength={120}
              />
            </div>
          </div>

          <div className="pt-2 flex gap-2">
            <Button className="btn-accent flex-1 py-3 font-bold" onClick={() => void handleConfirmCreateQuote()}>
              <FileSpreadsheet className="mr-2 inline h-4 w-4" />
              Generar Cotización
            </Button>
            <Button className="btn-secondary" onClick={() => setQuoteCreateOpen(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal de Previsualización y Envío de Cotización */}
      <QuoteModal
        quote={activeQuote}
        onClose={() => setActiveQuote(null)}
        onConvertToSale={() => {
          if (activeQuote) {
            void handleLoadQuoteToCart(activeQuote)
            setActiveQuote(null)
          }
        }}
      />

      {/* Modal con Historial de Cotizaciones */}
      <Modal open={quotesListOpen} onClose={() => setQuotesListOpen(false)} title="Cotizaciones y Presupuestos Guardados">
        <div className="max-h-[75vh] flex flex-col">
          <QuotesHistory onLoadQuoteToCart={handleLoadQuoteToCart} compact />
        </div>
      </Modal>

      {/* Modal de Ventas en Espera (Pausadas) */}
      <HeldSalesModal
        open={heldModalOpen}
        onClose={() => setHeldModalOpen(false)}
        heldSales={heldSales}
        onResume={handleResumeHeldSale}
        onDelete={(id) => {
          removeHeldSale(id)
          toast.info('Venta en espera eliminada')
        }}
      />

      {/* Guía Rápida de Atajos de Teclado */}
      <KeyboardShortcutsModal
        open={shortcutsModalOpen}
        onClose={() => setShortcutsModalOpen(false)}
      />

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
    const list: { unit: Unit; qty: number; label: string }[] = [
      { unit: 'cuarto', qty: 1, label: '¼ L (Cuarto)' },
      { unit: 'medio', qty: 1, label: '½ L (Medio)' },
      { unit: 'litro', qty: 1, label: '1 L' },
      { unit: 'litro', qty: 1.5, label: '1.5 L' },
      { unit: 'litro', qty: 2, label: '2 L' },
      { unit: 'galon', qty: 1, label: 'Galón (4 L)' },
    ]
    if (l.unit === 'cubeta') {
      list.push({ unit: 'cubeta', qty: 1, label: 'Cubeta (19 L)' })
    }
    return list
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
  onQuote,
  onHold,
  onUndo,
  onClear,
}: {
  cart: CartLine[]
  cartTotal: number
  setLineQty: (productId: string, saleUnit: Unit, qty: number) => void
  setLineUnitAndQty: (productId: string, fromUnit: Unit, toUnit: Unit, qty: number) => void
  removeLine: (productId: string, saleUnit: Unit) => void
  onPay: () => void
  onQuote?: () => void
  onHold?: () => void
  onUndo: () => void
  onClear?: () => void
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
    <div className="flex h-full flex-col bg-slate-50/40 dark:bg-slate-900/40">
      {/* Encabezado Estilo Ticket / Mostrador */}
      <div className="flex items-center justify-between border-b border-slate-200/90 px-4 py-3 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-primary dark:bg-emerald-950/60 dark:text-emerald-400">
            <Receipt className="h-4.5 w-4.5 stroke-[2.2]" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-black tracking-tight text-slate-900 dark:text-slate-100">Ticket de Venta</p>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100/90 dark:bg-emerald-950/60 px-2 py-0.2 text-[10px] font-black text-emerald-900 dark:text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {cart.length} {cart.length === 1 ? 'producto' : 'productos'}
              </span>
            </div>
            <p className="text-[10.5px] text-slate-400 font-medium">Mostrador · Entrega Inmediata</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {cart.length > 0 && onClear && (
            <button
              type="button"
              onClick={() => {
                if (confirm('¿Vaciar todos los artículos del carrito actual?')) onClear()
              }}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-slate-400 hover:bg-red-50 hover:text-red-600 transition active:scale-95 dark:hover:bg-red-950/40 dark:hover:text-red-400"
              title="Vaciar carrito actual"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Vaciar</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (confirm('¿Deshacer la última venta registrada? Se repondrá el stock.')) onUndo()
            }}
            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition active:scale-95 dark:text-slate-300 dark:hover:bg-slate-800"
            title="Deshacer la última venta registrada y recuperar stock"
          >
            <Undo2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Deshacer</span>
          </button>
        </div>
      </div>
      {cart.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-primary dark:bg-emerald-950/40 dark:text-emerald-400 mb-3 border border-emerald-200/60 dark:border-emerald-800/40 shadow-xs">
            <ShoppingCart className="h-8 w-8 stroke-[1.75]" />
          </div>
          <p className="font-display font-bold text-slate-800 dark:text-slate-100 text-sm">Venta actual vacía</p>
          <p className="text-xs text-slate-400 max-w-[240px] mt-1.5 leading-relaxed">
            Toca cualquier producto del catálogo o escanea un código de barras para comenzar.
          </p>
          <div className="mt-4 flex items-center gap-1.5 text-[10.5px] text-slate-400 bg-slate-100/80 dark:bg-slate-800/60 px-3 py-1.5 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
            <kbd className="font-mono font-bold text-slate-600 dark:text-slate-300">F2</kbd> Buscar ·
            <kbd className="font-mono font-bold text-slate-600 dark:text-slate-300 ml-1">F4</kbd> Cobrar ·
            <kbd className="font-mono font-bold text-slate-600 dark:text-slate-300 ml-1">F9</kbd> Pausar
          </div>
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
                        {l.presentations.length > 1 && (
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
                            onClick={() => setLineQty(l.productId, l.saleUnit, Math.max(0.1, round2(l.qty - 0.1)))}
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
                      ) : (l.saleUnit === 'litro' || l.saleUnit === 'metro') && l.fractional ? (
                        <>
                          <button
                            onClick={() => setLineQty(l.productId, l.saleUnit, Math.max(0.5, round2(l.qty - 0.5)))}
                            className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <input
                            value={l.qty}
                            inputMode="decimal"
                            onChange={(e) => {
                              const val = parseFloat(e.target.value)
                              if (!isNaN(val) && val > 0) setLineQty(l.productId, l.saleUnit, round2(val))
                            }}
                            className="w-12 rounded-lg border border-slate-200 px-1 py-1 text-center text-xs font-semibold dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                          />
                          <button
                            onClick={() => setLineQty(l.productId, l.saleUnit, round2(l.qty + 0.5))}
                            className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => setLineQty(l.productId, l.saleUnit, Math.max(1, Math.round(l.qty) - 1))}
                            className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <input
                            value={Math.round(l.qty)}
                            inputMode="numeric"
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10)
                              if (!isNaN(val) && val > 0) setLineQty(l.productId, l.saleUnit, val)
                            }}
                            className="w-12 rounded-lg border border-slate-200 px-1 py-1 text-center text-xs font-semibold dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                          />
                          <button
                            onClick={() => setLineQty(l.productId, l.saleUnit, Math.round(l.qty) + 1)}
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

                  {/* Disponibilidad y equivalencia comercial */}
                  <div className="mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[11px] text-slate-400">
                    {(() => {
                      if (isLiquid(l.unit)) {
                        if (l.saleUnit !== 'litro') {
                          const eqLiters = toExactLiters(l.qty, l.saleUnit)
                          return (
                            <span className="font-medium text-slate-500 dark:text-slate-400">
                              ≡ {eqLiters} {eqLiters === 1 ? 'Litro' : 'Litros'}
                            </span>
                          )
                        }
                        return null
                      }
                      if (l.saleUnit !== l.unit) {
                        return <span>≡ {formatQty(l.baseQty, l.unit)}</span>
                      }
                      return null
                    })()}
                    {(() => {
                      if (l.stock == null) return null
                      const avail = exactAvailableInUnit(l.stock, l.unit, l.saleUnit)
                      const unitName = avail === 1 ? UNIT_LABELS[l.saleUnit] : unitPlural(l.saleUnit)
                      return (
                        <span>
                          Disponible: {formatProductStock(l.stock, l.unit, l.fractional)}
                          {l.saleUnit !== l.unit && ` (${avail} ${unitName})`}
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
          {/* Separador punteado estilo ticket y Dock Flotante de Cobro */}
          <div className="border-t-2 border-dashed border-slate-200/90 dark:border-slate-800" />
          <div className="bg-white/95 backdrop-blur-md p-4 dark:bg-slate-900/95 shadow-[0_-8px_24px_rgba(0,0,0,0.06)] border-t border-slate-100 dark:border-slate-800/60">
            <div className="mb-3 flex items-baseline justify-between">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Total a liquidar</span>
                <span className="block text-[10.5px] text-slate-400">IVA incluido · Mostrador</span>
              </div>
              <span className="font-display text-3xl font-black text-slate-950 tabular-nums dark:text-white tracking-tight">
                {formatMoney(cartTotal)}
              </span>
            </div>
            <div className="flex gap-2">
              {onHold && (
                <button
                  type="button"
                  onClick={onHold}
                  className="flex h-12 items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-slate-100 px-3.5 text-xs font-bold text-slate-800 shadow-2xs transition-all hover:bg-slate-200 active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  title="Pausar venta actual y atender a otro cliente [F9]"
                >
                  <PauseCircle className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                  <span>Pausar</span>
                  <span className="text-[10px] opacity-60 font-mono">[F9]</span>
                </button>
              )}
              {onQuote && (
                <button
                  type="button"
                  onClick={onQuote}
                  className="flex h-12 items-center justify-center gap-1.5 rounded-xl border border-amber-300/80 bg-amber-50 px-3.5 text-xs font-bold text-amber-900 shadow-2xs transition-all hover:bg-amber-100 active:scale-95 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                  title="Generar cotización sin venta [F7]"
                >
                  <FileSpreadsheet className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  <span>Cotizar</span>
                  <span className="text-[10px] opacity-60 font-mono">[F7]</span>
                </button>
              )}
              <button
                onClick={onPay}
                className="btn-accent flex-1 flex h-12 items-center justify-center gap-2 rounded-xl text-base font-black shadow-lg shadow-accent/25 transition-all hover:brightness-105 active:scale-[0.98]"
                title="Cobrar venta actual [F4]"
              >
                <Banknote className="h-5 w-5" />
                <span>Cobrar {formatMoney(cartTotal)}</span>
                <span className="text-xs opacity-80 font-mono bg-black/10 px-1.5 py-0.5 rounded-md">[F4]</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
