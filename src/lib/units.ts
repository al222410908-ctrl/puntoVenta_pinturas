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
  galon: 3.785,
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
export function defaultPresentations(unit: Unit): SalePresentation[] {
  if (isLiquid(unit)) {
    return SALE_PRESENTATIONS.map((u) => ({ unit: u, factor: factorFor(u, unit) }))
  }
  return [{ unit, factor: 1 }]
}

/**
 * Presentaciones efectivas de un producto, migrando el formato antiguo `saleUnits`.
 * Siempre devuelve al menos la unidad base.
 */
export function productPresentations(p: {
  unit: Unit
  saleUnits?: Unit[]
  salePresentations?: SalePresentation[]
}): SalePresentation[] {
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

export function unitPlural(unit: Unit): string {
  return UNIT_LABELS_PLURAL[unit]
}
