import { APP_VERSION } from './version'

export interface NovedadVersion {
  categoria: 'Novedad' | 'Mejora' | 'Seguridad' | 'Operación'
  titulo: string
  descripcion: string
  badge?: string
  color: 'emerald' | 'amber' | 'blue' | 'purple' | 'rose'
  iconoTipo?: 'sparkles' | 'shield' | 'layers' | 'truck' | 'layout'
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
    version: APP_VERSION,
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
