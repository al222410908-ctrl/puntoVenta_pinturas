import { useState } from 'react'
import { Download, MessageCircle, X } from 'lucide-react'
import { toast } from 'sonner'
import type { Sale } from '../types'
import { Button, Field, Input, Modal } from './ui'
import {
  downloadTicketPdf,
  folioLabel,
  formatTicketDate,
  loadBusinessInfo,
  loadClientPhone,
  normalizePhone,
  openWhatsAppText,
  saveClientPhone,
  shareTicketPdf,
} from '../lib/ticket'
import { formatMoney } from '../lib/utils'
import { formatQty } from '../lib/units'

export function SaleNoteModal({ sale, onClose }: { sale: Sale | null; onClose: () => void }) {
  const [busy, setBusy] = useState(false)
  const [phone, setPhone] = useState(() => loadClientPhone())
  if (!sale) return null
  const business = loadBusinessInfo()
  const paid = sale.payments.reduce((s, p) => s + p.amount, 0)
  const change = Math.round((paid - sale.total) * 100) / 100

  const handleShare = async () => {
    setBusy(true)
    try {
      const normalized = normalizePhone(phone)
      if (normalized) {
        // Chat directo al cliente: se descarga el PDF y se abre el chat con el resumen
        saveClientPhone(phone)
        const name = await downloadTicketPdf(sale, business)
        openWhatsAppText(sale, business, normalized)
        toast.success(`PDF descargado (${name}). Adjúntalo en el chat de WhatsApp que se abrió.`)
      } else {
        const res = await shareTicketPdf(sale, business)
        if (res === 'downloaded') {
          toast.info('PDF descargado: adjúntalo a tu mensaje de WhatsApp')
        } else {
          toast.success('Nota compartida')
        }
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        toast.error(e instanceof Error ? e.message : 'No se pudo generar el PDF')
      }
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
      toast.error(e instanceof Error ? e.message : 'No se pudo generar el PDF')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={!!sale} onClose={onClose} title={`Nota de venta ${folioLabel(sale)}`}>
      <div className="flex flex-col gap-4">
        <div className="mx-auto w-full max-w-xs rounded-xl border border-slate-200 bg-white p-4 font-mono text-[11px] leading-relaxed text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200">
          {business.logo && <img src={business.logo} alt="" className="mx-auto mb-2 h-14 object-contain" />}
          <p className="text-center text-sm font-bold uppercase">{business.name}</p>
          {business.address?.trim() && <p className="text-center text-[10px]">{business.address}</p>}
          {business.phone?.trim() && <p className="text-center text-[10px]">Tel: {business.phone}</p>}
          <hr className="my-2 border-dashed border-slate-300 dark:border-slate-600" />
          <div className="flex justify-between">
            <span>Nota</span>
            <span>{folioLabel(sale)}</span>
          </div>
          <div className="flex justify-between">
            <span>Fecha</span>
            <span>{formatTicketDate(sale.date)}</span>
          </div>
          <hr className="my-2 border-dashed border-slate-300 dark:border-slate-600" />
          {sale.items.map((it) => (
            <div key={`${it.productId}-${it.unit}`} className="mb-1.5">
              <p className="truncate">{it.name}</p>
              <div className="flex justify-between">
                <span>
                  {formatQty(it.qty, it.unit)} × {formatMoney(it.unitPrice)}
                </span>
                <span>{formatMoney(it.lineTotal)}</span>
              </div>
            </div>
          ))}
          <hr className="my-2 border-dashed border-slate-300 dark:border-slate-600" />
          <div className="flex justify-between text-sm font-bold">
            <span>TOTAL</span>
            <span>{formatMoney(sale.total)}</span>
          </div>
          {sale.payments.map((p, i) => (
            <div key={i} className="flex justify-between">
              <span>{p.type === 'efectivo' ? 'Efectivo' : 'Tarjeta'}</span>
              <span>{formatMoney(p.amount)}</span>
            </div>
          ))}
          {change > 0 && (
            <div className="flex justify-between">
              <span>Cambio</span>
              <span>{formatMoney(change)}</span>
            </div>
          )}
          {sale.notes?.trim() && <p className="mt-2 text-[10px]">Nota: {sale.notes}</p>}
          {business.footer?.trim() && <p className="mt-2 text-center text-[10px]">{business.footer}</p>}
        </div>

        <Field label="WhatsApp del cliente (opcional)">
          <Input
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="10 dígitos, ej. 871 123 4567"
            maxLength={20}
          />
        </Field>

        <Button className="btn-primary w-full" disabled={busy} onClick={() => void handleShare()}>
          <MessageCircle className="mr-2 inline h-4 w-4" />
          Enviar por WhatsApp
        </Button>
        <Button className="btn-secondary w-full" disabled={busy} onClick={() => void handleDownload()}>
          <Download className="mr-2 inline h-4 w-4" />
          Descargar PDF
        </Button>
        <button
          onClick={() => openWhatsAppText(sale, business, normalizePhone(phone))}
          disabled={busy}
          className="text-xs text-primary underline-offset-2 hover:underline"
        >
          O enviar solo el resumen en texto
        </button>
        <Button className="btn-ghost mx-auto" onClick={onClose}>
          <X className="mr-1 inline h-4 w-4" />
          Cerrar
        </Button>
      </div>
    </Modal>
  )
}
