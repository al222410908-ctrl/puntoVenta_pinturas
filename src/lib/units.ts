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
 * Convierte de una unidad líquida a litros exactos sin errores de truncado ni residuos flotantes.
 * Absorbe residuos de redondeo en cubetas y galones (ej. 0.05 cub * 19 = 0.95 L -> 1 L exacto).
 */
export function toExactLiters(qty: number, unit: Unit): number {
  if (!isLiquid(unit)) return qty
  const factor = LIQUID_FACTORS[unit] ?? 1
  const rawLiters = qty * factor

  // Para cubetas (19 L), corregir residuos de redondeo (0.05 * 19 = 0.95 -> 1 L, 0.89 * 19 = 16.91 -> 17 L)
  if (unit === 'cubeta') {
    const nearestHalf = Math.round(rawLiters * 2) / 2
    if (Math.abs(rawLiters - nearestHalf) < 0.12) {
      return nearestHalf
    }
  }

  // Para galones (4 L), absorber desviaciones menores
  if (unit === 'galon') {
    const nearestQuarter = Math.round(rawLiters * 4) / 4
    if (Math.abs(rawLiters - nearestQuarter) < 0.08) {
      return nearestQuarter
    }
  }

  return Math.round(rawLiters * 1000) / 1000
}

/**
 * Convierte de litros exactos a la presentación destino sin pérdida matemática.
 */
export function fromExactLiters(liters: number, targetUnit: Unit): number {
  if (!isLiquid(targetUnit)) return liters
  const factor = LIQUID_FACTORS[targetUnit] ?? 1
  if (factor <= 0) return 0
  return Math.round((liters / factor) * 100000) / 100000
}

/**
 * Convierte una cantidad entre dos unidades líquidas cualesquiera (ej. cubeta -> litro, galón -> litro).
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
 * Prioriza siempre la cantidad real en LITROS (ej. "19 Litros (1 cubeta)", "17 Litros", "3 Litros").
 * Elimina confusiones como "19 cubetas + 3 L" o "0.89 cubetas".
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

  // Presentación en Cubeta (19 L)
  if (unit === 'cubeta') {
    if (Math.abs(totalLiters - 19) < 1e-3) {
      return compact ? '19 L (1 cub.)' : '19 Litros (1 cubeta)'
    }
    if (totalLiters > 19 && Math.abs(totalLiters % 19) < 1e-3) {
      const cubetas = Math.round(totalLiters / 19)
      return compact ? `${totalLiters} L (${cubetas} cub.)` : `${totalLiters} Litros (${cubetas} cubetas)`
    }
    // Si quedan litros sueltos (ej. 17 L, 3 L, 1 L):
    const label = totalLiters === 1 ? 'Litro' : 'Litros'
    return compact ? `${totalLiters} L` : `${totalLiters} ${label}`
  }

  // Presentación en Galón (4 L)
  if (unit === 'galon') {
    if (Math.abs(totalLiters - 4) < 1e-3) {
      return compact ? '4 L (1 gal.)' : '4 Litros (1 galón)'
    }
    if (totalLiters > 4 && Math.abs(totalLiters % 4) < 1e-3) {
      const galones = Math.round(totalLiters / 4)
      return compact ? `${totalLiters} L (${galones} gal.)` : `${totalLiters} Litros (${galones} galones)`
    }
    if (Math.abs(totalLiters - 2) < 1e-3) {
      return compact ? '2 L (½ gal.)' : '2 Litros (½ galón)'
    }
    const label = totalLiters === 1 ? 'Litro' : 'Litros'
    return compact ? `${totalLiters} L` : `${totalLiters} ${label}`
  }

  // Presentación en Litros directamente
  if (unit === 'litro') {
    const whole = Math.floor(totalLiters)
    const rem = round3(totalLiters - whole)
    let frac = ''
    if (Math.abs(rem - 0.5) < 1e-3) frac = '½'
    else if (Math.abs(rem - 0.25) < 1e-3) frac = '¼'
    else if (Math.abs(rem - 0.75) < 1e-3) frac = '¾'

    if (frac) {
      if (whole === 0) return compact ? `${frac} L` : `${frac} Litro`
      return compact ? `${whole} ${frac} L` : `${whole} ${frac} Litros`
    }
    const label = totalLiters === 1 ? 'Litro' : 'Litros'
    return compact ? `${totalLiters} L` : `${totalLiters} ${label}`
  }

  // Cuartos y Medios
  const label = totalLiters === 1 ? 'Litro' : 'Litros'
  return compact ? `${totalLiters} L` : `${totalLiters} ${label}`
}

export function unitPlural(unit: Unit): string {
  return UNIT_LABELS_PLURAL[unit]
}
