export function formatMoney(amount: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatDate(ts: number): string {
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(ts)
}

export function formatDay(ts: number): string {
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' }).format(ts)
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Normaliza un texto para búsqueda flexible:
 * - Convierte a minúsculas
 * - Remueve acentos y tildes (á->a, é->e, í->i, ó->o, ú->u)
 * - Remueve diacríticos
 */
export function normalizeSearch(str: string): string {
  if (!str) return ''
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

/**
 * Coincidencia flexible de búsqueda:
 * - Insensible a mayúsculas y minúsculas (ej: 'PINTURA' === 'pintura')
 * - Insensible a acentos / tildes (ej: 'vinilica' === 'Vinílica')
 * - Multi-palabra en cualquier orden (ej: 'blanca vinilica' encuentra 'Pintura Vinílica Blanca')
 * - Soporta códigos con guiones o espacios (ej: 'PV01' coincide con 'PV-01')
 */
export function matchesSearch(
  query: string,
  target: string | (string | null | undefined)[],
): boolean {
  const cleanQ = normalizeSearch(query)
  if (!cleanQ) return true
  const tokens = cleanQ.split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return true

  const fields = Array.isArray(target) ? (target.filter(Boolean) as string[]) : [target]
  const targetNorm = normalizeSearch(fields.join(' '))
  const targetClean = targetNorm.replace(/[\s\-_/.]/g, '')

  return tokens.every((token) => {
    if (targetNorm.includes(token)) return true
    const tokenClean = token.replace(/[\s\-_/.]/g, '')
    if (tokenClean && targetClean.includes(tokenClean)) return true
    return false
  })
}

export interface DenominationBreakdown {
  value: number
  label: string
  count: number
  isCoin: boolean
}

/**
 * Calcula el desglose óptimo de billetes y monedas mexicanas (MXN) para entregar cambio.
 */
export function calculateChangeBreakdown(change: number): DenominationBreakdown[] {
  if (change <= 0) return []
  let remainingCents = Math.round(change * 100)

  const denominations: { cents: number; value: number; label: string; isCoin: boolean }[] = [
    { cents: 50000, value: 500, label: '$500', isCoin: false },
    { cents: 20000, value: 200, label: '$200', isCoin: false },
    { cents: 10000, value: 100, label: '$100', isCoin: false },
    { cents: 5000, value: 50, label: '$50', isCoin: false },
    { cents: 2000, value: 20, label: '$20', isCoin: false },
    { cents: 1000, value: 10, label: '$10', isCoin: true },
    { cents: 500, value: 5, label: '$5', isCoin: true },
    { cents: 200, value: 2, label: '$2', isCoin: true },
    { cents: 100, value: 1, label: '$1', isCoin: true },
    { cents: 50, value: 0.5, label: '50¢', isCoin: true },
  ]

  const result: DenominationBreakdown[] = []

  for (const d of denominations) {
    if (remainingCents >= d.cents) {
      const count = Math.floor(remainingCents / d.cents)
      remainingCents %= d.cents
      result.push({
        value: d.value,
        label: d.label,
        count,
        isCoin: d.isCoin,
      })
    }
  }

  return result
}
