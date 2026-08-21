import type { jsPDF } from 'jspdf'
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
const W = 80
const M = 5
const RIGHT = W - M
const USABLE = W - M * 2

type Row =
  | { kind: 'text'; lines: string[]; size: number; bold: boolean; align: 'left' | 'center' | 'right'; gap: number }
  | { kind: 'cols'; left: string; right: string; size: number; bold: boolean; gap: number }
  | { kind: 'sep'; gap: number }

function rowHeight(r: Row): number {
  if (r.kind === 'sep') return 2 + r.gap
  const lh = r.size * PT * 1.3
  const lines = r.kind === 'text' ? r.lines.length : 1
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

function wrapWith(doc: jsPDF, text: string, size: number, bold: boolean): string[] {
  doc.setFont('helvetica', bold ? 'bold' : 'normal')
  doc.setFontSize(size)
  return doc.splitTextToSize(text, USABLE) as string[]
}

export async function buildTicketPdf(
  sale: Sale,
  business: BusinessInfo,
): Promise<{ blob: Blob; fileName: string }> {
  const { jsPDF: JsPDF } = await import('jspdf')
  // Documento auxiliar solo para medir texto con las fuentes reales
  const measurer = new JsPDF({ unit: 'mm', format: [W, 100] })

  let logoH = 0
  let logoW = 0
  if (business.logo) {
    try {
      const size = await loadImageSize(business.logo)
      logoH = Math.min(18, size.h * (30 / size.w))
      logoW = Math.min(30, size.w * (logoH / size.h))
      logoH = Math.min(18, size.h * (logoW / size.w))
    } catch {
      logoH = 0
      logoW = 0
    }
  }

  const rows: Row[] = []
  rows.push({
    kind: 'text',
    lines: wrapWith(measurer, business.name.toUpperCase(), 12, true),
    size: 12,
    bold: true,
    align: 'center',
    gap: 1,
  })
  if (business.address?.trim()) {
    rows.push({ kind: 'text', lines: wrapWith(measurer, business.address.trim(), 8, false), size: 8, bold: false, align: 'center', gap: 0.5 })
  }
  if (business.phone?.trim()) {
    rows.push({ kind: 'text', lines: [`Tel: ${business.phone.trim()}`], size: 8, bold: false, align: 'center', gap: 0.5 })
  }
  rows.push({ kind: 'sep', gap: 1 })
  rows.push({ kind: 'cols', left: `Nota ${folioLabel(sale)}`, right: formatTicketDate(sale.date), size: 8, bold: false, gap: 0.5 })
  rows.push({ kind: 'sep', gap: 1 })

  for (const it of sale.items) {
    rows.push({ kind: 'text', lines: wrapWith(measurer, it.name, 8, false), size: 8, bold: false, align: 'left', gap: 0 })
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
    rows.push({ kind: 'text', lines: wrapWith(measurer, `Nota: ${sale.notes.trim()}`, 7.5, false), size: 7.5, bold: false, align: 'left', gap: 0.5 })
  }
  if (business.footer?.trim()) {
    rows.push({ kind: 'sep', gap: 1 })
    rows.push({ kind: 'text', lines: wrapWith(measurer, business.footer.trim(), 8, false), size: 8, bold: false, align: 'center', gap: 0 })
  }

  let totalH = M * 2 + 4 + (logoH > 0 ? logoH + 2 : 0)
  for (const r of rows) totalH += rowHeight(r)

  const doc = new JsPDF({ unit: 'mm', format: [W, Math.max(totalH, 40)] })

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
        const lh = r.size * PT * 1.3
        const x = r.align === 'left' ? M : r.align === 'right' ? RIGHT : W / 2
        let ty = y + lh * 0.85
        for (const ln of r.lines) {
          doc.text(ln, x, ty, { align: r.align })
          ty += lh
        }
        y += r.lines.length * lh + r.gap
        break
      }
      case 'cols': {
        doc.setFont('helvetica', r.bold ? 'bold' : 'normal')
        doc.setFontSize(r.size)
        const lh = r.size * PT * 1.3
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

function wrapCanvas(ctx: CanvasRenderingContext2D, text: string, font: string, maxW: number): string[] {
  ctx.font = font
  const words = text.split(/\s+/)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w
    if (!cur || ctx.measureText(test).width <= maxW) cur = test
    else {
      lines.push(cur)
      cur = w
    }
  }
  if (cur) lines.push(cur)
  return lines.length ? lines : ['']
}

function loadLogoEl(dataUrl: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = dataUrl
  })
}

