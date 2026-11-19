import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ImagePlus, Save, Store, Trash2, ScanLine, Package, Pencil, CloudUpload, CheckCircle2, CreditCard, Printer, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import type { BusinessInfo, Container, Sale } from '../types'
import { SaleNoteModal } from '../components/SaleNoteModal'
import { db } from '../db/db'
import { deleteContainer, saveContainer } from '../db/repos'
import { loadBusinessInfo, saveBusinessInfo } from '../lib/ticket'
import { notifyLocalChange } from '../lib/sync'
import { loadScannerSettings, saveScannerSettings, type ScannerSettings } from '../lib/scanner'
import { uploadImage, migratePhotosToCloudinary, type MigrationProgress } from '../lib/image'
import { Button, Field, Input, Segmented, TextArea } from '../components/ui'

const MOCK_TEST_SALE: Sale = {
  id: 'test-demo-123456',
  folio: 1,
  date: Date.now(),
  items: [
    {
      productId: 'demo-1',
      name: 'Pintura Vinílica Blanca Mate 4L',
      qty: 1,
      unit: 'litro',
      cost: 260,
      unitPrice: 380,
      lineTotal: 380,
    },
    {
      productId: 'demo-2',
      name: 'Brocha Profesional Cerda Natural 2 pulg',
      qty: 2,
      unit: 'pieza',
      cost: 28,
      unitPrice: 45,
      lineTotal: 90,
    },
  ],
  total: 470,
  payments: [{ type: 'efectivo', amount: 500 }],
  customerName: 'Cliente Demostración',
  customerPhone: '5512345678',
  notes: 'Ticket de prueba para impresora térmica Truper PDV-80I (80mm)',
}

