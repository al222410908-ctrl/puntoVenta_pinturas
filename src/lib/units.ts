import type { SalePresentation, Unit } from '../types'

export const UNIT_LABELS: Record<Unit, string> = {
  pieza: 'pieza',
  litro: 'litro',
  medio: 'medio',
  cuarto: 'cuarto',
  galon: 'galón',
  cubeta: 'cubeta',
  kg: 'kg',
  metro: 'metro',
  bolsa: 'bolsa',
  caja: 'caja',
}

const UNIT_LABELS_PLURAL: Record<Unit, string> = {
  pieza: 'piezas',
  litro: 'litros',
  medio: 'medios',
  cuarto: 'cuartos',
  galon: 'galones',
  cubeta: 'cubetas',
  kg: 'kgs',
  metro: 'metros',
  bolsa: 'bolsas',
  caja: 'cajas',
}

export const UNITS: { value: Unit; label: string }[] = [
  { value: 'pieza', label: 'Pieza' },
  { value: 'litro', label: 'Litro' },
  { value: 'medio', label: 'Medio (½ litro)' },
  { value: 'cuarto', label: 'Cuarto (¼ litro)' },
  { value: 'galon', label: 'Galón' },
  { value: 'cubeta', label: 'Cubeta' },
  { value: 'kg', label: 'Kilogramo' },
  { value: 'metro', label: 'Metro' },
  { value: 'bolsa', label: 'Bolsa' },
  { value: 'caja', label: 'Caja' },
]

/** Unidades que se miden en litros y sus equivalencias. */
export const LIQUID_FACTORS: Partial<Record<Unit, number>> = {
  medio: 0.5,
  cuarto: 0.25,
  litro: 1,
  galon: 4, // 4 litros exactos (estándar comercial en pinturas)
  cubeta: 19,
}

/** Presentaciones disponibles para productos líquidos, en orden de venta común. */
export const SALE_PRESENTATIONS: Unit[] = ['galon', 'litro', 'medio', 'cuarto', 'cubeta']

export const LIQUID_UNITS: Unit[] = Object.keys(LIQUID_FACTORS) as Unit[]

export const FRACTIONAL_UNITS: Unit[] = ['medio', 'cuarto', 'litro', 'galon', 'cubeta', 'kg', 'metro']

export function isLiquid(unit: Unit): boolean {
  return unit in LIQUID_FACTORS
}

/** Equivalencia de una unidad en litros (1 para las que no son líquidas). */
export function unitFactor(unit: Unit): number {
  return LIQUID_FACTORS[unit] ?? 1
}

/**
 * Absorbe residuos de redondeo en litros y alinea hacia la rejilla comercial física más cercana:
 * - Enteros (ej. 0.97 -> 1, 2.98 -> 3, 16.98 -> 17, 18.87 -> 19)
 * - Medios litros (ej. 0.49 -> 0.5, 1.48 -> 1.5, 2.51 -> 2.5)
 * - Cuartos de litro (ej. 0.24 -> 0.25, 0.76 -> 0.75)
 */
export function snapToCommercialGrid(liters: number): number {
  if (liters <= 0) return 0
  const nearestInt = Math.round(liters)
  if (Math.abs(liters - nearestInt) < 0.14) {
    return nearestInt
  }
  const nearestHalf = Math.round(liters * 2) / 2
  if (Math.abs(liters - nearestHalf) < 0.08) {
    return nearestHalf
  }
  const nearestQuarter = Math.round(liters * 4) / 4
  if (Math.abs(liters - nearestQuarter) < 0.05) {
    return nearestQuarter
  }
  return Math.round(liters * 1000) / 1000
}

/**
 * Convierte de una unidad líquida a litros exactos sin errores de truncado ni residuos flotantes.
 * Absorbe residuos de redondeo en cubetas y galones (ej. 0.89 cub * 19 = 16.91 -> 17 L exacto; 0.05 * 19 = 0.95 -> 1 L exacto).
 */
export function toExactLiters(qty: number, unit: Unit): number {
  if (!isLiquid(unit)) return qty
  const factor = LIQUID_FACTORS[unit] ?? 1
  const rawLiters = qty * factor
  return snapToCommercialGrid(rawLiters)
}

/**
 * Calcula la disponibilidad real en la unidad de venta seleccionada sin divisiones con residuos truncados.
 * Ej: 1 L en cuartos = 4 cuartos exactos (nunca 3.846).
 * 19 L en medios = 38 medios exactos.
 * 19 L en cuartos = 76 cuartos exactos.
 */
