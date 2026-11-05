import { useEffect, useState } from 'react'
import {
  Download,
  MessageCircle,
  RotateCcw,
  Share2,
  X,
  Printer,
  Copy,
  Check,
  PlusCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import type { Sale } from '../types'
import { Input, Modal } from './ui'
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
  whatsappText,
} from '../lib/ticket'
import { formatMoney, round2, calculateChangeBreakdown } from '../lib/utils'
import { formatQty } from '../lib/units'
import { ReturnModal } from './ReturnModal'

/**
 * Barcode realista estilizado para el pie de ticket térmico
 */
function ThermalBarcode({ value }: { value: string }) {
  const bars = [
    2, 1, 3, 1, 2, 1, 4, 1, 2, 2, 1, 3, 1, 2, 1, 3,
    2, 1, 1, 4, 2, 1, 3, 1, 2, 2, 1, 3, 1, 1, 4, 1,
    2, 1, 3, 2, 1, 2, 3, 1,
  ]
  return (
    <div className="flex flex-col items-center justify-center my-3">
      <div className="flex items-center justify-center h-9 gap-[2px]">
        {bars.map((w, i) => (
          <div
            key={i}
            className="bg-zinc-950 h-full"
            style={{ width: `${w}px` }}
          />
        ))}
      </div>
      <span className="font-mono text-[10px] tracking-widest text-zinc-700 mt-1 uppercase font-bold">
        {value}
      </span>
    </div>
  )
}

