import Dexie from 'dexie'
import type { Table } from 'dexie'
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

export class PosDatabase extends Dexie {
  categories!: Table<Category, string>
  suppliers!: Table<Supplier, string>
  products!: Table<Product, string>
  sales!: Table<Sale, string>
  purchases!: Table<Purchase, string>
  purchaseOrders!: Table<PurchaseOrder, string>
  stockMovements!: Table<StockMovement, string>
  cashEntries!: Table<CashEntry, string>
  tombstones!: Table<Tombstone, string>

  constructor() {
    super('pinturas-pos')
    this.version(1).stores({
      categories: 'id, name',
      suppliers: 'id, name',
      products: 'id, name, barcode, categoryId, supplierId',
      sales: 'id, date',
      purchases: 'id, date, supplierId',
      purchaseOrders: 'id, date, supplierId, status',
      stockMovements: 'id, date, type, productId',
    })
    this.version(2).stores({
      categories: 'id, name',
      suppliers: 'id, name',
      products: 'id, name, barcode, categoryId, supplierId',
      sales: 'id, date',
      purchases: 'id, date, supplierId',
      purchaseOrders: 'id, date, supplierId, status',
      stockMovements: 'id, date, type, productId',
      cashEntries: 'id, date',
    })
    this.version(3).stores({
      categories: 'id, name',
      suppliers: 'id, name',
      products: 'id, name, barcode, categoryId, supplierId',
      sales: 'id, date',
      purchases: 'id, date, supplierId',
      purchaseOrders: 'id, date, supplierId, status',
      stockMovements: 'id, date, type, productId',
      cashEntries: 'id, date',
      tombstones: 'id, table, at',
    })
  }
}

export const db = new PosDatabase()