export function exactAvailableInUnit(
  stock: number,
  baseUnit: Unit,
  saleUnit: Unit,
): number {
  if (stock <= 0) return 0
  if (baseUnit === saleUnit) return stock

  if (isLiquid(baseUnit) && isLiquid(saleUnit)) {
    const liters = toExactLiters(stock, baseUnit)
    const factor = LIQUID_FACTORS[saleUnit] ?? 1
    const raw = liters / factor
    const rounded = Math.round(raw)
    if (Math.abs(raw - rounded) < 0.06) return rounded
    return Math.round(raw * 100) / 100
  }

  const factor = unitFactor(saleUnit) / unitFactor(baseUnit)
  if (factor <= 0) return 0
  const raw = stock / factor
  const rounded = Math.round(raw)
  if (Math.abs(raw - rounded) < 0.02) return rounded
  return Math.round(raw * 100) / 100
}

export const PRESENTATION_LABELS: Partial<Record<Unit, string>> = {
  cuarto: 'Cuarto (¼ L · 250 ml)',
  medio: 'Medio (½ L · 500 ml)',
  litro: 'Litro (1.0 L · 1000 ml)',
  galon: 'Galón (4.0 L)',
  cubeta: 'Cubeta (19.0 L)',
  kg: 'Kilogramo (1 kg)',
  metro: 'Metro (1 m)',
  pieza: 'Pieza',
}

export function presentationDisplayName(unit: Unit): string {
  return PRESENTATION_LABELS[unit] ?? UNIT_LABELS[unit]
}

/**
 * Convierte de litros exactos a la presentación o unidad destino con alta precisión.
 */
export function fromExactLiters(liters: number, targetUnit: Unit): number {
  if (!isLiquid(targetUnit)) return liters
  const factor = LIQUID_FACTORS[targetUnit] ?? 1
  if (factor <= 0) return 0
  return Math.round((liters / factor) * 100000) / 100000
}

/**
 * Convierte una cantidad entre dos unidades líquidas directamente a través de litros exactos.
 */
export function convertLiquid(qty: number, fromUnit: Unit, toUnit: Unit): number {
  if (fromUnit === toUnit) return qty
  if (!isLiquid(fromUnit) || !isLiquid(toUnit)) return qty
  const liters = toExactLiters(qty, fromUnit)
  return fromExactLiters(liters, toUnit)
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}

function factorFor(unit: Unit, baseUnit: Unit): number {
  if (isLiquid(baseUnit) && isLiquid(unit)) {
    const fromL = LIQUID_FACTORS[unit] ?? 1
    const toL = LIQUID_FACTORS[baseUnit] ?? 1
    return fromL / toL
  }
  return unit === baseUnit ? 1 : 0
}

/** Presentaciones por defecto para un producto, relativas a su unidad base. */
export function defaultPresentations(unit: Unit, fractional = false): SalePresentation[] {
  if (isLiquid(unit) && fractional) {
    return SALE_PRESENTATIONS.map((u) => ({ unit: u, factor: factorFor(u, unit) }))
  }
  return [{ unit, factor: 1 }]
}

/**
 * Presentaciones efectivas de un producto, migrando el formato antiguo `saleUnits`.
 * Siempre devuelve al menos la unidad base.
 * Si el producto no es fraccionado, la unidad base se trata como unidad independiente
 * (ej. unidad "cuarto" → el stock se cuenta en cuartos, no en litros).
 */
export function productPresentations(p: {
  unit: Unit
  fractional?: boolean
  saleUnits?: Unit[]
  salePresentations?: SalePresentation[]
}): SalePresentation[] {
  if (!p.fractional) return [{ unit: p.unit, factor: 1 }]
  if (p.salePresentations && p.salePresentations.length) return p.salePresentations
  if (p.saleUnits && p.saleUnits.length) {
    return p.saleUnits.map((u) => ({ unit: u, factor: factorFor(u, p.unit) || 1 }))
  }
  return defaultPresentations(p.unit)
}

/** Equivalencia en unidades base de 1 presentación dentro del producto (1 si no está definida). */
export function presentationFactor(
  p: { unit: Unit; salePresentations?: SalePresentation[] },
  saleUnit: Unit,
): number {
  if (isLiquid(p.unit) && isLiquid(saleUnit)) {
    const fromL = LIQUID_FACTORS[saleUnit] ?? 1
    const toL = LIQUID_FACTORS[p.unit] ?? 1
    return fromL / toL
  }
  const found = p.salePresentations?.find((s) => s.unit === saleUnit)
  if (found && found.factor > 0) return found.factor
  return factorFor(saleUnit, p.unit) || 1
}

/** Convierte una cantidad vendida en una presentación a unidades base del producto. */
export function toBaseQty(qty: number, factor: number, saleUnit?: Unit, baseUnit?: Unit): number {
  if (saleUnit && baseUnit && isLiquid(saleUnit) && isLiquid(baseUnit)) {
    return convertLiquid(qty, saleUnit, baseUnit)
  }
  return round3(qty * factor)
}

