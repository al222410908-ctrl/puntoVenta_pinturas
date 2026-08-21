import type { BusinessInfo, Sale } from '../types'
import { formatMoney } from './utils'
import { formatQty } from './units'

const BUSINESS_KEY = 'pos_business'
const CLIENT_PHONE_KEY = 'pos_cliente_phone'

export const DEFAULT_BUSINESS: BusinessInfo = { name: 'Pinturas POS' }

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

export function ticketFileName(sale: Sale): string {
  const d = new Date(sale.date)
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  return `nota-${sale.folio ?? sale.id.slice(0, 6)}-${ymd}.pdf`
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

export function whatsappText(sale: Sale, business: BusinessInfo): string {
  const lines: string[] = []
  lines.push(`*${business.name}*`)
  lines.push(`Nota ${folioLabel(sale)} — ${formatTicketDate(sale.date)}`)
  lines.push('')
  for (const it of sale.items) {
    lines.push(`${formatQty(it.qty, it.unit)} de ${it.name} — ${formatMoney(it.lineTotal)}`)
  }
  lines.push('')
  lines.push(`*Total: ${formatMoney(sale.total)}*`)
  for (const p of sale.payments) {
    lines.push(`${p.type === 'efectivo' ? 'Efectivo' : 'Tarjeta'}: ${formatMoney(p.amount)}`)
  }
  if (business.footer) {
    lines.push('')
    lines.push(business.footer)
  }
  return lines.join('\n')
}

/** Abre el chat de WhatsApp (con número de cliente si se da) con el resumen. */
export function openWhatsAppText(sale: Sale, business: BusinessInfo, clientPhone?: string | null): void {
  const base = clientPhone ? `https://wa.me/${clientPhone}` : 'https://wa.me/'
  window.open(`${base}?text=${encodeURIComponent(whatsappText(sale, business))}`, '_blank')
}

/** Abre directamente el chat de WhatsApp del cliente, sin mensaje predefinido. */
export function openWhatsAppChat(clientPhone: string): void {
  window.open(`https://wa.me/${clientPhone}`, '_blank')
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

export async function buildTicketPdf(
  sale: Sale,
  business: BusinessInfo,
): Promise<{ blob: Blob; fileName: string }> {
  const { jsPDF: JsPDF } = await import('jspdf')
  // A5 (148 x 210 mm): tamaño estándar que los visores de PDF/WhatsApp
  // muestran completo, sin recortar (a diferencia de páginas muy angostas).
  const doc = new JsPDF({ unit: 'mm', format: 'a5' })
  const PW = doc.internal.pageSize.getWidth()
  const M = 14
  const RIGHT = PW - M
  const USABLE = PW - M * 2
  const lineH = (s: number) => s * PT * 1.35

  const BRAND: [number, number, number] = [23, 74, 59]
  const DARK: [number, number, number] = [30, 41, 59]
  const GRAY: [number, number, number] = [100, 116, 139]
  const LINE: [number, number, number] = [203, 213, 225]
  const BLUE: [number, number, number] = [37, 99, 235]

  const style = (size: number, bold: boolean, color: [number, number, number]) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setFontSize(size)
    doc.setTextColor(color[0], color[1], color[2])
  }
  const wrap = (text: string, size: number, bold: boolean): string[] => {
    style(size, bold, DARK)
    return doc.splitTextToSize(text, USABLE) as string[]
  }
  const sep = (y: number) => {
    doc.setDrawColor(LINE[0], LINE[1], LINE[2])
    doc.setLineWidth(0.3)
    doc.line(M, y, RIGHT, y)
  }

  let logoH = 0
  let logoW = 0
  if (business.logo) {
    try {
      const size = await loadImageSize(business.logo)
      logoH = Math.min(24, (size.h * 40) / size.w)
      logoW = Math.min(40, (size.w * logoH) / size.h)
      logoH = Math.min(24, (size.h * logoW) / size.w)
    } catch {
      logoH = 0
      logoW = 0
    }
  }

  // --- Encabezado con color de marca ---
  let y = 14
  const nameLines = wrap(business.name.toUpperCase(), 14, true)
  const addrLines = business.address?.trim() ? wrap(business.address.trim(), 10, false) : []
  const tel = business.phone?.trim() ? `Tel: ${business.phone.trim()}` : ''
  const headH =
    y +
    (logoH ? logoH + 4 : 0) +
    nameLines.length * lineH(14) +
    (addrLines.length ? addrLines.length * lineH(10) + 1 : 0) +
    (tel ? lineH(10) : 0) +
    12

  doc.setFillColor(BRAND[0], BRAND[1], BRAND[2])
  doc.rect(0, 0, PW, headH, 'F')

  if (logoH > 0 && business.logo) {
    doc.addImage(business.logo, 'JPEG', (PW - logoW) / 2, y, logoW, logoH)
    y += logoH + 4
  }
  style(14, true, [255, 255, 255])
  for (const ln of nameLines) {
    doc.text(ln, PW / 2, y, { align: 'center' })
    y += lineH(14)
  }
  style(10, false, [235, 245, 242])
  for (const ln of addrLines) {
    doc.text(ln, PW / 2, y, { align: 'center' })
    y += lineH(10)
  }
  if (tel) {
    doc.text(tel, PW / 2, y, { align: 'center' })
    y += lineH(10)
  }

  // --- Cuerpo ---
  let yb = headH + 12
  style(12, true, DARK)
  doc.text(`Nota ${folioLabel(sale)}`, M, yb)
  style(10, false, GRAY)
  doc.text(formatTicketDate(sale.date), RIGHT, yb, { align: 'right' })
  yb += Math.max(lineH(12), lineH(10)) + 4
  sep(yb)
  yb += 12

  for (const it of sale.items) {
    const nl = wrap(it.name, 12, true)
    style(12, true, DARK)
    for (const ln of nl) {
      doc.text(ln, M, yb)
      yb += lineH(12)
    }
    style(10, false, GRAY)
    doc.text(`${formatQty(it.qty, it.unit)} × ${formatMoney(it.unitPrice)}`, M + 4, yb)
    style(11, true, DARK)
    doc.text(formatMoney(it.lineTotal), RIGHT, yb, { align: 'right' })
    yb += lineH(10) + 6
  }
  sep(yb)
  yb += 12

  style(13, true, DARK)
  doc.text('TOTAL', M, yb)
  style(20, true, BRAND)
  doc.text(formatMoney(sale.total), RIGHT, yb, { align: 'right' })
  yb += lineH(20) + 6

  for (const p of sale.payments) {
    style(11, false, GRAY)
    doc.text(p.type === 'efectivo' ? 'Efectivo' : 'Tarjeta', M, yb)
    doc.text(formatMoney(p.amount), RIGHT, yb, { align: 'right' })
    yb += lineH(11) + 3
  }
  const paid = sale.payments.reduce((s, p) => s + p.amount, 0)
  const change = Math.round((paid - sale.total) * 100) / 100
  if (change > 0) {
    style(11, true, BLUE)
    doc.text('Cambio', M, yb)
    doc.text(formatMoney(change), RIGHT, yb, { align: 'right' })
    yb += lineH(11) + 3
  }
  if (sale.notes?.trim()) {
    sep(yb)
    yb += 12
    style(10, false, GRAY)
    for (const ln of wrap(`Nota: ${sale.notes.trim()}`, 10, false)) {
      doc.text(ln, M, yb)
      yb += lineH(10)
    }
  }
  if (business.footer?.trim()) {
    sep(yb)
    yb += 12
    style(10, false, GRAY)
    for (const ln of wrap(business.footer.trim(), 10, false)) {
      doc.text(ln, PW / 2, yb, { align: 'center' })
      yb += lineH(10)
    }
  }

  return { blob: doc.output('blob'), fileName: ticketFileName(sale) }
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

/** Comparte el PDF por el sistema (WhatsApp, etc.). Si no hay soporte, lo descarga. */
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
      // sin soporte para este archivo: cae a descarga
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
