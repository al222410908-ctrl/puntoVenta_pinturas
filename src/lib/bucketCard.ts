import type { Unit, BusinessInfo } from '../types'
import type { CartLine } from '../db/repos'
import { round2 } from './utils'

/**
 * Identifica si un producto o línea de venta corresponde a una presentación de cubeta de 19 Litros.
 */
export function isBucket19L(item: { unit?: Unit; saleUnit?: Unit; name?: string }): boolean {
  if (item.saleUnit === 'cubeta' || item.unit === 'cubeta') return true
  const n = (item.name || '').toLowerCase()
  // Patrones comunes en ferreterías y pinturas para 19 Litros
  return (
    n.includes('19l') ||
    n.includes('19 l') ||
    n.includes('19lt') ||
    n.includes('19 lt') ||
    n.includes('cubeta')
  )
}

/**
 * Calcula el precio con tarjeta para una sola cubeta de 19L según la configuración del negocio.
 */
export function calculateBucketCardPrice(basePrice: number, business?: BusinessInfo | null): number {
  if (!business?.bucketCardSurchargeEnabled) return basePrice
  const type = business.bucketCardSurchargeType ?? 'fixed'
  const amount = business.bucketCardSurchargeAmount ?? 50

  if (type === 'percent') {
    return round2(basePrice * (1 + amount / 100))
  }
  return round2(basePrice + amount)
}

export interface BucketCardInfo {
  hasBuckets: boolean
  bucketCount: number
  surcharge: number
  totalWithCard: number
}

/**
 * Analiza un carrito de venta y calcula el desglose de sobreprecio aplicable
 * exclusivamente a las cubetas de 19 Litros si se paga con tarjeta.
 */
export function calculateCartBucketCardInfo(
  lines: CartLine[],
  business?: BusinessInfo | null,
  cartTotal?: number,
): BucketCardInfo {
  const baseTotal = cartTotal ?? lines.reduce((acc, l) => acc + (l.salePrice ?? l.unitPrice) * l.qty, 0)
  if (!business?.bucketCardSurchargeEnabled || lines.length === 0) {
    return {
      hasBuckets: false,
      bucketCount: 0,
      surcharge: 0,
      totalWithCard: baseTotal,
    }
  }

  const type = business.bucketCardSurchargeType ?? 'fixed'
  const amount = business.bucketCardSurchargeAmount ?? 50

  let bucketCount = 0
  let bucketsSubtotal = 0

  for (const line of lines) {
    if (isBucket19L(line)) {
      // Si la unidad de venta es cubeta, qty son las cubetas.
      // Si se vende por litros y son 19 o más, calculamos cubetas equivalentes.
      const count =
        line.saleUnit === 'cubeta' || line.unit === 'cubeta'
          ? Math.max(1, Math.round(line.qty))
          : line.qty >= 19
          ? Math.floor(line.qty / 19)
          : 1

      bucketCount += count
      const linePrice = line.salePrice ?? line.unitPrice
      bucketsSubtotal += linePrice * count
    }
  }

  if (bucketCount <= 0) {
    return {
      hasBuckets: false,
      bucketCount: 0,
      surcharge: 0,
      totalWithCard: baseTotal,
    }
  }

  const surcharge =
    type === 'percent'
      ? round2(bucketsSubtotal * (amount / 100))
      : round2(amount * bucketCount)

  return {
    hasBuckets: true,
    bucketCount,
    surcharge,
    totalWithCard: round2(baseTotal + surcharge),
  }
}
