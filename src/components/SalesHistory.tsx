import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Clock,
  Download,
  History,
  MessageCircle,
  Receipt,
  Search,
  User,
  X,
} from 'lucide-react'
import { db } from '../db/db'
import type { Sale } from '../types'
import { folioLabel, formatTicketDate, openWhatsAppText, loadBusinessInfo, buildTicketPdf, downloadBlob } from '../lib/ticket'
import { formatMoney, matchesSearch, round2 } from '../lib/utils'
import { formatQty } from '../lib/units'
import { Button, EmptyState, Input } from './ui'
import { SaleNoteModal } from './SaleNoteModal'
import { toast } from 'sonner'

type DateFilter = 'hoy' | 'ayer' | 'semana' | 'mes' | 'todo'

interface SalesHistoryProps {
  onSelectSale?: (sale: Sale) => void
  compact?: boolean
}

export function SalesHistory({ compact = false }: SalesHistoryProps) {
  const [search, setSearch] = useState('')
  const [dateFilter, setDateFilter] = useState<DateFilter>('hoy')
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  const business = useMemo(() => loadBusinessInfo(), [])
  const sales = useLiveQuery(() => db.sales.orderBy('date').reverse().toArray(), []) ?? []

  // Calcular límites de fechas
  const { startTimestamp, endTimestamp } = useMemo(() => {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime()

    if (dateFilter === 'hoy') {
      return { startTimestamp: todayStart, endTimestamp: todayEnd }
    }
    if (dateFilter === 'ayer') {
      const yesterdayStart = todayStart - 86_400_000
      const yesterdayEnd = todayStart - 1
      return { startTimestamp: yesterdayStart, endTimestamp: yesterdayEnd }
    }
    if (dateFilter === 'semana') {
      const weekStart = todayStart - 6 * 86_400_000
      return { startTimestamp: weekStart, endTimestamp: todayEnd }
    }
    if (dateFilter === 'mes') {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
      return { startTimestamp: monthStart, endTimestamp: todayEnd }
    }
    return { startTimestamp: 0, endTimestamp: Number.MAX_SAFE_INTEGER }
  }, [dateFilter])

  // Filtrado de ventas
  const filteredSales = useMemo(() => {
    return sales.filter((s) => {
      // Filtro de fecha
      if (s.date < startTimestamp || s.date > endTimestamp) {
        return false
      }

      // Filtro de búsqueda flexible
      if (!search.trim()) return true

      const targets = [
        folioLabel(s),
        String(s.folio ?? ''),
        s.customerName ?? '',
        s.customerPhone ?? '',
        s.notes ?? '',
        ...s.items.map((i) => i.name),
      ]

      return matchesSearch(search, targets)
    })
  }, [sales, startTimestamp, endTimestamp, search])

  // Métricas del filtro actual
  const metrics = useMemo(() => {
    const totalAmount = round2(filteredSales.reduce((acc, s) => acc + s.total, 0))
    const totalItems = filteredSales.reduce(
      (acc, s) => acc + s.items.reduce((sum, it) => sum + (it.saleQty ?? it.qty), 0),
      0,
    )
    return {
      count: filteredSales.length,
      totalAmount,
      totalItems: round2(totalItems),
    }
  }, [filteredSales])

  const handleDownloadPdf = async (s: Sale, e: React.MouseEvent) => {
    e.stopPropagation()
    setDownloadingId(s.id)
    try {
      const { blob, fileName } = await buildTicketPdf(s, business)
      downloadBlob(blob, fileName)
      toast.success(`PDF descargado: ${fileName}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al generar PDF')
    } finally {
      setDownloadingId(null)
    }
  }

  const handleWhatsApp = (s: Sale, e: React.MouseEvent) => {
    e.stopPropagation()
    openWhatsAppText(s, business, s.customerPhone)
  }

  return (
    <div className="flex flex-col gap-3 min-h-0">
      {/* Controles de Búsqueda y Filtros de Fecha */}
      <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por folio (#42), cliente, producto vendido..."
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

        {/* Segmented de fecha */}
        <div className="flex items-center overflow-x-auto rounded-xl border border-slate-200 bg-slate-100/80 p-1 dark:border-slate-800 dark:bg-slate-900/80 shrink-0">
          {(
            [
              { key: 'hoy', label: 'Hoy' },
              { key: 'ayer', label: 'Ayer' },
              { key: 'semana', label: '7 días' },
              { key: 'mes', label: 'Mes' },
              { key: 'todo', label: 'Todo' },
            ] as const
          ).map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setDateFilter(item.key)}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                dateFilter === item.key
                  ? 'bg-white text-primary shadow-xs dark:bg-slate-800 dark:text-emerald-400'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Barra de Resumen / Evidencia */}
      <div className="flex items-center justify-between rounded-xl bg-slate-50 border border-slate-200/80 px-3.5 py-2 text-xs dark:bg-slate-900/60 dark:border-slate-800">
        <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
          <History className="h-4 w-4 text-primary dark:text-emerald-400" />
          <span>
            <strong>{metrics.count}</strong> {metrics.count === 1 ? 'nota encontrada' : 'notas encontradas'}
          </span>
          {dateFilter !== 'todo' && (
            <span className="text-[11px] text-slate-400 dark:text-slate-500">
              (Filtro: {dateFilter === 'hoy' ? 'Hoy' : dateFilter === 'ayer' ? 'Ayer' : dateFilter === 'semana' ? 'Últimos 7 días' : 'Este mes'})
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-100">
          <span className="text-slate-500 text-[11px] font-normal">Suma:</span>
          <span className="text-primary dark:text-emerald-400 tabular-nums font-display text-sm">
            {formatMoney(metrics.totalAmount)}
          </span>
        </div>
      </div>

      {/* Lista de Notas de Venta */}
      <div className={`space-y-2.5 overflow-y-auto overscroll-contain ${compact ? 'max-h-[60vh]' : 'flex-1'}`}>
        {filteredSales.length === 0 ? (
          <EmptyState
            icon={<Receipt className="h-7 w-7 text-slate-400" />}
            title="No se encontraron notas de venta"
            hint={
              search
                ? `No hay ninguna venta que coincida con "${search}" en este periodo.`
                : 'No se realizaron ventas en el periodo seleccionado.'
            }
          />
        ) : (
          filteredSales.map((s) => {
            const hasCard = s.payments.some((p) => p.type === 'tarjeta')
            const hasTransfer = s.payments.some((p) => p.type === 'transferencia')
            const hasCash = s.payments.some((p) => p.type === 'efectivo')
            const payTypes = [hasCash && 'Efectivo', hasCard && 'Tarjeta', hasTransfer && 'Transferencia']
              .filter(Boolean)
              .join(' + ')

            return (
              <div
                key={s.id}
                onClick={() => setSelectedSale(s)}
                className="group relative flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-2xs transition hover:border-primary/40 hover:shadow-xs dark:border-slate-800 dark:bg-slate-900/90 cursor-pointer"
              >
                {/* Columna Izquierda: Folio, Fecha, Cliente y Artículos */}
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display font-bold text-base text-primary dark:text-emerald-400">
                      {folioLabel(s)}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                      <Clock className="h-3 w-3 text-slate-400" />
                      {formatTicketDate(s.date)}
                    </span>
                    {s.customerName?.trim() ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300">
                        <User className="h-2.5 w-2.5" />
                        {s.customerName.trim()}
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-400 dark:text-slate-500 italic">
                        Mostrador (Público general)
                      </span>
                    )}
                  </div>

                  {/* Resumen de Artículos vendidos */}
                  <div className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
                    {s.items.map((it, idx) => (
                      <span key={idx} className="mr-2">
                        • {formatQty(it.saleQty ?? it.qty, it.saleUnit ?? it.unit)} {it.name}
                      </span>
                    ))}
                  </div>

                  {/* Pago y notas */}
                  <div className="flex flex-wrap items-center gap-2 pt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
                    <span>Pago: {payTypes || 'Efectivo'}</span>
                    {s.notes?.trim() && <span className="text-amber-600 dark:text-amber-400">Nota: {s.notes}</span>}
                  </div>
                </div>

                {/* Columna Derecha: Total e Interacción */}
                <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100 dark:border-slate-800 gap-2 shrink-0">
                  <div className="text-right">
                    <span className="font-display font-extrabold text-lg text-slate-900 dark:text-white tabular-nums">
                      {formatMoney(s.total)}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={(e) => handleWhatsApp(s, e)}
                      title="Enviar resumen por WhatsApp"
                      className="rounded-lg border border-emerald-200 bg-emerald-50 p-1.5 text-emerald-700 hover:bg-emerald-100 transition dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                    >
                      <MessageCircle className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => void handleDownloadPdf(s, e)}
                      disabled={downloadingId === s.id}
                      title="Descargar PDF de evidencia"
                      className="rounded-lg border border-slate-200 bg-slate-100 p-1.5 text-slate-700 hover:bg-slate-200 transition dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      <Download className="h-4 w-4" />
                    </button>
                    <Button
                      type="button"
                      className="btn-secondary h-8 px-2.5 text-xs font-semibold"
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedSale(s)
                      }}
                    >
                      Ver Nota
                    </Button>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Modal de Detalle de Nota Original */}
      <SaleNoteModal sale={selectedSale} onClose={() => setSelectedSale(null)} />
    </div>
  )
}
