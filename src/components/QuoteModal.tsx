import { useState } from 'react'
import { Download, MessageCircle, Share2, ShoppingCart, X } from 'lucide-react'
import { toast } from 'sonner'
import type { Quote } from '../types'
import { Button, Field, Input, Modal } from './ui'
import {
  quoteFolioLabel,
  formatTicketDate,
  formatSimpleDate,
  loadBusinessInfo,
  loadClientPhone,
  normalizePhone,
  openWhatsAppQuoteText,
  saveClientPhone,
  shareQuotePdf,
  downloadQuotePdf,
} from '../lib/ticket'
import { formatMoney, round2 } from '../lib/utils'
import { formatQty } from '../lib/units'

interface QuoteModalProps {
  quote: Quote | null
  onClose: () => void
  onConvertToSale?: (quote: Quote) => void
}

export function QuoteModal({ quote, onClose, onConvertToSale }: QuoteModalProps) {
  const [busy, setBusy] = useState(false)
  const [phone, setPhone] = useState(() => quote?.customerPhone?.trim() || loadClientPhone())
  if (!quote) return null
  const business = loadBusinessInfo()

  const handleSendWhatsApp = () => {
    const normalized = normalizePhone(phone)
    if (!normalized) {
      toast.error('Escribe el número de WhatsApp del cliente (10 dígitos)')
      return
    }
    saveClientPhone(phone)
    openWhatsAppQuoteText(quote, business, normalized)
    toast.success('Abriendo WhatsApp con la cotización lista para enviar')
  }

  const handleSharePdf = async () => {
    setBusy(true)
    try {
      if (phone) saveClientPhone(phone)
      const res = await shareQuotePdf(quote, business)
      if (res === 'shared') {
        toast.success('Cotización PDF compartida con éxito')
      } else {
        toast.success('PDF descargado en el dispositivo')
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      toast.error(e instanceof Error ? e.message : 'No se pudo compartir la cotización')
    } finally {
      setBusy(false)
    }
  }

  const handleDownload = async () => {
    setBusy(true)
    try {
      const name = await downloadQuotePdf(quote, business)
      toast.success(`PDF descargado: ${name}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo descargar el PDF')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={!!quote} onClose={onClose} title={`Cotización ${quoteFolioLabel(quote)}`}>
      <div className="flex flex-col gap-4">
        {/* Tarjeta de Previsualización de Cotización */}
        <div className="mx-auto w-full max-w-sm rounded-2xl border border-amber-200/90 bg-white p-4.5 shadow-xs text-xs text-slate-800 dark:border-amber-900/60 dark:bg-slate-900 dark:text-slate-200">
          <div className="text-center pb-2 border-b border-slate-100 dark:border-slate-800">
            {business.logo && (
              <img src={business.logo} alt="" className="mx-auto mb-2 h-12 max-w-[140px] object-contain" />
            )}
            <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800 mb-1">
              Presupuesto / Cotización
            </span>
            <h3 className="font-display font-bold text-sm tracking-wide text-primary dark:text-emerald-400 uppercase">
              {business.name}
            </h3>
            {business.address?.trim() && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{business.address}</p>
            )}
          </div>

          {/* Folio, Fechas y Cliente */}
          <div className="py-2.5 flex items-center justify-between border-b border-dashed border-slate-200 dark:border-slate-800 text-[11px]">
            <div>
              <span className="font-bold text-amber-700 dark:text-amber-400 text-xs">{quoteFolioLabel(quote)}</span>
              <p className="text-[10px] text-slate-400">{formatTicketDate(quote.date)}</p>
              {quote.validUntil && (
                <p className="text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                  Válido hasta: {formatSimpleDate(quote.validUntil)}
                </p>
              )}
            </div>
            <div className="text-right">
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                {quote.customerName?.trim() || 'Cliente Mostrador'}
              </span>
              {quote.customerPhone?.trim() && (
                <p className="text-[10px] text-slate-400">Tel: {quote.customerPhone.trim()}</p>
              )}
            </div>
          </div>

          {/* Lista de Productos Cotizados */}
          <div className="py-2.5 space-y-2 max-h-48 overflow-y-auto pr-1">
            {quote.items.map((it, idx) => {
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

          {/* Total Cotizado */}
          <div className="pt-2 border-t border-dashed border-slate-200 dark:border-slate-800 space-y-1">
            <div className="flex justify-between items-center text-sm font-bold">
              <span className="text-slate-700 dark:text-slate-200">TOTAL ESTIMADO</span>
              <span className="text-base text-amber-700 dark:text-amber-400 font-display tabular-nums">
                {formatMoney(quote.total)}
              </span>
            </div>

            {quote.notes?.trim() && (
              <p className="mt-2 text-[10px] text-slate-500 bg-slate-50 dark:bg-slate-800/60 p-1.5 rounded-lg border border-slate-200/60 dark:border-slate-700">
                <strong>Notas:</strong> {quote.notes}
              </p>
            )}

            <p className="mt-2 text-[9.5px] text-slate-400 leading-tight text-center">
              Precios informativos sujetos a cambio sin previo aviso.
            </p>
          </div>
        </div>

        {/* Input de WhatsApp */}
        <Field label="WhatsApp del cliente para enviar cotización">
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

        {/* Acciones */}
        <div className="space-y-2">
          <Button
            className="btn-accent w-full py-2.5 font-bold shadow-sm"
            disabled={busy}
            onClick={handleSendWhatsApp}
          >
            <MessageCircle className="mr-2 inline h-4 w-4" />
            Enviar Cotización por WhatsApp
          </Button>

          <Button
            className="btn-secondary w-full py-2.5 font-semibold"
            disabled={busy}
            onClick={() => void handleSharePdf()}
          >
            <Share2 className="mr-2 inline h-4 w-4 text-amber-600 dark:text-amber-400" />
            Compartir PDF Oficial (Móvil / WhatsApp)
          </Button>

          {onConvertToSale && (
            <Button
              className="btn-primary w-full py-2 text-xs font-bold"
              onClick={() => onConvertToSale(quote)}
            >
              <ShoppingCart className="mr-1.5 inline h-3.5 w-3.5" />
              Cargar al Carrito para Vender
            </Button>
          )}

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
