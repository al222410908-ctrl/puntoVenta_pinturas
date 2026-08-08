import { useEffect, useState } from 'react'
import { ShoppingCart, Package, Truck, Boxes, BarChart3, PaintBucket, Moon, Sun } from 'lucide-react'
import Pos from './screens/Pos'
import Products from './screens/Products'
import Restock from './screens/Restock'
import Inventory from './screens/Inventory'
import Reports from './screens/Reports'

const NAV = [
  { id: 'vender', label: 'Vender', icon: ShoppingCart },
  { id: 'catalogo', label: 'Catálogo', icon: Package },
  { id: 'resurtir', label: 'Resurtir', icon: Truck },
  { id: 'inventario', label: 'Inventario', icon: Boxes },
  { id: 'reportes', label: 'Reportes', icon: BarChart3 },
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

  return (
    <div className="flex h-dvh flex-col md:flex-row">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-slate-200 bg-white md:flex dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-4 dark:border-slate-800">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-white">
            <PaintBucket className="h-5 w-5" />
          </span>
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
          <p className="text-xs text-slate-400">
            Los datos se guardan en este dispositivo. Exporta respaldo en Reportes.
          </p>
          <ThemeToggle dark={dark} onToggle={() => setDark((d) => !d)} />
        </div>
      </aside>

      <div className="flex min-h-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3 md:hidden dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white">
              <PaintBucket className="h-4 w-4" />
            </span>
            <p className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">Pinturas POS</p>
          </div>
          <ThemeToggle dark={dark} onToggle={() => setDark((d) => !d)} />
        </header>
        <main className="min-h-0 flex-1">
          {tab === 'vender' && <Pos />}
          {tab === 'catalogo' && <Products />}
          {tab === 'resurtir' && <Restock />}
          {tab === 'inventario' && <Inventory />}
          {tab === 'reportes' && <Reports />}
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden dark:border-slate-800 dark:bg-slate-900">
        <div className="grid grid-cols-5">
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
