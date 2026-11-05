import type { BusinessInfo, Quote, Sale } from '../types'
import { formatMoney, round2, calculateChangeBreakdown } from './utils'
import { formatQty } from './units'

const BUSINESS_KEY = 'pos_business'
const CLIENT_PHONE_KEY = 'pos_cliente_phone'

export const DEFAULT_BUSINESS: BusinessInfo = {
  name: 'Pinturas POS',
  bucketCardSurchargeEnabled: true,
  bucketCardSurchargeType: 'fixed',
  bucketCardSurchargeAmount: 50,
}

export function loadBusinessInfo(): BusinessInfo {
  try {
    const raw = localStorage.getItem(BUSINESS_KEY)
    if (!raw) return DEFAULT_BUSINESS
    const parsed = JSON.parse(raw) as Partial<BusinessInfo>
    return {
      ...DEFAULT_BUSINESS,
      ...parsed,
      name: parsed.name?.trim() || DEFAULT_BUSINESS.name,
    }
  } catch {
    return DEFAULT_BUSINESS
  }
}

export function saveBusinessInfo(info: BusinessInfo): void {
  localStorage.setItem(BUSINESS_KEY, JSON.stringify(info))
}

export function loadClientPhone(): string {
  return localStorage.getItem(CLIENT_PHONE_KEY) ?? ''
}

export function saveClientPhone(phone: string): void {
  localStorage.setItem(CLIENT_PHONE_KEY, phone.trim())
}

/** Deja solo dígitos; si tiene 10 dígitos asume México y agrega 52. */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  if (!digits) return null
  if (digits.length === 10) return `52${digits}`
  if (digits.length >= 8) return digits
  return null
}

export function folioLabel(sale: Sale): string {
  return sale.folio ? `#${String(sale.folio).padStart(4, '0')}` : `#${sale.id.slice(0, 6).toUpperCase()}`
}

export function quoteFolioLabel(quote: Quote): string {
  return quote.folio ? `COT-#${String(quote.folio).padStart(4, '0')}` : `COT-#${quote.id.slice(0, 6).toUpperCase()}`
}

export function ticketFileName(sale: Sale): string {
  const d = new Date(sale.date)
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  return `nota-${sale.folio ?? sale.id.slice(0, 6)}-${ymd}.pdf`
}

export function quoteFileName(quote: Quote): string {
  const d = new Date(quote.date)
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  return `cotizacion-${quote.folio ?? quote.id.slice(0, 6)}-${ymd}.pdf`
}

