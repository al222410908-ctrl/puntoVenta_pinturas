import { useState, useEffect, useCallback } from 'react'
import {
  Sparkles,
  X,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  MousePointer2,
  FileText,
  Percent,
  Printer,
  Zap,
} from 'lucide-react'
import { sound } from '../lib/sound'

interface Step {
  title: string
  subtitle: string
  description: string
  targetTab: 'vender' | 'ajustes'
  elementId: string
  label: string
  icon: typeof Sparkles
  badge: string
}

const STEPS: Step[] = [
  {
    title: '1. Mensajes y Garantías en Tickets',
    subtitle: 'Personaliza los textos del comprobante',
    description:
      'Ahora puedes redactar libremente el mensaje de cortesía al pie del ticket y tus políticas de devolución, garantía o aclaraciones.',
    targetTab: 'ajustes',
    elementId: 'settings-ticket-messages',
    label: 'Políticas y Mensajes',
    icon: FileText,
    badge: 'Novedad 1 de 4',
  },
  {
    title: '2. Control de Desglose de IVA',
    subtitle: 'Tickets claros sin confusiones',
    description:
      'Si no requieres desglosar IVA a tus clientes, desactiva este switch para que el ticket impreso solo muestre el total neto final.',
    targetTab: 'ajustes',
    elementId: 'settings-iva-toggle',
    label: 'Desglose de IVA',
    icon: Percent,
    badge: 'Novedad 2 de 4',
  },
  {
    title: '3. Impresora Térmica 80mm & Prueba',
    subtitle: 'Tickets nítidos sin desperdiciar papel',
    description:
      'Tira un ticket de prueba con 1 clic para verificar la calidad en tu Truper PDV-80I o de 80mm y activa la impresión automática al cobrar.',
    targetTab: 'ajustes',
    elementId: 'settings-thermal-printer',
    label: 'Impresora Térmica 80mm',
    icon: Printer,
    badge: 'Novedad 3 de 4',
  },
  {
    title: '4. Cobro Exprés con [Enter] & Escaneo',
    subtitle: 'Cobro instantáneo y consulta digital',
    description:
      'En la terminal de cobro rápido presiona [Enter] para completar e imprimir tu venta. Además, escanea el código de barras o QR de cualquier ticket para ver su nota digital.',
    targetTab: 'vender',
    elementId: 'pos-search',
    label: 'Cobro Exprés & Búsqueda',
    icon: Zap,
    badge: 'Novedad 4 de 4',
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
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768)
  const [pointerPos, setPointerPos] = useState({ x: 0, y: 0 })
  const [cardPos, setCardPos] = useState<'top' | 'bottom'>('bottom')

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Actualizar la posición del radar hacia el elemento objetivo en pantalla
  const updateTargetPosition = useCallback((elementId: string) => {
    const el = document.getElementById(elementId)
    if (el) {
      const rect = el.getBoundingClientRect()
      // Calcular punto focal (centro o ligeramente hacia la izquierda del elemento)
      const targetX = Math.round(rect.left + Math.min(rect.width / 2, 100))
      const targetY = Math.round(Math.max(70, Math.min(window.innerHeight - 80, rect.top + 24)))
      setPointerPos({ x: targetX, y: targetY })

      // Si el elemento está en la mitad inferior, colocar la tarjeta explicativa arriba
      setCardPos(rect.top > window.innerHeight / 2 ? 'top' : 'bottom')
    } else {
      // Coordenada por defecto centrada si aún no monta
      setPointerPos({
        x: Math.round(window.innerWidth / 2),
        y: Math.round(window.innerHeight / 3),
      })
      setCardPos('bottom')
    }
  }, [])

  // Al abrir o cambiar de paso, navegar activamente y hacer scroll suave al elemento
  useEffect(() => {
    if (!open) {
      setCurrentStep(0)
      return
    }

    const step = STEPS[currentStep]
    if (!step) return

    // 1. Navegar a la pestaña correspondiente
    window.dispatchEvent(new CustomEvent('pos:navigate_tab', { detail: step.targetTab }))
    sound.beep(850, 0.04)

    // 2. Esperar brevemente a que el DOM monte o cambie de vista, luego hacer scroll suave
    const timer1 = setTimeout(() => {
      const el = document.getElementById(step.elementId)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
      updateTargetPosition(step.elementId)
    }, 180)

    // 3. Ajuste fino de coordenadas post-scroll
    const timer2 = setTimeout(() => {
      updateTargetPosition(step.elementId)
    }, 450)

    const timer3 = setTimeout(() => {
      updateTargetPosition(step.elementId)
    }, 750)

    return () => {
      clearTimeout(timer1)
      clearTimeout(timer2)
      clearTimeout(timer3)
    }
  }, [open, currentStep, updateTargetPosition])

  // Seguir al elemento si el usuario hace scroll manual durante el tour
  useEffect(() => {
    if (!open) return
    const step = STEPS[currentStep]
    if (!step) return

    const handleScrollOrResize = () => {
      updateTargetPosition(step.elementId)
    }

    window.addEventListener('scroll', handleScrollOrResize, { passive: true })
    window.addEventListener('resize', handleScrollOrResize, { passive: true })

    return () => {
      window.removeEventListener('scroll', handleScrollOrResize)
      window.removeEventListener('resize', handleScrollOrResize)
    }
  }, [open, currentStep, updateTargetPosition])

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

  return (
    <div className="fixed inset-0 z-[100000] overflow-hidden pointer-events-auto select-none animate-fadeIn">
      {/* Fondo translúcido con desenfoque suave para no tapar la interfaz real */}
      <div
        className="absolute inset-0 bg-slate-950/45 backdrop-blur-[1.5px] transition-all duration-500"
        onClick={handleClose}
      />

      {/* Cursor virtual animado que se mueve directamente a la sección física en pantalla */}
      <div
        className="fixed top-0 left-0 z-30 transition-all duration-500 ease-out pointer-events-none"
        style={{
          transform: `translate3d(${pointerPos.x}px, ${pointerPos.y}px, 0)`,
        }}
      >
        <div className="relative -translate-x-1/2 -translate-y-1/2 flex items-center justify-center">
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
            <span>{step.label}</span>
          </div>
        </div>
      </div>

      {/* Tarjeta Flotante Explicativa (se ajusta dinámicamente arriba o abajo para no tapar el objetivo) */}
      <div
        className={`fixed z-40 w-full max-w-sm sm:max-w-md transition-all duration-500 ease-out px-4 left-1/2 -translate-x-1/2 ${
          isMobile
            ? 'bottom-[calc(env(safe-area-inset-bottom)+1.25rem)]'
            : cardPos === 'top'
            ? 'top-8 md:top-12'
            : 'bottom-8 md:bottom-12'
        }`}
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
