import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  Sparkles,
  CheckCircle2,
  ShieldCheck,
  Layers,
  Truck,
  Layout,
  Tag,
  Play,
  X,
} from 'lucide-react'
import { getUltimaVersion, type NovedadVersion } from '../config/changelog'
import { APP_VERSION } from '../config/version'
import { FeatureShowcaseOverlay } from './FeatureShowcaseOverlay'
import { sound } from '../lib/sound'

interface ActualizacionModalProps {
  forceOpen?: boolean
  onClose?: () => void
}

export function ActualizacionModal({
  forceOpen = false,
  onClose,
}: ActualizacionModalProps) {
  const release = getUltimaVersion()
  const [isOpen, setIsOpen] = useState(false)
  const [showAnimationTour, setShowAnimationTour] = useState(false)

  useEffect(() => {
    // Escuchar evento manual para abrir el modal (ej. clic en el footer del sidebar)
    const handleManualOpen = () => setIsOpen(true)
    window.addEventListener('pos:open_changelog', handleManualOpen)

    if (forceOpen) {
      setIsOpen(true)
      return () => window.removeEventListener('pos:open_changelog', handleManualOpen)
    }

    // Verificar si el usuario ya vio las novedades de esta versión
    try {
      const lastSeen = localStorage.getItem('pos_last_seen_changelog')
      if (lastSeen !== (release.version || APP_VERSION)) {
        // Retardo suave para que cargue la interfaz primero
        const timer = setTimeout(() => {
          setIsOpen(true)
          sound.beep(800, 0.05)
        }, 800)
        return () => {
          clearTimeout(timer)
          window.removeEventListener('pos:open_changelog', handleManualOpen)
        }
      }
    } catch {
      // Ignorar fallo de storage
    }

    return () => window.removeEventListener('pos:open_changelog', handleManualOpen)
  }, [forceOpen, release.version])

  const guardarVisto = () => {
    try {
      localStorage.setItem('pos_last_seen_changelog', release.version || APP_VERSION)
    } catch {
      // noop
    }
  }

  const handleCerrarSimple = () => {
    guardarVisto()
    setIsOpen(false)
    if (onClose) onClose()
  }

  const handleIniciarTourAnimado = () => {
    guardarVisto()
    setIsOpen(false)
    setShowAnimationTour(true)
  }

  if (!isOpen && !showAnimationTour) return null

  const renderIcono = (item: NovedadVersion) => {
    switch (item.iconoTipo) {
      case 'shield':
        return <ShieldCheck className="text-rose-500 shrink-0" size={18} />
      case 'layout':
        return <Layout className="text-emerald-500 shrink-0" size={18} />
      case 'layers':
        return <Layers className="text-blue-500 shrink-0" size={18} />
      case 'truck':
        return <Truck className="text-purple-500 shrink-0" size={18} />
      default:
        return <Sparkles className="text-amber-500 shrink-0" size={18} />
    }
  }

  const getCategoryStyles = (color: NovedadVersion['color']) => {
    switch (color) {
      case 'rose':
        return {
          pill: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200/80 dark:border-rose-800/40',
          dot: 'bg-rose-500',
        }
      case 'amber':
        return {
          pill: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200/80 dark:border-amber-800/40',
          dot: 'bg-amber-500',
        }
      case 'emerald':
        return {
          pill: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200/80 dark:border-emerald-800/40',
          dot: 'bg-emerald-500',
        }
      case 'purple':
        return {
          pill: 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200/80 dark:border-purple-800/40',
          dot: 'bg-purple-500',
        }
      case 'blue':
        return {
          pill: 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200/80 dark:border-blue-800/40',
          dot: 'bg-blue-500',
        }
      default:
        return {
          pill: 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700',
          dot: 'bg-slate-500',
        }
    }
  }

  const modalContent = (
    <>
      {isOpen && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-fadeIn">
          {/* Fondo con blur cinematográfico */}
          <div
            className="fixed inset-0 bg-slate-950/75 backdrop-blur-md transition-opacity"
            onClick={handleCerrarSimple}
          />

          {/* Contenedor Principal del Modal */}
          <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200/90 dark:border-slate-800 overflow-hidden transform transition-all duration-300 flex flex-col max-h-[92vh] sm:max-h-[90vh]">
            {/* Cabecera con degradado Pino Profundo & Logo oficial */}
            <div className="relative px-5 sm:px-6 pt-5 sm:pt-6 pb-4 sm:pb-5 bg-gradient-to-br from-[#061e18] via-[#10352a] to-[#174a3b] text-white overflow-hidden shrink-0">
              {/* Círculos de luz decorativos de fondo */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-400/15 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
              <div className="absolute bottom-0 left-0 w-48 h-48 bg-amber-400/10 rounded-full blur-2xl pointer-events-none -ml-10 -mb-10" />

              {/* Fila superior: Logo institucional + Píldora de versión */}
              <div className="relative flex items-center justify-between gap-3 mb-3">
                <div className="bg-white px-2.5 py-1.5 rounded-xl shadow-md border border-white/20 inline-flex items-center justify-center shrink-0">
                  <img
                    src="/logopintura.jpeg"
                    alt="Pinturas POS"
                    className="h-6 sm:h-7 w-auto object-cover rounded-md"
                  />
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="px-3 py-1 rounded-full bg-amber-400/20 border border-amber-400/40 text-amber-300 text-xs font-mono font-bold shadow-sm">
                    {release.version}
                  </span>
                  <span className="text-[10px] text-slate-300 font-medium hidden sm:inline">
                    {release.fecha}
                  </span>
                  <button
                    type="button"
                    onClick={handleCerrarSimple}
                    className="p-1 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition cursor-pointer"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Fila de título y subtítulo */}
              <div className="relative">
                <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1.5 mb-1">
                  <Sparkles size={13} className="text-amber-400 shrink-0" />
                  Actualización del Sistema · <span className="text-emerald-200 font-medium">{release.fecha}</span>
                </span>
                <h2 className="text-lg sm:text-2xl font-black tracking-tight text-white leading-tight">
                  {release.titulo}
                </h2>
                <p className="text-xs sm:text-sm text-emerald-100/90 mt-2 leading-relaxed">
                  {release.subtitulo}
                </p>
              </div>
            </div>

            {/* Lista de Novedades y Mejoras (Scrollable) */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-3 bg-slate-50/60 dark:bg-slate-900/60 grow">
              <div className="flex items-center justify-between pb-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <Tag size={13} className="text-primary dark:text-emerald-400" />
                  Resumen de cambios implementados
                </span>
                <span className="text-[11px] text-slate-400">
                  {release.novedades.length} mejoras activas
                </span>
              </div>

              {release.novedades.map((item, index) => {
                const styles = getCategoryStyles(item.color)
                return (
                  <div
                    key={index}
                    className="bg-white dark:bg-slate-800/90 p-3.5 sm:p-4 rounded-2xl border border-slate-200/70 dark:border-slate-700/60 shadow-xs hover:shadow-md transition-shadow group"
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-700/60 shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                        {renderIcono(item)}
                      </div>

                      <div className="grow min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 mb-1">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-md border flex items-center gap-1 ${styles.pill}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${styles.dot}`} />
                            {item.categoria}
                          </span>

                          {item.badge && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                              {item.badge}
                            </span>
                          )}
                        </div>

                        <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white mb-0.5">
                          {item.titulo}
                        </h4>

                        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                          {item.descripcion}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Pie del modal con acciones */}
            <div className="p-4 sm:p-5 bg-white dark:bg-slate-900 border-t border-slate-200/80 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
              <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500">
                <CheckCircle2 size={15} className="text-emerald-500 shrink-0" />
                <span>Punto de venta y catálogo 100% listos.</span>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={handleCerrarSimple}
                  className="w-1/2 sm:w-auto px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold transition active:scale-95 cursor-pointer"
                >
                  Entendido
                </button>

                <button
                  type="button"
                  onClick={handleIniciarTourAnimado}
                  className="w-1/2 sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-primary to-primary-600 text-white font-black text-xs shadow-md shadow-primary/25 hover:from-primary-600 hover:to-primary-700 active:scale-95 transition cursor-pointer flex items-center justify-center gap-2 dark:from-emerald-600 dark:to-emerald-500 dark:text-slate-950"
                  title="Ver animación de dónde se han puesto las novedades"
                >
                  <Play size={14} className="fill-current" />
                  <span>Ver Animación de Novedades</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Showcase / Tour Animado de Referencia */}
      <FeatureShowcaseOverlay
        open={showAnimationTour}
        onClose={() => {
          setShowAnimationTour(false)
          if (onClose) onClose()
        }}
      />
    </>
  )

  return createPortal(modalContent, document.body)
}

/**
 * Función utilitaria para abrir el modal desde cualquier parte del sistema.
 */
export function abrirModalActualizacion() {
  window.dispatchEvent(new CustomEvent('pos:open_changelog'))
}
