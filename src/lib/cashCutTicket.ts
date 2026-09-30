import { jsPDF } from 'jspdf'
import type { BusinessInfo, CashShift } from '../types'
import type { ShiftMetrics } from '../db/repos'
import { formatMoney } from './utils'
import { downloadBlob, loadBusinessInfo } from './ticket'

const BRAND = [23, 74, 59] // #174a3b pine green
const DARK = [15, 23, 42]
const GRAY = [100, 116, 139]
const DANGER = [185, 28, 28]
const SUCCESS = [22, 101, 52]

export async function generateCashCutPdf(
  shift: CashShift,
  metrics: ShiftMetrics,
  isClosing: boolean,
  businessInfo?: BusinessInfo,
): Promise<{ blob: Blob; fileName: string }> {
  const business = businessInfo ?? loadBusinessInfo()
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [80, 297], // 80mm ancho tirilla estándar
  })

  const PW = 80
  const M = 4
  const RIGHT = PW - M

  const style = (size: number, bold: boolean, color: number[] = DARK) => {
    doc.setFontSize(size)
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setTextColor(color[0], color[1], color[2])
  }

  const lineH = (size: number) => size * 0.42

  const sep = (yPos: number, dashed = true) => {
    doc.setDrawColor(200, 205, 215)
    doc.setLineWidth(0.3)
    if (dashed) {
      doc.setLineDashPattern([1.5, 1], 0)
    } else {
      doc.setLineDashPattern([], 0)
    }
    doc.line(M, yPos, RIGHT, yPos)
  }

  let y = 10

  // Encabezado
  style(12, true, BRAND)
  doc.text(business.name.toUpperCase(), PW / 2, y, { align: 'center' })
  y += lineH(12) + 1

  if (business.address) {
    style(8, false, GRAY)
    doc.text(business.address, PW / 2, y, { align: 'center' })
    y += lineH(8) + 1
  }

  y += 2
  sep(y, false)
  y += 5

  // Título del corte
  style(13, true, isClosing ? DANGER : BRAND)
  const cutTitle = isClosing ? 'CORTE Z — CIERRE DE TURNO' : 'CORTE X — PARCIAL DE TURNO'
  doc.text(cutTitle, PW / 2, y, { align: 'center' })
  y += lineH(13) + 2

  style(8, false, GRAY)
  const printDate = new Date().toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  doc.text(`Impreso: ${printDate}`, PW / 2, y, { align: 'center' })
  y += lineH(8) + 3

  sep(y)
  y += 5

  // Datos del turno
  style(8, false, DARK)
  doc.text('Apertura:', M, y)
  doc.text(new Date(shift.openedAt).toLocaleString('es-MX', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }), RIGHT, y, { align: 'right' })
  y += lineH(8) + 2

  if (shift.closedAt) {
    doc.text('Cierre:', M, y)
    doc.text(new Date(shift.closedAt).toLocaleString('es-MX', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }), RIGHT, y, { align: 'right' })
    y += lineH(8) + 2
  }

  if (shift.openedBy || shift.closedBy) {
    doc.text('Cajero / Responsable:', M, y)
    doc.text(shift.closedBy || shift.openedBy || 'General', RIGHT, y, { align: 'right' })
    y += lineH(8) + 2
  }

  y += 2
  sep(y)
  y += 5

  // SECCIÓN: VENTAS POR MÉTODO DE PAGO
  style(9, true, BRAND)
  doc.text('VENTAS EN EL TURNO', M, y)
  doc.text(`(${metrics.salesCount} tickets)`, RIGHT, y, { align: 'right' })
  y += lineH(9) + 3

  style(8, false, DARK)
  doc.text('💵 Efectivo en mostrador:', M, y)
  doc.text(formatMoney(metrics.cashSales), RIGHT, y, { align: 'right' })
  y += lineH(8) + 2

  doc.text('💳 Tarjeta / Terminal:', M, y)
  doc.text(formatMoney(metrics.cardSales), RIGHT, y, { align: 'right' })
  y += lineH(8) + 2

  doc.text('📱 Transferencia / SPEI:', M, y)
  doc.text(formatMoney(metrics.transferSales), RIGHT, y, { align: 'right' })
  y += lineH(8) + 3

  style(9, true, DARK)
  doc.text('TOTAL VENTAS:', M, y)
  doc.text(formatMoney(metrics.totalSales), RIGHT, y, { align: 'right' })
  y += lineH(9) + 4

  sep(y)
  y += 5

  // SECCIÓN: MOVIMIENTOS DE CAJA CHICA
  style(9, true, BRAND)
  doc.text('FLUJO DE EFECTIVO (CAJÓN)', M, y)
  y += lineH(9) + 3

  style(8, false, DARK)
  doc.text('Fondo inicial de apertura:', M, y)
  doc.text(formatMoney(shift.initialCash), RIGHT, y, { align: 'right' })
  y += lineH(8) + 2

  doc.text('+ Ventas en efectivo:', M, y)
  doc.text(`+${formatMoney(metrics.cashSales)}`, RIGHT, y, { align: 'right' })
  y += lineH(8) + 2

  if (metrics.incomesCash > 0) {
    doc.text('+ Ingresos adicionales:', M, y)
    doc.text(`+${formatMoney(metrics.incomesCash)}`, RIGHT, y, { align: 'right' })
    y += lineH(8) + 2
  }

  if (metrics.expensesOperativos > 0) {
    doc.text('− Gastos operativos:', M, y)
    doc.text(`−${formatMoney(metrics.expensesOperativos)}`, RIGHT, y, { align: 'right' })
    y += lineH(8) + 2
  }

  if (metrics.expensesProveedores > 0) {
    doc.text('− Pago a proveedores:', M, y)
    doc.text(`−${formatMoney(metrics.expensesProveedores)}`, RIGHT, y, { align: 'right' })
    y += lineH(8) + 2
  }

  if (metrics.expensesRetiroSeguro > 0) {
    doc.text('− Retiro de efectivo seguro:', M, y)
    doc.text(`−${formatMoney(metrics.expensesRetiroSeguro)}`, RIGHT, y, { align: 'right' })
    y += lineH(8) + 2
  }

  y += 2
  style(10, true, BRAND)
  doc.text('EFECTIVO ESPERADO EN CAJA:', M, y)
  y += lineH(10) + 1
  style(13, true, BRAND)
  doc.text(formatMoney(metrics.expectedCash), RIGHT, y, { align: 'right' })
  y += lineH(13) + 4

  // ARQUEO CIEGO (si es corte Z)
  if (isClosing && shift.actualCash !== undefined) {
    sep(y, false)
    y += 5

    style(9, true, DARK)
    doc.text('ARQUEO FÍSICO CONTADO', M, y)
    y += lineH(9) + 2

    style(8, false, DARK)
    doc.text('Dinero físico en cajón:', M, y)
    style(10, true, DARK)
    doc.text(formatMoney(shift.actualCash), RIGHT, y, { align: 'right' })
    y += lineH(10) + 3

    const diff = shift.difference ?? round2(shift.actualCash - metrics.expectedCash)
    const diffColor = diff === 0 ? SUCCESS : diff > 0 ? SUCCESS : DANGER
    const diffLabel = diff === 0 ? 'Exacto (Sin diferencia)' : diff > 0 ? 'SOBRANTE (+)' : 'FALTANTE (−)'

    style(9, true, diffColor)
    doc.text(`Diferencia: ${diffLabel}`, M, y)
    doc.text(formatMoney(Math.abs(diff)), RIGHT, y, { align: 'right' })
    y += lineH(9) + 4

    if (shift.notes) {
      style(8, false, GRAY)
      doc.text(`Notas: ${shift.notes}`, M, y, { maxWidth: PW - 2 * M })
      y += lineH(8) * 2 + 2
    }
  }

  y += 12
  // Firmas
  doc.setDrawColor(180, 185, 195)
  doc.setLineDashPattern([], 0)
  doc.line(M + 6, y, RIGHT - 6, y)
  y += 4
  style(8, false, GRAY)
  doc.text('Firma de Cajero / Encargado', PW / 2, y, { align: 'center' })

  // Ajustar altura de página exacta si es necesario
  const fileName = `corte_${isClosing ? 'Z_cierre' : 'X_parcial'}_${new Date().toISOString().slice(0, 10)}.pdf`
  const blob = doc.output('blob')
  return { blob, fileName }
}

export async function downloadCashCutPdf(
  shift: CashShift,
  metrics: ShiftMetrics,
  isClosing: boolean,
): Promise<string> {
  const { blob, fileName } = await generateCashCutPdf(shift, metrics, isClosing)
  downloadBlob(blob, fileName)
  return fileName
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