export function formatTicketDate(date: number): string {
  return new Date(date).toLocaleString('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

export function formatSimpleDate(date: number): string {
  return new Date(date).toLocaleDateString('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

// ─── GENERACIÓN DE TEXTO PARA WHATSAPP ────────────────────────────────────────

export function whatsappText(sale: Sale, business: BusinessInfo): string {
  const lines: string[] = []
  lines.push(`🎨 *${business.name}*`)
  if (business.address?.trim()) {
    lines.push(`📍 ${business.address.trim()}`)
  }
  lines.push(`🧾 *Nota de Venta ${folioLabel(sale)}*`)
  lines.push(`📅 ${formatTicketDate(sale.date)}`)

  if (sale.customerName?.trim()) {
    const ph = sale.customerPhone?.trim() ? ` (${sale.customerPhone.trim()})` : ''
    lines.push(`👤 Cliente: *${sale.customerName.trim()}*${ph}`)
  }

  lines.push('')
  lines.push('──────────────────────')
  lines.push('*DETALLE DE PRODUCTOS:*')
  for (const it of sale.items) {
    const displayQty = it.saleQty ?? it.qty
    const displayUnit = it.saleUnit ?? it.unit
    lines.push(`• *${formatQty(displayQty, displayUnit)}* de ${it.name}`)
    lines.push(`   Importe: ${formatMoney(it.lineTotal)}`)
  }
  lines.push('──────────────────────')
  lines.push('')
  const subtotal = round2(sale.total / 1.16)
  const iva = round2(sale.total - subtotal)
  lines.push(`Subtotal: ${formatMoney(subtotal)} | IVA (16%): ${formatMoney(iva)}`)
  lines.push(`💰 *TOTAL: ${formatMoney(sale.total)}*`)

  if (sale.payments.length > 0) {
    const pLines: string[] = []
    for (const p of sale.payments) {
      const label = p.type === 'efectivo' ? 'Efectivo' : p.type === 'tarjeta' ? 'Tarjeta' : 'Transferencia'
      pLines.push(`${label}: ${formatMoney(p.amount)}`)
    }
    lines.push(`Pago: ${pLines.join(' | ')}`)
  }

  const paid = sale.payments.reduce((s, p) => s + p.amount, 0)
  const change = Math.round((paid - sale.total) * 100) / 100
  if (change > 0) {
    const breakdown = calculateChangeBreakdown(change)
    const bStr = breakdown.map((b) => `${b.count}x ${b.label}`).join(', ')
    lines.push(`💵 Cambio: ${formatMoney(change)}${bStr ? ` (${bStr})` : ''}`)
  }

  const supParts = [
    business.ownerName?.trim() ? `Supervisor: ${business.ownerName.trim()}` : '',
    business.ownerPhone?.trim() ? `Tel: ${business.ownerPhone.trim()}` : '',
  ].filter(Boolean)
  if (supParts.length > 0) {
    lines.push('')
    lines.push(`📞 ${supParts.join(' · ')}`)
  }

  if (business.footer?.trim()) {
    lines.push('')
    lines.push(`✨ _${business.footer.trim()}_`)
  }

  return lines.join('\n')
}

export function whatsappQuoteText(quote: Quote, business: BusinessInfo): string {
  const lines: string[] = []
  lines.push(`📋 *COTIZACIÓN / PRESUPUESTO*`)
  lines.push(`🎨 *${business.name}*`)
  if (business.address?.trim()) {
    lines.push(`📍 ${business.address.trim()}`)
  }
  lines.push(`Folio: *${quoteFolioLabel(quote)}*`)
  lines.push(`Fecha: ${formatTicketDate(quote.date)}`)
  if (quote.validUntil) {
    lines.push(`⏳ *Vigencia hasta: ${formatSimpleDate(quote.validUntil)}*`)
  }

  if (quote.customerName?.trim()) {
    const ph = quote.customerPhone?.trim() ? ` (${quote.customerPhone.trim()})` : ''
    lines.push(`👤 Para: *${quote.customerName.trim()}*${ph}`)
  }

  lines.push('')
  lines.push('──────────────────────')
  lines.push('*DETALLE COTIZADO:*')
  for (const it of quote.items) {
    const displayQty = it.saleQty ?? it.qty
    const displayUnit = it.saleUnit ?? it.unit
    lines.push(`• *${formatQty(displayQty, displayUnit)}* de ${it.name}`)
    lines.push(`   P. Unit: ${formatMoney(it.unitPrice)}  |  Subtotal: ${formatMoney(it.lineTotal)}`)
  }
  lines.push('──────────────────────')
  lines.push('')
  lines.push(`💵 *TOTAL ESTIMADO: ${formatMoney(quote.total)}*`)

  if (quote.notes?.trim()) {
    lines.push(`📝 Observaciones: ${quote.notes.trim()}`)
  }

  const supParts = [
    business.ownerName?.trim() ? `Atención: ${business.ownerName.trim()}` : '',
    business.ownerPhone?.trim() ? `Tel: ${business.ownerPhone.trim()}` : '',
  ].filter(Boolean)
  if (supParts.length > 0) {
    lines.push('')
    lines.push(`📞 ${supParts.join(' · ')}`)
  }

  lines.push('')
  lines.push(`ℹ️ _Precios sujetos a cambio sin previo aviso. Esta cotización no reserva existencias ni compromete producto hasta confirmar su compra._`)

  return lines.join('\n')
}

/**
 * Abre directamente WhatsApp con el mensaje pre-llenado usando el protocolo universal de WhatsApp
 * Funciona perfectamente en celulares Android/iOS y en computadoras (WhatsApp Web / App Desktop).
 */
export function openWhatsAppText(sale: Sale, business: BusinessInfo, clientPhone?: string | null): void {
  const norm = clientPhone ? normalizePhone(clientPhone) : null
  const text = encodeURIComponent(whatsappText(sale, business))
  const url = norm ? `https://api.whatsapp.com/send/?phone=${norm}&text=${text}` : `https://api.whatsapp.com/send/?text=${text}`
  window.open(url, '_blank')
}

export function openWhatsAppQuoteText(quote: Quote, business: BusinessInfo, clientPhone?: string | null): void {
  const norm = clientPhone ? normalizePhone(clientPhone) : null
  const text = encodeURIComponent(whatsappQuoteText(quote, business))
  const url = norm ? `https://api.whatsapp.com/send/?phone=${norm}&text=${text}` : `https://api.whatsapp.com/send/?text=${text}`
  window.open(url, '_blank')
}

const PT = 0.352778

async function loadImageSize(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 })
    img.onerror = () => reject(new Error('No se pudo leer el logo'))
    img.src = dataUrl
  })
}