export function SaleNoteModal({
  sale,
  onClose,
  onSaleUpdated,
}: {
  sale: Sale | null
  onClose: () => void
  onSaleUpdated?: (updated: Sale) => void
}) {
  const [currentSale, setCurrentSale] = useState<Sale | null>(sale)
  const [busy, setBusy] = useState(false)
  const [phone, setPhone] = useState('')
  const [returnOpen, setReturnOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setCurrentSale(sale)
    setPhone(sale?.customerPhone?.trim() || loadClientPhone())
  }, [sale])

  if (!currentSale) return null

  const business = loadBusinessInfo()
  const paid = currentSale.payments.reduce((s, p) => s + p.amount, 0)
  const change = Math.round((paid - currentSale.total) * 100) / 100
  const subtotal = round2(currentSale.total / 1.16)
  const iva = round2(currentSale.total - subtotal)
  const changeBreakdown = change > 0 ? calculateChangeBreakdown(change) : []
  const folioFormatted = folioLabel(currentSale).startsWith('#')
    ? `#VTA-${folioLabel(currentSale).replace('#', '')}`
    : folioLabel(currentSale)

  const handleSendWhatsApp = () => {
    const normalized = normalizePhone(phone)
    if (!normalized) {
      toast.error('Escribe el número de WhatsApp del cliente (10 dígitos)')
      return
    }
    saveClientPhone(phone)
    openWhatsAppText(currentSale, business, normalized)
    toast.success('Abriendo WhatsApp con el ticket redactado listo para enviar')
  }

  const handlePrint = () => {
    window.print()
  }

  const handleCopyText = async () => {
    try {
      const text = whatsappText(currentSale, business)
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast.success('Texto del ticket copiado al portapapeles')
      setTimeout(() => setCopied(false), 2200)
    } catch {
      toast.error('No se pudo copiar el texto al portapapeles')
    }
  }

  const handleNewSale = () => {
    onClose()
    setTimeout(() => {
      const searchEl = document.getElementById('pos-search') as HTMLInputElement | null
      if (searchEl) {
        searchEl.focus()
        searchEl.select()
      }
    }, 120)
    toast.success('Listo para registrar una nueva venta')
  }

  const handleSharePdf = async () => {
    setBusy(true)
    try {
      if (phone) saveClientPhone(phone)
      const res = await shareTicketPdf(currentSale, business)
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
      const name = await downloadTicketPdf(currentSale, business)
      toast.success(`PDF descargado: ${name}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo descargar el PDF')
    } finally {
      setBusy(false)
    }
  }

  const handleReturnSuccess = (updated: Sale) => {
    setCurrentSale(updated)
    onSaleUpdated?.(updated)
  }

  return (
    <>
      <Modal
        open={!!currentSale}
        onClose={onClose}
        title={`Comprobante de Venta ${folioFormatted}`}
        size="2xl"
      >
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
          {/* Columna Izquierda: Tarjeta Física Térmica de 80mm */}
          <div className="md:col-span-6 flex justify-center">
            <div
              id="thermal-receipt-printable"
              className="w-full max-w-[340px] rounded-2xl bg-white p-5 shadow-xl border border-zinc-200 text-zinc-950 font-mono text-xs select-text dark:bg-white dark:text-zinc-950 relative"
            >
              {/* Encabezado del Comercio */}
              <div className="text-center pb-2.5 border-b-2 border-dashed border-zinc-300">
                {business.logo ? (
                  <img
                    src={business.logo}
                    alt=""
                    className="mx-auto mb-2 h-12 max-w-[140px] object-contain"
                  />
                ) : (
                  <div className="text-2xl mb-1">🎨</div>
                )}
                <h3 className="font-mono font-black text-sm tracking-wider text-zinc-950 uppercase">
                  {business.name}
                </h3>
                {business.address?.trim() && (
                  <p className="text-[10.5px] text-zinc-600 mt-0.5 leading-snug">
                    {business.address}
                  </p>
                )}
                <div className="flex flex-wrap justify-center gap-x-2 text-[10px] text-zinc-500 mt-1">
                  {business.phone?.trim() && <span>Tel: {business.phone}</span>}
                  {(business.ownerName?.trim() || business.ownerPhone?.trim()) && (
                    <span>
                      · Sup: {[business.ownerName?.trim(), business.ownerPhone?.trim()].filter(Boolean).join(' ')}
                    </span>
                  )}
                </div>
              </div>

              {/* Folio, Fecha, Cajero y Cliente */}
              <div className="py-2.5 border-b border-dashed border-zinc-300 text-[11px] space-y-1">
                <div className="flex justify-between items-center font-bold">
                  <span>FOLIO: {folioFormatted}</span>
                  <span className="text-[10px] font-normal text-zinc-500">80mm TÉRMICO</span>
                </div>
                <div className="flex justify-between text-[10.5px] text-zinc-600">
                  <span>FECHA:</span>
                  <span>{formatTicketDate(currentSale.date)}</span>
                </div>
                <div className="flex justify-between text-[10.5px] text-zinc-600">
                  <span>CAJERO:</span>
                  <span>Caja 1 · Mostrador</span>
                </div>
                <div className="flex justify-between text-[10.5px] text-zinc-600 pt-0.5 border-t border-dotted border-zinc-200">
                  <span>CLIENTE:</span>
                  <span className="font-bold text-zinc-800 truncate max-w-[170px]">
                    {currentSale.customerName?.trim() || 'Público General'}
                  </span>
                </div>
                {currentSale.customerPhone?.trim() && (
                  <div className="flex justify-between text-[10px] text-zinc-500">
                    <span>TELÉFONO:</span>
                    <span>{currentSale.customerPhone.trim()}</span>
                  </div>
                )}
              </div>

              {/* Tabla Itemizada de Productos */}
              <div className="py-2.5 border-b border-dashed border-zinc-300">
                <table className="w-full text-[10.5px] font-mono tabular-nums border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-400 text-zinc-600 font-bold text-[9.5px]">
                      <th className="text-left pb-1">CANT</th>
                      <th className="text-left pb-1 pl-1">DESCRIPCIÓN</th>
                      <th className="text-right pb-1">P.U</th>
                      <th className="text-right pb-1">TOTAL</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dotted divide-zinc-200">
                    {currentSale.items.map((it, idx) => {
                      const displayQty = it.saleQty ?? it.qty
                      const displayUnit = it.saleUnit ?? it.unit
                      const displayPrice = displayQty > 0 ? round2(it.lineTotal / displayQty) : it.unitPrice
                      const returned = it.returnedQty ?? 0
                      return (
                        <tr key={`${it.productId}-${idx}`} className="align-top">
                          <td className="py-1 font-semibold text-zinc-800 whitespace-nowrap">
                            {formatQty(displayQty, displayUnit)}
                          </td>
                          <td className="py-1 pl-1 text-zinc-900 break-words pr-1">
                            <div>{it.name}</div>
                            {returned > 0 && (
                              <span className="text-[9px] text-red-600 font-bold">
                                (-{returned} devuelto)
                              </span>
                            )}
                          </td>
                          <td className="py-1 text-right text-zinc-600 whitespace-nowrap">
                            {formatMoney(displayPrice)}
                          </td>
                          <td className="py-1 text-right font-bold text-zinc-950 whitespace-nowrap">
                            {formatMoney(it.lineTotal)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Totales, Impuestos y Métodos de Pago */}
              <div className="pt-2.5 pb-2 border-b-2 border-dashed border-zinc-300 space-y-1 text-[11px] tabular-nums">
                <div className="flex justify-between text-zinc-600 text-[10.5px]">
                  <span>SUBTOTAL:</span>
                  <span>{formatMoney(subtotal)}</span>
                </div>
                <div className="flex justify-between text-zinc-600 text-[10.5px]">
                  <span>IVA (16%):</span>
                  <span>{formatMoney(iva)}</span>
                </div>
                <div className="flex justify-between items-center text-sm font-black pt-1 border-t border-zinc-300 text-zinc-950">
                  <span>TOTAL:</span>
                  <span className="text-base">{formatMoney(currentSale.total)}</span>
                </div>

                <div className="pt-1.5 space-y-0.5 text-[10.5px] text-zinc-700">
                  {currentSale.payments.map((p, i) => (
                    <div key={i} className="flex justify-between">
                      <span className="capitalize">{p.type === 'efectivo' ? 'Pago Efectivo' : p.type === 'tarjeta' ? 'Pago Tarjeta' : 'Pago Transferencia'}:</span>
                      <span className="font-semibold">{formatMoney(p.amount)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-zinc-600 font-medium">
                    <span>Total Recibido:</span>
                    <span>{formatMoney(paid)}</span>
                  </div>
                  {change > 0 && (
                    <div className="flex justify-between font-bold text-emerald-700 text-[11px]">
                      <span>CAMBIO ENTREGADO:</span>
                      <span>{formatMoney(change)}</span>
                    </div>
                  )}
                  {changeBreakdown.length > 0 && (
                    <div className="text-[9.5px] text-zinc-500 pt-0.5">
                      <span>Desglose: {changeBreakdown.map((b) => `${b.count}x ${b.label}`).join(', ')}</span>
                    </div>
                  )}
                </div>

                {currentSale.notes?.trim() && (
                  <p className="mt-2 text-[9.5px] text-zinc-600 bg-zinc-50 p-1.5 rounded border border-zinc-200">
                    <strong>Nota:</strong> {currentSale.notes}
                  </p>
                )}
              </div>

              {/* Pie con Código de Barras y Mensaje */}
              <div className="text-center pt-2">
                <p className="text-[10px] font-bold text-zinc-800 uppercase">
                  ¡Gracias por su compra!
                </p>
                <p className="text-[9px] text-zinc-500 mt-0.5">
                  Conserve este ticket para cualquier aclaración o garantía
                </p>
                {business.footer?.trim() && (
                  <p className="text-[9px] text-zinc-400 italic mt-0.5">{business.footer}</p>
                )}
                <ThermalBarcode value={folioFormatted} />
              </div>
            </div>
          </div>

          {/* Columna Derecha: Panel de Acciones Modernas */}
          <div className="md:col-span-6 space-y-3.5 no-print">
            {/* Input de WhatsApp Rápido */}
            <div className="rounded-2xl border border-slate-200/90 bg-slate-50/80 p-3.5 dark:border-slate-800 dark:bg-slate-900/60 space-y-2">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <MessageCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <span>Enviar Comprobante por WhatsApp</span>
              </label>
              <div className="flex gap-2">
                <Input
                  type="tel"
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="WhatsApp 10 dígitos (ej. 5512345678)"
                  maxLength={15}
                  className="text-xs bg-white dark:bg-slate-900"
                />
                <button
                  type="button"
                  onClick={handleSendWhatsApp}
                  disabled={busy}
                  className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition active:scale-95 shrink-0 flex items-center gap-1.5"
                  title="Abrir WhatsApp con el comprobante formateado"
                >
                  <MessageCircle className="h-4 w-4" />
                  <span>Enviar</span>
                </button>
              </div>
              <p className="text-[10.5px] text-slate-400">
                Envía el ticket redactado con formato profesional, negritas y emojis listo para enviar.
              </p>
            </div>

            {/* Botones de Acción Primarios */}
            <div className="space-y-2">
              {/* Imprimir Ticket Térmico 80mm */}
              <button
                type="button"
                onClick={handlePrint}
                className="w-full py-3 px-4 rounded-xl border border-slate-300/90 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-900 dark:text-white font-bold text-sm shadow-xs transition active:scale-98 flex items-center justify-center gap-2 cursor-pointer"
              >
                <Printer className="h-4.5 w-4.5 text-primary dark:text-emerald-400" />
                <span>Imprimir Ticket Térmico (80mm)</span>
              </button>

              {/* Copiar Texto al Portapapeles */}
              <button
                type="button"
                onClick={() => void handleCopyText()}
                className="w-full py-2.5 px-4 rounded-xl border border-slate-200/90 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-850 text-slate-700 dark:text-slate-300 font-semibold text-xs shadow-2xs transition active:scale-98 flex items-center justify-center gap-2"
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4 text-emerald-600" />
                    <span className="text-emerald-700 dark:text-emerald-400 font-bold">¡Texto Copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 text-slate-500" />
                    <span>Copiar Texto del Ticket al Portapapeles</span>
                  </>
                )}
              </button>

              {/* Compartir y Descargar PDF */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleSharePdf()}
                  className="py-2.5 px-3 rounded-xl border border-slate-200/90 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-850 text-slate-700 dark:text-slate-300 font-semibold text-xs shadow-2xs transition active:scale-98 flex items-center justify-center gap-1.5"
                >
                  <Share2 className="h-4 w-4 text-primary dark:text-emerald-400" />
                  <span>Compartir PDF</span>
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleDownload()}
                  className="py-2.5 px-3 rounded-xl border border-slate-200/90 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-850 text-slate-700 dark:text-slate-300 font-semibold text-xs shadow-2xs transition active:scale-98 flex items-center justify-center gap-1.5"
                >
                  <Download className="h-4 w-4 text-primary dark:text-emerald-400" />
                  <span>Descargar PDF</span>
                </button>
              </div>

              {/* Devolver Producto / Reembolso */}
              <button
                type="button"
                onClick={() => setReturnOpen(true)}
                className="w-full py-2.5 px-4 rounded-xl border border-amber-300/80 bg-amber-50/70 hover:bg-amber-100/80 dark:border-amber-800/80 dark:bg-amber-950/30 dark:hover:bg-amber-950/60 text-amber-900 dark:text-amber-300 font-bold text-xs transition active:scale-98 flex items-center justify-center gap-2"
              >
                <RotateCcw className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <span>Devolver Producto / Reembolso</span>
              </button>
            </div>

            {/* Botones de Cierre / Nueva Venta */}
            <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800 flex gap-2.5">
              <button
                type="button"
                onClick={handleNewSale}
                className="btn-accent flex-1 py-3 px-3 rounded-xl font-black text-sm flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/20 active:scale-98 transition"
              >
                <PlusCircle className="h-4.5 w-4.5" />
                <span>Nueva Venta</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="btn-secondary px-4 py-3 rounded-xl font-bold text-xs"
              >
                <X className="h-4 w-4 mr-1 inline" />
                Cerrar
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Modal Secundario de Devolución */}
      {returnOpen && (
        <ReturnModal
          sale={currentSale}
          onClose={() => setReturnOpen(false)}
          onSuccess={handleReturnSuccess}
        />
      )}
    </>
  )
}
