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

function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}

function factorFor(unit: Unit, baseUnit: Unit): number {
  return isLiquid(baseUnit) ? round3(unitFactor(unit) / unitFactor(baseUnit)) : unit === baseUnit ? 1 : 0
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
  const found = p.salePresentations?.find((s) => s.unit === saleUnit)
  if (found && found.factor > 0) return found.factor
  return factorFor(saleUnit, p.unit) || 1
}

/** Convierte una cantidad vendida en una presentación a unidades base del producto. */
export function toBaseQty(qty: number, factor: number): number {
  return round3(qty * factor)
}

/** Convierte unidades base del producto a una presentación. */
export function fromBaseQty(baseQty: number, factor: number): number {
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
 * Si una cubeta de 19L tiene 0.894 (17 L restantes), muestra "17 L (0.89 cub.)" o "17 Litros".
 * Si un galón de 4L tiene 0.5 (2 L restantes), muestra "½ galón (2 L)".
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

  const factor = unitFactor(unit) // ej. 19 para cubeta, 4 para galon, 1 para litro
  const totalLiters = round3(stock * factor)
  const isWhole = Math.abs(stock - Math.round(stock)) < 1e-4

  if (isWhole) {
    if (unit === 'litro') return `${stock} ${stock === 1 ? 'litro' : 'litros'}`
    const label = stock === 1 ? UNIT_LABELS[unit] : UNIT_LABELS_PLURAL[unit]
    return compact ? `${stock} ${label}` : `${stock} ${label} (${totalLiters} L)`
  }

  // Fracciones comunes de cubeta (19 L)
  if (unit === 'cubeta') {
    const whole = Math.floor(stock)
    const remLiters = round3((stock - whole) * 19)
    if (whole === 0) {
      return compact ? `${remLiters} L` : `${remLiters} Litros (${Number(stock.toFixed(2))} cub.)`
    }
    return compact ? `${whole} cub. + ${remLiters} L` : `${whole} cubeta(s) + ${remLiters} L (${totalLiters} L)`
  }

  // Fracciones comunes de galón (4 L)
  if (unit === 'galon') {
    const whole = Math.floor(stock)
    const rem = round3(stock - whole)
    const remLiters = round3(rem * 4)

    let fracLabel = ''
    if (Math.abs(rem - 0.5) < 1e-4) fracLabel = '½'
    else if (Math.abs(rem - 0.25) < 1e-4) fracLabel = '¼'
    else if (Math.abs(rem - 0.75) < 1e-4) fracLabel = '¾'

    if (whole === 0) {
      if (fracLabel) return compact ? `${fracLabel} gal. (${remLiters} L)` : `${fracLabel} galón (${remLiters} L)`
      return compact ? `${remLiters} L` : `${remLiters} Litros (${Number(stock.toFixed(2))} gal.)`
    }
    if (fracLabel) return compact ? `${whole} ${fracLabel} gal.` : `${whole} ${fracLabel} galones (${totalLiters} L)`
    return compact ? `${whole} gal. + ${remLiters} L` : `${whole} galón(es) + ${remLiters} L (${totalLiters} L)`
  }

  // Litros con fracciones comunes
  if (unit === 'litro') {
    const whole = Math.floor(stock)
    const rem = round3(stock - whole)
    let frac = ''
    if (Math.abs(rem - 0.5) < 1e-4) frac = '½'
    else if (Math.abs(rem - 0.25) < 1e-4) frac = '¼'
    else if (Math.abs(rem - 0.75) < 1e-4) frac = '¾'

    if (frac) {
      if (whole === 0) return `${frac} Litro`
      return `${whole} ${frac} Litros`
    }
    return `${Number(stock.toFixed(2))} Litros`
  }

  return formatQty(stock, unit)
}

export function unitPlural(unit: Unit): string {
  return UNIT_LABELS_PLURAL[unit]
}
