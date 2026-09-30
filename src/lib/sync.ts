import { db } from '../db/db'
import type {
  CashEntry,
  CashShift,
  Category,
  Container,
  Product,
  Purchase,
  PurchaseOrder,
  Sale,
  StockMovement,
  Supplier,
  Tombstone,
} from '../types'

const EDITABLE_TABLES = ['products', 'categories', 'suppliers', 'containers', 'cashShifts'] as const
const APPEND_TABLES = ['sales', 'purchases', 'purchaseOrders', 'stockMovements', 'cashEntries'] as const

type EditableTable = (typeof EDITABLE_TABLES)[number]
type AppendTable = (typeof APPEND_TABLES)[number]
type SyncTable = EditableTable | AppendTable

export interface SyncPayload {
  products: Product[]
  categories: Category[]
  suppliers: Supplier[]
  containers: Container[]
  cashShifts: CashShift[]
  sales: Sale[]
  purchases: Purchase[]
  purchaseOrders: PurchaseOrder[]
  stockMovements: StockMovement[]
  cashEntries: CashEntry[]
  tombstones: Tombstone[]
}

const LAST_SYNC_KEY = 'pos_last_sync'
const LAST_PULL_KEY = 'pos_last_pull'
const LAST_PUSH_KEY = 'pos_last_push'
/** Clave donde AccessGate guarda el hash SHA-256 del PIN */
const PIN_STORAGE = 'pos_pin'

/**
 * Base URL de la API de sincronización.
 * - Producción / vercel dev: VITE_SYNC_URL vacío → '/api' (ruta relativa al mismo dominio).
 *   Resulta en /api/sync y /api/access, que Vercel resuelve a los serverless functions.
 * - Staging u otro host: define VITE_SYNC_URL=https://… en el entorno de Vercel.
 */
export const API_BASE: string =
  (import.meta.env.VITE_SYNC_URL as string | undefined)?.replace(/\/$/, '') || '/api'

/**
 * Devuelve el hash SHA-256 del PIN como token de autenticación.
 * De esta forma ningún secreto queda embebido en el bundle JS:
 * el servidor ya conoce el pinHash y puede validarlo directamente.
 */
export function getSyncToken(): string | null {
  return localStorage.getItem(PIN_STORAGE)
}

/** @deprecated Ya no se necesita: el token se deriva del PIN hash */
export function setSyncToken(_token: string): void {
  // no-op: kept for backwards compatibility
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
  const [products, categories, suppliers, containers, cashShifts, sales, purchases, purchaseOrders, stockMovements, cashEntries, tombstones] =
    await Promise.all([
      db.products.toArray(),
      db.categories.toArray(),
      db.suppliers.toArray(),
      db.containers.toArray(),
      db.cashShifts.toArray(),
      db.sales.toArray(),
      db.purchases.toArray(),
      db.purchaseOrders.toArray(),
      db.stockMovements.toArray(),
      db.cashEntries.toArray(),
      db.tombstones.toArray(),
    ])
  return {
    products: since === 0 ? products : products.filter((p) => (p.updatedAt ?? 0) > since),
    categories: since === 0 ? categories : categories.filter((c) => (c.updatedAt ?? 0) > since),
    suppliers: since === 0 ? suppliers : suppliers.filter((s) => (s.updatedAt ?? 0) > since),
    containers: since === 0 ? containers : containers.filter((c) => (c.updatedAt ?? 0) > since),
    cashShifts: since === 0 ? cashShifts : cashShifts.filter((s) => (s.updatedAt ?? s.openedAt ?? 0) > since),
    sales: since === 0 ? sales : sales.filter((s) => s.date > since),
    purchases: since === 0 ? purchases : purchases.filter((p) => p.date > since),
    purchaseOrders: since === 0 ? purchaseOrders : purchaseOrders.filter((p) => p.date > since),
    stockMovements: since === 0 ? stockMovements : stockMovements.filter((m) => m.date > since),
    cashEntries: since === 0 ? cashEntries : cashEntries.filter((c) => c.date > since),
    tombstones,
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
    [db.products, db.categories, db.suppliers, db.containers, db.cashShifts, db.sales, db.purchases, db.purchaseOrders, db.stockMovements, db.cashEntries, db.tombstones],
    async () => {
      await Promise.all([
        rest.products.length ? db.products.bulkPut(rest.products) : Promise.resolve(),
        rest.categories.length ? db.categories.bulkPut(rest.categories) : Promise.resolve(),
        rest.suppliers.length ? db.suppliers.bulkPut(rest.suppliers) : Promise.resolve(),
        rest.containers?.length ? db.containers.bulkPut(rest.containers) : Promise.resolve(),
        rest.cashShifts?.length ? db.cashShifts.bulkPut(rest.cashShifts) : Promise.resolve(),
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

export async function syncNow(options?: { full?: boolean }): Promise<SyncResult> {
  const isFull = options?.full === true
  const pullSince = isFull ? 0 : lastPullSince()
  const pushSince = isFull ? 0 : lastPushAt()

  const payload = await localPayload(pushSince)
  const up = countRecords(payload)
  const thisPushTime = Date.now()

  let resp: Response
  try {
    const token = getSyncToken()
    resp = await fetch(`${API_BASE}/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ since: pullSince, payload }),
    })
  } catch (e) {
    throw new Error(`No se pudo conectar con el servidor (${e instanceof Error ? e.message : String(e)})`)
  }
  if (!resp.ok) {
    if (resp.status === 401) {
      sessionStorage.removeItem('pos_session')
      localStorage.removeItem('pos_session')
      localStorage.removeItem('pos_pin')
      setTimeout(() => window.location.reload(), 1000)
      throw new Error('PIN no autorizado o sesión expirada. Reingresando...')
    }
    let detail = ''
    try {
      detail = (await resp.text()).slice(0, 300)
    } catch {
      /* ignore */
    }
    throw new Error(`Servidor respondió HTTP ${resp.status}${detail ? `: ${detail}` : ''}`)
  }
  const data = (await resp.json()) as {
    changedCount?: number
    since?: number
    serverTime?: number
    payload: SyncPayload
  }
  const down = countRecords(data.payload)
  await applyPayload(data.payload)

  // Guardar cursores separados: pull desde el servidor, push desde el reloj local
  if (typeof data.since === 'number') {
    localStorage.setItem(LAST_PULL_KEY, String(data.since))
  }
  // Buffer de 2 segundos en el push para no perder nada si se guardó durante el fetch
  localStorage.setItem(LAST_PUSH_KEY, String(Math.max(0, thisPushTime - 2000)))
  localStorage.setItem(LAST_SYNC_KEY, String(Date.now()))

  return { up, down, changed: data.changedCount ?? up }
}

export function lastSyncAt(): number {
  return Number(localStorage.getItem(LAST_SYNC_KEY) || '0')
}

export function lastPullSince(): number {
  return Number(localStorage.getItem(LAST_PULL_KEY) || '0')
}

export function lastPushAt(): number {
  return Number(localStorage.getItem(LAST_PUSH_KEY) || '0')
}

function countRecords(p: SyncPayload) {
  return (
    p.products.length +
    p.categories.length +
    p.suppliers.length +
    (p.containers?.length ?? 0) +
    p.sales.length +
    p.purchases.length +
    p.purchaseOrders.length +
    p.stockMovements.length +
    p.cashEntries.length +
    p.tombstones.length
  )
}