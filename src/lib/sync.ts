import { db } from '../db/db'
import type {
  CashEntry,
  Category,
  Product,
  Purchase,
  PurchaseOrder,
  Sale,
  StockMovement,
  Supplier,
  Tombstone,
} from '../types'

const EDITABLE_TABLES = ['products', 'categories', 'suppliers'] as const
const APPEND_TABLES = ['sales', 'purchases', 'purchaseOrders', 'stockMovements', 'cashEntries'] as const

type EditableTable = (typeof EDITABLE_TABLES)[number]
type AppendTable = (typeof APPEND_TABLES)[number]
type SyncTable = EditableTable | AppendTable

export interface SyncPayload {
  products: Product[]
  categories: Category[]
  suppliers: Supplier[]
  sales: Sale[]
  purchases: Purchase[]
  purchaseOrders: PurchaseOrder[]
  stockMovements: StockMovement[]
  cashEntries: CashEntry[]
  tombstones: Tombstone[]
}

const LAST_SYNC_KEY = 'pos_last_sync'
const SYNC_TOKEN_KEY = 'pos_sync_token'

export function getSyncToken(): string | null {
  const env = import.meta.env.VITE_SYNC_TOKEN as string | undefined
  if (env) return env
  return localStorage.getItem(SYNC_TOKEN_KEY)
}

export function setSyncToken(token: string): void {
  localStorage.setItem(SYNC_TOKEN_KEY, token)
}

type LocalChangeListener = () => void
const localChangeListeners = new Set<LocalChangeListener>()

/** Registra un callback que se ejecutará cuando ocurra un cambio local real (venta, compra, edición, etc.) */
export function onLocalChange(listener: LocalChangeListener): () => void {
  localChangeListeners.add(listener)
  return () => localChangeListeners.delete(listener)
}

/** Señala que hubo un cambio local que debería sincronizarse */
export function notifyLocalChange(): void {
  for (const l of localChangeListeners) l()
}

export function touch<T extends { updatedAt?: number }>(rec: T): T {
  return { ...rec, updatedAt: Date.now() }
}

export async function localPayload(since = 0): Promise<SyncPayload> {
  const [products, categories, suppliers, sales, purchases, purchaseOrders, stockMovements, cashEntries, tombstones] =
    await Promise.all([
      db.products.toArray(),
      db.categories.toArray(),
      db.suppliers.toArray(),
      db.sales.toArray(),
      db.purchases.toArray(),
      db.purchaseOrders.toArray(),
      db.stockMovements.toArray(),
      db.cashEntries.toArray(),
      db.tombstones.toArray(),
    ])
  return {
    products: products.filter((p) => (p.updatedAt ?? 0) > since),
    categories: categories.filter((c) => (c.updatedAt ?? 0) > since),
    suppliers: suppliers.filter((s) => (s.updatedAt ?? 0) > since),
    sales: sales.filter((s) => s.date > since),
    purchases: purchases.filter((p) => p.date > since),
    purchaseOrders: purchaseOrders.filter((p) => p.date > since),
    stockMovements: stockMovements.filter((m) => m.date > since),
    cashEntries: cashEntries.filter((c) => c.date > since),
    tombstones: tombstones.filter((t) => t.at > since),
  }
}

async function deleteByTombstones(tombstones: Tombstone[]): Promise<void> {
  for (const t of tombstones) {
    const table = (db as unknown as Record<SyncTable, { delete: (id: string) => Promise<void> }>)[t.table as SyncTable]
    if (table) await table.delete(t.recordId)
  }
}

export async function applyPayload(payload: SyncPayload): Promise<void> {
  if (!payload.tombstones) payload.tombstones = []
  const { tombstones, ...rest } = payload
  await db.transaction(
    'rw',
    [db.products, db.categories, db.suppliers, db.sales, db.purchases, db.purchaseOrders, db.stockMovements, db.cashEntries, db.tombstones],
    async () => {
      await Promise.all([
        rest.products.length ? db.products.bulkPut(rest.products) : Promise.resolve(),
        rest.categories.length ? db.categories.bulkPut(rest.categories) : Promise.resolve(),
        rest.suppliers.length ? db.suppliers.bulkPut(rest.suppliers) : Promise.resolve(),
        rest.sales.length ? db.sales.bulkPut(rest.sales) : Promise.resolve(),
        rest.purchases.length ? db.purchases.bulkPut(rest.purchases) : Promise.resolve(),
        rest.purchaseOrders.length ? db.purchaseOrders.bulkPut(rest.purchaseOrders) : Promise.resolve(),
        rest.stockMovements.length ? db.stockMovements.bulkPut(rest.stockMovements) : Promise.resolve(),
        rest.cashEntries.length ? db.cashEntries.bulkPut(rest.cashEntries) : Promise.resolve(),
        tombstones.length ? db.tombstones.bulkPut(tombstones) : Promise.resolve(),
      ])
      await deleteByTombstones(tombstones)
    },
  )
}

export interface SyncResult {
  up: number
  down: number
  changed: number
}

export async function syncNow(): Promise<SyncResult> {
  const since = lastSyncAt()
  const payload = await localPayload(since)
  const up = countRecords(payload)
  let resp: Response
  try {
    const token = getSyncToken()
    resp = await fetch('/api/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ since, payload }),
    })
  } catch (e) {
    throw new Error(`No se pudo conectar con el servidor (${e instanceof Error ? e.message : String(e)})`)
  }
  if (!resp.ok) {
    let detail = ''
    try {
      detail = (await resp.text()).slice(0, 300)
    } catch {
      /* ignore */
    }
    throw new Error(`Servidor respondió HTTP ${resp.status}${detail ? `: ${detail}` : ''}`)
  }
  const data = (await resp.json()) as { changedCount?: number; since?: number; payload: SyncPayload }
  const down = countRecords(data.payload)
  await applyPayload(data.payload)
  const newSince = Math.max(data.since ?? 0, Date.now())
  localStorage.setItem(LAST_SYNC_KEY, String(newSince))
  return { up, down, changed: data.changedCount ?? up }
}

export function lastSyncAt(): number {
  return Number(localStorage.getItem(LAST_SYNC_KEY) || '0')
}

function countRecords(p: SyncPayload) {
  return (
    p.products.length +
    p.categories.length +
    p.suppliers.length +
    p.sales.length +
    p.purchases.length +
    p.purchaseOrders.length +
    p.stockMovements.length +
    p.cashEntries.length +
    p.tombstones.length
  )
}