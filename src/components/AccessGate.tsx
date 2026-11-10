import { useEffect, useRef, useState } from 'react'
import { Delete, Lock, Sparkles, ShieldAlert, KeyRound } from 'lucide-react'
import { getSyncToken, API_BASE } from '../lib/sync'
import { sound } from '../lib/sound'

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
  } catch {
    /* best effort */
  }
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

function PinDots({ length, done, hasError }: { length: number; done?: boolean; hasError?: boolean }) {
  return (
    <div className="flex justify-center items-center gap-4 py-2">
      {[0, 1, 2, 3].map((i) => {
        const active = i < length
        return (
          <div
            key={i}
            className={`h-4.5 w-4.5 rounded-full border-2 transition-all duration-200 flex items-center justify-center ${
              hasError
                ? 'border-rose-500 bg-rose-500/20 scale-105 animate-shake'
                : done
                ? 'border-emerald-500 bg-emerald-500 scale-110 shadow-sm shadow-emerald-500/40'
                : active
                ? 'border-primary bg-primary scale-110 shadow-sm shadow-primary/30 dark:border-emerald-500 dark:bg-emerald-500'
                : 'border-slate-300 bg-slate-100/60 dark:border-slate-700 dark:bg-slate-800/40'
            }`}
          >
            {active && (
              <span className={`h-1.5 w-1.5 rounded-full ${done ? 'bg-white' : 'bg-white'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

function Keypad({
  onDigit,
  onBack,
  disabled,
}: {
  onDigit: (d: string) => void
  onBack: () => void
  disabled?: boolean
}) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']
  const layout = [...keys.slice(0, 9), 'back', '0', 'del']

  return (
    <div className="mx-auto grid w-full max-w-[280px] grid-cols-3 gap-3">
      {layout.map((k, idx) =>
        k === 'back' ? (
          <div key={`empty-${idx}`} className="flex aspect-square items-center justify-center pointer-events-none" />
        ) : k === 'del' ? (
          <button
            key="del"
            type="button"
            disabled={disabled}
            onClick={onBack}
            className="flex aspect-square items-center justify-center rounded-2xl border border-slate-200/60 bg-white/60 text-slate-500 shadow-2xs backdrop-blur-sm transition-all hover:bg-rose-50 hover:border-rose-200 hover:text-rose-600 active:scale-90 disabled:opacity-30 dark:border-slate-800/80 dark:bg-slate-800/60 dark:text-slate-400 dark:hover:bg-rose-950/40 dark:hover:text-rose-300 cursor-pointer"
            title="Borrar dígito"
          >
            <Delete className="h-5 w-5" />
          </button>
        ) : (
          <button
            key={k}
            type="button"
            disabled={disabled}
            onClick={() => onDigit(k)}
            className="neo-tactile-btn flex aspect-square items-center justify-center rounded-2xl border border-slate-200/90 bg-white/95 font-display text-2xl font-black text-slate-800 shadow-2xs transition-all hover:bg-slate-50 hover:border-primary/40 hover:text-primary active:scale-90 disabled:opacity-40 dark:border-slate-800/90 dark:bg-slate-800/90 dark:text-slate-100 dark:hover:border-emerald-500/40 dark:hover:text-emerald-400 cursor-pointer"
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
  const [unlockedSuccess, setUnlockedSuccess] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setSplash(false), 1200)
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
    return () => {
      cancelled = true
    }
  }, [])

  const unlock = () => {
    setUnlockedSuccess(true)
    sound.beep(1200, 0.08)
    setTimeout(() => {
      localStorage.setItem(SESSION_STORAGE, '1')
      onUnlock()
    }, 350)
  }

  const submit = async (value: string) => {
    setError('')
    if (firstRun) {
      if (!confirming) {
        pendingRef.current = value
        setConfirming(true)
        setPin('')
        sound.beep(800, 0.04)
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
          sound.beep(400, 0.12)
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
      sound.beep(350, 0.12)
      setError('PIN incorrecto, verifica e intenta de nuevo')
    }
  }

  const onDigit = (d: string) => {
    if (pin.length >= 4) return
    sound.beep(900, 0.03)
    const next = pin + d
    setPin(next)
    if (next.length === 4) {
      setTimeout(() => void submit(next), 160)
    }
  }

  const onBack = () => {
    sound.beep(600, 0.03)
    setPin((p) => p.slice(0, -1))
  }

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

  // Vista de Splash inicial animado
  if (splash) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-slate-950 text-white animate-fadeIn">
        <div className="absolute inset-0 opacity-20 pointer-events-none"
             style={{
               backgroundImage: 'linear-gradient(rgba(255,255,255,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.12) 1px, transparent 1px)',
               backgroundSize: '40px 40px',
             }}
        />
        <div className="relative flex flex-col items-center gap-4 z-10 animate-scale-in">
          <div className="relative">
            <div className="absolute -inset-2 rounded-3xl bg-gradient-to-r from-emerald-500 to-amber-400 opacity-60 blur-xl animate-pulseGlow" />
            <img
              src="/logopintura.jpeg"
              alt="Pinturas POS"
              className="relative h-24 w-24 rounded-3xl object-cover shadow-2xl ring-2 ring-white/30"
            />
          </div>
          <div className="text-center">
            <p className="font-display text-3xl font-black tracking-tight text-white">
              Pinturas POS
            </p>
            <p className="text-xs font-bold tracking-widest text-amber-300 uppercase mt-1">
              Terminal Segura & Punto de Venta
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col md:flex-row bg-slate-50 text-slate-900 font-sans md:h-screen md:overflow-hidden overflow-y-auto dark:bg-slate-950 dark:text-slate-100">
      {/* ══════════════════════════════════════════════════════════════════
          PANEL IZQUIERDO: HERO BRANDING (Cosmos Glassmorphism POS)
      ══════════════════════════════════════════════════════════════════ */}
      <div
        className="hidden md:flex relative md:w-1/2 h-full flex-col justify-between p-8 lg:p-12 overflow-hidden shrink-0 z-10 select-none text-white"
        style={{
          background:
            'linear-gradient(135deg, #051a14 0%, #0a2920 25%, #174a3b 60%, #1f5e4c 85%, #27725d 100%)',
        }}
      >
        {/* Ambient Glowing Orbs */}
        <div
          className="absolute -top-28 -left-28 w-96 h-96 rounded-full opacity-45 blur-3xl pointer-events-none"
          style={{ background: 'radial-gradient(circle, #34d399 0%, transparent 70%)' }}
        />
        <div
          className="absolute bottom-10 -right-20 w-96 h-96 rounded-full opacity-35 blur-3xl pointer-events-none"
          style={{ background: 'radial-gradient(circle, #fbbf24 0%, transparent 70%)' }}
        />
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[32rem] h-[32rem] rounded-full opacity-20 blur-3xl pointer-events-none"
          style={{ background: 'radial-gradient(circle, #10b981 0%, transparent 70%)' }}
        />

        {/* Mesh Grid Pattern Overlay */}
        <div
          className="absolute inset-0 opacity-15 pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.15) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />

        {/* Contenido Central */}
        <div className="relative z-10 my-auto py-4">
          <div className="flex items-center gap-3.5 mb-6">
            <div className="relative shrink-0">
              <div className="absolute -inset-1 rounded-2xl bg-amber-400/40 blur-sm" />
              <img
                src="/logopintura.jpeg"
                alt="Pinturas POS"
                className="relative w-16 h-16 object-cover rounded-2xl border-2 border-white/40 shadow-xl"
              />
            </div>
            <div>
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-300 uppercase tracking-wider mb-0.5">
                <Sparkles size={13} className="text-amber-400" /> Sistema Integral POS
              </span>
              <h3 className="text-2xl font-black text-white tracking-tight">Pinturas POS</h3>
            </div>
          </div>

          <h1 className="text-3xl lg:text-4xl xl:text-5xl font-black text-white tracking-tight leading-[1.15] mb-4">
            Bienvenido de <br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-amber-300 via-emerald-200 to-amber-100">
              vuelta al mostrador.
            </span>
          </h1>

          <p className="text-emerald-100/80 text-sm lg:text-base font-medium max-w-md leading-relaxed">
            Control de inventario en tiempo real, catálogo de pinturas y ferretería, cobro ágil y soporte offline garantizado.
          </p>

          {/* Feature Chips */}
          <div className="flex flex-wrap gap-2.5 mt-8">
            <span className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-white/10 text-white border border-white/10 backdrop-blur-sm shadow-2xs">
              ⚡ Modo Offline-Ready
            </span>
            <span className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-white/10 text-white border border-white/10 backdrop-blur-sm shadow-2xs">
              🪣 Manejo de Fraccionables & 19L
            </span>
            <span className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-white/10 text-white border border-white/10 backdrop-blur-sm shadow-2xs">
              🧾 Tickets Térmicos 80mm
            </span>
          </div>
        </div>

        {/* Footer del panel izquierdo */}
        <div className="relative z-10 flex flex-col gap-2 pt-4 border-t border-white/10 text-xs text-emerald-200/80 font-medium">
          <div className="flex items-center justify-between">
            <span>Terminal Punto de Venta · <strong className="text-white font-mono font-bold">Pinturas POS</strong></span>
            <span className="inline-flex items-center gap-1.5 text-emerald-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              Seguridad Local
            </span>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          PANEL DERECHO: FORMULARIO PIN PAD (Atmósfera Glassmorphism)
      ══════════════════════════════════════════════════════════════════ */}
      <div
        className="w-full md:w-1/2 min-h-screen md:min-h-0 md:h-full flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-10 relative overflow-y-auto"
        style={{
          background: 'radial-gradient(circle at 50% 30%, #f7f9f8 0%, #edf3f0 50%, #e2ece7 100%)',
        }}
      >
        {/* Orbes difusos en panel derecho */}
        <div
          className="absolute top-10 right-10 w-96 h-96 rounded-full opacity-40 blur-3xl pointer-events-none"
          style={{ background: 'radial-gradient(circle, #a7f3d0 0%, #6ee7b7 50%, transparent 70%)' }}
        />
        <div
          className="absolute bottom-10 left-10 w-96 h-96 rounded-full opacity-30 blur-3xl pointer-events-none"
          style={{ background: 'radial-gradient(circle, #fde68a 0%, #fef3c7 50%, transparent 70%)' }}
        />

        {/* Tarjeta de Seguridad PIN Pad */}
        <div className="relative z-10 w-full max-w-sm bg-white/90 backdrop-blur-2xl p-6 sm:p-8 rounded-3xl shadow-[0_20px_50px_rgba(23,74,59,0.12),0_0_0_1px_rgba(23,74,59,0.08)] border border-slate-200/80 dark:border-slate-800 dark:bg-slate-900/90 dark:shadow-[0_20px_50px_rgba(0,0,0,0.6)] animate-fadeIn my-auto">
          {/* Header móvil con logo (visible solo en celulares) */}
          <div className="flex md:hidden items-center gap-3 mb-5 pb-4 border-b border-slate-200/80 dark:border-slate-800">
            <img
              src="/logopintura.jpeg"
              alt="Pinturas POS"
              className="w-12 h-12 object-cover rounded-2xl border border-slate-200 shadow-xs dark:border-slate-700"
            />
            <div>
              <span className="inline-flex items-center gap-1 text-[10px] font-black text-primary dark:text-emerald-400 uppercase tracking-wider">
                <Sparkles size={11} className="text-accent" /> Punto de Venta
              </span>
              <h3 className="text-lg font-black text-slate-900 dark:text-white">Pinturas POS</h3>
            </div>
          </div>

          <div className="flex flex-col items-center text-center gap-2 mb-5">
            <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-primary to-primary-600 text-amber-300 shadow-md shadow-primary/25 ring-4 ring-primary/10 dark:from-emerald-600 dark:to-emerald-500 dark:text-slate-950">
              <Lock className="h-6 w-6 stroke-[2.2]" />
            </div>

            <div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                {firstRun
                  ? confirming
                    ? 'Confirma tu PIN'
                    : 'Crea tu PIN de Acceso'
                  : 'Terminal Bloqueada'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                {firstRun
                  ? confirming
                    ? 'Vuelve a introducir el código de 4 dígitos'
                    : 'Establece un código numérico para proteger la caja'
                  : 'Ingresa tu PIN de 4 dígitos para desbloquear'}
              </p>
            </div>
          </div>

          {/* Banner de Estado / Error */}
          {error && (
            <div
              className={`flex items-center gap-2 p-3 mb-4 rounded-2xl text-xs font-bold animate-fadeIn ${
                error === 'Confirma tu PIN'
                  ? 'bg-amber-50 text-amber-900 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-800/80'
                  : 'bg-rose-50 text-rose-800 border border-rose-200 dark:bg-rose-950/60 dark:text-rose-200 dark:border-rose-800/80'
              }`}
            >
              {error === 'Confirma tu PIN' ? (
                <KeyRound className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
              ) : (
                <ShieldAlert className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0" />
              )}
              <span className="flex-1">{error}</span>
            </div>
          )}

          {/* Puntos indicadores del PIN */}
          <div className="mb-6">
            <PinDots
              length={pin.length}
              done={unlockedSuccess}
              hasError={!!error && error !== 'Confirma tu PIN'}
            />
          </div>

          {/* Teclado numérico PIN Pad */}
          <Keypad disabled={!initDone || unlockedSuccess} onDigit={onDigit} onBack={onBack} />

          {/* Mensaje de teclado físico */}
          <div className="mt-5 text-center">
            <p className="text-[11px] text-slate-400 dark:text-slate-500 font-medium flex items-center justify-center gap-1.5">
              <span>Puedes usar el teclado numérico</span>
              <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-[9px] text-slate-500 dark:text-slate-400">
                0-9
              </kbd>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
