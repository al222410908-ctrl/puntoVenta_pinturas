import { useEffect, useRef, useState } from 'react'
import { Delete, Lock } from 'lucide-react'
import { getSyncToken } from '../lib/sync'

const PIN_STORAGE = 'pos_pin'
const SESSION_STORAGE = 'pos_session'

async function fetchSharedPin(): Promise<string | null> {
  try {
    const token = getSyncToken()
    const resp = await fetch('/api/access', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!resp.ok) return null
    const data = (await resp.json()) as { pinHash?: string }
    return data.pinHash && /^[0-9a-f]{64}$/.test(data.pinHash) ? data.pinHash : null
  } catch {
    return null
  }
}

async function pushSharedPin(pinHash: string): Promise<void> {
  try {
    const token = getSyncToken()
    await fetch('/api/access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ pinHash }),
    })
  } catch { /* best effort */ }
}

async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(`pinturas-pos:${pin}:v2`)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function hashPinLegacy(pin: string) {
  let h = 5381
  for (let i = 0; i < pin.length; i++) h = (h * 33) ^ pin.charCodeAt(i)
  return (h >>> 0).toString(36)
}

const isNewFormat = (s: string | null) => !!s && /^[0-9a-f]{64}$/.test(s)

function pinsEqual(a: string, b: string) {
  return a.length === b.length && a.split('').every((c, i) => c === b[i])
}

function PinDots({ length, done }: { length: number; done?: boolean }) {
  return (
    <div className="flex justify-center gap-3">
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className={`h-4 w-4 rounded-full border-2 transition-all ${
            i < length ? (done ? 'border-emerald-500 bg-emerald-500' : 'border-primary bg-primary') : 'border-slate-400 dark:border-slate-600'
          } ${done ? 'animate-pulse' : ''}`}
        />
      ))}
    </div>
  )
}

function Keypad({ onDigit, onBack, disabled }: { onDigit: (d: string) => void; onBack: () => void; disabled?: boolean }) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']
  const layout = [...keys.slice(0, 9), 'back', '0', 'del']
  return (
    <div className="mx-auto grid w-full max-w-[240px] grid-cols-3 gap-3">
      {layout.map((k) =>
        k === 'back' ? (
          <span key={k} />
        ) : k === 'del' ? (
          <button
            key={k}
            disabled={disabled}
            onClick={onBack}
            className="flex aspect-square items-center justify-center rounded-full text-slate-500 transition active:scale-95 disabled:opacity-40 dark:text-slate-300"
          >
            <Delete className="h-6 w-6" />
          </button>
        ) : (
          <button
            key={k}
            disabled={disabled}
            onClick={() => onDigit(k)}
            className="flex aspect-square items-center justify-center rounded-full bg-white text-xl font-semibold text-slate-800 shadow ring-1 ring-slate-200 transition hover:bg-slate-50 active:scale-95 disabled:opacity-40 dark:bg-slate-700 dark:text-slate-100 dark:ring-slate-600"
          >
            {k}
          </button>
        ),
      )}
    </div>
  )
}

export default function AccessGate({ onUnlock }: { onUnlock: () => void }) {
  const [splash, setSplash] = useState(true)
  const [pin, setPin] = useState('')
  const [initDone, setInitDone] = useState(false)
  const [firstRun, setFirstRun] = useState(() => !localStorage.getItem(PIN_STORAGE))
  const [confirming, setConfirming] = useState(false)
  const pendingRef = useRef('')
  const [error, setError] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setSplash(false), 1600)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const shared = await fetchSharedPin()
      if (cancelled) return
      if (shared) {
        localStorage.setItem(PIN_STORAGE, shared)
        setFirstRun(false)
      } else {
        const local = localStorage.getItem(PIN_STORAGE)
        if (local && isNewFormat(local)) {
          void pushSharedPin(local)
          setFirstRun(false)
        }
      }
      setInitDone(true)
    })()
    return () => { cancelled = true }
  }, [])

  const unlock = () => {
    localStorage.setItem(SESSION_STORAGE, '1')
    onUnlock()
  }

  const submit = async (value: string) => {
    setError('')
    if (firstRun) {
      if (!confirming) {
        pendingRef.current = value
        setConfirming(true)
        setPin('')
        setError('Confirma tu PIN')
      } else {
        if (pinsEqual(pendingRef.current, value)) {
          const hash = await hashPin(pendingRef.current)
          localStorage.setItem(PIN_STORAGE, hash)
          void pushSharedPin(hash)
          unlock()
        } else {
          pendingRef.current = ''
          setPin('')
          setConfirming(false)
          setError('Los PIN no coinciden, intenta de nuevo')
        }
      }
      return
    }
    const stored = localStorage.getItem(PIN_STORAGE)
    if (stored && pinsEqual(await hashPin(value), stored)) {
      unlock()
    } else if (stored && !isNewFormat(stored) && pinsEqual(hashPinLegacy(value), stored)) {
      const hash = await hashPin(value)
      localStorage.setItem(PIN_STORAGE, hash)
      void pushSharedPin(hash)
      unlock()
    } else {
      setPin('')
      setError('PIN incorrecto')
    }
  }

  const onDigit = (d: string) => {
    if (pin.length >= 4) return
    const next = pin + d
    setPin(next)
    if (next.length === 4) setTimeout(() => void submit(next), 180)
  }

  const onBack = () => setPin((p) => p.slice(0, -1))

  useEffect(() => {
    if (splash || !initDone) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') onDigit(e.key)
      else if (e.key === 'Backspace') onBack()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [splash, initDone, pin])

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-[#f6f1e7] dark:bg-slate-900">
      {splash ? (
        <div className="flex flex-col items-center gap-4">
          <img src="/logopintura.jpeg" alt="Pinturas POS" className="h-20 w-20 animate-bounce-slow rounded-2xl object-cover shadow-lg" />
          <p className="font-display text-2xl font-semibold text-slate-900 dark:text-slate-100">Pinturas POS</p>
          <p className="text-sm text-accent/70 animate-pulse">Venta e inventario</p>
        </div>
      ) : (
        <div className="flex w-full max-w-sm flex-col gap-6 px-6">
          <div className="flex flex-col items-center gap-3">
            <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary text-white">
              <Lock className="h-7 w-7" />
            </span>
            <p className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
              {firstRun ? (confirming ? 'Confirma tu PIN' : 'Crea tu PIN de acceso') : 'Ingresa tu PIN'}
            </p>
            {error ? (
              <p className={`text-sm font-medium ${error === 'Confirma tu PIN' ? 'text-accent' : 'text-red-500'}`}>{error}</p>
            ) : (
              firstRun && !confirming && <p className="text-xs text-slate-500 dark:text-slate-400">Solo tú tendrás acceso a esta tienda</p>
            )}
          </div>
          <PinDots length={pin.length} done={false} />
          <Keypad disabled={!initDone} onDigit={onDigit} onBack={onBack} />
        </div>
      )}
    </div>
  )
}