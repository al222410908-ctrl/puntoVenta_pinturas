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
  exactAvailableInUnit,
  snapToCommercialGrid,
} from './units'
import { matchesSearch } from './utils'

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

  it('snapToCommercialGrid eliminates floating point and conversion residues', () => {
    // Absorbe residuos a enteros comerciales
    expect(snapToCommercialGrid(0.97)).toBe(1)
    expect(snapToCommercialGrid(2.98)).toBe(3)
    expect(snapToCommercialGrid(16.98)).toBe(17)
    expect(snapToCommercialGrid(18.87)).toBe(19)
    expect(toExactLiters(0.05, 'cubeta')).toBe(1) // 0.05 * 19 = 0.95 -> 1L
    expect(toExactLiters(0.89, 'cubeta')).toBe(17) // 0.89 * 19 = 16.91 -> 17L
    expect(toExactLiters(0.993, 'cubeta')).toBe(19) // residuo -> 19L

    // Medios y cuartos
    expect(toExactLiters(0.5, 'litro')).toBe(0.5)
    expect(toExactLiters(0.25, 'litro')).toBe(0.25)
    expect(toExactLiters(1.5, 'litro')).toBe(1.5)
  })

  it('exactAvailableInUnit eliminates fractional division errors (e.g. 3.846 cuartos)', () => {
    // 0.05 cubetas de stock (1 Litro físico) en cuartos debe ser exactamente 4 cuartos, NUNCA 3.846
    expect(exactAvailableInUnit(0.05, 'cubeta', 'cuarto')).toBe(4)
    expect(exactAvailableInUnit(0.05, 'cubeta', 'medio')).toBe(2)
    expect(exactAvailableInUnit(0.05, 'cubeta', 'litro')).toBe(1)

    // 1 cubeta completa (19 L):
    // 19 L / 0.25 = 76 cuartos exactos
    expect(exactAvailableInUnit(1, 'cubeta', 'cuarto')).toBe(76)
    // 19 L / 0.5 = 38 medios exactos
    expect(exactAvailableInUnit(1, 'cubeta', 'medio')).toBe(38)
    // 19 L en galones = 4.75 galones (4 galones y 3 litros)
    expect(exactAvailableInUnit(1, 'cubeta', 'galon')).toBe(4.75)

    // 1 Galón (4 L):
    expect(exactAvailableInUnit(1, 'galon', 'litro')).toBe(4)
    expect(exactAvailableInUnit(1, 'galon', 'medio')).toBe(8)
    expect(exactAvailableInUnit(1, 'galon', 'cuarto')).toBe(16)
  })

  it('simulates the user bucket breakdown sequence cleanly without residues', () => {
    // Caso de uso del usuario:
    // 1 cubeta de 19 L:
    let liters = 19

    // 1. Se venden 4 galones (16 L)
    const sale1Liters = toExactLiters(4, 'galon')
    expect(sale1Liters).toBe(16)
    liters = liters - sale1Liters
    expect(liters).toBe(3) // Quedan 3 L exactos
    expect(exactAvailableInUnit(liters, 'litro', 'litro')).toBe(3)
    expect(exactAvailableInUnit(liters, 'litro', 'cuarto')).toBe(12) // 12 cuartos

    // 2. Se venden 1.5 L
    const sale2Liters = toExactLiters(1.5, 'litro')
    expect(sale2Liters).toBe(1.5)
    liters = liters - sale2Liters
    expect(liters).toBe(1.5) // Queda 1.5 L (un litro y medio)
    expect(exactAvailableInUnit(liters, 'litro', 'medio')).toBe(3) // 3 medios
    expect(exactAvailableInUnit(liters, 'litro', 'cuarto')).toBe(6) // 6 cuartos

    // 3. Se vende 1 L
    const sale3Liters = toExactLiters(1, 'litro')
    liters = liters - sale3Liters
    expect(liters).toBe(0.5) // Queda 0.5 L (medio litro o 2 cuartitos)
    expect(exactAvailableInUnit(liters, 'litro', 'medio')).toBe(1) // 1 medio
    expect(exactAvailableInUnit(liters, 'litro', 'cuarto')).toBe(2) // 2 cuartos

    // 4. Se venden 2 cuartitos (0.5 L)
    const sale4Liters = toExactLiters(2, 'cuarto')
    expect(sale4Liters).toBe(0.5)
    liters = liters - sale4Liters
    expect(liters).toBe(0) // Agotado limpio
    expect(exactAvailableInUnit(liters, 'litro', 'cuarto')).toBe(0)
  })
})

describe('Flexible & Case-Insensitive Search (matchesSearch)', () => {
  const product = {
    name: 'Pintura Vinílica Blanca Comex 19L',
    barcode: '750123456789',
    purchaseCode: 'PV-BL-19',
  }

  it('matches case-insensitively (mayúsculas y minúsculas)', () => {
    expect(matchesSearch('pintura', product.name)).toBe(true)
    expect(matchesSearch('PINTURA', product.name)).toBe(true)
    expect(matchesSearch('PiNtUrA', product.name)).toBe(true)
    expect(matchesSearch('BLANCA', product.name)).toBe(true)
    expect(matchesSearch('comex', product.name)).toBe(true)
  })

  it('matches accent-insensitively (con o sin acentos)', () => {
    // Busca sin acento cuando el producto tiene acento
    expect(matchesSearch('vinilica', product.name)).toBe(true)
    expect(matchesSearch('VINILICA', product.name)).toBe(true)
    expect(matchesSearch('vinílica', product.name)).toBe(true)
    expect(matchesSearch('VINÍLICA', product.name)).toBe(true)
  })

  it('matches multiple tokens in any order', () => {
    expect(matchesSearch('blanca vinilica', product.name)).toBe(true)
    expect(matchesSearch('comex 19l blanca', product.name)).toBe(true)
    expect(matchesSearch('19l vinilica pintura', product.name)).toBe(true)
  })

  it('matches across multiple target fields (name, barcode, purchaseCode)', () => {
    const fields = [product.name, product.barcode, product.purchaseCode]
    expect(matchesSearch('750123', fields)).toBe(true)
    expect(matchesSearch('PV-BL', fields)).toBe(true)
    expect(matchesSearch('pvbl', fields)).toBe(true) // sin guiones
    expect(matchesSearch('pv-bl-19', fields)).toBe(true)
    expect(matchesSearch('inexistente12345', fields)).toBe(false)
  })
})
