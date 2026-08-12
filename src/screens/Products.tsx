import { useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, Package, Tag, Truck, Search, Sparkles, Image as ImageIcon, Download, Upload } from 'lucide-react'
import { db } from '../db/db'
import { markDeleted } from '../db/repos'
import { notifyLocalChange } from '../lib/sync'
import type { Category, Product, Supplier, Unit } from '../types'
import { UNITS } from '../lib/units'
import { formatMoney, round2, uid } from '../lib/utils'
import { ProductForm } from '../components/ProductForm'
import { Button, EmptyState, Field, Input, Modal, Segmented, Select, TextArea } from '../components/ui'

type Tab = 'productos' | 'categorias' | 'proveedores'

type SampleProduct = Omit<Product, 'id' | 'stock' | 'categoryId' | 'supplierId'> & {
  category: string
  supplier: string
  stock: number
}

const SAMPLE_CATEGORIES = ['Pinturas', 'Herramientas', 'Ferretería']

const SAMPLE_SUPPLIERS = [
  { name: 'Comex', contact: 'Distribuidor de pinturas', phone: '555-1234' },
  { name: 'Truper', contact: 'Herramientas y ferretería', phone: '555-5678' },
  { name: 'Distribuidora El Sol', contact: 'Consumibles', phone: '555-9012' },
]

const SAMPLE_PRODUCTS: SampleProduct[] = [
  { category: 'Pinturas', supplier: 'Comex', name: 'Pintura vinílica blanca 19L', unit: 'litro', fractional: true, price: 1190, cost: 980, minStock: 4, stock: 3, barcode: '7501001', subcategory: 'Pintura de agua', subsubcategory: 'Vinílica' },
  { category: 'Pinturas', supplier: 'Comex', name: 'Pintura vinílica blanca 4L', unit: 'litro', fractional: true, price: 320, cost: 250, minStock: 6, stock: 7, barcode: '7501002', subcategory: 'Pintura de agua', subsubcategory: 'Vinílica' },
  { category: 'Pinturas', supplier: 'Comex', name: 'Pintura esmalte rojo 1L', unit: 'litro', fractional: true, price: 145, cost: 110, minStock: 8, stock: 5, subcategory: 'Esmalte', subsubcategory: 'Al aceite' },
  { category: 'Pinturas', supplier: 'Comex', name: 'Thinner estándar 1L', unit: 'litro', fractional: true, price: 60, cost: 42, minStock: 10, stock: 12, barcode: '7501003' },
  { category: 'Herramientas', supplier: 'Truper', name: 'Brocha truper 2"', unit: 'pieza', fractional: false, price: 35, cost: 22, minStock: 12, stock: 9, barcode: '7502001' },
  { category: 'Herramientas', supplier: 'Truper', name: 'Rodillo truper 9"', unit: 'pieza', fractional: false, price: 55, cost: 36, minStock: 10, stock: 14, barcode: '7502002' },
  { category: 'Ferretería', supplier: 'Distribuidora El Sol', name: 'Clavo de acero 2" (caja x50)', unit: 'pieza', fractional: false, price: 0.6, cost: 0.4, minStock: 150, stock: 100, isPackage: true, pkgUnits: 50, pkgQty: 2, barcode: '7503001' },
  { category: 'Ferretería', supplier: 'Distribuidora El Sol', name: 'Cinta de aislar', unit: 'pieza', fractional: false, price: 18, cost: 12, minStock: 20, stock: 24, barcode: '7503002' },
  { category: 'Ferretería', supplier: 'Distribuidora El Sol', name: 'Lija para agua #120', unit: 'pieza', fractional: false, price: 8, cost: 4.5, minStock: 50, stock: 60 },
  { category: 'Ferretería', supplier: 'Distribuidora El Sol', name: 'Alambre galvanizado', unit: 'metro', fractional: true, price: 9, cost: 6, minStock: 50, stock: 30 },
]

const CSV_HEAD = ['Nombre', 'Código barras', 'Código compra', 'Categoría', 'Proveedor', 'Unidad', 'Fraccionario', 'Precio', 'Costo', 'Stock', 'Mínimo', 'Es paquete', 'Unidades por paquete']

function csvEsc(v: unknown) {
  return `"${String(v ?? '').replace(/\r?\n/g, ' ').replace(/"/g, '""')}"`
}

function csvJoin() {
  const example = ['Pintura vinílica blanca 4L', '7501002', '8762378', 'Pinturas', 'Comex', 'Litro', '', '320', '250', '7', '6', '', '']
  const examplePkg = ['Clavo de acero 2"', '7503001', '', 'Ferretería', 'Distribuidora El Sol', 'Pieza', '', '0.6', '0.4', '100', '150', 'Sí', '50']
  return [CSV_HEAD, example, examplePkg].map((r) => r.map(csvEsc).join(',')).join('\r\n')
}

