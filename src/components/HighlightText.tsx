import React from 'react'
import { normalizeSearch } from '../lib/utils'

export function HighlightText({
  text,
  query,
  className = '',
}: {
  text: string
  query: string
  className?: string
}) {
  if (!query || !query.trim() || !text) {
    return <span className={className}>{text}</span>
  }

  const cleanQuery = normalizeSearch(query)
  const tokens = cleanQuery.split(/\s+/).filter(Boolean)
  if (tokens.length === 0) {
    return <span className={className}>{text}</span>
  }

  const normText = normalizeSearch(text)
  const matchRanges: Array<[number, number]> = []

  for (const token of tokens) {
    let startIdx = 0
    while (startIdx < normText.length) {
      const idx = normText.indexOf(token, startIdx)
      if (idx === -1) break
      matchRanges.push([idx, idx + token.length])
      startIdx = idx + Math.max(1, token.length)
    }
  }

  if (matchRanges.length === 0) {
    return <span className={className}>{text}</span>
  }

  // Merge overlapping or contiguous ranges
  matchRanges.sort((a, b) => a[0] - b[0])
  const merged: Array<[number, number]> = []
  for (const range of matchRanges) {
    if (merged.length === 0) {
      merged.push([...range])
    } else {
      const prev = merged[merged.length - 1]
      if (range[0] <= prev[1]) {
        prev[1] = Math.max(prev[1], range[1])
      } else {
        merged.push([...range])
      }
    }
  }

  const elements: React.ReactNode[] = []
  let lastIdx = 0

  merged.forEach(([start, end], i) => {
    const s = Math.min(text.length, Math.max(0, start))
    const e = Math.min(text.length, Math.max(0, end))

    if (s > lastIdx) {
      elements.push(text.slice(lastIdx, s))
    }
    if (e > s) {
      elements.push(
        <mark
          key={i}
          className="bg-amber-200 text-amber-950 font-black rounded-xs px-0.5 dark:bg-amber-500/40 dark:text-amber-100"
        >
          {text.slice(s, e)}
        </mark>,
      )
    }
    lastIdx = e
  })

  if (lastIdx < text.length) {
    elements.push(text.slice(lastIdx))
  }

  return <span className={className}>{elements}</span>
}
