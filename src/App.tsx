import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { ShoppingCart, Package, Truck, Boxes, BarChart3, Wallet, Settings, Moon, Sun, RefreshCw } from 'lucide-react'
import AccessGate from './components/AccessGate'
import { syncNow, lastSyncAt, onLocalChange } from './lib/sync'
import { BarcodeScanner } from './components/BarcodeScanner'
import { Modal, Button, SafeImage } from './components/ui'
import { db } from './db/db'
import type { Product } from './types'
import { formatMoney } from './lib/utils'
import { UNIT_LABELS, formatQty } from './lib/units'
import { loadScannerSettings, useBarcodeScanner } from './lib/scanner'
import { toast } from 'sonner'

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
  const [globalScanOpen, setGlobalScanOpen] = useState(false)
  const [scannedProduct, setScannedProduct] = useState<Product | null>(null)
  const scanner = loadScannerSettings()

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

  const doSync = async (full = false) => {
    if (busyRef.current) return
    busyRef.current = true
    setSyncState('syncing')
    setSyncError(null)
    try {
      await syncNow({ full })
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
    // Sincronización completa inicial al abrir la app o desbloquear
    void doSyncRef.current(true)

    let debounce: ReturnType<typeof setTimeout> | undefined
    const offLocalChange = onLocalChange(() => {
      if (debounce) clearTimeout(debounce)
      debounce = setTimeout(() => {
        debounce = undefined
        void doSyncRef.current(false)
      }, 1000)
    })

    // Al enfocar la ventana o volver a la pestaña, sincronizar solo cambios recientes (delta)
    // con un cooldown de 20s para no saturar transferencia si el usuario alterna pestañas.
    let lastFocusSync = 0
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        const now = Date.now()
        if (now - lastFocusSync > 20_000) {
          lastFocusSync = now
          void doSyncRef.current(false)
        }
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)

    // Sincronización periódica cada 45 segundos solo si la pestaña está activa y visible
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void doSyncRef.current(false)
      }
    }, 45_000)

    return () => {
      offLocalChange()
      window.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      clearInterval(interval)
      if (debounce) clearTimeout(debounce)
    }
  }, [unlocked])

  const handleGlobalScan = async (code: string) => {
    // Si hay un modal abierto o el foco está en un campo de texto (ej. registrando o editando producto),
    // NO obstruir ni redirigir. El formulario se queda intacto.
    if (document.querySelector('[role="dialog"]') && !globalScanOpen) {
      return
    }
    const el = document.activeElement
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) {
      return
    }

    setGlobalScanOpen(false)
    const clean = code.replace(/\s|-/g, '')
    const product = await db.products
      .filter(
        (p) =>
          (p.barcode ?? '').replace(/\s|-/g, '') === clean ||
          (p.purchaseCode ?? '').replace(/\s|-/g, '') === clean,
      )
      .first()

    if (product) {
      if (tab === 'vender') {
        window.dispatchEvent(new CustomEvent('pos:add_to_cart', { detail: product }))
        toast.success(`${product.name} agregado al carrito`)
      } else {
        setScannedProduct(product)
      }
    } else {
      toast.error(`Código ${code} no encontrado en el inventario`)
    }
  }

  useBarcodeScanner(
    handleGlobalScan,
    unlocked && tab !== 'vender' && scanner.enabled,
    scanner.suffix,
    true,
  )

  if (!unlocked) {
    return <AccessGate onUnlock={() => { sessionStorage.setItem('pos_session', '1'); setUnlocked(true) }} />
  }

  return (
    <div className="flex h-app flex-col bg-surface dark:bg-slate-950">
      <header className="flex h-10 shrink-0 items-center justify-between border-b border-slate-200/90 bg-white/80 backdrop-blur-md px-3 sm:px-4 dark:border-slate-800 dark:bg-slate-900/80">
        <button
          onClick={() => void doSyncRef.current()}
          className="inline-flex items-center gap-2 rounded-full border border-slate-200/90 bg-slate-50/90 px-2.5 py-1 text-xs font-medium text-slate-600 shadow-2xs hover:bg-slate-100/80 transition dark:border-slate-800 dark:bg-slate-800/80 dark:text-slate-300"
          title="Toca para sincronizar ahora"
        >
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${
              syncState === 'ok'
                ? 'bg-emerald-500 shadow-xs shadow-emerald-500/50'
                : syncState === 'syncing'
                  ? 'animate-pulse bg-amber-400'
                  : 'bg-red-500'
            }`}
          />
          <span className="text-[11px] sm:text-xs">
            {syncState === 'syncing'
              ? 'Sincronizando…'
              : syncState === 'offline'
                ? `Sin conexión${syncError ? `: ${syncError}` : ''}`
                : `Sincronizado${last > 0 ? ` · ${new Date(last).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}` : ' ahora'}`}
          </span>
        </button>
        <button
          onClick={() => void doSyncRef.current(true)}
          className={`inline-flex items-center gap-1.5 rounded-lg border border-transparent px-2.5 py-1 text-xs font-semibold transition ${
            syncState === 'syncing'
              ? 'cursor-default text-slate-400'
              : 'text-primary hover:border-slate-200 hover:bg-slate-100/90 dark:text-emerald-400 dark:hover:border-slate-700 dark:hover:bg-slate-800'
          }`}
          disabled={syncState === 'syncing'}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${syncState === 'syncing' ? 'animate-spin text-amber-500' : ''}`} />
          <span className="hidden sm:inline">Sincronizar</span>
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200/90 bg-white/95 backdrop-blur-sm md:flex dark:border-slate-800 dark:bg-slate-900/95">
          <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-4 dark:border-slate-800">
            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-primary-700 to-primary-600 p-0.5 shadow-sm shadow-primary/30">
              <img src="/logopintura.jpeg" alt="Pinturas POS" className="h-full w-full rounded-[10px] object-cover" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-display text-base font-bold tracking-tight text-slate-900 dark:text-slate-100">Pinturas POS</p>
              <p className="text-[11px] font-medium text-slate-400 dark:text-slate-500">Punto de Venta & Stock</p>
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
                  className={`group flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-all duration-150 ${
                    active
                      ? 'bg-gradient-to-r from-primary-600 to-primary text-white shadow-sm shadow-primary/25'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/80 dark:hover:text-slate-100'
                  }`}
                >
                  <Icon className={`h-4.5 w-4.5 transition-transform group-hover:scale-105 ${active ? 'text-amber-300' : 'text-slate-400 dark:text-slate-500'}`} />
                  <span>{n.label}</span>
                </button>
              )
            })}
          </nav>
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 dark:border-slate-800">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400 dark:text-slate-500">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span>Offline-ready</span>
            </div>
            <ThemeToggle dark={dark} onToggle={() => setDark((d) => !d)} />
          </div>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between gap-2 border-b border-slate-200/90 bg-white/90 backdrop-blur-md px-4 py-2.5 md:hidden dark:border-slate-800 dark:bg-slate-900/90">
            <div className="flex items-center gap-2.5">
              <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-tr from-primary-700 to-primary-600 p-0.5 shadow-2xs">
                <img src="/logopintura.jpeg" alt="Pinturas POS" className="h-full w-full rounded-md object-cover" />
              </div>
              <p className="font-display text-base font-bold text-slate-900 dark:text-slate-100">Pinturas POS</p>
            </div>
            <ThemeToggle dark={dark} onToggle={() => setDark((d) => !d)} />
          </header>
          <main className="flex min-h-0 min-w-0 flex-1 flex-col pb-[calc(env(safe-area-inset-bottom)+4.25rem)] md:pb-0">
            <Suspense fallback={<div className="flex h-full items-center justify-center text-sm font-medium text-slate-400">Cargando…</div>}>
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

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/90 bg-white/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)] shadow-lg md:hidden dark:border-slate-800 dark:bg-slate-900/95">
        <div className="grid grid-cols-7 py-1">
          {NAV.map((n) => {
            const Icon = n.icon
            const active = tab === n.id
            return (
              <button
                key={n.id}
                onClick={() => setTab(n.id)}
                className={`flex flex-col items-center justify-center gap-0.5 py-1.5 transition-all ${
                  active
                    ? 'text-primary font-bold dark:text-emerald-400'
                    : 'text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300'
                }`}
              >
                <div className={`flex h-7 w-7 items-center justify-center rounded-xl transition ${active ? 'bg-primary/10 dark:bg-emerald-950/60' : ''}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <span className="text-[10px] leading-tight tracking-tight">{n.label}</span>
              </button>
            )
          })}
        </div>
      </nav>

      {globalScanOpen && (
        <BarcodeScanner
          open={globalScanOpen}
          onClose={() => setGlobalScanOpen(false)}
          onScan={(code) => void handleGlobalScan(code)}
        />
      )}

      {scannedProduct && (
        <Modal
          open={!!scannedProduct}
          onClose={() => setScannedProduct(null)}
          title="Producto escaneado"
        >
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <SafeImage
                src={scannedProduct.photo}
                alt={scannedProduct.name}
                className="h-16 w-16 shrink-0 rounded-xl border border-slate-200 dark:border-slate-700"
                fallbackIcon={<Package className="h-8 w-8 text-slate-400 dark:text-slate-500" />}
              />
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-bold text-slate-900 break-words dark:text-slate-100">
                  {scannedProduct.name}
                </h3>
                <p className="text-xs text-slate-400">
                  Código:{' '}
                  <span className="font-mono font-medium text-slate-600 dark:text-slate-300">
                    {scannedProduct.barcode || scannedProduct.purchaseCode || 'Sin código'}
                  </span>
                </p>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-lg font-extrabold text-primary dark:text-emerald-400">
                    {formatMoney(scannedProduct.price)}
                  </span>
                  <span className="text-xs text-slate-400">
                    / {UNIT_LABELS[scannedProduct.unit]}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-700 dark:bg-slate-900/50">
              <div className="flex justify-between border-b border-slate-200/60 py-1 dark:border-slate-700/60">
                <span className="text-slate-500">Stock disponible:</span>
                <span
                  className={`font-semibold ${
                    scannedProduct.stock <= scannedProduct.minStock
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-slate-800 dark:text-slate-200'
                  }`}
                >
                  {formatQty(scannedProduct.stock, scannedProduct.unit)}
                </span>
              </div>
              {scannedProduct.purchaseCode && (
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">Código de compra:</span>
                  <span className="font-mono text-slate-700 dark:text-slate-300">
                    {scannedProduct.purchaseCode}
                  </span>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2 pt-1 sm:flex-row">
              <Button
                className="w-full justify-center btn-primary"
                onClick={() => {
                  const p = scannedProduct
                  setScannedProduct(null)
                  setTab('vender')
                  setTimeout(() => {
                    window.dispatchEvent(new CustomEvent('pos:add_to_cart', { detail: p }))
                  }, 60)
                }}
              >
                <ShoppingCart className="h-4 w-4" />
                Ir a Ventas y Cobrar
              </Button>
              <Button
                className="w-full justify-center btn-secondary"
                onClick={() => {
                  setScannedProduct(null)
                  setTab('catalogo')
                }}
              >
                <Package className="h-4 w-4" />
                Ver en Catálogo
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
