import { describe, it, expect } from 'vitest'
import { calculateChangeBreakdown, matchesSearch, normalizeSearch } from './utils'

describe('calculateChangeBreakdown', () => {
  it('returns empty array when change is 0 or negative', () => {
    expect(calculateChangeBreakdown(0)).toEqual([])
    expect(calculateChangeBreakdown(-10)).toEqual([])
  })

  it('correctly breaks down $272 (1x$200, 1x$50, 1x$20, 1x$2)', () => {
    const res = calculateChangeBreakdown(272)
    expect(res).toEqual([
      { value: 200, label: '$200', count: 1, isCoin: false },
      { value: 50, label: '$50', count: 1, isCoin: false },
      { value: 20, label: '$20', count: 1, isCoin: false },
      { value: 2, label: '$2', count: 1, isCoin: true },
    ])
  })

  it('handles centavos correctly (e.g. $18.50 -> 1x$10, 1x$5, 1x$2, 1x$1, 1x50¢)', () => {
    const res = calculateChangeBreakdown(18.5)
    expect(res).toEqual([
      { value: 10, label: '$10', count: 1, isCoin: true },
      { value: 5, label: '$5', count: 1, isCoin: true },
      { value: 2, label: '$2', count: 1, isCoin: true },
      { value: 1, label: '$1', count: 1, isCoin: true },
      { value: 0.5, label: '50¢', count: 1, isCoin: true },
    ])
  })

  it('handles large bills ($1500 -> 3x$500)', () => {
    const res = calculateChangeBreakdown(1500)
    expect(res).toEqual([
      { value: 500, label: '$500', count: 3, isCoin: false },
    ])
  })
})

describe('normalizeSearch and matchesSearch', () => {
  it('normalizes diacritics and case', () => {
    expect(normalizeSearch('Pintura Vinílica')).toBe('pintura vinilica')
  })

  it('matches searches ignoring accents and order', () => {
    expect(matchesSearch('vinilica azul', 'Pintura Azul Vinílica Comex')).toBe(true)
    expect(matchesSearch('thinner', 'THINNER ESTÁNDAR 1L')).toBe(true)
  })
})
