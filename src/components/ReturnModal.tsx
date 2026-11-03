import { useState } from 'react'
import { AlertCircle, Banknote, RotateCcw, X } from 'lucide-react'
import { toast } from 'sonner'
import type { Sale } from '../types'
import { returnSaleItem } from '../db/repos'
import { folioLabel } from '../lib/ticket'
import { formatMoney, round2 } from '../lib/utils'
import { formatQty, UNIT_LABELS } from '../lib/units'
import { Button, Field, Input, Modal } from './ui'

interface ReturnModalProps {
  sale: Sale | null
  onClose: () => void
  onSuccess?: (updatedSale: Sale) => void
}

const COMMON_REASONS = [
  'Defecto o daño de fábrica',
  'Color o tono incorrecto',
  'Error de compra del cliente',
  'Sobrante de obra o proyecto',
  'Cambio de producto',
  'Otro motivo',
]

export function ReturnModal({ sale, onClose, onSuccess }: ReturnModalProps) {
  const [selectedItemIdx, setSelectedItemIdx] = useState<number>(0)
  const [qtyToReturn, setQtyToReturn] = useState<string>('1')
  const [reason, setReason] = useState<string>(COMMON_REASONS[0])
  const [customReason, setCustomReason] = useState<string>('')
  const [refundCash, setRefundCash] = useState<boolean>(true)
  const [customRefundAmount, setCustomRefundAmount] = useState<string>('')
  const [busy, setBusy] = useState<boolean>(false)

  if (!sale) return null

  const item = sale.items[selectedItemIdx] ?? sale.items[0]
  if (!item) return null

  const totalSold = item.saleQty ?? item.qty
  const returnedSoFar = item.returnedQty ?? 0
  const availableToReturn = round2(Math.max(0, totalSold - returnedSoFar))

  // Cálculo proporcional del precio unitario y reembolso sugerido
  const unitPrice = totalSold > 0 ? round2(item.lineTotal / totalSold) : item.unitPrice
  const parsedQty = parseFloat(qtyToReturn) || 0
  const suggestedRefund = round2(Math.min(availableToReturn, Math.max(0, parsedQty)) * unitPrice)

  const effectiveRefundAmount = customRefundAmount !== '' ? (parseFloat(customRefundAmount) || 0) : suggestedRefund

  const handleConfirmReturn = async () => {
    if (availableToReturn <= 0) {
      toast.error('Este producto ya fue devuelto en su totalidad')
      return
    }

    if (parsedQty <= 0) {
      toast.error('Indica una cantidad a devolver mayor a 0')
      return
    }

    if (parsedQty > availableToReturn + 1e-4) {
      toast.error(`Solo puedes devolver hasta ${availableToReturn} ${item.saleUnit ?? item.unit}(s)`)
      return
    }

    const finalReason = reason === 'Otro motivo' ? (customReason.trim() || 'Otro motivo') : reason

    setBusy(true)
    try {
      const res = await returnSaleItem({
        saleId: sale.id,
        itemIndex: selectedItemIdx,
        qtyToReturn: parsedQty,
        reason: finalReason,
        refundCash,
        refundAmount: refundCash ? effectiveRefundAmount : undefined,
      })

      toast.success(
        `Devolución registrada: ${parsedQty} ${item.saleUnit ?? item.unit}(s) de ${item.name} reintegrados al inventario`,
      )
      if (refundCash && effectiveRefundAmount > 0) {
        toast.info(`Egreso de caja registrado: ${formatMoney(effectiveRefundAmount)}`)
      }

      onSuccess?.(res.sale)
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al procesar la devolución')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={!!sale}
      onClose={onClose}
      title={`Devolución / Reembolso - Nota ${folioLabel(sale)}`}
      size="md"
    >
      <div className="flex flex-col gap-4 text-xs text-slate-800 dark:text-slate-200">
        {/* Banner informativo de la venta */}
        <div className="rounded-xl border border-slate-200/90 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-900/60">
          <div className="flex items-center justify-between">
            <span className="font-bold text-primary dark:text-emerald-400 text-sm">
              Nota {folioLabel(sale)}
            </span>
            <span className="text-slate-500 font-medium">
              Cliente: {sale.customerName?.trim() || 'Público general'}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            El producto devuelto regresará al stock y se creará una entrada de kardex y comprobante de devolución.
          </p>
        </div>

        {/* 1. Selección de Producto a Devolver */}
        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
            Selecciona el producto a devolver:
          </label>
          <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
            {sale.items.map((it, idx) => {
              const maxIt = it.saleQty ?? it.qty
              const retIt = it.returnedQty ?? 0
              const availIt = round2(Math.max(0, maxIt - retIt))
              const isSelected = selectedItemIdx === idx

              return (
                <button
                  key={`${it.productId}-${idx}`}
                  type="button"
                  onClick={() => {
                    setSelectedItemIdx(idx)
                    setQtyToReturn(availIt > 0 ? '1' : '0')
                    setCustomRefundAmount('')
                  }}
                  className={`w-full text-left rounded-xl border p-2.5 transition flex items-center justify-between gap-2 ${
                    isSelected
                      ? 'border-primary bg-primary/5 ring-1 ring-primary/30 dark:border-emerald-500 dark:bg-emerald-950/20'
                      : 'border-slate-200/80 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/50'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-xs truncate text-slate-800 dark:text-slate-200">
                      {it.name}
                    </p>
                    <p className="text-[10.5px] text-slate-400">
                      Vendido: {formatQty(maxIt, it.saleUnit ?? it.unit)} · Precio: {formatMoney(unitPrice)}
                      {retIt > 0 && (
                        <span className="ml-1 font-semibold text-amber-600 dark:text-amber-400">
                          (Ya devueltos: {retIt})
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span
                      className={`inline-block rounded-md px-2 py-0.5 text-[10.5px] font-bold ${
                        availIt > 0
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300'
                          : 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/40 dark:border-red-800 dark:text-red-300'
                      }`}
                    >
                      {availIt > 0 ? `Devolución disp: ${availIt}` : 'Devuelto total'}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {availableToReturn <= 0 ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>Todos los artículos de este producto ya han sido devueltos.</span>
          </div>
        ) : (
          <>
            {/* 2. Cantidad a devolver */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field
                label={`Cantidad a devolver (máx: ${availableToReturn} ${UNIT_LABELS[item.saleUnit ?? item.unit] ?? item.saleUnit ?? item.unit})`}
              >
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min="0.01"
                    max={availableToReturn}
                    value={qtyToReturn}
                    onChange={(e) => {
                      setQtyToReturn(e.target.value)
                      setCustomRefundAmount('')
                    }}
                    className="font-bold text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setQtyToReturn(String(availableToReturn))
                      setCustomRefundAmount('')
                    }}
                    className="rounded-lg border border-slate-200 bg-slate-100 px-2.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200 shrink-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    Todo ({availableToReturn})
                  </button>
                </div>
              </Field>

              {/* 3. Motivo de Devolución */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Motivo de devolución:
                </label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full rounded-xl border border-slate-200/90 bg-white px-3 py-2 text-xs font-medium dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  {COMMON_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {reason === 'Otro motivo' && (
              <Field label="Especifica el motivo de la devolución">
                <Input
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  placeholder="Ej: Cliente compró por error el acabado brillante en lugar de mate"
                />
              </Field>
            )}

            {/* 4. Opciones de Reembolso de Dinero en Efectivo */}
            <div className="rounded-xl border border-slate-200/90 bg-white/70 p-3.5 space-y-2 dark:border-slate-800 dark:bg-slate-900/60">
              <label className="flex items-center gap-2 cursor-pointer font-bold text-xs text-slate-800 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={refundCash}
                  onChange={(e) => setRefundCash(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary dark:border-slate-600"
                />
                <span className="flex items-center gap-1.5">
                  <Banknote className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  ¿Reembolsar dinero de caja en efectivo?
                </span>
              </label>

              {refundCash && (
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Monto sugerido por {parsedQty} {item.saleUnit ?? item.unit}(s):{' '}
                    <strong className="text-slate-800 dark:text-slate-100 tabular-nums">
                      {formatMoney(suggestedRefund)}
                    </strong>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-400 font-medium">$</span>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={customRefundAmount !== '' ? customRefundAmount : String(suggestedRefund)}
                      onChange={(e) => setCustomRefundAmount(e.target.value)}
                      className="w-28 text-right font-bold tabular-nums text-xs"
                      placeholder="0.00"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Acciones */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <Button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
                <X className="mr-1 inline h-4 w-4" />
                Cancelar
              </Button>
              <Button
                type="button"
                className="btn-primary font-bold shadow-sm"
                onClick={() => void handleConfirmReturn()}
                disabled={busy || parsedQty <= 0}
              >
                <RotateCcw className="mr-1.5 inline h-4 w-4" />
                {busy ? 'Procesando...' : 'Confirmar Devolución'}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
