import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { X } from 'lucide-react'

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
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-xs transition-opacity animate-fade-in md:items-center md:p-4">
      <div
        className={`flex max-h-[92vh] w-full flex-col rounded-t-3xl bg-white shadow-2xl animate-scale-in md:rounded-2xl dark:bg-slate-900 dark:border dark:border-slate-800 dark:shadow-black/60 ${
          wide ? 'md:max-w-2xl' : 'md:max-w-md'
        }`}
      >
        <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-slate-200 md:hidden dark:bg-slate-700" />
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5 dark:border-slate-800">
          <h2 className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
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
    <div className="inline-flex w-full gap-1 rounded-xl bg-slate-200/80 p-1 border border-slate-300/40 dark:bg-slate-800/90 dark:border-slate-700/60">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-lg px-3 py-1.5 text-xs sm:text-sm font-semibold tracking-tight transition-all duration-150 ${
            value === o.value
              ? 'bg-white text-primary shadow-xs dark:bg-slate-900 dark:text-white'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
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
    <div className="flex flex-col items-center justify-center gap-2.5 py-14 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15 dark:bg-primary/20 dark:text-emerald-400">
        {icon}
      </div>
      <p className="font-display text-base font-semibold text-slate-700 dark:text-slate-200">{title}</p>
      {hint && <p className="max-w-xs text-xs text-slate-400 dark:text-slate-500">{hint}</p>}
    </div>
  )
}
