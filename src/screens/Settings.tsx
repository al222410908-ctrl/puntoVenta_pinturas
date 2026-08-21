import { useRef, useState } from 'react'
import { ImagePlus, Save, Store, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { BusinessInfo } from '../types'
import { loadBusinessInfo, saveBusinessInfo } from '../lib/ticket'
import { compressImageFile } from '../lib/image'
import { Button, Field, Input, TextArea } from '../components/ui'

export default function Settings() {
  const [form, setForm] = useState<BusinessInfo>(() => loadBusinessInfo())
  const [savingLogo, setSavingLogo] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const set = (patch: Partial<BusinessInfo>) => setForm((f) => ({ ...f, ...patch }))

  const handleSave = () => {
    if (!form.name.trim()) {
      toast.error('El nombre del negocio es obligatorio')
      return
    }
    saveBusinessInfo({ ...form, name: form.name.trim() })
    toast.success('Datos del negocio guardados')
  }

  const handleLogo = async (file: File | undefined) => {
    if (!file) return
    setSavingLogo(true)
    try {
      const dataUrl = await compressImageFile(file)
      set({ logo: dataUrl })
      toast.success('Logo listo. Guarda los cambios para aplicarlo.')
    } catch {
      toast.error('No se pudo procesar la imagen')
    } finally {
      setSavingLogo(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="mx-auto w-full max-w-xl space-y-4">
      <div className="flex items-center gap-2">
        <Store className="h-5 w-5 text-primary" />
        <h1 className="font-display text-lg font-semibold text-slate-800 dark:text-slate-100">
          Datos del negocio
        </h1>
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Aparecen en la nota de venta que envías por WhatsApp o descargas en PDF.
      </p>

      <div className="space-y-3 rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-800 dark:shadow-black/20">
        <Field label="Nombre del negocio *">
          <Input
            value={form.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="Pinturas El Buen Color"
            maxLength={60}
          />
        </Field>
        <Field label="Dirección (opcional)">
          <Input
            value={form.address ?? ''}
            onChange={(e) => set({ address: e.target.value })}
            placeholder="Av. Principal 123, Col. Centro"
            maxLength={120}
          />
        </Field>
        <Field label="Teléfono (opcional)">
          <Input
            value={form.phone ?? ''}
            onChange={(e) => set({ phone: e.target.value })}
            placeholder="555 123 4567"
            maxLength={30}
          />
        </Field>
        <Field label="Mensaje al pie (opcional)">
          <TextArea
            rows={2}
            value={form.footer ?? ''}
            onChange={(e) => set({ footer: e.target.value })}
            placeholder="¡Gracias por su compra!"
            maxLength={160}
          />
        </Field>

        <div>
          <span className="label">Logo (opcional)</span>
          <div className="flex items-center gap-3">
            {form.logo ? (
              <img
                src={form.logo}
                alt="Logo"
                className="h-16 w-16 rounded-lg border border-slate-200 object-contain dark:border-slate-600"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-slate-300 text-slate-400 dark:border-slate-600">
                <Store className="h-6 w-6" />
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Button
                type="button"
                className="btn-secondary"
                disabled={savingLogo}
                onClick={() => fileRef.current?.click()}
              >
                <ImagePlus className="mr-2 inline h-4 w-4" />
                {savingLogo ? 'Procesando…' : form.logo ? 'Cambiar logo' : 'Subir logo'}
              </Button>
              {form.logo && (
                <Button type="button" className="btn-danger" onClick={() => set({ logo: undefined })}>
                  <Trash2 className="mr-2 inline h-4 w-4" />
                  Quitar
                </Button>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => void handleLogo(e.target.files?.[0])}
            />
          </div>
        </div>

        <Button className="btn-primary w-full" onClick={handleSave}>
          <Save className="mr-2 inline h-4 w-4" />
          Guardar cambios
        </Button>
      </div>
    </div>
  )
}
