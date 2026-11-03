import { Clock, Play, Trash2, User, X } from 'lucide-react'
import type { HeldSale } from '../lib/heldSales'
import { formatMoney } from '../lib/utils'
import { formatQty } from '../lib/units'
import { formatTicketDate } from '../lib/ticket'
import { Button, EmptyState, Modal } from './ui'

interface HeldSalesModalProps {
  open: boolean
  onClose: () => void
  heldSales: HeldSale[]
  onResume: (held: HeldSale) => void
  onDelete: (id: string) => void
}

export function HeldSalesModal({
  open,
  onClose,
  heldSales,
  onResume,
  onDelete,
}: HeldSalesModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="Ventas en Espera (Pausadas)" size="md">
      <div className="flex flex-col gap-3 min-h-0 text-xs text-slate-800 dark:text-slate-200">
        <p className="text-[11.5px] text-slate-500 dark:text-slate-400">
          Ventas que fueron congeladas para atender a otro cliente en mostrador. Selecciona cualquiera para reanudar su cobro.
        </p>

        {heldSales.length === 0 ? (
          <EmptyState
            icon={<Clock className="h-7 w-7 text-slate-400" />}
            title="No hay ventas en espera"
            hint="Cuando pauses una venta [F9], aparecerá aquí lista para ser recuperada."
          />
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {heldSales.map((h) => {
              const itemCount = h.cart.reduce((s, l) => s + l.qty, 0)
              return (
                <div
                  key={h.id}
                  className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-2xs transition hover:border-primary/40 dark:border-slate-800 dark:bg-slate-900/60 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1">
                        <Clock className="h-3 w-3 text-slate-400" />
                        {formatTicketDate(h.date)}
                      </span>
                      {h.customerName ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300">
                          <User className="h-2.5 w-2.5" />
                          {h.customerName}
                        </span>
                      ) : (
                        <span className="text-[10.5px] text-slate-400 italic">Público general</span>
                      )}
                    </div>

                    <p className="text-[11px] text-slate-600 dark:text-slate-300 line-clamp-1">
                      {h.cart.map((l) => `${formatQty(l.qty, l.saleUnit)} ${l.name}`).join(', ')}
                    </p>

                    <div className="flex items-center gap-2 text-[10.5px] text-slate-400">
                      <span>
                        {itemCount} {itemCount === 1 ? 'artículo' : 'artículos'}
                      </span>
                      {h.notes && <span>· Nota: {h.notes}</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-display font-extrabold text-base text-primary dark:text-emerald-400 tabular-nums">
                      {formatMoney(h.total)}
                    </span>

                    <button
                      type="button"
                      onClick={() => onDelete(h.id)}
                      title="Descartar esta venta pausada"
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 transition dark:hover:bg-red-950/30 dark:hover:text-red-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>

                    <Button
                      type="button"
                      className="btn-primary h-8 px-2.5 text-xs font-bold shadow-xs"
                      onClick={() => onResume(h)}
                    >
                      <Play className="mr-1 inline h-3.5 w-3.5 fill-current" />
                      Reanudar
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div className="flex justify-end pt-1">
          <Button className="btn-ghost" onClick={onClose}>
            <X className="mr-1 inline h-3.5 w-3.5" />
            Cerrar
          </Button>
        </div>
      </div>
    </Modal>
  )
}
