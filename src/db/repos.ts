import { db } from './db'
import type {
  Backup,
  CashEntry,
  Payment,
  Product,
  Purchase,
  PurchaseItem,
  PurchaseOrder,
  PurchaseOrderItem,
  Sale,
  SaleItem,
  Tombstone,
} from '../types'
import { round2, uid } from '../lib/utils'
import { notifyLocalChange } from '../lib/sync'

export interface CartLine {
  productId: string
  name: string
  unit: SaleItem['unit']
  fractional?: boolean
  qty: number
  unitPrice: number
  cost: number
}

export function cartToItems(lines: CartLine[]): SaleItem[] {
  return lines.map((l) => ({
    productId: l.productId,
    name: l.name,
    unit: l.unit,
    qty: l.qty,
    unitPrice: l.unitPrice,
    cost: l.cost,
    lineTotal: round2(l.qty * l.unitPrice),
  }))
}

export async function registerSale(
  lines: CartLine[],
  payments: Payment[],
  notes?: string,
): Promise<Sale> {
  const items = cartToItems(lines)
  const total = round2(items.reduce((s, i) => s + i.lineTotal, 0))
  const sale: Sale = {
    id: uid(),
    date: Date.now(),
    items,
    payments,
    total,
    notes,
  }
  await db.transaction(
    'rw',
    [db.sales, db.products, db.stockMovements],
    async () => {
      await db.sales.add(sale)
      for (const item of items) {
        const product = await db.products.get(item.productId)
        if (product) {
          const next = round2(product.stock - item.qty)
          if (next < 0) {
            throw new Error(`Stock insuficiente para ${item.name}: solo hay ${round2(product.stock)} ${item.unit}(s)`)
          }
          await db.products.update(item.productId, { stock: next, updatedAt: sale.date })
        }
        await db.stockMovements.add({
          id: uid(),
          date: sale.date,
          type: 'venta',
          productId: item.productId,
          productName: item.name,
          unit: item.unit,
          qty: -item.qty,
          refId: sale.id,
        })
      }
    },
  )
  notifyLocalChange()
  return sale
}

export async function markDeleted(
  table: Tombstone['table'],
  recordId: string,
  at: number = Date.now(),
): Promise<void> {
  await db.tombstones.put({ id: `${table}:${recordId}`, table, recordId, at })
}

export async function undoLastSale(): Promise<Sale | null> {
  const last = await db.sales.orderBy('date').last()
  if (!last) return null
  const now = Date.now()
  await db.transaction(
    'rw',
    [db.sales, db.products, db.stockMovements, db.tombstones],
    async () => {
      await db.sales.delete(last.id!)
      await markDeleted('sales', last.id!, now)
      for (const item of last.items) {
        const product = await db.products.get(item.productId)
        if (product) {
          await db.products.update(item.productId, {
            stock: round2(product.stock + item.qty),
            updatedAt: now,
          })
        }
        await db.stockMovements.add({
          id: uid(),
          date: now,
          type: 'devolucion',
          productId: item.productId,
          productName: item.name,
          unit: item.unit,
          qty: item.qty,
          note: 'Deshacer venta',
          refId: last.id,
        })
      }
    },
  )
  notifyLocalChange()
  return last
}

export function pkgUnits(product: Product): number {
  return product.isPackage && product.pkgUnits ? product.pkgUnits : 1
}

export function packagesFromUnits(product: Product, units: number): number {
  const u = pkgUnits(product)
  return product.fractional ? round2(units / u) : Math.ceil(units / u)
}

export function unitsFromPackages(product: Product, packages: number): number {
  return round2(packages * pkgUnits(product))
}

export async function registerPurchase(
  supplierId: string | undefined,
  items: PurchaseItem[],
  notes?: string,
): Promise<Purchase> {
  const supplierName = supplierId
    ? (await db.suppliers.get(supplierId))?.name
    : undefined
  const total = round2(items.reduce((s, i) => s + i.lineTotal, 0))
  const purchase: Purchase = {
    id: uid(),
    date: Date.now(),
    supplierId,
    supplierName,
    items,
    total,
    notes,
  }
  await db.transaction(
    'rw',
    [db.purchases, db.products, db.stockMovements],
    async () => {
      await db.purchases.add(purchase)
      for (const item of items) {
        const product = await db.products.get(item.productId)
        if (product) {
          await db.products.update(item.productId, {
            stock: round2(product.stock + item.qty),
            cost: item.unitCost,
            updatedAt: purchase.date,
          })
        }
        await db.stockMovements.add({
          id: uid(),
          date: purchase.date,
          type: 'compra',
          productId: item.productId,
          productName: item.name,
          unit: item.unit,
          qty: item.qty,
          refId: purchase.id,
        })
      }
    },
  )
  notifyLocalChange()
  return purchase
}

export async function adjustStock(
  product: Product,
  qty: number,
  note?: string,
): Promise<void> {
  if (!qty) return
  await db.transaction(
    'rw',
    [db.products, db.stockMovements],
    async () => {
      await db.products.update(product.id, {
        stock: round2(product.stock + qty),
        updatedAt: Date.now(),
      })
      await db.stockMovements.add({
        id: uid(),
        date: Date.now(),
        type: 'ajuste',
        productId: product.id,
        productName: product.name,
        unit: product.unit,
        qty,
        note,
      })
    },
  )
  notifyLocalChange()
}

