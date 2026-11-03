import { describe, it, expect, beforeEach } from 'vitest'
import { getHeldSales, holdSale, removeHeldSale, saveHeldSales } from './heldSales'
import type { CartLine } from '../db/repos'

describe('Held Sales (Ventas en Pausa / Espera)', () => {
  beforeEach(() => {
    saveHeldSales([])
  })

  it('starts with an empty held sales list', () => {
    expect(getHeldSales()).toEqual([])
  })

  it('parks a current cart and retrieves it', () => {
    const dummyCart: CartLine[] = [
      {
        productId: 'prod-1',
        name: 'Pintura Vinílica Blanca',
        unit: 'cubeta',
        presentations: [],
        saleUnit: 'cubeta',
        qty: 1,
        baseQty: 1,
        unitPrice: 1250,
        cost: 800,
      },
    ]

    const held = holdSale(dummyCart, 'Don Pedro', 'Fue a buscar más dinero')
    expect(held.id).toBeDefined()
    expect(held.customerName).toBe('Don Pedro')
    expect(held.notes).toBe('Fue a buscar más dinero')
    expect(held.total).toBe(1250)
    expect(held.cart).toHaveLength(1)

    const list = getHeldSales()
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe(held.id)
  })

  it('removes a resumed or discarded held sale', () => {
    const dummyCart: CartLine[] = [
      {
        productId: 'prod-2',
        name: 'Brocha 4 Pulgadas',
        unit: 'pieza',
        presentations: [],
        saleUnit: 'pieza',
        qty: 2,
        baseQty: 2,
        unitPrice: 65,
        cost: 40,
      },
    ]

    const held = holdSale(dummyCart, 'Cliente Mostrador')
    expect(getHeldSales()).toHaveLength(1)

    removeHeldSale(held.id)
    expect(getHeldSales()).toHaveLength(0)
  })
})