/** Convierte unidades base del producto a una presentación. */
export function fromBaseQty(baseQty: number, factor: number, baseUnit?: Unit, saleUnit?: Unit): number {
  if (saleUnit && baseUnit && isLiquid(saleUnit) && isLiquid(baseUnit)) {
    return convertLiquid(baseQty, baseUnit, saleUnit)
  }
  return factor === 0 ? 0 : round3(baseQty / factor)
}

export function formatQty(qty: number, unit: Unit): string {
  const isFractional = FRACTIONAL_UNITS.includes(unit)
  const decimals = isFractional ? 3 : 0
  const value = Number(qty.toFixed(decimals)).toString()
  const label = qty === 1 ? UNIT_LABELS[unit] : UNIT_LABELS_PLURAL[unit]
  return `${value} ${label}`
}

/**
 * Formateo comprensible de stock para productos líquidos y fraccionados.
 * Si una cubeta de 19L tiene 0.894 (17 L restantes), muestra "17 Litros (0.89 cub.)" o en compacto "17 L".
 * Si un galón de 4L tiene 0.5 (2 L restantes), muestra "½ galón (2 L)" o en compacto "½ gal. (2 L)".
 */
export function formatProductStock(
  stock: number,
  unit: Unit,
  fractional = false,
  compact = false,
): string {
  if (!fractional || !isLiquid(unit)) {
    return formatQty(stock, unit)
  }

  const totalLiters = toExactLiters(stock, unit)
  const isWhole = Math.abs(stock - Math.round(stock)) < 1e-4

  if (isWhole) {
    if (unit === 'litro') return `${stock} ${stock === 1 ? 'litro' : 'litros'}`
    const label = stock === 1 ? UNIT_LABELS[unit] : UNIT_LABELS_PLURAL[unit]
    return compact ? `${stock} ${label}` : `${stock} ${label} (${totalLiters} L)`
  }

  // Fracciones comunes de cubeta (19 L)
  if (unit === 'cubeta') {
    const whole = Math.floor(stock + 1e-4)
    const remLiters = toExactLiters(stock - whole, 'cubeta')
    if (whole === 0) {
      if (remLiters <= 0) return '0 Litros'
      const cubApprox = Number(stock.toFixed(2))
      return compact ? `${remLiters} L` : `${remLiters} ${remLiters === 1 ? 'Litro' : 'Litros'} (${cubApprox} cub.)`
    }
    return compact ? `${whole} cub. + ${remLiters} L` : `${whole} cubeta(s) + ${remLiters} L (${totalLiters} L)`
  }

  // Fracciones comunes de galón (4 L)
  if (unit === 'galon') {
    const whole = Math.floor(stock + 1e-4)
    const rem = round3(stock - whole)
    const remLiters = toExactLiters(rem, 'galon')

    let fracLabel = ''
    if (Math.abs(rem - 0.5) < 0.05) fracLabel = '½'
    else if (Math.abs(rem - 0.25) < 0.05) fracLabel = '¼'
    else if (Math.abs(rem - 0.75) < 0.05) fracLabel = '¾'

    if (whole === 0) {
      if (fracLabel) return compact ? `${fracLabel} gal. (${remLiters} L)` : `${fracLabel} galón (${remLiters} L)`
      return compact ? `${remLiters} L` : `${remLiters} ${remLiters === 1 ? 'Litro' : 'Litros'} (${Number(stock.toFixed(2))} gal.)`
    }
    if (fracLabel) return compact ? `${whole} ${fracLabel} gal.` : `${whole} ${fracLabel} galones (${totalLiters} L)`
    return compact ? `${whole} gal. + ${remLiters} L` : `${whole} galón(es) + ${remLiters} L (${totalLiters} L)`
  }

  // Litros con fracciones comunes
  if (unit === 'litro') {
    const whole = Math.floor(stock + 1e-4)
    const rem = round3(stock - whole)
    let frac = ''
    if (Math.abs(rem - 0.5) < 0.05) frac = '½'
    else if (Math.abs(rem - 0.25) < 0.05) frac = '¼'
    else if (Math.abs(rem - 0.75) < 0.05) frac = '¾'

    if (frac) {
      if (whole === 0) return `${frac} Litro`
      return `${whole} ${frac} Litros`
    }
    const cleanLiters = Number(stock.toFixed(2))
    return `${cleanLiters} ${cleanLiters === 1 ? 'Litro' : 'Litros'}`
  }

  return formatQty(stock, unit)
}

export function unitPlural(unit: Unit): string {
  return UNIT_LABELS_PLURAL[unit]
}
