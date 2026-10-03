import { db } from './db'
import type {
  Backup,
  CashEntry,
  CashShift,
  Container,
  MermaReason,
  Payment,
  Product,
  Purchase,
  PurchaseItem,
  PurchaseOrder,
  PurchaseOrderItem,
  OrderStatus,
  Sale,
  SaleItem,
  SalePresentation,
  ShiftSalesSummary,
  Supplier,
  Tombstone,
} from '../types'
import { round2, uid } from '../lib/utils'
import { notifyLocalChange } from '../lib/sync'
import { toBaseQty, presentationFactor, unitFactor } from '../lib/units'

export interface CartLine {
  productId: string
  name: string
  photo?: string
  unit: SaleItem['unit']
  fractional?: boolean
  /** Presentaciones disponibles para vender este producto */
  presentations: SalePresentation[]
  /** Presentación seleccionada en la línea */
  saleUnit: SaleItem['unit']
  /** Cantidad en la presentación seleccionada */
  qty: number
  /** Cantidad convertida a la unidad base del producto */
  baseQty: number
  /** Stock actual del producto en la unidad base */
  stock?: number
  /** Precio unitario en la unidad base (p.price) */
  unitPrice: number
  /** Precio por presentación si la presentación tiene precio propio (ej. 1 medio = $60) */
  salePrice?: number
  cost: number
}

export function cartToItems(lines: CartLine[]): SaleItem[] {
  return lines.map((l) => {
    const factor = presentationFactor({ unit: l.unit, salePresentations: l.presentations }, l.saleUnit)
    const baseQty = round2(l.baseQty ?? toBaseQty(l.qty, factor))
    const unitPrice = l.salePrice != null ? round2(l.salePrice / (factor || 1)) : l.unitPrice
    return {
      productId: l.productId,
      name: l.name,
      unit: l.unit,
      qty: baseQty,
      unitPrice,
      cost: l.cost,
      lineTotal: round2(baseQty * unitPrice),
    }
  })
}

export async function registerSale(
  lines: CartLine[],
  payments: Payment[],
  notes?: string,
): Promise<Sale> {
  const items = cartToItems(lines)
  const total = round2(items.reduce((s, i) => s + i.lineTotal, 0))
  const lastSale = await db.sales.orderBy('date').last()
  const sale: Sale = {
    id: uid(),
    folio: (lastSale?.folio ?? 0) + 1,
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

export async function saveContainer(input: {
  id?: string
  name: string
  liters: number
}): Promise<Container> {
  const name = input.name.trim()
  if (!name) throw new Error('El nombre del envase es obligatorio')
  if (!(input.liters > 0)) throw new Error('El contenido en litros debe ser mayor a 0')
  const existing = input.id ? await db.containers.get(input.id) : undefined
  const rec: Container = {
    id: existing?.id ?? uid(),
    name,
    liters: round2(input.liters),
    updatedAt: Date.now(),
  }
  await db.containers.put(rec)
  notifyLocalChange()
  return rec
}

export async function deleteContainer(id: string): Promise<void> {
  const now = Date.now()
  await db.transaction('rw', [db.containers, db.tombstones], async () => {
    await db.containers.delete(id)
    await markDeleted('containers', id, now)
  })
  notifyLocalChange()
}

/**
 * Unidades base del producto que aporta 1 envase.
 * Ej. Tanque de 50 L sobre producto con unidad "litro" → 50; con unidad "galón" → 13.21.
 */
export function containerBaseQty(container: Container, product: Product): number {
  return round2(container.liters / unitFactor(product.unit))
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
  const unitCost = product.cost || 0
  const totalCost = round2(qty * unitCost)
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
        cost: unitCost,
        totalCost,
        note,
      })
    },
  )
  notifyLocalChange()
}

export async function registerMerma(
  product: Product,
  qty: number,
  reason: MermaReason,
  note?: string,
): Promise<void> {
  if (qty <= 0) throw new Error('La cantidad debe ser mayor a cero')
  if (product.stock < qty) {
    throw new Error(`Stock insuficiente: solo hay ${product.stock} ${product.unit}(s)`)
  }
  const unitCost = product.cost || 0
  const totalCost = round2(qty * unitCost)
  await db.transaction('rw', [db.products, db.stockMovements], async () => {
    await db.products.update(product.id, {
      stock: round2(product.stock - qty),
      updatedAt: Date.now(),
    })
    await db.stockMovements.add({
      id: uid(),
      date: Date.now(),
      type: 'merma',
      productId: product.id,
      productName: product.name,
      unit: product.unit,
      qty: -qty,
      cost: unitCost,
      totalCost,
      mermaReason: reason,
      note,
    })
  })
  notifyLocalChange()
}