// ─── GENERACIÓN DE PDF PROFESIONAL Y ELEGANTE (A5) ───────────────────────────

export async function buildTicketPdf(
  sale: Sale,
  business: BusinessInfo,
): Promise<{ blob: Blob; fileName: string }> {
  const { jsPDF: JsPDF } = await import('jspdf')
  const doc = new JsPDF({ unit: 'mm', format: 'a5' })
  const PW = doc.internal.pageSize.getWidth()
  const PH = doc.internal.pageSize.getHeight()
  const M = 12
  const RIGHT = PW - M
  const USABLE = PW - M * 2
  const lineH = (s: number) => s * PT * 1.35

  // Paleta de marca oficial
  const BRAND: [number, number, number] = [23, 74, 59] // Pino profundo #174a3b
  const ACCENT: [number, number, number] = [197, 152, 42] // Ocre dorado #c5982a
  const DARK: [number, number, number] = [24, 33, 47] // Pizarra oscuro #18212f
  const GRAY: [number, number, number] = [100, 116, 139] // Slate gris
  const LIGHT_BG: [number, number, number] = [248, 250, 252] // Fondo tarjeta
  const BORDER: [number, number, number] = [226, 232, 240] // Borde sutil

  const style = (size: number, bold: boolean, color: [number, number, number]) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setFontSize(size)
    doc.setTextColor(color[0], color[1], color[2])
  }

  const wrap = (text: string, size: number, bold: boolean, width = USABLE): string[] => {
    style(size, bold, DARK)
    return doc.splitTextToSize(text, width) as string[]
  }

  // Marco exterior sutil
  doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2])
  doc.setLineWidth(0.4)
  doc.roundedRect(M - 3, M - 3, USABLE + 6, PH - (M * 2) + 6, 3, 3, 'S')

  let y = M + 2

  // --- Cabecera Elegante ---
  let logoH = 0
  let logoW = 0
  if (business.logo) {
    try {
      const size = await loadImageSize(business.logo)
      logoH = Math.min(20, (size.h * 32) / size.w)
      logoW = Math.min(32, (size.w * logoH) / size.h)
      doc.addImage(business.logo, 'JPEG', M, y, logoW, logoH)
    } catch {
      logoH = 0
    }
  }

  const textStartX = logoH > 0 ? M + logoW + 4 : M
  const textAvailW = logoH > 0 ? USABLE - (logoW + 4) : USABLE

  style(13, true, BRAND)
  const nameLines = wrap(business.name.toUpperCase(), 13, true, textAvailW)
  for (const ln of nameLines) {
    doc.text(ln, textStartX, y + 4)
    y += lineH(13)
  }

  if (business.address?.trim()) {
    style(8.5, false, GRAY)
    for (const ln of wrap(business.address.trim(), 8.5, false, textAvailW)) {
      doc.text(ln, textStartX, y + 3)
      y += lineH(8.5)
    }
  }

  const contactList = [
    business.phone?.trim() ? `Tel: ${business.phone.trim()}` : '',
    business.ownerName?.trim() ? `Atención: ${business.ownerName.trim()}` : '',
  ].filter(Boolean).join(' · ')
  if (contactList) {
    style(8, false, GRAY)
    doc.text(contactList, textStartX, y + 3)
    y += lineH(8) + 1
  }

  y = Math.max(y + 3, M + (logoH > 0 ? logoH + 4 : 0))

  // --- Banner / Badge de Comprobante ---
  doc.setFillColor(BRAND[0], BRAND[1], BRAND[2])
  doc.roundedRect(M, y, USABLE, 13, 2, 2, 'F')

  style(10, true, [255, 255, 255])
  doc.text('NOTA DE VENTA', M + 4, y + 8)

  style(11, true, ACCENT)
  doc.text(folioLabel(sale), RIGHT - 4, y + 8, { align: 'right' })

  y += 16

  // --- Tarjeta de Información (Cliente + Fecha) ---
  doc.setFillColor(LIGHT_BG[0], LIGHT_BG[1], LIGHT_BG[2])
  doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2])
  doc.roundedRect(M, y, USABLE, 15, 2, 2, 'FD')

  style(8, false, GRAY)
  doc.text('Fecha y hora:', M + 3, y + 5)
  style(8.5, true, DARK)
  doc.text(formatTicketDate(sale.date), M + 3, y + 10)

  const custName = sale.customerName?.trim() || 'Público general (Mostrador)'
  const custPhone = sale.customerPhone?.trim() ? ` · Tel: ${sale.customerPhone.trim()}` : ''
  style(8, false, GRAY)
  doc.text('Cliente:', RIGHT - 3, y + 5, { align: 'right' })
  style(8.5, true, BRAND)
  doc.text(`${custName}${custPhone}`, RIGHT - 3, y + 10, { align: 'right' })

  y += 19

  // --- Encabezado de la Tabla de Productos ---
  doc.setFillColor(241, 245, 249)
  doc.roundedRect(M, y, USABLE, 7, 1.5, 1.5, 'F')

  style(7.5, true, DARK)
  doc.text('CANTIDAD / PRES.', M + 3, y + 4.8)
  doc.text('DESCRIPCIÓN DEL ARTÍCULO', M + 40, y + 4.8)
  doc.text('PRECIO', RIGHT - 28, y + 4.8, { align: 'right' })
  doc.text('IMPORTE', RIGHT - 3, y + 4.8, { align: 'right' })

  y += 9

  // --- Filas de Productos ---
  for (const it of sale.items) {
    const displayQty = it.saleQty ?? it.qty
    const displayUnit = it.saleUnit ?? it.unit
    const displayPrice = displayQty > 0 ? round2(it.lineTotal / displayQty) : it.unitPrice

    style(8.5, true, BRAND)
    doc.text(formatQty(displayQty, displayUnit), M + 3, y + 3)

    style(9, true, DARK)
    const nameLines = wrap(it.name, 9, true, USABLE - 68)
    let itemY = y + 3
    for (const ln of nameLines) {
      doc.text(ln, M + 40, itemY)
      itemY += lineH(9)
    }

    style(8.5, false, GRAY)
    doc.text(formatMoney(displayPrice), RIGHT - 28, y + 3, { align: 'right' })

    style(9, true, DARK)
    doc.text(formatMoney(it.lineTotal), RIGHT - 3, y + 3, { align: 'right' })

    const rowH = Math.max(itemY - y + 2, 7.5)
    y += rowH

    // Línea separadora tenue
    doc.setDrawColor(241, 245, 249)
    doc.setLineWidth(0.2)
    doc.line(M + 2, y, RIGHT - 2, y)
    y += 1.5
  }

  y += 3

  // --- Cuadro de Totales y Pagos ---
  const boxW = 68
  const boxX = RIGHT - boxW
  doc.setFillColor(LIGHT_BG[0], LIGHT_BG[1], LIGHT_BG[2])
  doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2])
  doc.roundedRect(boxX, y, boxW, 20, 2, 2, 'FD')

  style(10, true, DARK)
  doc.text('TOTAL:', boxX + 4, y + 8)

  style(14, true, BRAND)
  doc.text(formatMoney(sale.total), RIGHT - 4, y + 8, { align: 'right' })

  // Desglose de pagos
  let payY = y + 13
  for (const p of sale.payments) {
    style(8, false, GRAY)
    const label = p.type === 'efectivo' ? 'Efectivo' : p.type === 'tarjeta' ? 'Tarjeta' : 'Transf.'
    doc.text(`${label}: ${formatMoney(p.amount)}`, boxX + 4, payY)
    payY += lineH(8)
  }

  const paid = sale.payments.reduce((s, p) => s + p.amount, 0)
  const change = Math.round((paid - sale.total) * 100) / 100
  if (change > 0) {
    style(8, true, [37, 99, 235])
    doc.text(`Cambio: ${formatMoney(change)}`, RIGHT - 4, y + 17, { align: 'right' })
  }

  // Notas si las hay (a la izquierda del total)
  if (sale.notes?.trim()) {
    style(7.5, true, GRAY)
    doc.text('OBSERVACIONES:', M + 2, y + 5)
    style(8, false, DARK)
    let noteY = y + 9
    for (const ln of wrap(sale.notes.trim(), 8, false, USABLE - boxW - 6)) {
      doc.text(ln, M + 2, noteY)
      noteY += lineH(8)
    }
  }

  y += 26

  // --- Pie de Página Profesional ---
  if (business.footer?.trim()) {
    style(8.5, false, GRAY)
    const footLines = wrap(business.footer.trim(), 8.5, false, USABLE)
    for (const ln of footLines) {
      doc.text(ln, PW / 2, y, { align: 'center' })
      y += lineH(8.5)
    }
    y += 2
  }

  style(6.5, false, [160, 174, 192])
  doc.text('Comprobante digital para efectos de control interno y garantía · Pinturas POS', PW / 2, PH - M, { align: 'center' })

  return { blob: doc.output('blob'), fileName: ticketFileName(sale) }
}

