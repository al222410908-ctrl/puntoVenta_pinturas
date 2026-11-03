import { useState } from 'react'
import { Download, MessageCircle, Share2, X } from 'lucide-react'
import { toast } from 'sonner'
import type { Sale } from '../types'
import { Button, Field, Input, Modal } from './ui'
import {
  folioLabel,
  formatTicketDate,
  loadBusinessInfo,
  loadClientPhone,
  normalizePhone,
  openWhatsAppText,
  saveClientPhone,
  shareTicketPdf,
  downloadTicketPdf,
} from '../lib/ticket'
import { formatMoney, round2 } from '../lib/utils'
import { formatQty } from '../lib/units'

export function SaleNoteModal({ sale, onClose }: { sale: Sale | null; onClose: () => void }) {
  const [busy, setBusy] = useState(false)
  const [phone, setPhone] = useState(() => sale?.customerPhone?.trim() || loadClientPhone())
  if (!sale) return null
  const business = loadBusinessInfo()
  const paid = sale.payments.reduce((s, p) => s + p.amount, 0)
  const change = Math.round((paid - sale.total) * 100) / 100

  const handleSendWhatsApp = () => {
    const normalized = normalizePhone(phone)
    if (!normalized) {
      toast.error('Escribe el número de WhatsApp del cliente (10 dígitos)')
      return
    }
    saveClientPhone(phone)
    openWhatsAppText(sale, business, normalized)
    toast.success('Abriendo WhatsApp con el ticket redactado listo para enviar')
  }

  const handleSharePdf = async () => {
    setBusy(true)
    try {
      if (phone) saveClientPhone(phone)
      const res = await shareTicketPdf(sale, business)
      if (res === 'shared') {
        toast.success('Comprobante PDF compartido con éxito')
      } else {
        toast.success('PDF descargado en el dispositivo')
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      toast.error(e instanceof Error ? e.message : 'No se pudo compartir el PDF')
    } finally {
      setBusy(false)
    }
  }

  const handleDownload = async () => {
    setBusy(true)
    try {
      const name = await downloadTicketPdf(sale, business)
      toast.success(`PDF descargado: ${name}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo descargar el PDF')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={!!sale} onClose={onClose} title={`Comprobante de Venta ${folioLabel(sale)}`}>
      <div className="flex flex-col gap-4">
        {/* Tarjeta de Ticket Mejorada y Elegante */}
        <div className="mx-auto w-full max-w-sm rounded-2xl border border-slate-200/90 bg-white p-4.5 shadow-xs text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
          {/* Logo y Encabezado */}
          <div className="text-center pb-2 border-b border-slate-100 dark:border-slate-800">
            {business.logo && (
              <img src={business.logo} alt="" className="mx-auto mb-2 h-12 max-w-[140px] object-contain" />
            )}
            <h3 className="font-display font-bold text-sm tracking-wide text-primary dark:text-emerald-400 uppercase">
              {business.name}
            </h3>
            {business.address?.trim() && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{business.address}</p>
            )}
            <div className="flex flex-wrap justify-center gap-x-2 text-[10.5px] text-slate-400 mt-0.5">
              {business.phone?.trim() && <span>Tel: {business.phone}</span>}
              {(business.ownerName?.trim() || business.ownerPhone?.trim()) && (
                <span>
                  · Supervisor: {[business.ownerName?.trim(), business.ownerPhone?.trim()].filter(Boolean).join(' ')}
                </span>
              )}
            </div>
          </div>

          {/* Folio y Cliente Badge */}
          <div className="py-2.5 flex items-center justify-between border-b border-dashed border-slate-200 dark:border-slate-800 text-[11px]">
            <div>
              <span className="font-bold text-primary dark:text-emerald-400 text-xs">{folioLabel(sale)}</span>
              <p className="text-[10px] text-slate-400">{formatTicketDate(sale.date)}</p>
            </div>
            <div className="text-right">
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                {sale.customerName?.trim() || 'Mostrador (Público general)'}
              </span>
              {sale.customerPhone?.trim() && (
                <p className="text-[10px] text-slate-400">Tel: {sale.customerPhone.trim()}</p>
              )}
            </div>
          </div>

          {/* Lista de Productos */}
          <div className="py-2.5 space-y-2 max-h-48 overflow-y-auto pr-1">
            {sale.items.map((it, idx) => {
              const displayQty = it.saleQty ?? it.qty
              const displayUnit = it.saleUnit ?? it.unit
              const displayPrice = displayQty > 0 ? round2(it.lineTotal / displayQty) : it.unitPrice
              return (
                <div key={`${it.productId}-${idx}`} className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-800 dark:text-slate-200 truncate">{it.name}</p>
                    <p className="text-[10.5px] text-slate-400">
                      {formatQty(displayQty, displayUnit)} × {formatMoney(displayPrice)}
                    </p>
                  </div>
                  <span className="font-bold tabular-nums text-slate-900 dark:text-slate-100">
                    {formatMoney(it.lineTotal)}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Totales y Pagos */}
          <div className="pt-2 border-t border-dashed border-slate-200 dark:border-slate-800 space-y-1">
            <div className="flex justify-between items-center text-sm font-bold">
              <span className="text-slate-700 dark:text-slate-200">TOTAL</span>
              <span className="text-base text-primary dark:text-emerald-400 font-display tabular-nums">
                {formatMoney(sale.total)}
              </span>
            </div>

            <div className="text-[10.5px] text-slate-500 dark:text-slate-400 space-y-0.5 pt-1">
              {sale.payments.map((p, i) => (
                <div key={i} className="flex justify-between">
                  <span>{p.type === 'efectivo' ? 'Efectivo' : p.type === 'tarjeta' ? 'Tarjeta' : 'Transferencia'}</span>
                  <span className="tabular-nums">{formatMoney(p.amount)}</span>
                </div>
              ))}
              {change > 0 && (
                <div className="flex justify-between font-semibold text-blue-600 dark:text-blue-400">
                  <span>Cambio</span>
                  <span className="tabular-nums">{formatMoney(change)}</span>
                </div>
              )}
            </div>

            {sale.notes?.trim() && (
              <p className="mt-2 text-[10px] text-slate-500 bg-slate-50 dark:bg-slate-800/60 p-1.5 rounded-lg border border-slate-200/60 dark:border-slate-700">
                <strong>Nota:</strong> {sale.notes}
              </p>
            )}

            {business.footer?.trim() && (
              <p className="mt-2 text-center text-[10px] text-slate-400 italic">{business.footer}</p>
            )}
          </div>
        </div>

        {/* Input de WhatsApp */}
        <Field label="WhatsApp del cliente (10 dígitos)">
          <Input
            type="tel"
            inputMode="tel"
            autoFocus
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Ej: 55 1234 5678"
            maxLength={20}
          />
        </Field>

        {/* Acciones Claras e Intuitivas */}
        <div className="space-y-2">
          <Button
            className="btn-primary w-full py-2.5 font-bold shadow-sm shadow-primary/20"
            disabled={busy}
            onClick={handleSendWhatsApp}
          >
            <MessageCircle className="mr-2 inline h-4 w-4" />
            Enviar por WhatsApp (Mensaje con detalle)
          </Button>

          <Button
            className="btn-secondary w-full py-2.5 font-semibold"
            disabled={busy}
            onClick={() => void handleSharePdf()}
          >
            <Share2 className="mr-2 inline h-4 w-4 text-primary dark:text-emerald-400" />
            Compartir Ticket PDF (WhatsApp / Móvil)
          </Button>

          <div className="flex gap-2">
            <Button
              className="btn-ghost flex-1 text-xs text-slate-600 dark:text-slate-400"
              disabled={busy}
              onClick={() => void handleDownload()}
            >
              <Download className="mr-1.5 inline h-3.5 w-3.5" />
              Descargar PDF
            </Button>
            <Button className="btn-ghost flex-1 text-xs" onClick={onClose}>
              <X className="mr-1 inline h-3.5 w-3.5" />
              Cerrar
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
