import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Clock,
  Download,
  FileSpreadsheet,
  MessageCircle,
  Search,
  ShoppingCart,
  Trash2,
  User,
  X,
} from 'lucide-react'
import { db } from '../db/db'
import type { Quote } from '../types'
import { quoteFolioLabel, formatTicketDate, formatSimpleDate, openWhatsAppQuoteText, loadBusinessInfo, buildQuotePdf, downloadBlob } from '../lib/ticket'
import { formatMoney, matchesSearch } from '../lib/utils'
import { formatQty } from '../lib/units'
import { Button, EmptyState, Input } from './ui'
import { QuoteModal } from './QuoteModal'
import { deleteQuote } from '../db/repos'
import { toast } from 'sonner'

interface QuotesHistoryProps {
  onLoadQuoteToCart?: (quote: Quote) => void
  compact?: boolean
}

export function QuotesHistory({ onLoadQuoteToCart, compact = false }: QuotesHistoryProps) {
  const [search, setSearch] = useState('')
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  const business = useMemo(() => loadBusinessInfo(), [])
  const quotes = useLiveQuery(() => db.quotes.orderBy('date').reverse().toArray(), []) ?? []

  const filteredQuotes = useMemo(() => {
    if (!search.trim()) return quotes
    return quotes.filter((q) => {
      const targets = [
        quoteFolioLabel(q),
        String(q.folio ?? ''),
        q.customerName ?? '',
        q.customerPhone ?? '',
        q.notes ?? '',
        ...q.items.map((i) => i.name),
      ]
      return matchesSearch(search, targets)
    })
  }, [quotes, search])

  const handleDownloadPdf = async (q: Quote, e: React.MouseEvent) => {
    e.stopPropagation()
    setDownloadingId(q.id)
    try {
      const { blob, fileName } = await buildQuotePdf(q, business)
      downloadBlob(blob, fileName)
      toast.success(`PDF descargado: ${fileName}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al generar PDF')
    } finally {
      setDownloadingId(null)
    }
  }

  const handleWhatsApp = (q: Quote, e: React.MouseEvent) => {
    e.stopPropagation()
    openWhatsAppQuoteText(q, business, q.customerPhone)
  }

  const handleDelete = async (q: Quote, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm(`¿Eliminar la cotización ${quoteFolioLabel(q)}?`)) return
    try {
      await deleteQuote(q.id)
      toast.success('Cotización eliminada')
    } catch {
      toast.error('No se pudo eliminar')
    }
  }

  return (
    <div className="flex flex-col gap-3 min-h-0">
      {/* Buscador */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar cotización por cliente, folio (COT-1), producto..."
          className="pl-10 pr-9 bg-white/90 dark:bg-slate-900"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            aria-label="Limpiar búsqueda"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Resumen */}
      <div className="flex items-center justify-between rounded-xl bg-amber-50/60 border border-amber-200/80 px-3.5 py-2 text-xs dark:bg-amber-950/20 dark:border-amber-900/60 text-amber-900 dark:text-amber-300">
        <span className="font-medium">
          {filteredQuotes.length} {filteredQuotes.length === 1 ? 'cotización guardada' : 'cotizaciones guardadas'}
        </span>
        <span className="text-[11px] text-amber-700/80 dark:text-amber-400">
          Haz clic en cualquier cotización para verla o enviarla
        </span>
      </div>

      {/* Lista */}
      <div className={`space-y-2.5 overflow-y-auto overscroll-contain ${compact ? 'max-h-[60vh]' : 'flex-1'}`}>
        {filteredQuotes.length === 0 ? (
          <EmptyState
            icon={<FileSpreadsheet className="h-7 w-7 text-amber-500" />}
            title="No hay cotizaciones registradas"
            hint={
              search
                ? `No se encontró ninguna cotización con "${search}".`
                : 'Crea una cotización en el punto de venta agregando productos al carrito y tocando "Cotizar".'
            }
          />
        ) : (
          filteredQuotes.map((q) => {
            const isExpired = q.validUntil ? q.validUntil < Date.now() : false
            return (
              <div
                key={q.id}
                onClick={() => setSelectedQuote(q)}
                className="group relative flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-2xs transition hover:border-amber-400 hover:shadow-xs dark:border-slate-800 dark:bg-slate-900/90 cursor-pointer"
              >
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display font-bold text-base text-amber-700 dark:text-amber-400">
                      {quoteFolioLabel(q)}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                      <Clock className="h-3 w-3 text-slate-400" />
                      {formatTicketDate(q.date)}
                    </span>
                    {q.validUntil && (
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                          isExpired
                            ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300'
                        }`}
                      >
                        {isExpired ? 'Vencida' : `Válida hasta ${formatSimpleDate(q.validUntil)}`}
                      </span>
                    )}
                    {q.customerName?.trim() && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 border border-slate-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300">
                        <User className="h-2.5 w-2.5" />
                        {q.customerName.trim()}
                      </span>
                    )}
                  </div>

                  <div className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
                    {q.items.map((it, idx) => (
                      <span key={idx} className="mr-2">
                        • {formatQty(it.saleQty ?? it.qty, it.saleUnit ?? it.unit)} {it.name}
                      </span>
                    ))}
                  </div>

                  {q.notes?.trim() && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400 pt-0.5">Nota: {q.notes}</p>
                  )}
                </div>

                <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100 dark:border-slate-800 gap-2 shrink-0">
                  <div className="text-right">
                    <span className="font-display font-extrabold text-lg text-amber-800 dark:text-amber-300 tabular-nums">
                      {formatMoney(q.total)}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {onLoadQuoteToCart && (
                      <Button
                        type="button"
                        className="btn-primary h-8 px-2.5 text-xs font-semibold"
                        onClick={(e) => {
                          e.stopPropagation()
                          onLoadQuoteToCart(q)
                        }}
                        title="Cargar productos de esta cotización al carrito"
                      >
                        <ShoppingCart className="mr-1 inline h-3.5 w-3.5" />
                        Vender
                      </Button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => handleWhatsApp(q, e)}
                      title="Enviar cotización por WhatsApp"
                      className="rounded-lg border border-emerald-200 bg-emerald-50 p-1.5 text-emerald-700 hover:bg-emerald-100 transition dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                    >
                      <MessageCircle className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => void handleDownloadPdf(q, e)}
                      disabled={downloadingId === q.id}
                      title="Descargar PDF"
                      className="rounded-lg border border-slate-200 bg-slate-100 p-1.5 text-slate-700 hover:bg-slate-200 transition dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      <Download className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => void handleDelete(q, e)}
                      title="Eliminar cotización"
                      className="rounded-lg border border-rose-200 bg-rose-50 p-1.5 text-rose-600 hover:bg-rose-100 transition dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      <QuoteModal
        quote={selectedQuote}
        onClose={() => setSelectedQuote(null)}
        onConvertToSale={onLoadQuoteToCart ? (q) => {
          setSelectedQuote(null)
          onLoadQuoteToCart(q)
        } : undefined}
      />
    </div>
  )
}