export async function createOrder(
  supplierId: string | undefined,
  items: PurchaseOrderItem[],
): Promise<PurchaseOrder> {
  const supplierName = supplierId
    ? (await db.suppliers.get(supplierId))?.name
    : undefined
  const order: PurchaseOrder = {
    id: uid(),
    date: Date.now(),
    supplierId,
    supplierName,
    items,
    total: round2(items.reduce((s, i) => s + i.lineTotal, 0)),
    status: 'pendiente',
  }
  await db.purchaseOrders.add(order)
  notifyLocalChange()
  return order
}

export async function purchaseFromOrder(orderId: string): Promise<Purchase> {
  const order = await db.purchaseOrders.get(orderId)
  if (!order) throw new Error('Orden no encontrada')
  if (order.status !== 'pendiente') {
    throw new Error('La orden ya no está pendiente')
  }
  let purchase!: Purchase
  await db.transaction(
    'rw',
    [
      db.purchaseOrders,
      db.purchases,
      db.products,
      db.stockMovements,
    ],
    async () => {
      const current = await db.purchaseOrders.get(orderId)
      if (current && current.status !== 'pendiente') {
        throw new Error('La orden ya fue recibida')
      }
      await db.purchaseOrders.update(orderId, { status: 'comprada' })
      purchase = await registerPurchase(
        order.supplierId,
        order.items.map((i) => ({
          productId: i.productId,
          name: i.name,
          unit: i.unit,
          qty: i.qty,
          unitCost: i.unitCost,
          lineTotal: i.lineTotal,
        })),
        `Compra desde orden ${order.id.slice(0, 8)}`,
      )
    },
  )
  return purchase
}

export async function cancelOrder(orderId: string): Promise<void> {
  await db.purchaseOrders.update(orderId, { status: 'cancelada' })
  notifyLocalChange()
}

export interface RestockSuggestion {
  product: Product
  suggestedQty: number
  lineTotal: number
}

export function suggestedQty(product: Product): number {
  const target = product.minStock * 2 - product.stock
  if (target <= 0) return 0
  return product.fractional
    ? Math.round(target * 10) / 10
    : Math.ceil(target)
}

export async function restockSuggestions(): Promise<RestockSuggestion[]> {
  const products = await db.products.toArray()
  return products
    .filter((p) => p.stock <= p.minStock)
    .map((p) => ({
      product: p,
      suggestedQty: suggestedQty(p),
      lineTotal: 0,
    }))
    .filter((s) => s.suggestedQty > 0)
}

export async function addCashEntry(entry: Omit<CashEntry, 'id'>): Promise<CashEntry> {
  const full: CashEntry = { id: uid(), ...entry }
  await db.cashEntries.add(full)
  notifyLocalChange()
  return full
}

export async function deleteCashEntry(id: string): Promise<void> {
  const now = Date.now()
  await db.transaction('rw', [db.cashEntries, db.tombstones], async () => {
    await db.cashEntries.delete(id)
    await markDeleted('cashEntries', id, now)
  })
  notifyLocalChange()
}

export async function cashSummary() {
  const [entries, sales, purchases] = await Promise.all([
    db.cashEntries.toArray(),
    db.sales.toArray(),
    db.purchases.toArray(),
  ])
  const manualIn = entries
    .filter((e) => e.type === 'ingreso')
    .reduce((s, e) => s + e.amount, 0)
  const manualOut = entries
    .filter((e) => e.type === 'egreso')
    .reduce((s, e) => s + e.amount, 0)
  const salesTotal = sales.reduce((s, x) => s + x.total, 0)
  const purchasesTotal = purchases.reduce((s, x) => s + x.total, 0)
  return {
    entries,
    ingresos:
      round2(salesTotal + manualIn),
    egresos: round2(purchasesTotal + manualOut),
    saldo: round2(salesTotal + manualIn - purchasesTotal - manualOut),
    salesTotal: round2(salesTotal),
    purchasesTotal: round2(purchasesTotal),
  }
}

export async function exportBackup(): Promise<Backup> {
  const [categories, suppliers, products, sales, purchases, purchaseOrders, stockMovements, cashEntries] =
    await Promise.all([
      db.categories.toArray(),
      db.suppliers.toArray(),
      db.products.toArray(),
      db.sales.toArray(),
      db.purchases.toArray(),
      db.purchaseOrders.toArray(),
      db.stockMovements.toArray(),
      db.cashEntries.toArray(),
    ])
  return {
    version: 2,
    exportedAt: Date.now(),
    categories,
    suppliers,
    products,
    sales,
    purchases,
    purchaseOrders,
    stockMovements,
    cashEntries,
  }
}

export async function restoreBackup(data: Backup): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.categories,
      db.suppliers,
      db.products,
      db.sales,
      db.purchases,
      db.purchaseOrders,
      db.stockMovements,
      db.cashEntries,
    ],
    async () => {
      await Promise.all([
        db.categories.clear(),
        db.suppliers.clear(),
        db.products.clear(),
        db.sales.clear(),
        db.purchases.clear(),
        db.purchaseOrders.clear(),
        db.stockMovements.clear(),
        db.cashEntries.clear(),
      ])
      await Promise.all([
        db.categories.bulkAdd(data.categories),
        db.suppliers.bulkAdd(data.suppliers),
        db.products.bulkAdd(data.products),
        db.sales.bulkAdd(data.sales),
        db.purchases.bulkAdd(data.purchases),
        db.purchaseOrders.bulkAdd(data.purchaseOrders),
        db.stockMovements.bulkAdd(data.stockMovements),
        data.cashEntries ? db.cashEntries.bulkAdd(data.cashEntries) : Promise.resolve(),
      ])
    },
  )
  notifyLocalChange()
}
