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
