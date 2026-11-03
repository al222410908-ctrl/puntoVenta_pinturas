import { Keyboard, Search, ShoppingBag, PauseCircle, FileSpreadsheet, X } from 'lucide-react'
import { Button, Modal } from './ui'

interface KeyboardShortcutsModalProps {
  open: boolean
  onClose: () => void
}

const SHORTCUTS = [
  {
    key: 'F2  ó  /',
    title: 'Buscar Producto',
    description: 'Enfoca el buscador para escribir el nombre o código de barras sin usar el mouse.',
    icon: Search,
  },
  {
    key: 'F4',
    title: 'Cobrar Venta',
    description: 'Abre la pantalla de cobro con desglose de billetes, tarjeta o transferencia.',
    icon: ShoppingBag,
  },
  {
    key: 'F7',
    title: 'Cotizar Pedido',
    description: 'Genera una cotización formal en PDF o WhatsApp con los artículos del carrito sin registrar venta.',
    icon: FileSpreadsheet,
  },
  {
    key: 'F9',
    title: 'Pausar Venta (Espera)',
    description: 'Guarda temporalmente el carrito actual para atender a otro cliente y reanudarlo después.',
    icon: PauseCircle,
  },
  {
    key: 'Esc',
    title: 'Cerrar / Cancelar',
    description: 'Cierra cualquier ventana emergente o modal abierta al instante.',
    icon: X,
  },
]

export function KeyboardShortcutsModal({ open, onClose }: KeyboardShortcutsModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="Guía Rápida de Atajos de Teclado" size="md">
      <div className="flex flex-col gap-4 text-xs text-slate-700 dark:text-slate-300">
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 dark:border-emerald-500/20 dark:bg-emerald-950/20 flex items-start gap-2.5">
          <Keyboard className="h-5 w-5 text-primary dark:text-emerald-400 shrink-0 mt-0.5" />
          <p className="text-[11.5px] leading-relaxed">
            Atajos diseñados para cobrar a máxima velocidad en mostrador. El cajero puede operar el punto de venta usando únicamente el teclado.
          </p>
        </div>

        <div className="space-y-2">
          {SHORTCUTS.map((s) => {
            const Icon = s.icon
            return (
              <div
                key={s.key}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200/90 bg-white p-3 shadow-2xs dark:border-slate-800 dark:bg-slate-900/60"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 shrink-0">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 dark:text-slate-100 text-xs">{s.title}</p>
                    <p className="text-[10.5px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                      {s.description}
                    </p>
                  </div>
                </div>

                <kbd className="inline-flex items-center justify-center min-w-[54px] px-2 py-1.5 rounded-lg border border-slate-300 bg-slate-100 font-mono text-[11px] font-bold text-slate-800 shadow-2xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 shrink-0">
                  {s.key}
                </kbd>
              </div>
            )
          })}
        </div>

        <div className="flex justify-end pt-1">
          <Button className="btn-primary" onClick={onClose}>
            Entendido
          </Button>
        </div>
      </div>
    </Modal>
  )
}
