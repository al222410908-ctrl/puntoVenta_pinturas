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
  /** Tiempo estimado de entrega en días (Lead time) */
  leadTimeDays?: number
  updatedAt?: number
}

/** Envase de compra configurable (ej. Tanque 50 L). El stock se acredita en la unidad base del producto. */
export interface Container {
  id: string
  name: string
  /** Contenido del envase en litros */
  liters: number
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

export type PaymentType = 'efectivo' | 'tarjeta' | 'transferencia'

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
  /** Folio consecutivo de la nota de venta */
  folio?: number
  date: number
  items: SaleItem[]
  payments: Payment[]
  total: number
  notes?: string
}

export interface BusinessInfo {
  name: string
  address?: string
  phone?: string
  footer?: string
  logo?: string
  ownerName?: string
  ownerPhone?: string
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
  receivedQty?: number
}

export type OrderStatus = 'pendiente' | 'parcial' | 'comprada' | 'cancelada'

export interface PurchaseOrder {
  id: string
  folio?: number
  date: number
  supplierId?: string
  supplierName?: string
  items: PurchaseOrderItem[]
  total: number
  status: OrderStatus
  receivedAt?: number
  notes?: string
  updatedAt?: number
}

export type MovementType = 'venta' | 'compra' | 'ajuste' | 'devolucion' | 'merma'

export type MermaReason =
  | 'muestra_color'
  | 'danado_derrame'
  | 'caducado_secado'
  | 'uso_interno'
  | 'otro'

export interface StockMovement {
  id: string
  date: number
  type: MovementType
  productId: string
  productName: string
  unit: Unit
  qty: number
  cost?: number
  totalCost?: number
  mermaReason?: MermaReason
  note?: string
  refId?: string
}

export interface InventoryAuditItem {
  productId: string
  productName: string
  unit: Unit
  systemStock: number
  countedStock: number
  difference: number
  unitCost: number
  costDifference: number
}

export interface InventoryAudit {
  id: string
  date: number
  itemsCounted: number
  discrepanciesCount: number
  netDifferenceCost: number
  notes?: string
}

export type CashType = 'ingreso' | 'egreso'
export type CashExpenseCategory = 'operativo' | 'proveedor' | 'retiro_seguro' | 'otro'
export type CashIncomeCategory = 'venta' | 'fondo_inicial' | 'aportacion' | 'otro'

export interface CashEntry {
  id: string
  date: number
  type: CashType
  concept: string
  category?: string
  subCategory?: CashExpenseCategory | CashIncomeCategory
  amount: number
  note?: string
  shiftId?: string
  updatedAt?: number
}

export interface ShiftSalesSummary {
  cashSales: number
  cardSales: number
  transferSales: number
  totalSales: number
  salesCount: number
  expensesCash: number
  expensesOperativos: number
  expensesProveedores: number
  expensesRetiroSeguro: number
  incomesCash: number
}

export interface CashShift {
  id: string
  openedAt: number
  closedAt?: number
  initialCash: number           // Fondo inicial en caja (para cambio)
  status: 'abierto' | 'cerrado'
  openedBy?: string
  closedBy?: string
  expectedCash?: number         // Calculado por sistema al cerrar
  actualCash?: number           // Contado ciego ingresado por el cajero
  difference?: number           // actualCash - expectedCash (positivo=sobrante, negativo=faltante)
  notes?: string
  summary?: ShiftSalesSummary
  updatedAt?: number
}

export interface Tombstone {
  id: string // `${table}:${recordId}`
  table:
    | 'products'
    | 'categories'
    | 'suppliers'
    | 'containers'
    | 'sales'
    | 'purchases'
    | 'purchaseOrders'
    | 'stockMovements'
    | 'cashEntries'
    | 'cashShifts'
  recordId: string
  at: number
}

export interface Backup {
  version: 2
  exportedAt: number
  categories: Category[]
  suppliers: Supplier[]
  containers?: Container[]
  products: Product[]
  sales: Sale[]
  purchases: Purchase[]
  purchaseOrders: PurchaseOrder[]
  stockMovements: StockMovement[]
  cashEntries: CashEntry[]
  cashShifts?: CashShift[]
}
