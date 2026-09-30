import { useEffect, useRef, useState } from 'react'
import { Delete, Lock } from 'lucide-react'
import { getSyncToken, API_BASE } from '../lib/sync'

const PIN_STORAGE = 'pos_pin'
const SESSION_STORAGE = 'pos_session'

async function fetchSharedPin(): Promise<string | null> {
  try {
    const token = getSyncToken()
    const resp = await fetch(`${API_BASE}/access`, {
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
    await fetch(`${API_BASE}/access`, {
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
    <div className="flex justify-center gap-3.5">
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className={`h-4 w-4 rounded-full border-2 transition-all duration-200 ${
            i < length
              ? (done ? 'border-emerald-500 bg-emerald-500 scale-110' : 'border-primary bg-primary scale-110 shadow-xs shadow-primary/30')
              : 'border-slate-300 bg-transparent dark:border-slate-700'
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
    <div className="mx-auto grid w-full max-w-[260px] grid-cols-3 gap-3.5">
      {layout.map((k) =>
        k === 'back' ? (
          <span key={k} />
        ) : k === 'del' ? (
          <button
            key={k}
            disabled={disabled}
            onClick={onBack}
            className="flex aspect-square items-center justify-center rounded-2xl text-slate-400 hover:text-slate-700 transition active:scale-90 disabled:opacity-30 dark:text-slate-400 dark:hover:text-slate-200"
          >
            <Delete className="h-6 w-6" />
          </button>
        ) : (
          <button
            key={k}
            disabled={disabled}
            onClick={() => onDigit(k)}
            className="flex aspect-square items-center justify-center rounded-2xl border border-slate-200/90 bg-white font-display text-2xl font-bold text-slate-800 shadow-2xs transition-all hover:bg-slate-50 hover:border-slate-300 active:scale-92 disabled:opacity-40 dark:border-slate-700/80 dark:bg-slate-800/90 dark:text-slate-100"
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
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-surface dark:bg-slate-950">
      {splash ? (
        <div className="flex flex-col items-center gap-4 animate-fade-in">
          <div className="relative">
            <img src="/logopintura.jpeg" alt="Pinturas POS" className="h-24 w-24 rounded-3xl object-cover shadow-2xl ring-4 ring-primary/20 animate-bounce-slow" />
            <span className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full border-2 border-white bg-emerald-500 dark:border-slate-950" />
          </div>
          <div className="text-center">
            <p className="font-display text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">Pinturas POS</p>
            <p className="text-xs font-bold tracking-widest text-accent uppercase mt-1">Atelier & Punto de Venta</p>
          </div>
        </div>
      ) : (
        <div className="flex w-full max-w-sm flex-col gap-6 px-6 animate-scale-in">
          <div className="flex flex-col items-center gap-3">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-600 to-primary text-white shadow-lg shadow-primary/25 ring-4 ring-primary/10">
              <Lock className="h-7 w-7" />
            </span>
            <p className="font-display text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              {firstRun ? (confirming ? 'Confirma tu PIN' : 'Crea tu PIN de acceso') : 'Ingresa tu PIN'}
            </p>
            {error ? (
              <p className={`text-xs font-semibold ${error === 'Confirma tu PIN' ? 'text-accent' : 'text-danger'}`}>{error}</p>
            ) : (
              firstRun && !confirming && <p className="text-xs text-slate-400 dark:text-slate-500">Solo tú tendrás acceso a esta terminal</p>
            )}
          </div>
          <PinDots length={pin.length} done={false} />
          <Keypad disabled={!initDone} onDigit={onDigit} onBack={onBack} />
        </div>
      )}
    </div>
  )
}