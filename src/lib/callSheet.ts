import jsPDF from 'jspdf'
import type { BusinessInfo, Product, Supplier } from '../types'
import type { RestockSuggestion } from '../db/repos'
import { formatMoney, round2 } from './utils'
import { formatQty } from './units'
import { normalizePhone } from './ticket'

export interface CallSheetItem {
  product: Product
  qty: number
  cost: number
  suggestion?: RestockSuggestion
}

export interface CallSheetGroup {
  supplier?: Supplier
  supplierName: string
  supplierContact?: string
  supplierPhone?: string
  leadTimeDays?: number
  items: CallSheetItem[]
  totalEstimated: number
}

/**
 * Genera el texto estructurado de WhatsApp especialmente diseñado para que el dueño(a)
 * tenga abierta la lista en su celular mientras realiza la llamada telefónica con el proveedor.
 */
export function generateOwnerCallText(
  group: CallSheetGroup,
  business: BusinessInfo,
  allGroupsTotal?: number,
): string {
  const dateStr = new Date().toLocaleDateString('es-MX', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

  const lines: string[] = []
  lines.push(`📞 *HOJA DE LLAMADA / PEDIDO — ${business.name.toUpperCase()}*`)
  lines.push(`📅 *Fecha:* ${dateStr}`)
  if (business.ownerName) lines.push(`👤 *Para:* ${business.ownerName}`)
  lines.push(`🚚 *Proveedor:* ${group.supplierName.toUpperCase()}`)

  if (group.supplierContact || group.supplierPhone) {
    const contactParts: string[] = []
    if (group.supplierContact) contactParts.push(`Agente: ${group.supplierContact}`)
    if (group.supplierPhone) contactParts.push(`Tel: ${group.supplierPhone}`)
    lines.push(`📞 *Contacto proveedor:* ${contactParts.join(' | ')}`)
  }

  if (group.leadTimeDays) {
    lines.push(`⏳ *Tiempo de entrega:* ${group.leadTimeDays} días`)
  }

  lines.push(`─────────────────────────`)
  lines.push(`📦 *PRODUCTOS A SOLICITAR:*`)

  group.items.forEach((it, idx) => {
    const p = it.product
    const s = it.suggestion
    const stockStr = formatQty(p.stock, p.unit)
    const orderQtyStr = formatQty(it.qty, p.unit)
    const costStr = formatMoney(it.cost)

    let badge = ''
    if (p.stock <= 0) badge = ' 🚨 [AGOTADO]'
    else if (s?.isTopSeller) badge = ' 🔥 [MÁS VENDIDO]'
    else if (p.stock <= p.minStock) badge = ' ⚠️ [STOCK BAJO]'

    lines.push(``)
    lines.push(`${idx + 1}. *${p.name}*${badge}`)
    lines.push(`   👉 *Pedir:* ${orderQtyStr}`)
    lines.push(`   📊 *Stock actual en tienda:* ${stockStr}`)
    lines.push(`   💲 *Último costo:* ${costStr} c/u`)

    if (p.purchaseCode) {
      lines.push(`   🏷️ *Cód. Proveedor:* ${p.purchaseCode}`)
    } else if (p.barcode) {
      lines.push(`   🏷️ *Código:* ${p.barcode}`)
    }
  })

  lines.push(``)
  lines.push(`─────────────────────────`)
  lines.push(`💰 *TOTAL ESTIMADO ${group.supplierName.toUpperCase()}:* ${formatMoney(group.totalEstimated)}`)

  if (allGroupsTotal && allGroupsTotal > group.totalEstimated) {
    lines.push(`💼 *Total global de compras en tienda:* ${formatMoney(allGroupsTotal)}`)
  }

  lines.push(``)
  lines.push(`_Nota: Revisa con el vendedor si respeta el último costo registrado antes de autorizar el pedido._`)

  return lines.join('\n')
}

/**
 * Abre directamente WhatsApp con el número del dueño(a) (o abre selector si no está configurado)
 * con la hoja de llamada formateada.
 */
export function openOwnerCallWhatsApp(
  group: CallSheetGroup,
  business: BusinessInfo,
  allGroupsTotal?: number,
): void {
  const text = generateOwnerCallText(group, business, allGroupsTotal)
  const phone = business.ownerPhone ? normalizePhone(business.ownerPhone) : null

  if (phone) {
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
    window.open(url, '_blank')
  } else {
    // Si no tiene teléfono configurado, usa el enlace general de WhatsApp para compartir
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`
    window.open(url, '_blank')
  }
}

/**
 * Genera un PDF membretado "Hoja de Llamada y Orden de Compra" listo para imprimir
 * o tener abierto en pantalla durante la llamada telefónica.
 */
export async function downloadOwnerCallSheetPdf(
  group: CallSheetGroup,
  business: BusinessInfo,
): Promise<void> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  const margin = 14
  const pageWidth = 210
  let y = margin

  // Encabezado
  doc.setFillColor(30, 41, 59) // Slate 800
  doc.rect(margin, y, pageWidth - margin * 2, 22, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text(business.name.toUpperCase(), margin + 6, y + 9)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text('HOJA DE LLAMADA / RESURTIDO DE PROVEEDOR', margin + 6, y + 16)

  const dateStr = new Date().toLocaleDateString('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
  doc.text(`Fecha: ${dateStr}`, pageWidth - margin - 35, y + 9)
  y += 28

  // Cuadro de información del Proveedor
  doc.setDrawColor(226, 232, 240)
  doc.setFillColor(248, 250, 252)
  doc.roundedRect(margin, y, pageWidth - margin * 2, 24, 2, 2, 'FD')

  doc.setTextColor(15, 23, 42)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text(`Proveedor: ${group.supplierName}`, margin + 5, y + 7)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(71, 85, 105)

  const agentLine = group.supplierContact ? `Agente / Vendedor: ${group.supplierContact}` : 'Agente: No registrado'
  const telLine = group.supplierPhone ? `Tel: ${group.supplierPhone}` : ''
  doc.text(`${agentLine}  ${telLine ? `|  ${telLine}` : ''}`, margin + 5, y + 13)

  const leadLine = group.leadTimeDays ? `Plazo de entrega promedio: ${group.leadTimeDays} días` : 'Plazo de entrega: No especificado'
  doc.text(leadLine, margin + 5, y + 19)

  y += 30

  // Tabla de Productos
  doc.setFillColor(241, 245, 249)
  doc.rect(margin, y, pageWidth - margin * 2, 8, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(30, 41, 59)

  doc.text('#', margin + 2, y + 5.5)
  doc.text('CÓDIGO', margin + 8, y + 5.5)
  doc.text('PRODUCTO', margin + 35, y + 5.5)
  doc.text('STOCK ACTUAL', margin + 98, y + 5.5)
  doc.text('PEDIR', margin + 125, y + 5.5)
  doc.text('ÚLT. COSTO', margin + 145, y + 5.5)
  doc.text('IMPORTE', margin + 168, y + 5.5)

  y += 10

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)

  group.items.forEach((it, idx) => {
    // Si se acaba la página, nueva página
    if (y > 265) {
      doc.addPage()
      y = margin
    }

    const p = it.product
    const code = p.purchaseCode || p.barcode || '--'
    const nameTruncated = p.name.length > 34 ? `${p.name.slice(0, 32)}…` : p.name

    doc.setTextColor(71, 85, 105)
    doc.text(String(idx + 1), margin + 2, y + 4)
    doc.text(code, margin + 8, y + 4)

    doc.setTextColor(15, 23, 42)
    doc.setFont('helvetica', 'bold')
    doc.text(nameTruncated, margin + 35, y + 4)
    doc.setFont('helvetica', 'normal')

    // Stock actual con alerta si está en cero
    if (p.stock <= 0) {
      doc.setTextColor(220, 38, 38)
      doc.text('AGOTADO (0)', margin + 98, y + 4)
    } else {
      doc.setTextColor(71, 85, 105)
      doc.text(formatQty(p.stock, p.unit), margin + 98, y + 4)
    }

    doc.setTextColor(15, 23, 42)
    doc.setFont('helvetica', 'bold')
    doc.text(formatQty(it.qty, p.unit), margin + 125, y + 4)
    doc.setFont('helvetica', 'normal')

    doc.setTextColor(71, 85, 105)
    doc.text(formatMoney(it.cost), margin + 145, y + 4)

    doc.setTextColor(15, 23, 42)
    doc.text(formatMoney(round2(it.qty * it.cost)), margin + 168, y + 4)

    // Línea separadora tenue
    doc.setDrawColor(241, 245, 249)
    doc.line(margin, y + 6.5, pageWidth - margin, y + 6.5)
    y += 7.5
  })

  y += 4
  // Total
  doc.setFillColor(248, 250, 252)
  doc.rect(margin + 110, y, pageWidth - margin - 110, 10, 'F')
  doc.setDrawColor(203, 213, 225)
  doc.rect(margin + 110, y, pageWidth - margin - 110, 10, 'S')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(15, 23, 42)
  doc.text('TOTAL ESTIMADO:', margin + 115, y + 6.5)
  doc.text(formatMoney(group.totalEstimated), margin + 165, y + 6.5)

  y += 20
  // Caja de Notas para la Llamada
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(100, 116, 139)
  doc.text('ANOTACIONES DE LA LLAMADA (Precios negociados, fecha de entrega acordada):', margin, y)
  y += 3
  doc.setDrawColor(203, 213, 225)
  doc.rect(margin, y, pageWidth - margin * 2, 22)

  doc.save(`hoja-llamada-${group.supplierName.toLowerCase().replace(/\s+/g, '-')}-${dateStr}.pdf`)
}
