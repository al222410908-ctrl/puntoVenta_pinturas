export type Unit =
  | 'pieza'
  | 'litro'
  | 'galon'
  | 'kg'
  | 'metro'
  | 'bolsa'
  | 'caja'

export interface Category {
  id: string
  name: string
}

export interface Supplier {
  id: string
  name: string
  contact?: string
  phone?: string
  notes?: string
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

export interface Backup {
  version: 1
  exportedAt: number
  categories: Category[]
  suppliers: Supplier[]
  products: Product[]
  sales: Sale[]
  purchases: Purchase[]
  purchaseOrders: PurchaseOrder[]
  stockMovements: StockMovement[]
}
