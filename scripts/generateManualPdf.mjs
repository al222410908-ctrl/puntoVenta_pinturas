import fs from 'fs'
import path from 'path'
import { jsPDF } from 'jspdf'

const ROOT = process.cwd()
const CAPTURAS_DIR = path.join(ROOT, 'docs', 'capturas')
const OUTPUT_PDF = path.join(ROOT, 'Manual_de_Usuario_Pinturas_POS.pdf')

function getBase64Image(filename) {
  const filePath = path.join(CAPTURAS_DIR, filename)
  if (!fs.existsSync(filePath)) {
    console.warn(`No se encontro imagen: ${filePath}`)
    return null
  }
  const buffer = fs.readFileSync(filePath)
  return `data:image/png;base64,${buffer.toString('base64')}`
}

async function buildManualPdf() {
  console.log('Generando Manual de Usuario en PDF...')

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  const margin = 14
  const pageWidth = 210
  const pageHeight = 297
  const contentWidth = pageWidth - margin * 2

  function addHeader(sectionTitle) {
    doc.setFillColor(248, 250, 252)
    doc.rect(0, 0, pageWidth, 12, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(100, 116, 139)
    doc.text('PINTURAS POS — MANUAL DE USUARIO OFICIAL', margin, 8)
    doc.setFont('helvetica', 'normal')
    doc.text(sectionTitle, pageWidth - margin, 8, { align: 'right' })
    doc.setDrawColor(226, 232, 240)
    doc.line(0, 12, pageWidth, 12)
  }

  function addFooter(pageNum, totalPages = '') {
    doc.setDrawColor(226, 232, 240)
    doc.line(margin, pageHeight - 10, pageWidth - margin, pageHeight - 10)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(148, 163, 184)
    doc.text('Pinturas POS · Sistema Operativo Comercial Local-First', margin, pageHeight - 5)
    doc.text(`Página ${pageNum}${totalPages ? ` de ${totalPages}` : ''}`, pageWidth - margin, pageHeight - 5, { align: 'right' })
  }

  function drawImageBox(imgBase64, y, height = 75, caption = '') {
    if (!imgBase64) return y

    // Marco exterior de la figura
    doc.setFillColor(248, 250, 252)
    doc.setDrawColor(226, 232, 240)
    doc.roundedRect(margin, y, contentWidth, height + 8, 2, 2, 'FD')

    // Imagen
    try {
      doc.addImage(imgBase64, 'PNG', margin + 2, y + 2, contentWidth - 4, height, undefined, 'FAST')
    } catch (e) {
      console.error('Error insertando imagen:', e)
    }

    // Pie de foto
    if (caption) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7.5)
      doc.setTextColor(100, 116, 139)
      doc.text(caption, pageWidth / 2, y + height + 6, { align: 'center' })
    }

    return y + height + 14
  }

  // ==========================================
  // PÁGINA 1: PORTADA EJECUTIVA
  // ==========================================
  doc.setFillColor(248, 250, 252)
  doc.rect(0, 0, pageWidth, pageHeight, 'F')

  // Banda superior azul
  doc.setFillColor(37, 99, 235)
  doc.rect(0, 0, pageWidth, 8, 'F')

  let y = 35

  // Badge
  doc.setFillColor(239, 246, 255)
  doc.roundedRect(margin, y, 62, 7, 3, 3, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(29, 78, 216)
  doc.text('DOCUMENTO OFICIAL', margin + 31, y + 5, { align: 'center' })

  y += 18
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(30)
  doc.setTextColor(15, 23, 42)
  doc.text('Pinturas POS', margin, y)

  y += 9
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(71, 85, 105)
  doc.text('Manual de Usuario e Instrucciones de Operación', margin, y)

  y += 7
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(100, 116, 139)
  doc.text('Punto de Venta, Caja, Auditoría por Escáner, Smart Restock y Reportes Financieros', margin, y)

  y += 12
  // Imagen de Portada (Vender)
  const imgVender = getBase64Image('01_vender.png')
  y = drawImageBox(imgVender, y, 98, 'Sistema Integral para Mostrador y Bodega de Pinturas')

  y += 8
  // Tarjetas informativas inferiores
  doc.setDrawColor(226, 232, 240)
  doc.setFillColor(255, 255, 255)
  doc.roundedRect(margin, y, contentWidth, 38, 2, 2, 'FD')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(15, 23, 42)
  doc.text('CARACTERÍSTICAS CLAVE DEL SISTEMA:', margin + 6, y + 8)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(51, 65, 85)
  doc.text('• Arquitectura Local-First: Funciona sin internet ni pausas en el mostrador.', margin + 6, y + 15)
  doc.text('• Arqueo Ciego de Caja: Cero descuadres con tickets de Corte X y Corte Z en PDF.', margin + 6, y + 21)
  doc.text('• Auditoría y Mermas: Escaneo continuo con pistola lectora y registro tipificado de pérdidas.', margin + 6, y + 27)
  doc.text('• Smart Restock: Sugerencias por proveedor, hoja de llamada al dueño y recepción con escáner.', margin + 6, y + 33)

  addFooter(1)

  // ==========================================
  // PÁGINA 2: SEGURIDAD (PIN) Y PUNTO DE VENTA
  // ==========================================
  doc.addPage()
  addHeader('PUNTO DE VENTA Y SEGURIDAD')
  y = 20

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(15, 23, 42)
  doc.text('1. Acceso y PIN de Seguridad', margin, y)
  y += 6

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(51, 65, 85)
  doc.text('Pinturas POS cuenta con un teclado numérico táctil de seguridad para proteger los datos financieros:', margin, y)
  y += 5
  doc.text('• Primer inicio: El sistema solicita ingresar y confirmar un PIN maestro de 4 dígitos (ej: 1234).', margin + 3, y)
  y += 5
  doc.text('• Desbloqueo rápido: Al abrir la terminal o reactivar la pantalla, teclea tu PIN para despachar.', margin + 3, y)

  y += 10
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(15, 23, 42)
  doc.text('2. Módulo de Venta en Mostrador (Punto de Venta)', margin, y)
  y += 6

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(51, 65, 85)
  doc.text('Diseñado para atender con máxima agilidad utilizando lector de código de barras o pantalla táctil:', margin, y)
  y += 5
  doc.text('1. Escaneo rápido: Apunta la pistola al bote; se agrega al carrito con un sonido beep de éxito.', margin + 3, y)
  y += 5
  doc.text('2. Presentaciones: Selecciona litros, galones o cubetas de 19L; el precio se ajusta en automático.', margin + 3, y)
  y += 5
  doc.text('3. Cobro múltiple: Elige Efectivo (con cambio calculado), Tarjeta bancaria o Transferencia SPEI.', margin + 3, y)
  y += 5
  doc.text('4. Comprobante digital: Imprime el ticket térmico o envíalo directamente por WhatsApp al cliente.', margin + 3, y)

  y += 6
  y = drawImageBox(imgVender, y, 95, 'Figura 1: Interfaz del Punto de Venta con catálogo y carrito lateral.')

  // Tip
  doc.setFillColor(236, 253, 245)
  doc.setDrawColor(167, 243, 208)
  doc.roundedRect(margin, y, contentWidth, 14, 2, 2, 'FD')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(6, 95, 70)
  doc.text('TIP DE MOSTRADOR: DESHACER VENTA RÁPIDA', margin + 4, y + 5)
  doc.setFont('helvetica', 'normal')
  doc.text('Si te equivocaste al cobrar el último ticket, pulsa "Deshacer última venta" para anularla y regresar el stock.', margin + 4, y + 10)

  addFooter(2)

  // ==========================================
  // PÁGINA 3: CONTROL DE CAJA Y ARQUEO CIEGO
  // ==========================================
  doc.addPage()
  addHeader('CONTROL DE CAJA Y ARQUEOS')
  y = 20

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(15, 23, 42)
  doc.text('3. Control de Caja y Arqueo Ciego (Cortes X y Z)', margin, y)
  y += 6

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(51, 65, 85)
  doc.text('Protege el dinero físico de la tienda y asegura que el cajón cuadre al centavo todos los días:', margin, y)
  y += 5
  doc.text('• Apertura de turno: Registra el fondo de cambio inicial (ej. $500.00 MXN) y el cajero a cargo.', margin + 3, y)
  y += 5
  doc.text('• Tarjetas independientes: Visualiza por separado Efectivo en Cajón, Tarjetas y Transferencias.', margin + 3, y)
  y += 5
  doc.text('• Egresos tipificados: Registra salidas por gastos operativos (luz, fletes), compras o retiros seguros.', margin + 3, y)

  y += 6
  const imgCaja = getBase64Image('02_caja.png')
  y = drawImageBox(imgCaja, y, 92, 'Figura 2: Control de Caja con turno activo y desglose por forma de pago.')

  y += 4
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(15, 23, 42)
  doc.text('Diferencia entre Corte X y Corte Z:', margin, y)
  y += 6

  // Tabla explicativa
  doc.setFillColor(241, 245, 249)
  doc.rect(margin, y, contentWidth, 6, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(15, 23, 42)
  doc.text('Tipo de Corte', margin + 3, y + 4.5)
  doc.text('Momento de Uso', margin + 40, y + 4.5)
  doc.text('Objetivo y Funcionamiento', margin + 90, y + 4.5)
  y += 7

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text('Corte X (Parcial)', margin + 3, y + 3)
  doc.text('A mitad del turno', margin + 40, y + 3)
  doc.text('Muestra las ventas acumuladas SIN cerrar el turno de caja.', margin + 90, y + 3)
  y += 7

  doc.text('Corte Z (Cierre Final)', margin + 3, y + 3)
  doc.text('Al cerrar la tienda', margin + 40, y + 3)
  doc.text('Arqueo ciego: el cajero cuenta el dinero sin ver el cálculo. Muestra faltante/sobrante.', margin + 90, y + 3)

  addFooter(3)

  // ==========================================
  // PÁGINA 4: INVENTARIO FÍSICO Y MERMAS
  // ==========================================
  doc.addPage()
  addHeader('INVENTARIO Y MERMAS')
  y = 20

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(15, 23, 42)
  doc.text('4. Auditoría Física de Inventario con Escáner', margin, y)
  y += 6

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(51, 65, 85)
  doc.text('Elimina las horas de conteo con libreta y coteja tus anaqueles de forma continua:', margin, y)
  y += 5
  doc.text('1. Toma la pistola lectora o tu celular y ve caminando por los pasillos pistoleando cada bote.', margin + 3, y)
  y += 5
  doc.text('2. El sistema emite un beep sonoro y va sumando +1 pieza de forma continua e interactiva.', margin + 3, y)
  y += 5
  doc.text('3. Se genera la Matriz de Discrepancias mostrando faltantes, sobrantes y el impacto en dinero.', margin + 3, y)
  y += 5
  doc.text('4. Con "Aplicar Ajustes", sincronizas el inventario de la tienda con la realidad en un solo clic.', margin + 3, y)

  y += 6
  const imgAuditoria = getBase64Image('03_inventario_auditoria.png')
  y = drawImageBox(imgAuditoria, y, 78, 'Figura 3: Auditoría por Escáner y Matriz de Discrepancias en vivo.')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(15, 23, 42)
  doc.text('5. Registro de Mermas Tipificadas de Pintura', margin, y)
  y += 5

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(51, 65, 85)
  doc.text('Diferencia las pérdidas justificadas para efectos contables y administrativos:', margin, y)

  y += 4
  const imgMermas = getBase64Image('04_inventario_mermas.png')
  y = drawImageBox(imgMermas, y, 65, 'Figura 4: Módulo de Mermas por muestras a clientes, derrames o caducidad.')

  addFooter(4)

  // ==========================================
  // PÁGINA 5: SMART RESTOCK Y HOJA DE LLAMADA
  // ==========================================
  doc.addPage()
  addHeader('SMART RESTOCK Y PEDIDOS')
  y = 20

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(15, 23, 42)
  doc.text('6. Smart Restock y Hoja de Llamada para el Dueño', margin, y)
  y += 6

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(51, 65, 85)
  doc.text('Asistente inteligente de compras para que el dueño realice pedidos telefónicos con datos exactos:', margin, y)
  y += 5
  doc.text('• Cruce Inteligente: Detecta productos con Stock Bajo cruzados con los Top Más Vendidos.', margin + 3, y)
  y += 5
  doc.text('• Tarjetas con Foto: Cada tarjeta muestra la imagen del producto, existencias y badges de urgencia.', margin + 3, y)
  y += 5
  doc.text('• Hoja de Llamada por WhatsApp: Envía al dueño la lista lista para negociar durante la llamada telefónica.', margin + 3, y)
  y += 5
  doc.text('• Defensa de Precios: Muestra el último costo registrado para evitar aumentos sorpresa del proveedor.', margin + 3, y)

  y += 6
  const imgSugerencia = getBase64Image('05_resurtir_sugerencia.png')
  y = drawImageBox(imgSugerencia, y, 82, 'Figura 5: Sugerencias agrupadas por marca con fotos y botón de WhatsApp para el dueño.')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(15, 23, 42)
  doc.text('7. Recepción por Escáner en la Descarga del Camión', margin, y)
  y += 5

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(51, 65, 85)
  doc.text('El día que llega el camión con las cubetas a la tienda, coteja la entrega pistoleando en vivo:', margin, y)

  y += 4
  const imgOrdenes = getBase64Image('06_resurtir_ordenes.png')
  y = drawImageBox(imgOrdenes, y, 68, 'Figura 6: Órdenes en camino y botón para recepción por escáner con checklist.')

  addFooter(5)

  // ==========================================
  // PÁGINA 6: REPORTES EJECUTIVOS Y AJUSTES
  // ==========================================
  doc.addPage()
  addHeader('REPORTES CONTABLES Y AJUSTES')
  y = 20

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(15, 23, 42)
  doc.text('8. Analítica de Rentabilidad y Reportes para el Contador', margin, y)
  y += 6

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(51, 65, 85)
  doc.text('Toma decisiones basadas en margen real y exporta reportes directamente a Microsoft Excel:', margin, y)
  y += 5
  doc.text('• Margen por Categoría: Revisa el porcentaje de ganancia bruta de cada familia de productos.', margin + 3, y)
  y += 5
  doc.text('• Alerta de Stock Muerto: Detecta artículos sin ventas en 45/60/90 días y suma el capital estancado.', margin + 3, y)
  y += 5
  doc.text('• Exportación Excel (.csv UTF-8): Descarga Ventas Detalladas, Compras/Gastos y Valuación Total.', margin + 3, y)

  y += 6
  const imgMargen = getBase64Image('08_reportes_margen.png')
  y = drawImageBox(imgMargen, y, 78, 'Figura 7: Análisis de Margen y Aporte a la ganancia de la tienda por categoría.')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(15, 23, 42)
  doc.text('9. Configuración y Datos del Negocio', margin, y)
  y += 5

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(51, 65, 85)
  doc.text('Configura el nombre del local, datos del ticket y el WhatsApp del dueño para compras:', margin, y)

  y += 4
  const imgAjustes = getBase64Image('09_ajustes.png')
  y = drawImageBox(imgAjustes, y, 68, 'Figura 8: Pestaña Ajustes — Datos de ticket y WhatsApp del dueño para resurtido.')

  addFooter(6)

  // Guardar PDF en disco
  const pdfBytes = doc.output('arraybuffer')
  fs.writeFileSync(OUTPUT_PDF, Buffer.from(pdfBytes))
  console.log(`✅ Manual PDF generado exitosamente en: ${OUTPUT_PDF} (${(pdfBytes.byteLength / 1024).toFixed(1)} KB)`)
}

buildManualPdf().catch(console.error)
