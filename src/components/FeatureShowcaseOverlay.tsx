import { useState, useEffect } from 'react'
import {
  Sparkles,
  X,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  MousePointer2,
  PanelLeft,
  Sun,
  Plus,
  Truck,
} from 'lucide-react'
import { sound } from '../lib/sound'

interface Step {
  title: string
  subtitle: string
  description: string
  targetTab: 'vender' | 'resurtir'
  position: 'left-sidebar' | 'top-hero' | 'catalog-card' | 'restock-kpis'
  icon: typeof Sparkles
  badge: string
}

const STEPS: Step[] = [
  {
    title: '1. Menú Lateral Plegable',
    subtitle: 'Ahorro de espacio & Apertura fluida',
    description:
      'El menú lateral ahora se mantiene compacto a 72px para darte máxima visibilidad. Al pasar el cursor, se despliega suavemente a 256px y puedes fijarlo con el botón superior.',
    targetTab: 'vender',
    position: 'left-sidebar',
    icon: PanelLeft,
    badge: 'Demostración 1 de 4',
  },
  {
    title: '2. Hero Mostrador & KPIs en Vivo',
    subtitle: 'Bienvenida inteligente y control del día',
    description:
      'En tu pantalla de venta, el mostrador saluda según la hora (mañana, tarde o noche) y te muestra en vivo las notas facturadas hoy, dinero acumulado y alertas de resurtido.',
    targetTab: 'vender',
    position: 'top-hero',
    icon: Sun,
    badge: 'Demostración 2 de 4',
  },
  {
    title: '3. Stepper Táctil en Catálogo',
    subtitle: 'Ajuste instantáneo sin entrar al carrito',
    description:
      'Al agregar un producto, la tarjeta resalta que ya está en orden y te muestra los controles directos [-] y [+] para modificar piezas al instante con sonido y feedback táctil.',
    targetTab: 'vender',
    position: 'catalog-card',
    icon: Plus,
    badge: 'Demostración 3 de 4',
  },
  {
    title: '4. Pantalla de Resurtimiento',
    subtitle: 'Inversión estimada, presets y pedidos',
    description:
      '¡Mira cómo cambiamos a la sección de Resurtir! Aquí tienes las nuevas tarjetas con la inversión en MXN necesaria, el buscador por proveedor y los presets automáticos (+Mínimo / +Lote).',
    targetTab: 'resurtir',
    position: 'restock-kpis',
    icon: Truck,
    badge: 'Demostración 4 de 4',
  },
]

