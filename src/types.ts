export type Unit =
  | 'pieza'
  | 'litro'
  | 'medio'
  | 'cuarto'
  | 'galon'
  | 'cubeta'
  | 'kg'
  | 'metro'
  | 'bolsa'
  | 'caja'

export interface Category {
  id: string
  name: string
  updatedAt?: number
}

export interface Supplier {
  id: string
  name: string
  contact?: string
  phone?: string
  notes?: string
  updatedAt?: number
}

export interface SalePresentation {
  unit: Unit
  /** 1 presentación equivale a `factor` unidades base del producto (ej. 1 caja = 50 piezas) */
  factor: number
  /** Precio de venta de 1 presentación (ej. 1 medio = $60). Si no se define, se calcula proporcional al precio base. */
  price?: number
}

export interface Product {
  id: string
  name: string
  barcode?: string
  purchaseCode?: string
  categoryId?: string
  supplierId?: string
  unit: Unit
  fractional: boolean
  price: number
  cost: number
  stock: number
  minStock: number
  subcategory?: string
  subsubcategory?: string
  photo?: string
  isPackage?: boolean
  pkgUnits?: number
  pkgQty?: number
  /** Presentaciones en las que se puede vender (ej. litro, medio; caja de 50 piezas). El stock se cuenta en `unit`. */
  salePresentations?: SalePresentation[]
  /** @deprecated Reemplazado por `salePresentations`. Se conserva solo para migrar datos previos. */
  saleUnits?: Unit[]
  updatedAt?: number
}

export type PaymentType = 'efectivo' | 'tarjeta'

export interface Payment {
  type: PaymentType
  amount: number
}

export interface SaleItem {
  productId: string
  name: string
  unit: Unit
  qty: number
  unitPrice: number
  cost: number
  lineTotal: number
}

export interface Sale {
  id: string
  date: number
  items: SaleItem[]
  payments: Payment[]
  total: number
  notes?: string
}

export interface PurchaseItem {
  productId: string
  name: string
  unit: Unit
  qty: number
  unitCost: number
  lineTotal: number
}

export interface Purchase {
  id: string
  date: number
  supplierId?: string
  supplierName?: string
  items: PurchaseItem[]
  total: number
  notes?: string
}

export interface PurchaseOrderItem {
  productId: string
  name: string
  unit: Unit
  qty: number
  unitCost: number
  lineTotal: number
}

export type OrderStatus = 'pendiente' | 'comprada' | 'cancelada'

export interface PurchaseOrder {
  id: string
  date: number
  supplierId?: string
  supplierName?: string
  items: PurchaseOrderItem[]
  total: number
  status: OrderStatus
}

export type MovementType = 'venta' | 'compra' | 'ajuste' | 'devolucion'

export interface StockMovement {
  id: string
  date: number
  type: MovementType
  productId: string
  productName: string
  unit: Unit
  qty: number
  note?: string
  refId?: string
}

export type CashType = 'ingreso' | 'egreso'

export interface CashEntry {
  id: string
  date: number
  type: CashType
  concept: string
  category?: string
  amount: number
  note?: string
}

export interface Tombstone {
  id: string // `${table}:${recordId}`
  table:
    | 'products'
    | 'categories'
    | 'suppliers'
    | 'sales'
    | 'purchases'
    | 'purchaseOrders'
    | 'stockMovements'
    | 'cashEntries'
  recordId: string
  at: number
}

export interface Backup {
  version: 2
  exportedAt: number
  categories: Category[]
  suppliers: Supplier[]
  products: Product[]
  sales: Sale[]
  purchases: Purchase[]
  purchaseOrders: PurchaseOrder[]
  stockMovements: StockMovement[]
  cashEntries: CashEntry[]
}
