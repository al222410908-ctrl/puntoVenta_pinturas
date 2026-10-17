import { describe, it, expect } from 'vitest'
import {
  toExactLiters,
  fromExactLiters,
  convertLiquid,
  formatProductStock,
  presentationFactor,
  toBaseQty,
  fromBaseQty,
  unitFactor,
} from './units'

describe('Exact Liquid Arithmetic & Commercial Standards', () => {
  it('defines 1 galon as exactly 4 liters and 1 cubeta as 19 liters', () => {
    expect(unitFactor('galon')).toBe(4)
    expect(unitFactor('cubeta')).toBe(19)
    expect(unitFactor('litro')).toBe(1)
    expect(unitFactor('medio')).toBe(0.5)
    expect(unitFactor('cuarto')).toBe(0.25)
  })

  it('converts exact liters without floating point residue', () => {
    // 1 galón = 4 litros
    expect(toExactLiters(1, 'galon')).toBe(4)
    expect(toExactLiters(0.5, 'galon')).toBe(2)
    expect(toExactLiters(0.25, 'galon')).toBe(1)
    expect(fromExactLiters(4, 'galon')).toBe(1)
    expect(fromExactLiters(2, 'galon')).toBe(0.5)

    // 1 cubeta = 19 litros
    expect(toExactLiters(1, 'cubeta')).toBe(19)
    // 0.89 cubetas (17 litros exactos)
    expect(toExactLiters(0.89, 'cubeta')).toBe(17)
    // 0.05 cubetas (1 litro exacto)
    expect(toExactLiters(0.05, 'cubeta')).toBe(1)
    expect(fromExactLiters(19, 'cubeta')).toBe(1)
    expect(fromExactLiters(17, 'cubeta')).toBeCloseTo(17 / 19, 5)

    // Conversión directa entre líquidos
    expect(convertLiquid(1, 'galon', 'litro')).toBe(4)
    expect(convertLiquid(4, 'litro', 'galon')).toBe(1)
    expect(convertLiquid(19, 'litro', 'cubeta')).toBe(1)
  })

  it('calculates dynamic presentation factors for liquid units', () => {
    // Galón (4L): 1 Litro = 0.25 galón
    expect(presentationFactor({ unit: 'galon' }, 'litro')).toBe(0.25)
    expect(presentationFactor({ unit: 'galon' }, 'medio')).toBe(0.125)
    expect(presentationFactor({ unit: 'galon' }, 'cuarto')).toBe(0.0625)

    // Cubeta (19L): 1 Galón = 4/19 cubeta
    expect(presentationFactor({ unit: 'cubeta' }, 'galon')).toBeCloseTo(4 / 19, 5)
    expect(presentationFactor({ unit: 'cubeta' }, 'litro')).toBeCloseTo(1 / 19, 5)
  })

  it('toBaseQty and fromBaseQty convert exact liquid amounts between presentations', () => {
    // Venta de 2 litros de un galón (4L) -> 0.5 galón
    expect(toBaseQty(2, 0.25, 'litro', 'galon')).toBe(0.5)
    expect(fromBaseQty(0.5, 0.25, 'galon', 'litro')).toBe(2)
    // Venta de 1 litro de un galón (4L) -> 0.25 galón
    expect(toBaseQty(1, 0.25, 'litro', 'galon')).toBe(0.25)
    expect(fromBaseQty(0.25, 0.25, 'galon', 'litro')).toBe(1)
    // Venta de 1.5 litros de un galón -> 0.375 galón
    expect(toBaseQty(1.5, 0.25, 'litro', 'galon')).toBe(0.375)

    // Venta de 2 litros de una cubeta (19L)
    const baseCubeta = toBaseQty(2, 1 / 19, 'litro', 'cubeta')
    expect(baseCubeta).toBeCloseTo(2 / 19, 4)
  })

  it('formatProductStock formats liquid stock legibly and cleanly', () => {
    // Cubeta entera
    expect(formatProductStock(1, 'cubeta', true, false)).toBe('1 cubeta (19 L)')
    expect(formatProductStock(1, 'cubeta', true, true)).toBe('1 cubeta')

    // Cubeta con 17 litros (0.89 cubeta)
    expect(formatProductStock(0.89, 'cubeta', true, false)).toBe('17 Litros (0.89 cub.)')
    expect(formatProductStock(0.89, 'cubeta', true, true)).toBe('17 L')

    // Cubeta con 1 litro restante (0.05 cubeta)
    expect(formatProductStock(0.05, 'cubeta', true, false)).toBe('1 Litro (0.05 cub.)')
    expect(formatProductStock(0.05, 'cubeta', true, true)).toBe('1 L')

    // Galón con medio galón (2 litros)
    expect(formatProductStock(0.5, 'galon', true, false)).toBe('½ galón (2 L)')
    expect(formatProductStock(0.5, 'galon', true, true)).toBe('½ gal. (2 L)')

    // Galón con 1 litro restante (0.25 galón)
    expect(formatProductStock(0.25, 'galon', true, false)).toBe('¼ galón (1 L)')
    expect(formatProductStock(0.25, 'galon', true, true)).toBe('¼ gal. (1 L)')

    // Galón con 3 litros (0.75 galón)
    expect(formatProductStock(0.75, 'galon', true, false)).toBe('¾ galón (3 L)')
    expect(formatProductStock(0.75, 'galon', true, true)).toBe('¾ gal. (3 L)')
  })
})
