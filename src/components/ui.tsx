import { useEffect, useState, type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { X, Image as ImageIcon } from 'lucide-react'

export function Button({
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`btn ${className}`} {...props} />
}

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`input ${className}`} {...props} />
}

export function Select({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`input ${className}`} {...props} />
}

export function TextArea({ className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`input ${className}`} {...props} />
}

export function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  )
}

export function SafeImage({
  src,
  alt,
  className = '',
  fallbackIcon,
}: {
  src?: string | null
  alt: string
  className?: string
  fallbackIcon?: ReactNode
}) {
  const [error, setError] = useState(false)

  // Reset error when src changes
  useEffect(() => {
    setError(false)
  }, [src])

  if (!src || error) {
    return (
      <div className={`flex items-center justify-center bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-500 ${className}`}>
        {fallbackIcon || <ImageIcon className="h-5 w-5" />}
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={alt}
      className={`object-cover ${className}`}
      loading="lazy"
      onError={() => setError(true)}
    />
  )
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/70 backdrop-blur-sm p-0 transition-opacity duration-200 md:items-center md:p-4">
      <div
        className={`flex max-h-[92dvh] md:max-h-[90vh] w-full flex-col rounded-t-3xl border border-slate-200/90 bg-white shadow-2xl md:rounded-3xl dark:border-slate-700/80 dark:bg-slate-900 dark:shadow-2xl dark:shadow-black/70 ${
          wide ? 'md:max-w-2xl' : 'md:max-w-md'
        }`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-3.5 dark:border-slate-800">
          <h2 className="font-display text-base font-bold tracking-tight text-slate-800 dark:text-slate-100">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  )
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
}) {
  return (
    <div className="flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/60 shadow-2xs">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-lg px-3.5 py-1.5 text-xs sm:text-sm font-semibold transition-all duration-150 ${
            value === o.value
              ? 'bg-white text-primary shadow-xs ring-1 ring-slate-200/80 dark:bg-slate-900 dark:text-emerald-400 dark:ring-slate-700'
              : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function EmptyState({ icon, title, hint }: { icon: ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100/90 text-slate-400 ring-1 ring-slate-200/80 dark:bg-slate-800/80 dark:text-slate-400 dark:ring-slate-700/60 shadow-2xs">
        {icon}
      </div>
      <div>
        <p className="font-semibold text-slate-700 dark:text-slate-200 text-sm">{title}</p>
        {hint && <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500 max-w-xs">{hint}</p>}
      </div>
    </div>
  )
}