export interface AuditItemAdjustment {
  product: Product
  countedStock: number
  note?: string
}

export async function applyInventoryAudit(
  items: AuditItemAdjustment[],
  generalNote?: string,
): Promise<{ adjustedCount: number; netCostDiff: number }> {
  const now = Date.now()
  let adjustedCount = 0
  let netCostDiff = 0

  await db.transaction('rw', [db.products, db.stockMovements], async () => {
    for (const item of items) {
      const diff = round2(item.countedStock - item.product.stock)
      if (Math.abs(diff) > 0.0001) {
        adjustedCount++
        const unitCost = item.product.cost || 0
        const costDiff = round2(diff * unitCost)
        netCostDiff = round2(netCostDiff + costDiff)

        await db.products.update(item.product.id, {
          stock: item.countedStock,
          updatedAt: now,
        })

        await db.stockMovements.add({
          id: uid(),
          date: now,
          type: 'ajuste',
          productId: item.product.id,
          productName: item.product.name,
          unit: item.product.unit,
          qty: diff,
          cost: unitCost,
          totalCost: costDiff,
          note: item.note || generalNote || 'Ajuste por toma de inventario físico',
        })
      }
    }
  })

  notifyLocalChange()
  return { adjustedCount, netCostDiff }
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

export type RestockUrgency = 'critico' | 'urgente' | 'preventivo'

export interface RestockSuggestion {
  product: Product
  suggestedQty: number
  lineTotal: number
  dailyVelocity: number
  leadTimeDays: number
  daysRemaining: number | null
  urgency: RestockUrgency
  supplierName?: string
  supplierPhone?: string
  supplierContact?: string
  soldIn30Days: number
  isTopSeller: boolean
  isOutOfStock: boolean
  isBelowMin: boolean
}

export function suggestedQty(
  product: Product,
  leadTimeDays: number = 3,
  dailyVelocity: number = 0,
): number {
  const leadTimeDemand = round2(dailyVelocity * leadTimeDays)
  // Reorder point: stock mínimo + demanda durante el lead time
  const reorderPoint = round2(product.minStock + leadTimeDemand)
  // Objetivo: cubrir reorder point + margen de seguridad (1.5x)
  const target = Math.max(product.minStock * 2, reorderPoint * 1.5) - product.stock
  if (target <= 0) return 0
  return product.fractional
    ? Math.round(target * 10) / 10
    : Math.ceil(target)
}

export async function restockSuggestions(): Promise<RestockSuggestion[]> {
  const [products, suppliers, sales] = await Promise.all([
    db.products.toArray(),
    db.suppliers.toArray(),
    db.sales.where('date').aboveOrEqual(Date.now() - 30 * 86400000).toArray(),
  ])

  const supplierMap = new Map<string, Supplier>()
  for (const s of suppliers) {
    supplierMap.set(s.id, s)
  }

  const salesMap = new Map<string, number>()
  for (const sale of sales) {
    for (const item of sale.items) {
      const prev = salesMap.get(item.productId) ?? 0
      salesMap.set(item.productId, prev + item.qty)
    }
  }

  // Identificar el umbral para ser "Top Seller" (productos en el 25% superior de volumen vendido)
  const allSoldValues = [...salesMap.values()].filter((v) => v > 0).sort((a, b) => b - a)
  const topSellerThreshold = allSoldValues.length > 0
    ? allSoldValues[Math.min(allSoldValues.length - 1, Math.floor(allSoldValues.length * 0.25))]
    : 1

  const suggestions: RestockSuggestion[] = []

  for (const product of products) {
    const supplier = product.supplierId ? supplierMap.get(product.supplierId) : undefined
    const leadTimeDays = supplier?.leadTimeDays && supplier.leadTimeDays > 0 ? supplier.leadTimeDays : 3
    const soldIn30Days = salesMap.get(product.id) ?? 0
    const dailyVelocity = round2(soldIn30Days / 30)
    const leadTimeDemand = round2(dailyVelocity * leadTimeDays)
    const reorderPoint = round2(product.minStock + leadTimeDemand)

    const daysRemaining = dailyVelocity > 0 ? round2(product.stock / dailyVelocity) : null
    const isOutOfStock = product.stock <= 0
    const isBelowMin = product.stock <= product.minStock
    const isTopSeller = soldIn30Days >= topSellerThreshold && soldIn30Days > 0
    const needsRestock = isOutOfStock || isBelowMin || product.stock <= reorderPoint

    if (needsRestock) {
      const qty = suggestedQty(product, leadTimeDays, dailyVelocity)
      if (qty > 0) {
        let urgency: RestockUrgency = 'preventivo'
        if (isOutOfStock || (daysRemaining !== null && daysRemaining <= leadTimeDays)) {
          urgency = 'critico'
        } else if (isBelowMin || (daysRemaining !== null && daysRemaining <= leadTimeDays * 1.8)) {
          urgency = 'urgente'
        }

        // Si es Top Seller y tiene urgencia crítica o urgente, priorizar aún más
        suggestions.push({
          product,
          suggestedQty: qty,
          lineTotal: round2(qty * (product.cost || 0)),
          dailyVelocity,
          leadTimeDays,
          daysRemaining,
          urgency,
          supplierName: supplier?.name,
          supplierPhone: supplier?.phone,
          supplierContact: supplier?.contact,
          soldIn30Days,
          isTopSeller,
          isOutOfStock,
          isBelowMin,
        })
      }
    }
  }

  // Ordenar: primero los críticos y más vendidos, luego por días restantes
  const urgencyWeight: Record<RestockUrgency, number> = { critico: 0, urgente: 1, preventivo: 2 }
  return suggestions.sort((a, b) => {
    // Si uno es Top Seller y el otro no con misma urgencia, priorizar Top Seller
    const diff = urgencyWeight[a.urgency] - urgencyWeight[b.urgency]
    if (diff !== 0) return diff
    if (a.isTopSeller !== b.isTopSeller) return a.isTopSeller ? -1 : 1
    return (a.daysRemaining ?? 999) - (b.daysRemaining ?? 999)
  })
}

export interface ReceivedItemInput {
  productId: string
  receivedQty: number
  unitCost?: number
}

export async function receiveOrderWithScan(
  orderId: string,
  receivedItems: ReceivedItemInput[],
  options?: {
    closeRemaining?: boolean
    notes?: string
  },
): Promise<{ purchase: Purchase | null; order: PurchaseOrder; fullyCompleted: boolean }> {
  const order = await db.purchaseOrders.get(orderId)
  if (!order) throw new Error('Orden de compra no encontrada')
  if (order.status === 'cancelada' || order.status === 'comprada') {
    throw new Error('Esta orden ya fue cerrada o cancelada')
  }

  const itemsWithQty = receivedItems.filter((i) => i.receivedQty > 0)
  if (itemsWithQty.length === 0) {
    throw new Error('No se ha recibido ninguna cantidad de producto')
  }

  const now = Date.now()
  let createdPurchase: Purchase | null = null
  let updatedOrder!: PurchaseOrder

  await db.transaction(
    'rw',
    [db.purchaseOrders, db.purchases, db.products, db.stockMovements],
    async () => {
      const purchaseLines: PurchaseItem[] = []

      // Actualizar cada producto recibido
      for (const rec of itemsWithQty) {
        const prod = await db.products.get(rec.productId)
        if (!prod) continue

        const effectiveCost = rec.unitCost && rec.unitCost > 0 ? rec.unitCost : prod.cost || 0
        const lineTotal = round2(rec.receivedQty * effectiveCost)

        // 1. Agregar a la línea de compra
        purchaseLines.push({
          productId: prod.id,
          name: prod.name,
          unit: prod.unit,
          qty: rec.receivedQty,
          unitCost: effectiveCost,
          lineTotal,
        })

        // 2. Incrementar stock del producto y actualizar costo si cambió
        const nextStock = round2(prod.stock + rec.receivedQty)
        const patch: Partial<Product> = { stock: nextStock, updatedAt: now }
        if (rec.unitCost && rec.unitCost > 0 && Math.abs(rec.unitCost - prod.cost) > 0.001) {
          patch.cost = round2(rec.unitCost)
        }
        await db.products.update(prod.id, patch)

        // 3. Registrar StockMovement tipo compra
        await db.stockMovements.add({
          id: uid(),
          date: now,
          type: 'compra',
          productId: prod.id,
          productName: prod.name,
          unit: prod.unit,
          qty: rec.receivedQty,
          cost: effectiveCost,
          totalCost: lineTotal,
          note: `Recepción escáner orden ${order.folio ? `OC-${order.folio}` : order.id.slice(0, 8)}`,
          refId: order.id,
        })
      }

      // Crear el registro de compra formal si hubo productos recibidos
      if (purchaseLines.length > 0) {
        const totalPurchase = round2(purchaseLines.reduce((s, i) => s + i.lineTotal, 0))
        createdPurchase = {
          id: uid(),
          date: now,
          supplierId: order.supplierId,
          supplierName: order.supplierName,
          items: purchaseLines,
          total: totalPurchase,
          notes: options?.notes || `Recepción de orden ${order.folio ? `OC-${order.folio}` : order.id.slice(0, 8)}`,
        }
        await db.purchases.add(createdPurchase)
      }

      // Actualizar las cantidades recibidas en la orden
      const updatedItems = order.items.map((it) => {
        const matching = itemsWithQty.find((r) => r.productId === it.productId)
        const addQty = matching ? matching.receivedQty : 0
        const prevReceived = it.receivedQty || 0
        return {
          ...it,
          receivedQty: round2(prevReceived + addQty),
          unitCost: matching?.unitCost && matching.unitCost > 0 ? matching.unitCost : it.unitCost,
        }
      })

      // Determinar si la orden quedó completa
      const isComplete = updatedItems.every((it) => (it.receivedQty || 0) >= it.qty)
      const nextStatus: OrderStatus = isComplete || options?.closeRemaining ? 'comprada' : 'parcial'

      updatedOrder = {
        ...order,
        items: updatedItems,
        status: nextStatus,
        receivedAt: now,
        updatedAt: now,
      }
      await db.purchaseOrders.put(updatedOrder)
    },
  )

  notifyLocalChange()
  return {
    purchase: createdPurchase,
    order: updatedOrder,
    fullyCompleted: updatedOrder.status === 'comprada',
  }
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

export async function getCurrentShift(): Promise<CashShift | null> {
  const openShifts = await db.cashShifts.where('status').equals('abierto').toArray()
  if (openShifts.length === 0) return null
  return openShifts.sort((a, b) => b.openedAt - a.openedAt)[0]
}

export async function openCashShift({
  initialCash,
  cashierName,
}: {
  initialCash: number
  cashierName?: string
}): Promise<CashShift> {
  const current = await getCurrentShift()
  if (current) {
    throw new Error('Ya existe un turno de caja abierto')
  }
  const now = Date.now()
  const shift: CashShift = {
    id: uid(),
    openedAt: now,
    initialCash: round2(initialCash),
    status: 'abierto',
    openedBy: cashierName?.trim() || undefined,
    updatedAt: now,
  }
  await db.transaction('rw', [db.cashShifts, db.cashEntries], async () => {
    await db.cashShifts.add(shift)
    await db.cashEntries.add({
      id: uid(),
      date: now,
      type: 'ingreso',
      concept: 'Fondo inicial de caja',
      subCategory: 'fondo_inicial',
      amount: round2(initialCash),
      shiftId: shift.id,
      updatedAt: now,
    })
  })
  notifyLocalChange()
  return shift
}

export interface ShiftMetrics {
  shift: CashShift
  cashSales: number
  cardSales: number
  transferSales: number
  totalSales: number
  salesCount: number
  incomesCash: number
  expensesCash: number
  expensesOperativos: number
  expensesProveedores: number
  expensesRetiroSeguro: number
  expectedCash: number
  entries: CashEntry[]
}

export async function getShiftMetrics(shift: CashShift): Promise<ShiftMetrics> {
  const from = shift.openedAt
  const to = shift.closedAt ?? Date.now()

  const [allSales, allEntries] = await Promise.all([
    db.sales.where('date').between(from, to, true, true).toArray(),
    db.cashEntries.where('date').between(from, to, true, true).toArray(),
  ])

  let cashSales = 0
  let cardSales = 0
  let transferSales = 0

  for (const s of allSales) {
    for (const p of s.payments) {
      if (p.type === 'efectivo') cashSales += p.amount
      else if (p.type === 'tarjeta') cardSales += p.amount
      else if (p.type === 'transferencia') transferSales += p.amount
    }
  }

  cashSales = round2(cashSales)
  cardSales = round2(cardSales)
  transferSales = round2(transferSales)
  const totalSales = round2(cashSales + cardSales + transferSales)

  const incomesCash = round2(
    allEntries
      .filter((e) => e.type === 'ingreso' && e.subCategory !== 'fondo_inicial')
      .reduce((s, e) => s + e.amount, 0),
  )

  let expensesOperativos = 0
  let expensesProveedores = 0
  let expensesRetiroSeguro = 0
  let expensesOtros = 0

  for (const e of allEntries) {
    if (e.type === 'egreso') {
      if (e.subCategory === 'operativo') expensesOperativos += e.amount
      else if (e.subCategory === 'proveedor') expensesProveedores += e.amount
      else if (e.subCategory === 'retiro_seguro') expensesRetiroSeguro += e.amount
      else expensesOtros += e.amount
    }
  }

  expensesOperativos = round2(expensesOperativos)
  expensesProveedores = round2(expensesProveedores)
  expensesRetiroSeguro = round2(expensesRetiroSeguro)
  expensesOtros = round2(expensesOtros)
  const expensesCash = round2(expensesOperativos + expensesProveedores + expensesRetiroSeguro + expensesOtros)

  const expectedCash = round2(shift.initialCash + cashSales + incomesCash - expensesCash)

  return {
    shift,
    cashSales,
    cardSales,
    transferSales,
    totalSales,
    salesCount: allSales.length,
    incomesCash,
    expensesCash,
    expensesOperativos,
    expensesProveedores,
    expensesRetiroSeguro,
    expectedCash,
    entries: allEntries,
  }
}

export async function closeCashShift(
  shiftId: string,
  {
    actualCash,
    notes,
    cashierName,
  }: {
    actualCash: number
    notes?: string
    cashierName?: string
  },
): Promise<CashShift> {
  const shift = await db.cashShifts.get(shiftId)
  if (!shift) throw new Error('Turno no encontrado')
  if (shift.status === 'cerrado') throw new Error('El turno ya está cerrado')

  const now = Date.now()
  const metrics = await getShiftMetrics(shift)
  const actual = round2(actualCash)
  const diff = round2(actual - metrics.expectedCash)

  const summary: ShiftSalesSummary = {
    cashSales: metrics.cashSales,
    cardSales: metrics.cardSales,
    transferSales: metrics.transferSales,
    totalSales: metrics.totalSales,
    salesCount: metrics.salesCount,
    expensesCash: metrics.expensesCash,
    expensesOperativos: metrics.expensesOperativos,
    expensesProveedores: metrics.expensesProveedores,
    expensesRetiroSeguro: metrics.expensesRetiroSeguro,
    incomesCash: metrics.incomesCash,
  }

  const updated: CashShift = {
    ...shift,
    closedAt: now,
    status: 'cerrado',
    closedBy: cashierName?.trim() || undefined,
    expectedCash: metrics.expectedCash,
    actualCash: actual,
    difference: diff,
    notes: notes?.trim() || undefined,
    summary,
    updatedAt: now,
  }

  await db.cashShifts.put(updated)
  notifyLocalChange()
  return updated
}

export async function exportBackup(): Promise<Backup> {
  const [categories, suppliers, containers, products, sales, purchases, purchaseOrders, stockMovements, cashEntries, cashShifts] =
    await Promise.all([
      db.categories.toArray(),
      db.suppliers.toArray(),
      db.containers.toArray(),
      db.products.toArray(),
      db.sales.toArray(),
      db.purchases.toArray(),
      db.purchaseOrders.toArray(),
      db.stockMovements.toArray(),
      db.cashEntries.toArray(),
      db.cashShifts.toArray(),
    ])
  return {
    version: 2,
    exportedAt: Date.now(),
    categories,
    suppliers,
    containers,
    products,
    sales,
    purchases,
    purchaseOrders,
    stockMovements,
    cashEntries,
    cashShifts,
  }
}

export async function restoreBackup(data: Backup): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.categories,
      db.suppliers,
      db.containers,
      db.products,
      db.sales,
      db.purchases,
      db.purchaseOrders,
      db.stockMovements,
      db.cashEntries,
      db.cashShifts,
    ],
    async () => {
      await Promise.all([
        db.categories.clear(),
        db.suppliers.clear(),
        db.containers.clear(),
        db.products.clear(),
        db.sales.clear(),
        db.purchases.clear(),
        db.purchaseOrders.clear(),
        db.stockMovements.clear(),
        db.cashEntries.clear(),
        db.cashShifts.clear(),
      ])
      await Promise.all([
        db.categories.bulkAdd(data.categories),
        db.suppliers.bulkAdd(data.suppliers),
        data.containers ? db.containers.bulkAdd(data.containers) : Promise.resolve(),
        db.products.bulkAdd(data.products),
        db.sales.bulkAdd(data.sales),
        db.purchases.bulkAdd(data.purchases),
        db.purchaseOrders.bulkAdd(data.purchaseOrders),
        db.stockMovements.bulkAdd(data.stockMovements),
        data.cashEntries ? db.cashEntries.bulkAdd(data.cashEntries) : Promise.resolve(),
        data.cashShifts ? db.cashShifts.bulkAdd(data.cashShifts) : Promise.resolve(),
      ])
    },
  )
  notifyLocalChange()
}
