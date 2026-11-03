import type { CartLine } from '../db/repos'
import { round2, uid } from './utils'

export interface HeldSale {
  id: string
  date: number
  customerName?: string
  notes?: string
  cart: CartLine[]
  total: number
}

const STORAGE_KEY = 'pos_held_sales'
let memoryCache: HeldSale[] | null = null

function getStorage(): Storage | null {
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage
  if (typeof globalThis !== 'undefined' && globalThis.localStorage) return globalThis.localStorage
  return null
}

export function getHeldSales(): HeldSale[] {
  const storage = getStorage()
  if (!storage) return memoryCache ?? []
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as HeldSale[]
  } catch {
    return memoryCache ?? []
  }
}

export function saveHeldSales(list: HeldSale[]): void {
  memoryCache = list
  const storage = getStorage()
  if (storage) {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(list))
    } catch {
      // Storage quota or private mode
    }
  }
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new Event('pos:held_sales_updated'))
    } catch {
      // no-op
    }
  }
}

export function holdSale(cart: CartLine[], customerName?: string, notes?: string): HeldSale {
  const total = round2(
    cart.reduce((s, l) => s + (l.salePrice != null ? l.salePrice * l.qty : l.unitPrice * l.qty), 0),
  )
  const entry: HeldSale = {
    id: uid(),
    date: Date.now(),
    customerName: customerName?.trim() || undefined,
    notes: notes?.trim() || undefined,
    cart,
    total,
  }
  const current = getHeldSales()
  saveHeldSales([entry, ...current])
  return entry
}

export function removeHeldSale(id: string): void {
  const current = getHeldSales()
  saveHeldSales(current.filter((s) => s.id !== id))
}
