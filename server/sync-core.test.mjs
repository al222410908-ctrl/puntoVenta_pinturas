import { describe, it, expect } from 'vitest'
import {
  empty,
  normalize,
  applyMerge,
  snapshot,
  stockFor,
  TABLES,
} from '../server/sync-core.mjs'

function product(over = {}) {
  return {
    id: 'prod-1',
    name: 'Pintura',
    unit: 'litro',
    fractional: true,
    price: 100,
    cost: 60,
    stock: 10,
    minStock: 5,
    updatedAt: 1000,
    ...over,
  }
}

function sale(id = 'sale-1', over = {}) {
  return {
    id,
    date: 2000,
    items: [{ productId: 'prod-1', qty: 2 }, { raw: true }],
    payments: [],
    total: 200,
    ...over,
  }
}

describe('empty/normalize', () => {
  it('normalize agrega tablas faltantes', () => {
    const d = normalize({ products: { a: 1 } })
    for (const t of TABLES) expect(d[t]).toBeDefined()
    expect(d.tombstones).toEqual({})
  })
})

describe('applyMerge', () => {
  it('mergea un producto nuevo y calcula changed', () => {
    const data = normalize(empty())
    const changed = applyMerge(data, { products: [product()] })
    expect(changed).toBe(1)
    expect(data.products['prod-1'].name).toBe('Pintura')
  })

  it('no resucita un registro borrado (tombstone más reciente)', () => {
    const data = normalize(empty())
    applyMerge(data, { tombstones: [{ id: 'products:prod-1', table: 'products', recordId: 'prod-1', at: 5000 }] })
    const changed = applyMerge(data, { products: [product({ updatedAt: 1000 })] })
    expect(changed).toBe(0)
    expect(data.products['prod-1']).toBeUndefined()
  })

  it('una venta (APPEND) solo se inserta una vez', () => {
    const data = normalize(empty())
    applyMerge(data, { sales: [sale()] })
    const changed = applyMerge(data, { sales: [sale()] })
    expect(changed).toBe(0)
    expect(data.sales['sale-1'].total).toBe(200)
  })

  it('categorias (EDITABLE) aceptan la version mas reciente', () => {
    const data = normalize(empty())
    applyMerge(data, { categories: [{ id: 'c1', name: 'Viejo', updatedAt: 100 }] })
    const changed = applyMerge(data, { categories: [{ id: 'c1', name: 'Nuevo', updatedAt: 200 }] })
    expect(changed).toBe(1)
    expect(data.categories['c1'].name).toBe('Nuevo')
  })

  it('producto mantiene _baseStock para calcular el stock real', () => {
    const data = normalize(empty())
    applyMerge(data, { products: [product({ stock: 10 })] })
    applyMerge(data, {
      stockMovements: [{ id: 'm1', productId: 'prod-1', qty: -3, date: 3000 }],
    })
    const snap = snapshot(data, 0)
    const p = snap.products.find((x) => x.id === 'prod-1')
    expect(p.stock).toBe(7)
  })
})

describe('snapshot', () => {
  it('solo manda registros nuevos segun since', () => {
    const data = normalize(empty())
    applyMerge(data, {
      products: [product({ updatedAt: 1000 }), product({ id: 'prod-2', updatedAt: 3000 })],
    })
    const since = 2000
    const snap = snapshot(data, since)
    expect(snap.products.length).toBe(1)
    expect(snap.products[0].id).toBe('prod-2')
  })

  it('incluye tombstones posteriores a since', () => {
    const data = normalize(empty())
    applyMerge(data, { tombstones: [{ id: 't1', table: 'sales', recordId: 's1', at: 5000 }] })
    const snap = snapshot(data, 4000)
    expect(snap.tombstones.length).toBe(1)
    expect(snapshot(data, 6000).tombstones.length).toBe(0)
  })
})

describe('stockFor', () => {
  it('sume movimientos sobre stock base de un producto', () => {
    const data = normalize(empty())
    data.stockMovements = {
      m1: { productId: 'prod-1', qty: 10 },
      m2: { productId: 'prod-1', qty: -2 },
    }
    expect(stockFor(data, { id: 'prod-1', _baseStock: 5 })).toBe(13)
  })
})