export async function buildQuotePdf(
  quote: Quote,
  business: BusinessInfo,
): Promise<{ blob: Blob; fileName: string }> {
  const { jsPDF: JsPDF } = await import('jspdf')
  const doc = new JsPDF({ unit: 'mm', format: 'a5' })
  const PW = doc.internal.pageSize.getWidth()
  const PH = doc.internal.pageSize.getHeight()
  const M = 12
  const RIGHT = PW - M
  const USABLE = PW - M * 2
  const lineH = (s: number) => s * PT * 1.35

  const BRAND: [number, number, number] = [23, 74, 59] // Pino profundo #174a3b
  const ACCENT: [number, number, number] = [197, 152, 42] // Ocre dorado #c5982a
  const DARK: [number, number, number] = [24, 33, 47]
  const GRAY: [number, number, number] = [100, 116, 139]
  const LIGHT_BG: [number, number, number] = [248, 250, 252]
  const BORDER: [number, number, number] = [226, 232, 240]

  const style = (size: number, bold: boolean, color: [number, number, number]) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setFontSize(size)
    doc.setTextColor(color[0], color[1], color[2])
  }

  const wrap = (text: string, size: number, bold: boolean, width = USABLE): string[] => {
    style(size, bold, DARK)
    return doc.splitTextToSize(text, width) as string[]
  }

  // Marco exterior
  doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2])
  doc.setLineWidth(0.4)
  doc.roundedRect(M - 3, M - 3, USABLE + 6, PH - (M * 2) + 6, 3, 3, 'S')

  let y = M + 2

  // Logo y Empresa
  let logoH = 0
  let logoW = 0
  if (business.logo) {
    try {
      const size = await loadImageSize(business.logo)
      logoH = Math.min(20, (size.h * 32) / size.w)
      logoW = Math.min(32, (size.w * logoH) / size.h)
      doc.addImage(business.logo, 'JPEG', M, y, logoW, logoH)
    } catch {
      logoH = 0
    }
  }

  const textStartX = logoH > 0 ? M + logoW + 4 : M
  const textAvailW = logoH > 0 ? USABLE - (logoW + 4) : USABLE

  style(13, true, BRAND)
  for (const ln of wrap(business.name.toUpperCase(), 13, true, textAvailW)) {
    doc.text(ln, textStartX, y + 4)
    y += lineH(13)
  }

  if (business.address?.trim()) {
    style(8.5, false, GRAY)
    for (const ln of wrap(business.address.trim(), 8.5, false, textAvailW)) {
      doc.text(ln, textStartX, y + 3)
      y += lineH(8.5)
    }
  }

  const contactList = [
    business.phone?.trim() ? `Tel: ${business.phone.trim()}` : '',
    business.ownerName?.trim() ? `Asesor: ${business.ownerName.trim()}` : '',
  ].filter(Boolean).join(' · ')
  if (contactList) {
    style(8, false, GRAY)
    doc.text(contactList, textStartX, y + 3)
    y += lineH(8) + 1
  }

  y = Math.max(y + 3, M + (logoH > 0 ? logoH + 4 : 0))

  // Badge Cotización
  doc.setFillColor(ACCENT[0], ACCENT[1], ACCENT[2])
  doc.roundedRect(M, y, USABLE, 13, 2, 2, 'F')

  style(10, true, [255, 255, 255])
  doc.text('PRESUPUESTO / COTIZACIÓN', M + 4, y + 8)

  style(11, true, [255, 255, 255])
  doc.text(quoteFolioLabel(quote), RIGHT - 4, y + 8, { align: 'right' })

  y += 16

  // Tarjeta de Fechas y Cliente
  doc.setFillColor(LIGHT_BG[0], LIGHT_BG[1], LIGHT_BG[2])
  doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2])
  doc.roundedRect(M, y, USABLE, 15, 2, 2, 'FD')

  style(8, false, GRAY)
  doc.text('Emisión:', M + 3, y + 5)
  style(8.5, true, DARK)
  doc.text(formatTicketDate(quote.date), M + 3, y + 10)

  if (quote.validUntil) {
    style(8, false, GRAY)
    doc.text('Vigencia:', M + 46, y + 5)
    style(8.5, true, BRAND)
    doc.text(formatSimpleDate(quote.validUntil), M + 46, y + 10)
  }

  const custName = quote.customerName?.trim() || 'Cliente Cotización'
  const custPhone = quote.customerPhone?.trim() ? ` · Tel: ${quote.customerPhone.trim()}` : ''
  style(8, false, GRAY)
  doc.text('Cotizado para:', RIGHT - 3, y + 5, { align: 'right' })
  style(8.5, true, DARK)
  doc.text(`${custName}${custPhone}`, RIGHT - 3, y + 10, { align: 'right' })

  y += 19

  // Tabla
  doc.setFillColor(241, 245, 249)
  doc.roundedRect(M, y, USABLE, 7, 1.5, 1.5, 'F')

  style(7.5, true, DARK)
  doc.text('CANTIDAD', M + 3, y + 4.8)
  doc.text('DESCRIPCIÓN DEL ARTÍCULO', M + 36, y + 4.8)
  doc.text('P. UNITARIO', RIGHT - 28, y + 4.8, { align: 'right' })
  doc.text('SUBTOTAL', RIGHT - 3, y + 4.8, { align: 'right' })

  y += 9

  for (const it of quote.items) {
    const displayQty = it.saleQty ?? it.qty
    const displayUnit = it.saleUnit ?? it.unit
    const displayPrice = displayQty > 0 ? round2(it.lineTotal / displayQty) : it.unitPrice

    style(8.5, true, BRAND)
    doc.text(formatQty(displayQty, displayUnit), M + 3, y + 3)

    style(9, true, DARK)
    const nameLines = wrap(it.name, 9, true, USABLE - 64)
    let itemY = y + 3
    for (const ln of nameLines) {
      doc.text(ln, M + 36, itemY)
      itemY += lineH(9)
    }

    style(8.5, false, GRAY)
    doc.text(formatMoney(displayPrice), RIGHT - 28, y + 3, { align: 'right' })

    style(9, true, DARK)
    doc.text(formatMoney(it.lineTotal), RIGHT - 3, y + 3, { align: 'right' })

    const rowH = Math.max(itemY - y + 2, 7.5)
    y += rowH

    doc.setDrawColor(241, 245, 249)
    doc.setLineWidth(0.2)
    doc.line(M + 2, y, RIGHT - 2, y)
    y += 1.5
  }

  y += 3

  // Total
  const boxW = 68
  const boxX = RIGHT - boxW
  doc.setFillColor(LIGHT_BG[0], LIGHT_BG[1], LIGHT_BG[2])
  doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2])
  doc.roundedRect(boxX, y, boxW, 14, 2, 2, 'FD')

  style(9.5, true, DARK)
  doc.text('TOTAL COTIZADO:', boxX + 4, y + 8)

  style(13, true, BRAND)
  doc.text(formatMoney(quote.total), RIGHT - 4, y + 8, { align: 'right' })

  if (quote.notes?.trim()) {
    style(7.5, true, GRAY)
    doc.text('NOTAS Y CONDICIONES:', M + 2, y + 4)
    style(8, false, DARK)
    let noteY = y + 8
    for (const ln of wrap(quote.notes.trim(), 8, false, USABLE - boxW - 6)) {
      doc.text(ln, M + 2, noteY)
      noteY += lineH(8)
    }
  }

  y += 20

  // Condiciones legales
  style(7, false, GRAY)
  doc.text('• Precios expresados en moneda nacional (MXN). Sujetos a cambio sin previo aviso.', M + 2, y)
  y += 4
  doc.text('• Esta cotización no reserva inventario ni mercancía hasta confirmarse la compra.', M + 2, y)
  y += 6

  style(6.5, false, [160, 174, 192])
  doc.text('Presupuesto informativo generado por Pinturas POS', PW / 2, PH - M, { align: 'center' })

  return { blob: doc.output('blob'), fileName: quoteFileName(quote) }
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