function downloadCsv(filename: string, text: string) {
  const blob = new Blob(['\ufeff' + text], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  const push = () => {
    row.push(field)
    field = ''
  }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (ch === '"') inQuotes = false
      else field += ch
    } else if (ch === '"') inQuotes = true
    else if (ch === ',') push()
    else if (ch === '\n') { push(); rows.push(row); row = [] }
    else if (ch === '\r') { if (text[i + 1] !== '\n') {} } 
    else field += ch
  }
  push()
  rows.push(row)
  return rows
}

const normKey = (s: string) => s.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/gi, '')

export default function Products() {
  const [tab, setTab] = useState<Tab>('productos')
  return (
    <div className="flex h-full flex-col">
      <div className="p-3">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'productos', label: 'Productos' },
            { value: 'categorias', label: 'Categorías' },
            { value: 'proveedores', label: 'Proveedores' },
          ]}
        />
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-6">
        {tab === 'productos' && <ProductList />}
        {tab === 'categorias' && <CategoryList />}
        {tab === 'proveedores' && <SupplierList />}
      </div>
    </div>
  )
}

function ProductList() {
  const products = useLiveQuery(() => db.products.toArray(), []) ?? []
  const categories = useLiveQuery(() => db.categories.toArray(), []) ?? []
  const suppliers = useLiveQuery(() => db.suppliers.toArray(), []) ?? []
  const [search, setSearch] = useState('')
  const [supFilter, setSupFilter] = useState('')
  const [editing, setEditing] = useState<Product | null>(null)
  const [creating, setCreating] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<Product | null>(null)
  const importRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return products.filter(
      (p) =>
        (!q || p.name.toLowerCase().includes(q) || (p.barcode ?? '').includes(q)) &&
        (!supFilter || p.supplierId === supFilter),
    )
  }, [products, search, supFilter])

  const catName = (id?: string) => categories.find((c) => c.id === id)?.name
  const supName = (id?: string) => suppliers.find((s) => s.id === id)?.name

  const seed = async () => {
    if (products.length > 0) {
      toast.error('Ya hay productos cargados. Vacía el inventario para recargar los de ejemplo.')
      return
    }
    const catIds: Record<string, string> = {}
    for (const name of SAMPLE_CATEGORIES) {
      const existing = await db.categories.where('name').equals(name).first()
      if (existing) catIds[name] = existing.id
      else {
        const id = uid()
        await db.categories.add({ id, name, updatedAt: Date.now() })
        catIds[name] = id
      }
    }
    const supIds: Record<string, string> = {}
    for (const s of SAMPLE_SUPPLIERS) {
      const existing = await db.suppliers.where('name').equals(s.name).first()
      if (existing) supIds[s.name] = existing.id
      else {
        const id = uid()
        await db.suppliers.add({ id, ...s, updatedAt: Date.now() })
        supIds[s.name] = id
      }
    }
    await db.products.bulkAdd(
      SAMPLE_PRODUCTS.map((p) => {
        const { category, supplier, ...rest } = p
        return {
          ...rest,
          id: uid(),
          updatedAt: Date.now(),
          categoryId: catIds[category],
          supplierId: supIds[supplier],
        }
      }),
    )
    notifyLocalChange()
    toast.success('10 productos de ejemplo cargados')
  }

  const exportCsv = () => {
    const rows = [CSV_HEAD, ...[...filtered].sort((a, b) => a.name.localeCompare(b.name)).map((p) => [
      p.name,
      p.barcode ?? '',
      p.purchaseCode ?? '',
      catName(p.categoryId) ?? '',
      supName(p.supplierId) ?? '',
      UNITS.find((u) => u.value === p.unit)?.label ?? p.unit,
      p.fractional ? 'Sí' : '',
      String(p.price),
      String(p.cost),
      String(p.stock),
      String(p.minStock),
      p.isPackage ? 'Sí' : '',
      p.isPackage ? String(p.pkgUnits ?? '') : '',
    ])]
    downloadCsv(`productos-${new Date().toISOString().slice(0, 10)}.csv`, rows.map((r) => r.map(csvEsc).join(',')).join('\r\n'))
    toast.success(`Catálogo exportado (${filtered.length} productos)`)
  }

  const importCsv = async (file: File) => {
    try {
      const text = await file.text()
      const rows = parseCsv(text).map((r) => r.map((c) => c.trim().replace(/^\uFEFF/, '')))
      if (rows.length < 2 || rows[0].length === 0) {
        toast.error('El archivo no tiene datos')
        return
      }
      const headerIdx = (key: string) =>
        rows[0].findIndex((h) => normKey(h) === normKey(key))
      const iName = headerIdx('nombre')
      if (iName === -1) {
        toast.error('Falta la columna "nombre" en el archivo')
        return
      }
      let added = 0
      let updated = 0
      let skipped = 0
      for (const row of rows.slice(1)) {
        const name = row[iName]
        if (!name) { skipped++; continue }
        const price = Number(row[headerIdx('precio')] || 0)
        if (!(price > 0)) { skipped++; continue }
        const unitLabel = row[headerIdx('unidad')]
        const unit = UNITS.find((u) => u.label.toLowerCase() === unitLabel.toLowerCase())?.value ?? 'pieza'
        const fractional = ['sí', 'si', '1', 'verdadero', 'true'].includes(row[headerIdx('fraccionario')]?.toLowerCase() ?? '')
          || (unit !== 'pieza' && unit !== 'metro' && !unitLabel)
        const isPackage = ['sí', 'si', '1', 'verdadero', 'true'].includes(row[headerIdx('espaquete')]?.toLowerCase() ?? '')
        const pkgUnits = isPackage ? parseFloat(row[headerIdx('unidadesporpaquete')] || '0') || 0 : 0
        const cost = parseFloat(row[headerIdx('costo')] || '0') || 0
        const stock = parseFloat(row[headerIdx('stock')] || '0') || 0
        const minStock = parseFloat(row[headerIdx('mínimo')] || '0') || 0
        const catName2 = row[headerIdx('categoría')]
        const supName2 = row[headerIdx('proveedor')]
        let categoryId
        if (catName2) {
          const existingC = await db.categories.where('name').equals(catName2).first()
          if (existingC) categoryId = existingC.id
          else {
            categoryId = uid()
            await db.categories.add({ id: categoryId, name: catName2, updatedAt: Date.now() })
          }
        }
        let supplierId
        if (supName2) {
          const existingS = await db.suppliers.where('name').equals(supName2).first()
          if (existingS) supplierId = existingS.id
          else {
            supplierId = uid()
            await db.suppliers.add({ id: supplierId, name: supName2, contact: '', phone: '', updatedAt: Date.now() })
          }
        }
const data = {
          name,
          barcode: row[headerIdx('codigobarras')] || row[headerIdx('codigo')] || undefined,
          purchaseCode: row[headerIdx('codigocompra')] || undefined,
          categoryId,
          supplierId,
          unit: (isPackage ? 'pieza' : unit) as Unit,
          fractional: isPackage ? false : fractional,
          price,
          cost,
          stock,
          minStock,
          isPackage: isPackage || undefined,
          pkgUnits: isPackage && pkgUnits > 0 ? pkgUnits : undefined,
          pkgQty: isPackage && pkgUnits > 0 ? round2(stock / pkgUnits) : undefined,
        }
        const existing = await db.products.where('name').equals(name).first()
        if (existing) {
          await db.products.update(existing.id, { ...data, updatedAt: Date.now() })
          updated++
        } else {
          await db.products.add({ ...data, id: uid(), updatedAt: Date.now() })
          added++
        }
      }
      const msg = `Importados: ${added} nuevos, ${updated} actualizados${skipped ? `, ${skipped} omitidos` : ''}`
      notifyLocalChange()
      if (added + updated === 0) toast.error(msg)
      else toast.success(msg)
    } catch {
      toast.error('No se pudo leer el archivo CSV')
    } finally {
      if (importRef.current) importRef.current.value = ''
    }
  }

  return (
    <div>
      <div className="mb-3 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
          <Input className="pl-9" placeholder="Buscar producto…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" />Nuevo</Button>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select value={supFilter} onChange={(e) => setSupFilter(e.target.value)} className="min-w-40 flex-1 sm:flex-none">
          <option value="">Todos los proveedores</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        <div className="flex gap-2">
          <Button className="btn-secondary" onClick={exportCsv} title="Descargar catálogo en CSV">
            <Download className="h-4 w-4" />Exportar
          </Button>
          <Button className="btn-secondary" onClick={() => importRef.current?.click()} title="Importar productos desde un CSV">
            <Upload className="h-4 w-4" />Importar
          </Button>
          <input
            ref={importRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void importCsv(f)
            }}
          />
        </div>
      </div>
      <p className="mb-3 -mt-1 text-xs text-slate-400 dark:text-slate-500">
        El CSV necesita columnas: {[...CSV_HEAD.slice(0, 2), 'Precio'].join(', ')}…
        <button onClick={() => downloadCsv(`plantilla-productos.csv`, csvJoin())} className="ml-1 font-medium text-primary underline">
          Descargar plantilla
        </button>
      </p>

      {products.length === 0 ? (
        <div className="card p-6 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-300">No hay productos todavía.</p>
          <Button className="mt-4" onClick={() => void seed()}><Sparkles className="h-4 w-4" />Cargar productos de ejemplo</Button>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Package className="h-10 w-10" />} title="Sin resultados" />
      ) : (
        <div className="space-y-2">
          {filtered.map((p) => (
            <div key={p.id} className="card flex items-center gap-3 p-3">
              {p.photo ? (
                <img src={p.photo} alt={p.name} className="h-12 w-12 shrink-0 rounded-lg object-cover" />
              ) : (
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-700">
                  <ImageIcon className="h-5 w-5 text-slate-400 dark:text-slate-500" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-slate-800 dark:text-slate-100">{p.name}</p>
                <p className="text-xs text-slate-400">
                  {p.barcode && `Código ${p.barcode} · `}
                  {p.purchaseCode && `Compra ${p.purchaseCode} · `}
                  {catName(p.categoryId) ?? 'Sin categoría'} · {supName(p.supplierId) ?? 'Sin proveedor'}
                  {p.isPackage && p.pkgUnits ? ` · ${p.pkgUnits} pza/paquete` : ''}
                </p>
                <p className={`mt-0.5 text-sm ${p.stock <= p.minStock ? 'font-semibold text-red-600 dark:text-red-400' : 'text-slate-600 dark:text-slate-300'}`}>
                  Stock: {p.stock} · Mínimo: {p.minStock}
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-slate-800 dark:text-slate-100">{formatMoney(p.price)}</p>
                <p className="text-xs text-slate-400">Costo {formatMoney(p.cost)}</p>
              </div>
              <div className="flex gap-1">
                <button onClick={() => setEditing(p)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"><Pencil className="h-4 w-4" /></button>
                <button onClick={() => setConfirmDelete(p)} className="rounded-lg p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <ProductForm
          product={editing}
          categories={categories}
          suppliers={suppliers}
          onClose={() => { setCreating(false); setEditing(null) }}
        />
      )}

      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Eliminar producto">
        <p className="text-sm text-slate-600 dark:text-slate-300">¿Eliminar <b>{confirmDelete?.name}</b>? Esta acción no se puede deshacer.</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button className="btn-secondary" onClick={() => setConfirmDelete(null)}>Cancelar</Button>
          <Button
            className="btn-danger"
            onClick={() => {
              if (confirmDelete) {
                void db.transaction('rw', [db.products, db.tombstones], async () => {
                  await db.products.delete(confirmDelete.id)
                  await markDeleted('products', confirmDelete.id)
                }).then(() => notifyLocalChange())
              }
              setConfirmDelete(null)
              toast.success('Producto eliminado')
            }}
          >
            Eliminar
          </Button>
        </div>
      </Modal>
    </div>
  )
}

function CategoryList() {
  const categories = useLiveQuery(() => db.categories.toArray(), []) ?? []
  const [name, setName] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<Category | null>(null)

  const deleteCategory = async (c: Category) => {
    const products = await db.products.toArray()
    const ids = products.filter((p) => p.categoryId === c.id).map((p) => p.id)
    await db.transaction('rw', [db.categories, db.products, db.tombstones], async () => {
      await db.categories.delete(c.id)
      await markDeleted('categories', c.id)
      await Promise.all(ids.map((id) => db.products.update(id, { categoryId: undefined, updatedAt: Date.now() })))
    })
    notifyLocalChange()
    toast.success(`Categoría "${c.name}" eliminada${ids.length ? ` (${ids.length} producto${ids.length === 1 ? '' : 's'} sin categoría)` : ''}`)
  }

  return (
    <div>
      <form
        className="mb-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim()) return
          void db.categories.add({ id: uid(), name: name.trim(), updatedAt: Date.now() }).then(() => notifyLocalChange())
          setName('')
          toast.success('Categoría agregada')
        }}
      >
        <Input placeholder="Nueva categoría…" value={name} onChange={(e) => setName(e.target.value)} />
        <Button type="submit"><Plus className="h-4 w-4" />Agregar</Button>
      </form>
      {categories.length === 0 ? (
        <EmptyState icon={<Tag className="h-10 w-10" />} title="Sin categorías" />
      ) : (
        <div className="space-y-2">
          {categories.map((c) => (
            <div key={c.id} className="card flex items-center justify-between p-3">
              <span className="font-medium text-slate-800 dark:text-slate-100">{c.name}</span>
              <button
                onClick={() => setConfirmDelete(c)}
                className="rounded-lg p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Eliminar categoría">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          ¿Eliminar <b>{confirmDelete?.name}</b>? Los productos que la usan quedarán sin categoría (no se borran).
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button className="btn-secondary" onClick={() => setConfirmDelete(null)}>Cancelar</Button>
          <Button
            className="btn-danger"
            onClick={() => {
              if (confirmDelete) void deleteCategory(confirmDelete)
              setConfirmDelete(null)
            }}
          >
            Eliminar
          </Button>
        </div>
      </Modal>
    </div>
  )
}

function SupplierList() {
  const suppliers = useLiveQuery(() => db.suppliers.toArray(), []) ?? []
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Supplier | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Supplier | null>(null)

  const deleteSupplier = async (s: Supplier) => {
    const products = await db.products.toArray()
    const ids = products.filter((p) => p.supplierId === s.id).map((p) => p.id)
    await db.transaction('rw', [db.suppliers, db.products, db.tombstones], async () => {
      await db.suppliers.delete(s.id)
      await markDeleted('suppliers', s.id)
      await Promise.all(ids.map((id) => db.products.update(id, { supplierId: undefined, updatedAt: Date.now() })))
    })
    notifyLocalChange()
    toast.success(`Proveedor "${s.name}" eliminado${ids.length ? ` (${ids.length} producto${ids.length === 1 ? '' : 's'} sin proveedor)` : ''}`)
  }

  return (
    <div>
      <div className="mb-3">
        <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" />Nuevo proveedor</Button>
      </div>
      {suppliers.length === 0 ? (
        <EmptyState icon={<Truck className="h-10 w-10" />} title="Sin proveedores" hint="Agrega a tus 3 proveedores para el resurtimiento" />
      ) : (
        <div className="space-y-2">
          {suppliers.map((s) => (
            <div key={s.id} className="card flex items-center justify-between p-3">
              <div className="mr-2 min-w-0">
                <p className="font-medium text-slate-800 dark:text-slate-100">{s.name}</p>
                <p className="truncate text-xs text-slate-400">{s.contact ?? ''}{s.phone ? ` · ${s.phone}` : ''}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button onClick={() => setEditing(s)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700">
                  <Pencil className="h-4 w-4" />
                </button>
                <button onClick={() => setConfirmDelete(s)} className="rounded-lg p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {(creating || editing) && (
        <SupplierForm supplier={editing} onClose={() => { setCreating(false); setEditing(null) }} />
      )}

      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Eliminar proveedor">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          ¿Eliminar <b>{confirmDelete?.name}</b>? Los productos que lo usan quedarán sin proveedor (no se borran).
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button className="btn-secondary" onClick={() => setConfirmDelete(null)}>Cancelar</Button>
          <Button
            className="btn-danger"
            onClick={() => {
              if (confirmDelete) void deleteSupplier(confirmDelete)
              setConfirmDelete(null)
            }}
          >
            Eliminar
          </Button>
        </div>
      </Modal>
    </div>
  )
}

function SupplierForm({ supplier, onClose }: { supplier: Supplier | null; onClose: () => void }) {
  const [form, setForm] = useState({
    name: supplier?.name ?? '',
    contact: supplier?.contact ?? '',
    phone: supplier?.phone ?? '',
    notes: supplier?.notes ?? '',
  })

  const save = async () => {
    if (!form.name.trim()) {
      toast.error('El nombre es obligatorio')
      return
    }
    const data = {
      name: form.name.trim(),
      contact: form.contact.trim() || undefined,
      phone: form.phone.trim() || undefined,
      notes: form.notes.trim() || undefined,
    }
    if (supplier) {
      await db.suppliers.update(supplier.id, { ...data, updatedAt: Date.now() })
      notifyLocalChange()
      toast.success('Proveedor actualizado')
    } else {
      await db.suppliers.add({ ...data, id: uid(), updatedAt: Date.now() })
      notifyLocalChange()
      toast.success('Proveedor agregado')
    }
    onClose()
  }

  return (
    <Modal open onClose={onClose} title={supplier ? 'Editar proveedor' : 'Nuevo proveedor'}>
      <div className="space-y-3">
        <Field label="Nombre *">
          <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </Field>
        <Field label="Contacto">
          <Input value={form.contact} onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))} />
        </Field>
        <Field label="Teléfono">
          <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
        </Field>
        <Field label="Notas">
          <TextArea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button className="btn-secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => void save()}>Guardar</Button>
        </div>
      </div>
    </Modal>
  )
}