export default function Settings() {
  const [form, setForm] = useState<BusinessInfo>(() => loadBusinessInfo())
  const [scanner, setScanner] = useState<ScannerSettings>(() => loadScannerSettings())
  const [autoprint, setAutoprint] = useState(() => {
    try {
      return localStorage.getItem('pos_autoprint_ticket') === '1'
    } catch {
      return false
    }
  })
  const [testSaleOpen, setTestSaleOpen] = useState(false)

  const toggleAutoprint = (enabled: boolean) => {
    setAutoprint(enabled)
    try {
      localStorage.setItem('pos_autoprint_ticket', enabled ? '1' : '0')
      if (enabled) {
        toast.success('Impresión automática activada al confirmar venta')
      } else {
        toast.info('Impresión manual activada')
      }
    } catch {
      // noop
    }
  }
  const [savingLogo, setSavingLogo] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onBusinessUpdated = () => {
      setForm(loadBusinessInfo())
    }
    window.addEventListener('pos:business_updated', onBusinessUpdated)
    return () => window.removeEventListener('pos:business_updated', onBusinessUpdated)
  }, [])

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
    notifyLocalChange()
    toast.success('Datos del negocio guardados y sincronizados')
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
              📱 Contacto del Dueño(a) / Supervisor y Resurtido
            </span>
            <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80 mt-0.5 leading-relaxed">
              Este contacto se imprimirá en el <strong>ticket de compra</strong> como atención/supervisor a cargo, y recibirá con 1 clic la <strong>Hoja de Llamada</strong> para pedidos de resurtido.
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

        <div id="settings-ticket-messages" className="scroll-mt-24 space-y-4">
        <Field label="Mensaje de cortesía al pie del ticket (opcional)">
          <TextArea
            rows={2}
            value={form.footer ?? ''}
            onChange={(e) => set({ footer: e.target.value })}
            placeholder="¡Gracias por su preferencia, vuelva pronto!"
            maxLength={160}
          />
        </Field>

        <Field label="Políticas de garantía, aclaraciones o devoluciones">
          <TextArea
            rows={2}
            value={form.warrantyNotice ?? ''}
            onChange={(e) => set({ warrantyNotice: e.target.value })}
            placeholder="Conserve este comprobante para cualquier aclaración o garantía."
            maxLength={180}
          />
        </Field>
        </div>

        {/* Desglose de IVA en tickets */}
        <div id="settings-iva-toggle" className="scroll-mt-24 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-700 dark:bg-slate-900/50">
          <label className="flex items-center justify-between cursor-pointer">
            <div className="pr-4">
              <span className="text-sm font-bold text-slate-800 dark:text-slate-200 block">
                Desglosar IVA (16%) en tickets impresos
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 block mt-0.5">
                Desactívalo para mostrar únicamente el <strong>TOTAL neto</strong> sin imprimir los renglones de Subtotal e IVA (recomendado si vendes a público general y no desglosas impuestos).
              </span>
            </div>
            <input
              type="checkbox"
              checked={form.showIvaBreakdown ?? false}
              onChange={(e) => set({ showIvaBreakdown: e.target.checked })}
              className="h-5 w-5 accent-primary cursor-pointer shrink-0"
            />
          </label>
        </div>

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

      {/* ─── IMPRESORA TÉRMICA DE TICKETS (80mm / 58mm) ─── */}
      <div id="settings-thermal-printer" className="scroll-mt-24 space-y-3.5 rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-800 dark:shadow-black/20 border border-slate-200/80 dark:border-slate-700">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary dark:bg-emerald-950/60 dark:text-emerald-400">
              <Printer className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display text-base font-bold text-slate-800 dark:text-slate-100">
                  Impresora Térmica de Tickets
                </h2>
                <span className="rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 text-[10px] font-black px-2 py-0.5">
                  80mm / 58mm
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Compatible con Truper PDV-80I, Xprinter y terminales USB / Bluetooth
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setTestSaleOpen(true)}
            className="self-start sm:self-auto px-3.5 py-2 rounded-xl bg-gradient-to-r from-primary to-primary-600 text-white text-xs font-bold shadow-xs hover:from-primary-600 hover:to-primary-700 transition active:scale-95 flex items-center gap-1.5 dark:from-emerald-600 dark:to-emerald-500 dark:text-slate-950 cursor-pointer"
          >
            <Printer className="h-4 w-4" />
            <span>Imprimir Ticket de Prueba</span>
          </button>
        </div>

        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          Tus notas de venta se generan con formato optimizado de <strong>80mm</strong>, con corte automático de papel, logotipo, desglose de impuestos (IVA), desglose de cambio entregado y código de barras.
        </p>

        {/* Switch de Impresión Automática */}
        <div className="rounded-xl border border-slate-200/90 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-900/50">
          <label className="flex items-center justify-between cursor-pointer">
            <div className="pr-4">
              <span className="text-sm font-bold text-slate-800 dark:text-slate-200 block">
                Impresión automática al cobrar
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 block mt-0.5">
                Al confirmar una venta en caja, abre inmediatamente la orden de impresión para no dar clics adicionales.
              </span>
            </div>
            <input
              type="checkbox"
              checked={autoprint}
              onChange={(e) => toggleAutoprint(e.target.checked)}
              className="h-5 w-5 accent-primary cursor-pointer shrink-0"
            />
          </label>
        </div>

        {/* Guía rápida para Truper PDV-80I */}
        <div className="rounded-xl border border-amber-200/80 bg-amber-50/60 p-3 text-xs dark:border-amber-900/50 dark:bg-amber-950/20 space-y-1.5">
          <span className="font-bold text-amber-900 dark:text-amber-300 flex items-center gap-1">
            <Sparkles className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" /> Tips para tu impresora Truper PDV-80I:
          </span>
          <ul className="list-disc list-inside space-y-1 text-amber-950/80 dark:text-amber-200/80 leading-snug">
            <li><strong>Colocación del rollo:</strong> El papel térmico debe alimentar saliendo por enfrente (cara térmica hacia arriba). Si sale en blanco, voltea el rollo.</li>
            <li><strong>Ancho de papel:</strong> Usa el ancho completo de 80mm (no es necesario colocar el separador plástico para rollos de 80mm).</li>
            <li><strong>Diálogo de impresión:</strong> En la ventana de tu navegador, selecciona <em>Márgenes: Ninguno</em> y desmarca <em>"Encabezados y pies de página"</em> para que el ticket salga limpio.</li>
          </ul>
        </div>
      </div>

      {/* Cobro con tarjeta en Cubetas de 19L */}
      <div className="space-y-4 rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-800 dark:shadow-black/20">
        <div className="flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-amber-500" />
          <h2 className="font-display text-base font-semibold text-slate-800 dark:text-slate-100">
            Cobro con tarjeta en cubetas de 19 Litros
          </h2>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          En cubetas de 19 Litros aplica un precio diferenciado al cobrar con tarjeta (terminal bancaria) para proteger tu margen de ganancia.
        </p>

        <label className="flex items-center justify-between cursor-pointer">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
            Activar sobreprecio en cubetas con tarjeta
          </span>
          <input
            type="checkbox"
            checked={form.bucketCardSurchargeEnabled ?? true}
            onChange={(e) => set({ bucketCardSurchargeEnabled: e.target.checked })}
            className="h-5 w-5 accent-primary cursor-pointer"
          />
        </label>

        {(form.bucketCardSurchargeEnabled ?? true) && (
          <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-700/60">
            <Field label="Tipo de sobreprecio">
              <Segmented
                value={form.bucketCardSurchargeType ?? 'fixed'}
                onChange={(v) => set({ bucketCardSurchargeType: v as 'fixed' | 'percent' })}
                options={[
                  { value: 'fixed', label: '$ Fijo por cubeta (ej. $50)' },
                  { value: 'percent', label: '% Porcentaje (ej. 4%)' },
                ]}
              />
            </Field>

            <Field
              label={
                form.bucketCardSurchargeType === 'percent'
                  ? 'Porcentaje extra con tarjeta (%)'
                  : 'Monto extra en pesos por cubeta ($ MXN)'
              }
            >
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.5"
                value={form.bucketCardSurchargeAmount != null ? String(form.bucketCardSurchargeAmount) : '50'}
                onChange={(e) =>
                  set({
                    bucketCardSurchargeAmount: e.target.value === '' ? 0 : Number(e.target.value),
                  })
                }
                placeholder="50"
              />
            </Field>

            <div className="rounded-xl border border-amber-200/80 bg-amber-50/70 p-3 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
              <p className="font-semibold">💡 Ejemplo en mostrador:</p>
              <p className="mt-0.5">
                Una cubeta de $1,200 se cobrará a <strong>$1,200 en efectivo</strong> y a{' '}
                <strong>
                  ${form.bucketCardSurchargeType === 'percent'
                    ? (1200 * (1 + (form.bucketCardSurchargeAmount ?? 50) / 100)).toFixed(2)
                    : (1200 + (form.bucketCardSurchargeAmount ?? 50)).toFixed(2)}{' '}
                  en tarjeta
                </strong>
                .
              </p>
            </div>

            <Button className="btn-primary w-full" onClick={handleSave}>
              <Save className="mr-2 inline h-4 w-4" />
              Guardar configuración de cubetas
            </Button>
          </div>
        )}
      </div>

      <ContainersCard />
      <MigratePhotosCard />

      {testSaleOpen && (
        <SaleNoteModal
          sale={MOCK_TEST_SALE}
          onClose={() => setTestSaleOpen(false)}
          isTest
        />
      )}
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