/** Genera la nota como imagen PNG con diseño (se ve bien en cualquier visor/WhatsApp). */
export async function buildTicketImage(
  sale: Sale,
  business: BusinessInfo,
): Promise<{ blob: Blob; fileName: string }> {
  const S = 2
  const WL = 360
  const PADL = 20
  const USABLE = WL - PADL * 2
  const BRAND = '#174a3b'
  const DARK = '#1e293b'
  const GRAY = '#64748b'
  const LINE = '#cbd5e1'
  const BLUE = '#2563eb'
  const F = (size: number, weight = 400) =>
    `${weight} ${size}px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`

  const logo = business.logo ? await loadLogoEl(business.logo) : null

  function dash(ctx: CanvasRenderingContext2D, y: number): number {
    ctx.strokeStyle = LINE
    ctx.lineWidth = 1
    ctx.setLineDash([5, 4])
    ctx.beginPath()
    ctx.moveTo(PADL, y)
    ctx.lineTo(WL - PADL, y)
    ctx.stroke()
    ctx.setLineDash([])
    return y + 10
  }

  function render(ctx: CanvasRenderingContext2D): number {
    let y = 0

    // Encabezado con color de marca
    const nameLines = wrapCanvas(ctx, business.name.toUpperCase(), F(21, 700), USABLE)
    const addrLines = business.address?.trim() ? wrapCanvas(ctx, business.address.trim(), F(12), USABLE) : []
    const tel = business.phone?.trim() ? `Tel: ${business.phone.trim()}` : ''
    let logoH = 0
    if (logo && logo.naturalWidth > 0) {
      logoH = Math.max(20, Math.min(56, (USABLE / logo.naturalWidth) * logo.naturalHeight))
    }
    const headH =
      18 +
      (logoH ? logoH + 10 : 0) +
      nameLines.length * 27 +
      (addrLines.length ? addrLines.length * 17 + 2 : 0) +
      (tel ? 17 : 0) +
      16
    ctx.fillStyle = BRAND
    ctx.fillRect(0, 0, WL, headH)

    y = 18
    ctx.textAlign = 'center'
    if (logo && logoH) {
      const lw = (logo.naturalWidth / logo.naturalHeight) * logoH
      ctx.drawImage(logo, (WL - lw) / 2, y, lw, logoH)
      y += logoH + 10
    }
    ctx.fillStyle = '#ffffff'
    ctx.font = F(21, 700)
    for (const ln of nameLines) {
      ctx.fillText(ln, WL / 2, y + 17)
      y += 27
    }
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.font = F(12)
    for (const ln of addrLines) {
      ctx.fillText(ln, WL / 2, y + 12)
      y += 17
    }
    if (tel) {
      ctx.fillText(tel, WL / 2, y + 12)
      y += 17
    }

    y = headH + 14

    // Nota / fecha
    ctx.textAlign = 'left'
    ctx.fillStyle = DARK
    ctx.font = F(13, 600)
    ctx.fillText(`Nota ${folioLabel(sale)}`, PADL, y + 12)
    ctx.textAlign = 'right'
    ctx.fillStyle = GRAY
    ctx.font = F(11.5)
    ctx.fillText(formatTicketDate(sale.date), WL - PADL, y + 12)
    y += 22
    y = dash(ctx, y + 4)

    // Productos
    for (const it of sale.items) {
      const nameL = wrapCanvas(ctx, it.name, F(13.5, 600), USABLE)
      ctx.textAlign = 'left'
      ctx.fillStyle = DARK
      ctx.font = F(13.5, 600)
      for (const ln of nameL) {
        ctx.fillText(ln, PADL, y + 13)
        y += 18
      }
      ctx.fillStyle = GRAY
      ctx.font = F(12)
      ctx.fillText(`${formatQty(it.qty, it.unit)} × ${formatMoney(it.unitPrice)}`, PADL + 6, y + 12)
      ctx.textAlign = 'right'
      ctx.fillStyle = DARK
      ctx.font = F(12.5, 600)
      ctx.fillText(formatMoney(it.lineTotal), WL - PADL, y + 12)
      y += 20
    }
    y = dash(ctx, y + 2)

    // Total
    ctx.textAlign = 'left'
    ctx.fillStyle = DARK
    ctx.font = F(14, 800)
    ctx.fillText('TOTAL', PADL, y + 16)
    ctx.textAlign = 'right'
    ctx.fillStyle = BRAND
    ctx.font = F(23, 800)
    ctx.fillText(formatMoney(sale.total), WL - PADL, y + 18)
    y += 30

    // Pagos y cambio
    for (const p of sale.payments) {
      ctx.textAlign = 'left'
      ctx.fillStyle = GRAY
      ctx.font = F(12)
      ctx.fillText(p.type === 'efectivo' ? 'Efectivo' : 'Tarjeta', PADL, y + 12)
      ctx.textAlign = 'right'
      ctx.fillText(formatMoney(p.amount), WL - PADL, y + 12)
      y += 17
    }
    const paid = sale.payments.reduce((s, p) => s + p.amount, 0)
    const change = Math.round((paid - sale.total) * 100) / 100
    if (change > 0) {
      ctx.textAlign = 'left'
      ctx.fillStyle = BLUE
      ctx.font = F(12, 600)
      ctx.fillText('Cambio', PADL, y + 12)
      ctx.textAlign = 'right'
      ctx.fillText(formatMoney(change), WL - PADL, y + 12)
      y += 17
    }

    if (sale.notes?.trim()) {
      y += 4
      const noteLines = wrapCanvas(ctx, `Nota: ${sale.notes.trim()}`, F(11.5), USABLE)
      ctx.textAlign = 'left'
      ctx.fillStyle = GRAY
      ctx.font = F(11.5)
      for (const ln of noteLines) {
        ctx.fillText(ln, PADL, y + 12)
        y += 16
      }
    }

    if (business.footer?.trim()) {
      y = dash(ctx, y + 4)
      const footerLines = wrapCanvas(ctx, business.footer.trim(), F(12, 600), USABLE)
      ctx.textAlign = 'center'
      ctx.fillStyle = GRAY
      ctx.font = F(12, 600)
      for (const ln of footerLines) {
        ctx.fillText(ln, WL / 2, y + 13)
        y += 18
      }
    }

    return y + 18
  }

  // Pasada 1: medir; pasada 2: dibujar en lienzo del tamaño exacto
  const measure = document.createElement('canvas')
  measure.width = WL * S
  measure.height = 400 * S
  const mctx = measure.getContext('2d')!
  mctx.scale(S, S)
  const contentH = Math.ceil(render(mctx))

  const canvas = document.createElement('canvas')
  canvas.width = WL * S
  canvas.height = contentH * S
  const ctx = canvas.getContext('2d')!
  ctx.scale(S, S)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, WL, contentH)
  render(ctx)

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo generar la imagen'))), 'image/png')
  })
  return { blob, fileName: ticketFileName(sale).replace(/\.pdf$/, '.png') }
}
