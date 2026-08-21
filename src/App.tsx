import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { ShoppingCart, Package, Truck, Boxes, BarChart3, Wallet, Settings, Moon, Sun, RefreshCw } from 'lucide-react'
import AccessGate from './components/AccessGate'
import { syncNow, lastSyncAt, onLocalChange } from './lib/sync'

const Pos = lazy(() => import('./screens/Pos'))
const Products = lazy(() => import('./screens/Products'))
const Restock = lazy(() => import('./screens/Restock'))
const Inventory = lazy(() => import('./screens/Inventory'))
const Reports = lazy(() => import('./screens/Reports'))
const Money = lazy(() => import('./screens/Money'))
const SettingsScreen = lazy(() => import('./screens/Settings'))

type SyncState = 'ok' | 'offline' | 'syncing'

const NAV = [
  { id: 'vender', label: 'Vender', icon: ShoppingCart },
  { id: 'catalogo', label: 'Catálogo', icon: Package },
  { id: 'resurtir', label: 'Resurtir', icon: Truck },
  { id: 'inventario', label: 'Inventario', icon: Boxes },
  { id: 'caja', label: 'Caja', icon: Wallet },
  { id: 'reportes', label: 'Reportes', icon: BarChart3 },
  { id: 'ajustes', label: 'Ajustes', icon: Settings },
] as const

type TabId = (typeof NAV)[number]['id']

function ThemeToggle({ dark, onToggle }: { dark: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="inline-flex items-center justify-center rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
      aria-label={dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
    >
      {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </button>
  )
}

export default function App() {
  const [tab, setTab] = useState<TabId>('vender')
  const [dark, setDark] = useState<boolean>(() => {
    const saved = localStorage.getItem('theme')
    if (saved) return saved === 'dark'
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('theme', dark ? 'dark' : 'light')
  }, [dark])

  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem('pos_session') === '1')
  const [syncState, setSyncState] = useState<SyncState>('syncing')
  const [syncError, setSyncError] = useState<string | null>(null)
  const [last, setLast] = useState(lastSyncAt)
  const busyRef = useRef(false)

  const doSync = async () => {
    if (busyRef.current) return
    busyRef.current = true
    setSyncState('syncing')
    setSyncError(null)
    try {
      await syncNow()
      setSyncState('ok')
      setLast(lastSyncAt())
    } catch (e) {
      setSyncState('offline')
      setSyncError(e instanceof Error ? e.message : String(e))
    } finally {
      busyRef.current = false
    }
  }
  const doSyncRef = useRef(doSync)
  doSyncRef.current = doSync

  useEffect(() => {
    if (!unlocked) return
    const run = () => void doSyncRef.current()
    run()

    let debounce: ReturnType<typeof setTimeout> | undefined
    const offLocalChange = onLocalChange(() => {
      if (debounce) clearTimeout(debounce)
      debounce = setTimeout(() => {
        debounce = undefined
        run()
      }, 1500)
    })

    const onVisible = () => {
      if (document.visibilityState === 'visible') run()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)

    // Sincronización periódica cada 15 segundos (ideal para iPad/Safari)
    const interval = setInterval(run, 15_000)

    return () => {
      offLocalChange()
      window.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      clearInterval(interval)
      if (debounce) clearTimeout(debounce)
    }
  }, [unlocked])

  if (!unlocked) {
    return <AccessGate onUnlock={() => { sessionStorage.setItem('pos_session', '1'); setUnlocked(true) }} />
  }

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-9 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-3 md:px-4 dark:border-slate-800 dark:bg-slate-900">
        <button
          onClick={() => void doSyncRef.current()}
          className="inline-flex items-center gap-2 text-xs font-medium"
          title="Toca para sincronizar ahora"
        >
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${
              syncState === 'ok'
                ? 'bg-emerald-500'
                : syncState === 'syncing'
                  ? 'animate-pulse bg-amber-400'
                  : 'bg-red-500'
            }`}
          />
          <span className="text-slate-500 dark:text-slate-400">
            {syncState === 'syncing'
              ? 'Sincronizando…'
              : syncState === 'offline'
                ? `Sin conexión${syncError ? `: ${syncError}` : ''}`
                : `Sincronizado${last > 0 ? ` ${new Date(last).toLocaleString('es-MX', { hour: '2-digit', minute: '2-digit' })}` : ' ahora'}`}
          </span>
        </button>
        <button
          onClick={() => void doSyncRef.current()}
          className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition ${
            syncState === 'syncing' ? 'cursor-default text-slate-400' : 'text-primary hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
          disabled={syncState === 'syncing'}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${syncState === 'syncing' ? 'animate-spin' : ''}`} />
          Sincronizar
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className="hidden w-56 shrink-0 flex-col border-r border-slate-200 bg-white md:flex dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-4 dark:border-slate-800">
            <img src="/logopintura.jpeg" alt="Pinturas POS" className="h-9 w-9 rounded-lg object-cover" />
            <div>
              <p className="font-display text-lg font-semibold leading-tight text-slate-900 dark:text-slate-100">Pinturas POS</p>
              <p className="text-xs text-slate-400">Venta e inventario</p>
            </div>
          </div>
          <nav className="flex-1 space-y-1 p-3">
            {NAV.map((n) => {
              const Icon = n.icon
              const active = tab === n.id
              return (
                <button
                  key={n.id}
                  onClick={() => setTab(n.id)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                    active ? 'bg-primary text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  {n.label}
                </button>
              )
            })}
          </nav>
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 dark:border-slate-800">
            <p className="text-xs text-slate-400">Sincronización automática</p>
            <ThemeToggle dark={dark} onToggle={() => setDark((d) => !d)} />
          </div>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3 md:hidden dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2">
              <img src="/logopintura.jpeg" alt="Pinturas POS" className="h-8 w-8 rounded-lg object-cover" />
              <p className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">Pinturas POS</p>
            </div>
            <ThemeToggle dark={dark} onToggle={() => setDark((d) => !d)} />
          </header>
          <main className="min-h-0 min-w-0 flex-1 pb-[calc(env(safe-area-inset-bottom)+4rem)] md:pb-0">
            <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-slate-400">Cargando…</div>}>
              {tab === 'vender' && <Pos />}
              {tab === 'catalogo' && <Products />}
              {tab === 'resurtir' && <Restock />}
              {tab === 'inventario' && <Inventory />}
              {tab === 'caja' && <Money />}
              {tab === 'reportes' && <Reports />}
              {tab === 'ajustes' && <SettingsScreen />}
            </Suspense>
          </main>
        </div>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden dark:border-slate-800 dark:bg-slate-900">
        <div className="grid grid-cols-7">
          {NAV.map((n) => {
            const Icon = n.icon
            const active = tab === n.id
            return (
              <button
                key={n.id}
                onClick={() => setTab(n.id)}
                className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
                  active ? 'text-primary dark:text-blue-400' : 'text-slate-400 dark:text-slate-500'
                }`}
              >
                <Icon className="h-5 w-5" />
                {n.label}
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
