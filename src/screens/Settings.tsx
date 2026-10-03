import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ImagePlus, Save, Store, Trash2, ScanLine, Package, Pencil, CloudUpload, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import type { BusinessInfo, Container } from '../types'
import { db } from '../db/db'
import { deleteContainer, saveContainer } from '../db/repos'
import { loadBusinessInfo, saveBusinessInfo } from '../lib/ticket'
import { loadScannerSettings, saveScannerSettings, type ScannerSettings } from '../lib/scanner'
import { uploadImage, migratePhotosToCloudinary, type MigrationProgress } from '../lib/image'
import { Button, Field, Input, Segmented, TextArea } from '../components/ui'

export default function Settings() {
  const [form, setForm] = useState<BusinessInfo>(() => loadBusinessInfo())
  const [scanner, setScanner] = useState<ScannerSettings>(() => loadScannerSettings())
  const [savingLogo, setSavingLogo] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const set = (patch: Partial<BusinessInfo>) => setForm((f) => ({ ...f, ...patch }))
  const setScannerPatch = (patch: Partial<ScannerSettings>) =>
    setScanner((s) => {
      const next = { ...s, ...patch }
      saveScannerSettings(next)
      return next
    })

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
    const loadingToast = toast.loading('Subiendo logo…')
    try {
      const url = await uploadImage(file)
      set({ logo: url })
      toast.success('Logo listo. Guarda los cambios para aplicarlo.', { id: loadingToast })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo subir la imagen', { id: loadingToast })
    } finally {
      setSavingLogo(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="mx-auto w-full max-w-xl space-y-4 p-3 pb-8">
      <div className="space-y-4 rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-800 dark:shadow-black/20">
        <div className="flex items-center gap-2">
          <Store className="h-5 w-5 text-primary" />
          <h1 className="font-display text-base font-semibold text-slate-800 dark:text-slate-100">
            Datos del negocio
          </h1>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Aparecen en la nota de venta impresa o enviada por WhatsApp.
        </p>

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
        <Field label="Teléfono de la tienda (opcional)">
          <Input
            value={form.phone ?? ''}
            onChange={(e) => set({ phone: e.target.value })}
            placeholder="555 123 4567"
            maxLength={30}
          />
        </Field>

        {/* Sección Dueño / Compras para envío de Hoja de Llamada por WhatsApp */}
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5 space-y-3 dark:border-emerald-900/60 dark:bg-emerald-950/20">
          <div>
            <span className="font-semibold text-sm text-emerald-900 dark:text-emerald-300 flex items-center gap-1.5">
              📱 Contacto del Dueño(a) para Resurtido
            </span>
            <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80 mt-0.5 leading-relaxed">
              A este número de WhatsApp se enviará con 1 clic la <strong>Hoja de Llamada</strong> con la lista de botes que faltan, códigos y precios anteriores para realizar los pedidos telefónicos a proveedores.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Field label="Nombre del Dueño(a) / Administrador">
              <Input
                value={form.ownerName ?? ''}
                onChange={(e) => set({ ownerName: e.target.value })}
                placeholder="Ej: Don Roberto / Lina"
                maxLength={50}
              />
            </Field>
            <Field label="WhatsApp del Dueño(a) (10 dígitos)">
              <Input
                value={form.ownerPhone ?? ''}
                onChange={(e) => set({ ownerPhone: e.target.value })}
                placeholder="Ej: 5512345678"
                type="tel"
                maxLength={20}
              />
            </Field>
          </div>
        </div>

        <Field label="Mensaje al pie del ticket (opcional)">
          <TextArea
            rows={2}
            value={form.footer ?? ''}
            onChange={(e) => set({ footer: e.target.value })}
            placeholder="¡Gracias por su compra!"
            maxLength={160}
          />
        </Field>

        <div>
          <span className="label">Logo comercial (opcional)</span>
          <div className="flex items-center gap-3">
            {form.logo ? (
              <img
                src={form.logo}
                alt="Logo"
                className="h-16 w-16 rounded-lg border border-slate-200 object-contain p-1 dark:border-slate-700 bg-white"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-slate-300 text-slate-400 dark:border-slate-700">
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

      <div className="space-y-3 rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-800 dark:shadow-black/20">
        <div className="flex items-center gap-2">
          <ScanLine className="h-5 w-5 text-primary" />
          <h2 className="font-display text-base font-semibold text-slate-800 dark:text-slate-100">
            Lector de código de barras (PC)
          </h2>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Para computadora con lector USB (ej. Volteck 2D alámbrico). El lector "escribe" el código como
          teclado; activa esto y escanea directo para agregar productos sin tocar la cámara.
        </p>
        <label className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Activar lector en PC</span>
          <input
            type="checkbox"
            checked={scanner.enabled}
            onChange={(e) => setScannerPatch({ enabled: e.target.checked })}
            className="h-5 w-5 accent-primary"
          />
        </label>
        <Field label="Terminador del lector">
          <Segmented
            value={scanner.suffix}
            onChange={(v) => setScannerPatch({ suffix: v })}
            options={[
              { value: 'Enter', label: 'Enter' },
              { value: 'Tab', label: 'Tab' },
            ]}
          />
        </Field>
      </div>

      <ContainersCard />
      <MigratePhotosCard />
    </div>
  )
}

function MigratePhotosCard() {
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)
  const [progress, setProgress] = useState<MigrationProgress | null>(null)
  const [result, setResult] = useState<{ migrated: number; errors: number } | null>(null)

  // Contar cuántas fotos Base64 hay aún en IndexedDB
  const pending = useLiveQuery(
    () => db.products.filter((p) => !!p.photo?.startsWith('data:image/')).count(),
    [],
  ) ?? 0

  if (pending === 0 && !done) return null

  const handleMigrate = async () => {
    setRunning(true)
    setResult(null)
    try {
      const res = await migratePhotosToCloudinary((p) => setProgress(p))
      setResult(res)
      setDone(true)
      if (res.migrated > 0) {
        toast.success(`${res.migrated} foto${res.migrated > 1 ? 's' : ''} migrada${res.migrated > 1 ? 's' : ''} a Cloudinary`)
      }
      if (res.errors > 0) {
        toast.error(`${res.errors} foto${res.errors > 1 ? 's' : ''} no pudieron subirse (se conservan en el dispositivo)`)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error en la migración')
    } finally {
      setRunning(false)
      setProgress(null)
    }
  }

  const pct = progress ? Math.round((progress.current / progress.total) * 100) : 0

  return (
    <div className="space-y-3 rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-800 dark:shadow-black/20">
      <div className="flex items-center gap-2">
        <CloudUpload className="h-5 w-5 text-primary" />
        <h2 className="font-display text-base font-semibold text-slate-800 dark:text-slate-100">
          Migrar fotos a Cloudinary
        </h2>
      </div>

      {done && result ? (
        <div className="flex items-center gap-2 rounded-xl bg-green-50 p-3 dark:bg-green-900/20">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
          <p className="text-sm text-green-700 dark:text-green-300">
            ¡Migración completa! {result.migrated} foto{result.migrated !== 1 ? 's' : ''} subida{result.migrated !== 1 ? 's' : ''} a la nube.
            {result.errors > 0 && ` ${result.errors} con error (conservadas localmente).`}
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Tienes <strong className="text-slate-700 dark:text-slate-200">{pending} foto{pending !== 1 ? 's' : ''}</strong> guardada{pending !== 1 ? 's' : ''} como Base64 en este dispositivo.
            Al migrarlas a Cloudinary estarán disponibles en todos tus dispositivos y la sincronización será más rápida.
          </p>

          {running && progress && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
                <span className="truncate pr-2">{progress.name}</span>
                <span className="shrink-0">{progress.current}/{progress.total}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )}

          <Button
            className="btn-primary w-full"
            disabled={running}
            onClick={() => void handleMigrate()}
          >
            <CloudUpload className="mr-2 inline h-4 w-4" />
            {running ? 'Migrando…' : `Subir ${pending} foto${pending !== 1 ? 's' : ''} a Cloudinary`}
          </Button>
        </>
      )}
    </div>
  )
}

function ContainersCard() {
  const containers = useLiveQuery(() => db.containers.orderBy('name').toArray(), []) ?? []
  const [editing, setEditing] = useState<Container | null>(null)
  const [name, setName] = useState('')
  const [liters, setLiters] = useState('')

  const startEdit = (c: Container) => {
    setEditing(c)
    setName(c.name)
    setLiters(String(c.liters))
  }
  const reset = () => {
    setEditing(null)
    setName('')
    setLiters('')
  }

  const save = async () => {
    try {
      await saveContainer({ id: editing?.id, name, liters: Number(liters) || 0 })
      toast.success(editing ? 'Envase actualizado' : 'Envase agregado')
      reset()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
    }
  }

  const remove = async (c: Container) => {
    if (!confirm(`¿Eliminar el envase "${c.name}"?`)) return
    await deleteContainer(c.id)
    toast.success('Envase eliminado')
    if (editing?.id === c.id) reset()
  }

  return (
    <div className="card space-y-4 p-5">
      <div className="flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
        <Package className="h-5 w-5 text-primary dark:text-emerald-400" />
        <h2 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
          Envases de compra
        </h2>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
        Contenedores con los que compras producto a granel (ej. Tanque de 50 L). Al registrar una compra por
        envase, el stock se acredita automáticamente en litros. Solo aplica a productos líquidos.
      </p>

      {containers.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
          {containers.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{c.name}</p>
                <p className="text-xs text-slate-400">Contiene {c.liters} L</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  onClick={() => startEdit(c)}
                  className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
                  aria-label={`Editar ${c.name}`}
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => void remove(c)}
                  className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30"
                  aria-label={`Eliminar ${c.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <Field label={editing ? `Editando: ${editing.name}` : 'Nuevo envase'}>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre, ej. Tanque 50 L"
            maxLength={40}
          />
        </Field>
        <Field label="Litros">
          <Input
            className="w-24"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={liters}
            onChange={(e) => setLiters(e.target.value)}
            placeholder="50"
          />
        </Field>
        <div className="flex gap-2 pb-0.5">
          {editing && (
            <Button type="button" className="btn-secondary" onClick={reset}>
              Cancelar
            </Button>
          )}
          <Button type="button" onClick={() => void save()}>
            {editing ? 'Guardar' : 'Agregar'}
          </Button>
        </div>
      </div>
    </div>
  )
}