/**
 * Comparte el PDF de forma nativa por el sistema (WhatsApp, etc.).
 * Si el navegador o equipo no soporta compartir archivos, cae a descarga directa.
 */
export async function shareTicketPdf(
  sale: Sale,
  business: BusinessInfo,
): Promise<'shared' | 'downloaded'> {
  const { blob, fileName } = await buildTicketPdf(sale, business)
  const file = new File([blob], fileName, { type: 'application/pdf' })
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean }
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({
        files: [file],
        title: `Nota ${folioLabel(sale)}`,
        text: `${business.name} — Total ${formatMoney(sale.total)}`,
      })
      return 'shared'
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') throw e
    }
  }
  downloadBlob(blob, fileName)
  return 'downloaded'
}

export async function shareQuotePdf(
  quote: Quote,
  business: BusinessInfo,
): Promise<'shared' | 'downloaded'> {
  const { blob, fileName } = await buildQuotePdf(quote, business)
  const file = new File([blob], fileName, { type: 'application/pdf' })
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean }
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({
        files: [file],
        title: `Cotización ${quoteFolioLabel(quote)}`,
        text: `${business.name} — Presupuesto ${formatMoney(quote.total)}`,
      })
      return 'shared'
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') throw e
    }
  }
  downloadBlob(blob, fileName)
  return 'downloaded'
}

export async function downloadTicketPdf(sale: Sale, business: BusinessInfo): Promise<string> {
  const { blob, fileName } = await buildTicketPdf(sale, business)
  downloadBlob(blob, fileName)
  return fileName
}

export async function downloadQuotePdf(quote: Quote, business: BusinessInfo): Promise<string> {
  const { blob, fileName } = await buildQuotePdf(quote, business)
  downloadBlob(blob, fileName)
  return fileName
}
