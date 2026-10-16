import { describe, it, expect } from 'vitest'
import {
  toExactLiters,
  fromExactLiters,
  formatProductStock,
  unitFactor,
} from './units'

describe('Manejo y Matemática Exacta de Líquidos en Litros', () => {
  it('1 cubeta equivale exactamente a 19 Litros', () => {
    expect(toExactLiters(1, 'cubeta')).toBe(19)
    expect(fromExactLiters(19, 'cubeta')).toBe(1)
    expect(unitFactor('cubeta')).toBe(19)
  })

  it('1 galón equivale exactamente a 4 Litros', () => {
    expect(toExactLiters(1, 'galon')).toBe(4)
    expect(fromExactLiters(4, 'galon')).toBe(1)
    expect(unitFactor('galon')).toBe(4)
  })

  it('si se tienen 19 Litros (1 cubeta), 13 cubetas requieren 247 Litros y exceden el stock', () => {
    const stockLiters = toExactLiters(1, 'cubeta') // 19 L
    const requestedCubetas = 13
    const requestedLiters = toExactLiters(requestedCubetas, 'cubeta') // 247 L
    expect(stockLiters).toBe(19)
    expect(requestedLiters).toBe(247)
    expect(requestedLiters > stockLiters).toBe(true)

    // El máximo que cabe de cubetas es exactamente 1
    const maxCubetas = Math.floor(stockLiters / unitFactor('cubeta'))
    expect(maxCubetas).toBe(1)
  })

  it('al vender 4 galones (16 L) de una cubeta de 19 L, sobran exactamente 3 Litros', () => {
    const initialLiters = 19
    const soldGalones = 4
    const soldLiters = toExactLiters(soldGalones, 'galon') // 16 L
    const remainingLiters = initialLiters - soldLiters

    expect(soldLiters).toBe(16)
    expect(remainingLiters).toBe(3)
    expect(formatProductStock(remainingLiters, 'litro', true)).toBe('3 Litros')
  })

  it('al vender 18 Litros de una cubeta de 19 L, sobra exactamente 1 Litro', () => {
    const initialLiters = 19
    const soldLiters = 18
    const remainingLiters = initialLiters - soldLiters

    expect(remainingLiters).toBe(1)
    expect(formatProductStock(remainingLiters, 'litro', true)).toBe('1 Litro')
  })

  it('formatProductStock formatea sin fracciones decimales confusas', () => {
    expect(formatProductStock(1, 'cubeta', true, false)).toBe('19 Litros (1 cubeta)')
    expect(formatProductStock(1, 'cubeta', true, true)).toBe('19 L (1 cub.)')
    expect(formatProductStock(17, 'litro', true, false)).toBe('17 Litros')
    expect(formatProductStock(3, 'litro', true, false)).toBe('3 Litros')
    expect(formatProductStock(1, 'litro', true, false)).toBe('1 Litro')
  })

  it('toExactLiters absorbe residuos de redondeo en cubetas (0.05 -> 1L exacto, 0.89 -> 17L exacto)', () => {
    // 0.05 cubetas era 0.95 L -> debe ser 1 Litro exacto
    expect(toExactLiters(0.05, 'cubeta')).toBe(1)
    // 0.89 cubetas era 16.91 L -> debe ser 17 Litros exactos
    expect(toExactLiters(0.89, 'cubeta')).toBe(17)
    // En formatProductStock debe mostrar "1 Litro" o "1 L" y no "0.95 L"
    expect(formatProductStock(0.05, 'cubeta', true, false)).toBe('1 Litro')
    expect(formatProductStock(0.05, 'cubeta', true, true)).toBe('1 L')
  })
})
