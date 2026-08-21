import { useEffect, useRef } from 'react'

export type ScannerSuffix = 'Enter' | 'Tab'

export interface ScannerSettings {
  enabled: boolean
  suffix: ScannerSuffix
}

const SCANNER_KEY = 'pos_scanner'

export const DEFAULT_SCANNER: ScannerSettings = { enabled: false, suffix: 'Enter' }

export function loadScannerSettings(): ScannerSettings {
  try {
    const raw = localStorage.getItem(SCANNER_KEY)
    if (!raw) return DEFAULT_SCANNER
    const p = JSON.parse(raw) as Partial<ScannerSettings>
    return { enabled: !!p.enabled, suffix: p.suffix === 'Tab' ? 'Tab' : 'Enter' }
  } catch {
    return DEFAULT_SCANNER
  }
}

export function saveScannerSettings(s: ScannerSettings): void {
  localStorage.setItem(SCANNER_KEY, JSON.stringify(s))
}

// Los lectores HID escriben muy rápido (<= ~70 ms entre pulsaciones);
// un humano tarda más, así distinguimos un escaneo de tipeo normal.
const THRESHOLD = 70
const MIN_LEN = 4

/**
 * Captura códigos de barras desde un lector USB (HID) que "escribe" el
 * código y un terminador (Enter/Tab). No requiere drivers ni API nativa.
 */
export function useBarcodeScanner(
  onScan: (code: string) => void,
  enabled: boolean,
  suffix: ScannerSuffix = 'Enter',
) {
  const buffer = useRef('')
  const last = useRef(0)
  const onScanRef = useRef(onScan)
  onScanRef.current = onScan

  useEffect(() => {
    if (!enabled) {
      buffer.current = ''
      return
    }

    const clearFocusedInput = () => {
      const el = document.activeElement as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
        const input = el as HTMLInputElement
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value',
        )?.set
        setter?.call(input, '')
        input.dispatchEvent(new Event('input', { bubbles: true }))
      }
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const now = performance.now()
      const dt = now - last.current
      last.current = now
      if (dt > THRESHOLD) buffer.current = ''

      if ((e.key === 'Enter' || e.key === 'Tab') && e.key === suffix) {
        e.preventDefault()
        if (buffer.current.length >= MIN_LEN) {
          const code = buffer.current.trim()
          buffer.current = ''
          clearFocusedInput()
          onScanRef.current(code)
        } else {
          buffer.current = ''
        }
        return
      }

      if (e.key.length === 1) {
        if (dt < THRESHOLD) e.preventDefault()
        buffer.current += e.key
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled, suffix])
}
