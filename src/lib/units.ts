import type { Unit } from '../types'

export const UNIT_LABELS: Record<Unit, string> = {
  pieza: 'pieza',
  litro: 'litro',
  galon: 'galón',
  kg: 'kg',
  metro: 'metro',
  bolsa: 'bolsa',
  caja: 'caja',
}

export const UNITS: { value: Unit; label: string }[] = [
  { value: 'pieza', label: 'Pieza' },
  { value: 'litro', label: 'Litro' },
  { value: 'galon', label: 'Galón' },
  { value: 'kg', label: 'Kilogramo' },
  { value: 'metro', label: 'Metro' },
  { value: 'bolsa', label: 'Bolsa' },
  { value: 'caja', label: 'Caja' },
]

export const FRACTIONAL_UNITS: Unit[] = ['litro', 'galon', 'kg', 'metro']

export function formatQty(qty: number, unit: Unit): string {
  const isFractional = FRACTIONAL_UNITS.includes(unit)
  const decimals = isFractional ? 3 : 0
  const value = Number(qty.toFixed(decimals)).toString()
  return `${value} ${UNIT_LABELS[unit]}${qty === 1 ? '' : 's'}`
}
