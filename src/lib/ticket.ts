import type { BusinessInfo, Sale } from '../types'
import { formatMoney } from './utils'
import { formatQty } from './units'

const BUSINESS_KEY = 'pos_business'

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

export function openWhatsAppText(sale: Sale, business: BusinessInfo): void {
  window.open(`https://wa.me/?text=${encodeURIComponent(whatsappText(sale, business))}`, '_blank')
}

const PT = 0.352778
const W = 80
const M = 5
const RIGHT = W - M

type Row =
  | { kind: 'text'; text: string; size: number; bold: boolean; align: 'left' | 'center' | 'right'; gap: number }
  | { kind: 'cols'; left: string; right: string; size: number; bold: boolean; gap: number }
  | { kind: 'sep'; gap: number }

function wrapText(text: string, maxChars: number): string {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    if (!cur.length) cur = w
    else if ((cur + ' ' + w).length <= maxChars) cur += ' ' + w
    else {
      lines.push(cur)
      cur = w
    }
  }
  if (cur.length) lines.push(cur)
  return lines.join('\n')
}

function rowHeight(r: Row): number {
  if (r.kind === 'sep') return 2 + r.gap
  const lh = r.size * PT * 1.25
  const lines = r.kind === 'text' ? r.text.split('\n').length : 1
  return lines * lh + r.gap
}

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
  const rows: Row[] = []

  let logoH = 0
  let logoW = 0
  if (business.logo) {
    try {
      const size = await loadImageSize(business.logo)
      logoW = Math.min(30, size.w * (18 / size.h))
      logoH = Math.min(18, size.h * (logoW / size.w))
      logoW = Math.min(30, size.w * (logoH / size.h))
    } catch {
      logoH = 0
      logoW = 0
    }
  }

  rows.push({ kind: 'text', text: business.name.toUpperCase(), size: 12, bold: true, align: 'center', gap: 1 })
  if (business.address?.trim()) {
    rows.push({ kind: 'text', text: wrapText(business.address.trim(), 38), size: 8, bold: false, align: 'center', gap: 0.5 })
  }
  if (business.phone?.trim()) {
    rows.push({ kind: 'text', text: `Tel: ${business.phone.trim()}`, size: 8, bold: false, align: 'center', gap: 0.5 })
  }
  rows.push({ kind: 'sep', gap: 1 })
  rows.push({ kind: 'cols', left: `Nota ${folioLabel(sale)}`, right: formatTicketDate(sale.date), size: 8, bold: false, gap: 0.5 })
  rows.push({ kind: 'sep', gap: 1 })

  for (const it of sale.items) {
    rows.push({ kind: 'text', text: wrapText(it.name, 34), size: 8, bold: false, align: 'left', gap: 0 })
    rows.push({
      kind: 'cols',
      left: `  ${formatQty(it.qty, it.unit)} × ${formatMoney(it.unitPrice)}`,
      right: formatMoney(it.lineTotal),
      size: 8,
      bold: false,
      gap: 0.8,
    })
  }

  rows.push({ kind: 'sep', gap: 1 })
  rows.push({ kind: 'cols', left: 'TOTAL', right: formatMoney(sale.total), size: 11, bold: true, gap: 0.5 })
  for (const p of sale.payments) {
    rows.push({
      kind: 'cols',
      left: p.type === 'efectivo' ? 'Efectivo' : 'Tarjeta',
      right: formatMoney(p.amount),
      size: 8,
      bold: false,
      gap: 0.3,
    })
  }
  const paid = sale.payments.reduce((s, p) => s + p.amount, 0)
  const change = Math.round((paid - sale.total) * 100) / 100
  if (change > 0) {
    rows.push({ kind: 'cols', left: 'Cambio', right: formatMoney(change), size: 8, bold: false, gap: 0.3 })
  }
  if (sale.notes?.trim()) {
    rows.push({ kind: 'sep', gap: 1 })
    rows.push({ kind: 'text', text: wrapText(`Nota: ${sale.notes.trim()}`, 38), size: 7.5, bold: false, align: 'left', gap: 0.5 })
  }
  if (business.footer?.trim()) {
    rows.push({ kind: 'sep', gap: 1 })
    rows.push({ kind: 'text', text: wrapText(business.footer.trim(), 40), size: 8, bold: false, align: 'center', gap: 0 })
  }

  let totalH = M * 2 + (logoH > 0 ? logoH + 2 : 0)
  for (const r of rows) totalH += rowHeight(r)

  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: [W, Math.max(totalH, 40)] })

  let y = M
  if (logoH > 0 && business.logo) {
    try {
      doc.addImage(business.logo, 'JPEG', (W - logoW) / 2, y, logoW, logoH)
    } catch {
      // logo inválido: se omite
    }
    y += logoH + 2
  }

  for (const r of rows) {
    switch (r.kind) {
      case 'text': {
        doc.setFont('helvetica', r.bold ? 'bold' : 'normal')
        doc.setFontSize(r.size)
        const lh = r.size * PT * 1.25
        const x = r.align === 'left' ? M : r.align === 'right' ? RIGHT : W / 2
        let ty = y + lh * 0.85
        for (const ln of r.text.split('\n')) {
          doc.text(ln, x, ty, { align: r.align })
          ty += lh
        }
        y += r.text.split('\n').length * lh + r.gap
        break
      }
      case 'cols': {
        doc.setFont('helvetica', r.bold ? 'bold' : 'normal')
        doc.setFontSize(r.size)
        const lh = r.size * PT * 1.25
        doc.text(r.left, M, y + lh * 0.85)
        doc.text(r.right, RIGHT, y + lh * 0.85, { align: 'right' })
        y += lh + r.gap
        break
      }
      case 'sep': {
        doc.setDrawColor(150)
        doc.setLineWidth(0.2)
        doc.line(M, y + 1, RIGHT, y + 1)
        y += 2 + r.gap
        break
      }
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