export function FeatureShowcaseOverlay({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [currentStep, setCurrentStep] = useState(0)

  // Al abrir o cambiar de paso, navegar activamente a la pantalla que corresponde
  useEffect(() => {
    if (!open) {
      setCurrentStep(0)
      return
    }
    const step = STEPS[currentStep]
    if (step) {
      window.dispatchEvent(new CustomEvent('pos:navigate_tab', { detail: step.targetTab }))
      sound.beep(850, 0.04)
    }
  }, [open, currentStep])

  if (!open) return null

  const step = STEPS[currentStep]
  const isLast = currentStep === STEPS.length - 1
  const Icon = step.icon

  const handleNext = () => {
    if (isLast) {
      sound.beep(1200, 0.08)
      // Regresar a la pantalla de venta al terminar
      window.dispatchEvent(new CustomEvent('pos:navigate_tab', { detail: 'vender' }))
      onClose()
    } else {
      sound.beep(950, 0.04)
      setCurrentStep((c) => c + 1)
    }
  }

  const handlePrev = () => {
    if (currentStep > 0) {
      sound.beep(650, 0.04)
      setCurrentStep((c) => c - 1)
    }
  }

  const handleClose = () => {
    window.dispatchEvent(new CustomEvent('pos:navigate_tab', { detail: 'vender' }))
    onClose()
  }

  // Coordenadas precisas para cada zona de la interfaz real
  const getCoordinates = () => {
    switch (step.position) {
      case 'left-sidebar':
        return {
          pointer: 'left-6 top-32 md:left-14 md:top-36',
          box: 'left-4 top-52 md:left-24 md:top-44',
          label: 'Menú Lateral',
        }
      case 'top-hero':
        return {
          pointer: 'left-1/2 -translate-x-1/2 top-20 md:left-[45%] md:top-16',
          box: 'left-1/2 -translate-x-1/2 top-44 md:left-[45%] md:top-36',
          label: 'Hero Mostrador',
        }
      case 'catalog-card':
        return {
          pointer: 'left-1/2 -translate-x-1/2 top-[52%] md:left-[46%] md:top-[48%]',
          box: 'left-1/2 -translate-x-1/2 bottom-8 md:left-[46%] md:bottom-12',
          label: 'Stepper del Catálogo',
        }
      case 'restock-kpis':
        return {
          pointer: 'left-1/2 -translate-x-1/2 top-28 md:left-[50%] md:top-24',
          box: 'left-1/2 -translate-x-1/2 top-52 md:left-[50%] md:top-44',
          label: 'Dashboard de Resurtimiento',
        }
      default:
        return {
          pointer: 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2',
          box: 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2',
          label: 'Novedad',
        }
    }
  }

  const coords = getCoordinates()

  return (
    <div className="fixed inset-0 z-[100000] overflow-hidden pointer-events-auto select-none animate-fadeIn">
      {/* Fondo translúcido con desenfoque suave para no tapar la interfaz real */}
      <div
        className="absolute inset-0 bg-slate-950/45 backdrop-blur-[1.5px] transition-all duration-500"
        onClick={handleClose}
      />

      {/* Cursor virtual animado que se mueve directamente a la parte física de la pantalla */}
      <div
        className={`absolute z-30 transition-all duration-700 ease-out pointer-events-none ${coords.pointer}`}
      >
        <div className="relative flex items-center justify-center">
          {/* Ondas expansivas de radar */}
          <span className="absolute -inset-4 rounded-full bg-emerald-400/50 animate-ping" />
          <span className="absolute -inset-8 rounded-full bg-amber-400/30 animate-pulseGlow" />

          {/* Cursor estilizado */}
          <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-primary to-primary-600 text-amber-300 shadow-2xl border-2 border-white ring-4 ring-primary/25 animate-float">
            <MousePointer2 className="h-6 w-6 fill-amber-300 text-slate-950 stroke-[1.8] -rotate-12 translate-x-0.5 translate-y-0.5" />
          </div>

          {/* Badge con el nombre de la sección real */}
          <div className="absolute left-14 top-1 rounded-full bg-slate-900/95 text-white px-3.5 py-1 text-xs font-black border border-white/20 shadow-2xl whitespace-nowrap backdrop-blur-md animate-fadeIn flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 text-amber-300" />
            <span>{coords.label}</span>
          </div>
        </div>
      </div>

      {/* Tarjeta Flotante Explicativa */}
      <div
        className={`absolute z-40 w-full max-w-sm sm:max-w-md transition-all duration-500 ease-out px-4 ${coords.box}`}
      >
        <div className="card bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl rounded-3xl p-5 sm:p-6 shadow-[0_25px_60px_rgba(0,0,0,0.5)] border border-slate-200/90 dark:border-slate-800 text-slate-900 dark:text-slate-100">
          {/* Header de la tarjeta */}
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary dark:bg-emerald-950/60 dark:text-emerald-400 text-xs font-black uppercase tracking-wider">
              <Icon className="h-3.5 w-3.5 text-accent" />
              {step.badge}
            </span>

            <button
              type="button"
              onClick={handleClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition cursor-pointer"
              title="Cerrar demostración"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <h3 className="font-display text-lg sm:text-xl font-black text-slate-900 dark:text-white tracking-tight">
            {step.title}
          </h3>
          <p className="text-xs font-bold text-accent dark:text-amber-300 mt-0.5 mb-2">
            {step.subtitle}
          </p>

          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            {step.description}
          </p>

          {/* Barra de progreso interactiva */}
          <div className="mt-4 flex items-center gap-1.5">
            {STEPS.map((_, idx) => (
              <div
                key={idx}
                className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                  idx === currentStep
                    ? 'bg-primary dark:bg-emerald-500'
                    : idx < currentStep
                    ? 'bg-primary/40 dark:bg-emerald-500/40'
                    : 'bg-slate-200 dark:bg-slate-800'
                }`}
              />
            ))}
          </div>

          {/* Botones de navegación */}
          <div className="mt-5 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={handlePrev}
              disabled={currentStep === 0}
              className="px-3 py-2 rounded-xl border border-slate-200/80 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 transition active:scale-95 disabled:opacity-30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 cursor-pointer flex items-center gap-1"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Anterior</span>
            </button>

            <button
              type="button"
              onClick={handleNext}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-primary to-primary-600 text-white text-xs font-black shadow-md shadow-primary/25 hover:from-primary-600 hover:to-primary-700 active:scale-95 transition cursor-pointer flex items-center gap-1.5 dark:from-emerald-600 dark:to-emerald-500 dark:text-slate-950"
            >
              <span>{isLast ? 'Finalizar Demostración' : 'Siguiente Parte'}</span>
              {isLast ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <ArrowRight className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
