import { APP_VERSION } from './version'

export interface NovedadVersion {
  categoria: 'Novedad' | 'Mejora' | 'Seguridad' | 'Operación'
  titulo: string
  descripcion: string
  badge?: string
  color: 'emerald' | 'amber' | 'blue' | 'purple' | 'rose'
  iconoTipo?: 'sparkles' | 'shield' | 'layers' | 'truck' | 'layout' | 'printer'
}

export interface ReleaseNotes {
  version: string
  fecha: string
  titulo: string
  subtitulo: string
  novedades: NovedadVersion[]
}

export const HISTORIAL_VERSIONES: ReleaseNotes[] = [
  {
    version: 'v2.6.0',
    fecha: 'Noviembre 2026',
    titulo: '¡Soporte Oficial Impresora Térmica 80mm & Modo Alto Contraste!',
    subtitulo:
      'Integración total con impresoras térmicas USB y Bluetooth (Truper PDV-80I), tickets térmicos en negro puro ultra nítido, corte automático a la medida y panel de pruebas en Ajustes.',
    novedades: [
      {
        categoria: 'Novedad',
        titulo: 'Soporte Oficial para Impresoras Térmicas 80mm / 58mm (Truper PDV-80I)',
        descripcion:
          'El sistema ahora formatea automáticamente tus notas de venta para impresoras térmicas de 80mm por cable USB y Bluetooth, con encabezado de tienda, logotipo, tabla de productos, desglose de impuestos y código de barras.',
        badge: 'Impresión & Hardware',
        color: 'emerald',
        iconoTipo: 'printer',
      },
      {
        categoria: 'Mejora',
        titulo: 'Modo Térmico Ultra Alto Contraste (Negro Puro Sólido)',
        descripcion:
          'Se forzaron todos los textos del ticket a negro 100% (#000000) con mayor peso de fuente. La cabeza térmica quema con máxima fuerza eliminando cualquier texto deslavado o borroso.',
        badge: 'Nitidez & Calidad',
        color: 'amber',
        iconoTipo: 'sparkles',
      },
      {
        categoria: 'Operación',
        titulo: 'Corte a la Medida sin Desperdicio de Papel',
        descripcion:
          'El enlace de la tienda y la numeración de hoja ahora están integrados dentro del ticket. Con márgenes cero y la guillotina automática configurada, corta justo donde termina la nota sin desenrollar papel en blanco.',
        badge: 'Ahorro de Papel',
        color: 'blue',
        iconoTipo: 'layers',
      },
      {
        categoria: 'Novedad',
        titulo: 'Panel de Impresora en Ajustes con Ticket de Prueba & Autoprint',
        descripcion:
          'Nueva tarjeta en Ajustes para probar tu impresora con 1 clic sin tocar el inventario real, y opción para activar la impresión automática en cada venta cobrada.',
        badge: 'Ajustes & Flujo Rápido',
        color: 'purple',
        iconoTipo: 'layout',
      },
    ],
  },
  {
    version: 'v2.5.0',
    fecha: 'Noviembre 2026',
    titulo: `¡Novedades de la Versión ${APP_VERSION}!`,
    subtitulo:
      'Nueva experiencia visual adaptada de ConVeMe: pantalla de seguridad Cosmos Glassmorphism, menú lateral plegable, mostrador con KPIs en vivo, steppers táctiles y resurtido avanzado.',
    novedades: [
      {
        categoria: 'Novedad',
        titulo: 'Menú Lateral Plegable con Apertura Suave (Hover Expand)',
        descripcion:
          'El menú lateral ahora se pliega a 72px para dar máxima amplitud a la pantalla del mostrador. Al pasar el cursor, se despliega suavemente a 256px mostrando los nombres y badges completos. Incluye botón para fijarlo si lo deseas.',
        badge: 'Navegación & Ergonomía',
        color: 'emerald',
        iconoTipo: 'layout',
      },
      {
        categoria: 'Operación',
        titulo: 'Hero Mostrador Inteligente con KPIs y Saludo en Vivo',
        descripcion:
          'Encabezado dinámico que saluda según la hora del día (matutino, vespertino o cierre) y calcula en tiempo real las ventas de hoy, el monto facturado, alertas de resurtido y conteo de cubetas 19L.',
        badge: 'Caja & Mostrador',
        color: 'amber',
        iconoTipo: 'sparkles',
      },
      {
        categoria: 'Mejora',
        titulo: 'Stepper Táctil Directo en la Tarjeta de Catálogo',
        descripcion:
          'Ya no necesitas abrir el carrito para ajustar cantidades. Las tarjetas ahora detectan si un producto está en orden y muestran controles directos [-] y [+] con respuesta táctil elástica y tonos sintetizados.',
        badge: 'Catálogo & POS',
        color: 'blue',
        iconoTipo: 'layers',
      },
      {
        categoria: 'Novedad',
        titulo: 'Dashboard y Timeline de 4 Fases en Resurtimiento',
        descripcion:
          'Módulo de resurtido repotenciado con tarjetas de inversión requerida en tiempo real, buscador instantáneo, selector por proveedor, presets rápidos (+Mínimo, +Lote), alerta de aumento de costo y avance visual de pedidos.',
        badge: 'Compras & Logística',
        color: 'purple',
        iconoTipo: 'truck',
      },
      {
        categoria: 'Seguridad',
        titulo: 'Bloqueo Cosmos Glassmorphism con PIN Táctil y Físico',
        descripcion:
          'Pantalla de acceso renovada con atmósfera dual de alta tecnología, orbes luminosos, PIN Pad táctil neo-brutalista, soporte nativo de teclado numérico (0-9) y encriptación SHA-256 local.',
        badge: 'Seguridad & Acceso',
        color: 'rose',
        iconoTipo: 'shield',
      },
    ],
  },
]

export function getUltimaVersion(): ReleaseNotes {
  return HISTORIAL_VERSIONES[0]
}
