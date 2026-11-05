import { describe, it, expect } from 'vitest'
import { isBucket19L, calculateBucketCardPrice, calculateCartBucketCardInfo } from './bucketCard'
import type { CartLine } from '../db/repos'
import type { BusinessInfo } from '../types'

describe('bucketCard helper', () => {
  const businessFixed: BusinessInfo = {
    name: 'Pinturas POS',
    bucketCardSurchargeEnabled: true,
    bucketCardSurchargeType: 'fixed',
    bucketCardSurchargeAmount: 50,
  }

  const businessPercent: BusinessInfo = {
    name: 'Pinturas POS',
    bucketCardSurchargeEnabled: true,
    bucketCardSurchargeType: 'percent',
    bucketCardSurchargeAmount: 5, // 5%
  }

  it('detects 19L buckets correctly', () => {
    expect(isBucket19L({ unit: 'cubeta' })).toBe(true)
    expect(isBucket19L({ saleUnit: 'cubeta' })).toBe(true)
    expect(isBucket19L({ name: 'PINTURA VINILICA 19LT BLANCO' })).toBe(true)
    expect(isBucket19L({ name: 'Esmalte 19 Litros' })).toBe(true)
    expect(isBucket19L({ name: 'Cubeta de sellador 5x1' })).toBe(true)
    expect(isBucket19L({ unit: 'litro', name: 'Thinner 1L' })).toBe(false)
    expect(isBucket19L({ unit: 'galon', name: 'Pintura Galon 4L' })).toBe(false)
  })

  it('calculates single bucket card price with fixed surcharge', () => {
    const cardPrice = calculateBucketCardPrice(1200, businessFixed)
    expect(cardPrice).toBe(1250)
  })

  it('calculates single bucket card price with percent surcharge', () => {
    const cardPrice = calculateBucketCardPrice(1200, businessPercent)
    expect(cardPrice).toBe(1260) // 1200 + 5% (60) = 1260
  })

  it('calculates cart surcharge for multiple buckets with other items', () => {
    const lines: CartLine[] = [
      {
        productId: 'p1',
        name: 'PINTURA GLOSI BLANCO 19LT',
        unit: 'cubeta',
        saleUnit: 'cubeta',
        qty: 2,
        unitPrice: 1200,
        cost: 900,
        fractional: true,
        baseQty: 2,
        presentations: [],
      },
      {
        productId: 'p2',
        name: 'Brocha 2 pulgadas',
        unit: 'pieza',
        saleUnit: 'pieza',
        qty: 1,
        unitPrice: 50,
        cost: 30,
        fractional: false,
        baseQty: 1,
        presentations: [],
      },
    ]

    const cartTotal = 2 * 1200 + 50 // 2450
    const info = calculateCartBucketCardInfo(lines, businessFixed, cartTotal)

    expect(info.hasBuckets).toBe(true)
    expect(info.bucketCount).toBe(2)
    expect(info.surcharge).toBe(100) // 2 * $50
    expect(info.totalWithCard).toBe(2550)
  })

  it('returns zero surcharge when disabled', () => {
    const disabledBusiness: BusinessInfo = {
      name: 'Pinturas POS',
      bucketCardSurchargeEnabled: false,
    }
    const lines: CartLine[] = [
      {
        productId: 'p1',
        name: 'PINTURA GLOSI BLANCO 19LT',
        unit: 'cubeta',
        saleUnit: 'cubeta',
        qty: 1,
        unitPrice: 1200,
        cost: 900,
        fractional: true,
        baseQty: 1,
        presentations: [],
      },
    ]

    const info = calculateCartBucketCardInfo(lines, disabledBusiness, 1200)
    expect(info.hasBuckets).toBe(false)
    expect(info.surcharge).toBe(0)
    expect(info.totalWithCard).toBe(1200)
  })
})
