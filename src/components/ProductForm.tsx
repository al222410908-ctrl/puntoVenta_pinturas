import { useMemo, useState, type ChangeEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { toast } from 'sonner'
import { Calculator, Check, ImagePlus, Image as ImageIcon, Trash2 } from 'lucide-react'
import { db } from '../db/db'
import { notifyLocalChange } from '../lib/sync'
import type { Category, Product, Supplier, Unit } from '../types'
import {
  UNITS,
  UNIT_LABELS,
  defaultPresentations,
  productPresentations,
  unitPlural,
  isLiquid,
} from '../lib/units'
import { formatMoney, round2, uid } from '../lib/utils'
import { compressImageFile } from '../lib/image'
import { Button, Field, Input, Modal, Select } from '../components/ui'

function dedupe(values: string[]): string[] {
  return [...new Set(values)]
}

const EMPTY_PRODUCT = {
  name: '',
  barcode: '',
  purchaseCode: '',
  categoryId: '',
  supplierId: '',
  unit: 'pieza' as const,
  fractional: false,
  price: '',
  cost: '',
  stock: '',
  minStock: '0',
}

export function ProductForm({
  product,
  categories,
  suppliers,
  onClose,
}: {
  product: Product | null
  categories: Category[]
  suppliers: Supplier[]
  onClose: () => void
}) {
  const allProducts = useLiveQuery(() => db.products.toArray(), []) ?? []

  const [form, setForm] = useState({
    name: product?.name ?? EMPTY_PRODUCT.name,
    barcode: product?.barcode ?? EMPTY_PRODUCT.barcode,
    purchaseCode: product?.purchaseCode ?? EMPTY_PRODUCT.purchaseCode,
    categoryId: product?.categoryId ?? EMPTY_PRODUCT.categoryId,
    supplierId: product?.supplierId ?? EMPTY_PRODUCT.supplierId,
    unit: product?.unit ?? EMPTY_PRODUCT.unit,
    fractional: product?.fractional ?? EMPTY_PRODUCT.fractional,
    price: product ? String(product.price) : EMPTY_PRODUCT.price,
    cost: product ? String(product.cost) : EMPTY_PRODUCT.cost,
    stock: product ? String(product.stock) : EMPTY_PRODUCT.stock,
    minStock: product ? String(product.minStock) : EMPTY_PRODUCT.minStock,
    photo: product?.photo ?? '',
    subcategory: product?.subcategory ?? '',
    subsubcategory: product?.subsubcategory ?? '',
    isPackage: product?.isPackage ?? false,
    presentations: product ? productPresentations(product) : defaultPresentations('pieza'),
    pkgCost: product?.isPackage
      ? String(round2((product.cost ?? 0) * (product.pkgUnits ?? 1)))
      : '',
    pkgUnits: product?.isPackage ? String(product.pkgUnits ?? 1) : '',
    pkgQty: product?.isPackage
      ? String(
          product.pkgUnits && product.pkgUnits > 0
            ? round2(product.stock / product.pkgUnits)
            : 0,
        )
      : '',
  })

  const [calc, setCalc] = useState({ value: '', margin: '16', factor: '2' })
  const [res, setRes] = useState<{ cost: string; price: string }>({ cost: '', price: '' })

  const handleCalcInput = (key: keyof typeof calc, value: string) => {
    const next = { ...calc, [key]: value }
    setCalc(next)
    const base = Math.max(0, Number(next.value) || 0)
    const margin = Math.max(0, Number(next.margin) || 0)
    const factor = Math.max(1, Number(next.factor) || 1)
    const price = base > 0 ? round2(base * (1 + margin / 100) * factor) : 0
    setRes({
      cost: base > 0 ? String(base) : '',
      price: price > 0 ? String(price) : '',
    })
  }

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const onUnitChange = (u: Unit) =>
    setForm((f) => ({
      ...f,
      unit: u,
      presentations: f.fractional ? defaultPresentations(u, true) : [{ unit: u, factor: 1 }],
    }))

  const [pack, setPack] = useState<{ unit: Unit; qty: string }>({ unit: 'caja', qty: '' })

  const addPack = () => {
    const factor = Number(pack.qty)
    if (!(factor > 0)) {
      toast.error(`Indica cuántas ${unitPlural(form.unit)} trae cada presentación`)
      return
    }
    if (form.presentations.some((s) => s.unit === pack.unit)) {
      toast.error(`Ya existe la presentación ${UNIT_LABELS[pack.unit]}`)
      return
    }
    set('presentations', [...form.presentations, { unit: pack.unit, factor: round2(factor) }])
    setPack((p) => ({ ...p, qty: '' }))
  }

  const removePresentation = (u: Unit) =>
    setForm((f) => {
      if (u === f.unit) return f
      const next = f.presentations.filter((s) => s.unit !== u)
      return { ...f, presentations: next.length ? next : [{ unit: f.unit, factor: 1 }] }
    })

  const isPkg = form.isPackage
  const pkgCostNum = Math.max(0, Number(form.pkgCost) || 0)
  const pkgUnitsNum = Math.max(1, Number(form.pkgUnits) || 1)
  const pkgQtyNum = Math.max(0, Number(form.pkgQty) || 0)
  const computedCost = isPkg ? round2(pkgCostNum / pkgUnitsNum) : 0
  const computedStock = isPkg ? round2(pkgQtyNum * pkgUnitsNum) : 0

  const subs = useMemo(
    () =>
      dedupe(
        allProducts
          .filter((p) => p.categoryId === form.categoryId && p.subcategory)
          .map((p) => p.subcategory!),
      ),
    [allProducts, form.categoryId],
  )
  const subsubs = useMemo(
    () =>
      dedupe(
        allProducts.filter(
          (p) =>
            p.categoryId === form.categoryId &&
            p.subcategory === form.subcategory &&
            p.subsubcategory,
        ).map((p) => p.subsubcategory!),
      ),
    [allProducts, form.categoryId, form.subcategory],
  )

  const onPhoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 12_000_000) {
      toast.error('Imagen demasiado grande (máx. 12 MB)')
      return
    }
    try {
      set('photo', await compressImageFile(file))
    } catch {
      toast.error('No se pudo procesar la imagen')
    }
  }

  const applyCalc = () => {
    const unit = Number(res.cost)
    const price = Number(res.price)
if (!(unit > 0) || !(price > 0)) {
      toast.error('Ingresa el costo y un precio para aplicar')
      return
    }
    set('cost', String(unit))
    set('price', String(price))
    toast.success(`Costo y precio aplicados: ${formatMoney(price)}`)
  }

  const save = async () => {
    if (!form.name.trim()) {
      toast.error('El nombre es obligatorio')
      return
    }
    const price = Number(form.price)
    const minStock = Number(form.minStock) || 0
    if (!(price > 0)) {
      toast.error('Ingresa un precio válido')
      return
    }
    let cost = Number(form.cost)
    let stock = Number(form.stock) || 0
    let pkgUnits: number | undefined
    let pkgQty: number | undefined
    if (isPkg) {
      if (!(pkgCostNum > 0)) {
        toast.error('Ingresa el costo del paquete')
        return
      }
      if (!(pkgUnitsNum > 1)) {
        toast.error('Ingresa cuántas piezas trae cada paquete')
        return
      }
      cost = computedCost
      stock = computedStock
      pkgUnits = pkgUnitsNum
      pkgQty = pkgQtyNum
    }
    const data = {
      name: form.name.trim(),
      barcode: form.barcode.trim() || undefined,
      purchaseCode: form.purchaseCode.trim() || undefined,
      categoryId: form.categoryId || undefined,
      supplierId: form.supplierId || undefined,
      subcategory: form.subcategory.trim() || undefined,
      subsubcategory: form.subsubcategory.trim() || undefined,
      photo: form.photo || undefined,
      unit: isPkg ? ('pieza' as const) : form.unit,
      fractional: isPkg ? false : form.fractional,
      price,
      cost,
      stock: round2(stock),
      minStock: round2(minStock),
      isPackage: isPkg || undefined,
      salePresentations: isPkg ? undefined : form.presentations,
      pkgUnits,
      pkgQty,
    }
    if (product) {
      const now = Date.now()
      const stockDelta = round2(data.stock - (product.stock ?? 0))
      await db.transaction(
        'rw',
        [db.products, db.stockMovements],
        async () => {
          await db.products.update(product.id, { ...data, updatedAt: now })
          if (stockDelta !== 0) {
            await db.stockMovements.add({
              id: uid(),
              date: now,
              type: 'ajuste',
              productId: product.id,
              productName: data.name,
              unit: data.unit,
              qty: stockDelta,
              note: 'Ajuste desde edición de producto',
            })
          }
        },
      )
      notifyLocalChange()
      toast.success('Producto actualizado')
    } else {
      await db.products.add({ ...data, id: uid(), updatedAt: Date.now() })
      notifyLocalChange()
      toast.success('Producto agregado')
    }
    onClose()
  }

  return (
    <Modal open onClose={onClose} title={product ? 'Editar producto' : 'Nuevo producto'} wide>
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          {form.photo ? (
            <img src={form.photo} alt="Vista previa" className="h-20 w-20 rounded-lg object-cover" />
          ) : (
            <span className="flex h-20 w-20 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-700">
              <ImageIcon className="h-8 w-8 text-slate-400 dark:text-slate-500" />
            </span>
          )}
          <div className="flex flex-col gap-2">
            <label className="btn btn-secondary cursor-pointer">
              <ImagePlus className="h-4 w-4" />
              {form.photo ? 'Cambiar foto' : 'Subir foto'}
              <input type="file" accept="image/*" className="hidden" onChange={onPhoto} />
            </label>
            {form.photo && (
              <button
                onClick={() => set('photo', '')}
                className="self-start text-xs font-medium text-red-600 hover:underline dark:text-red-400"
              >
                Quitar foto
              </button>
            )}
          </div>
        </div>

        <Field label="Nombre *">
          <Input value={form.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Código de barras">
            <Input value={form.barcode} onChange={(e) => set('barcode', e.target.value)} placeholder="Opcional" />
          </Field>
          <Field label="Código de compra">
            <Input value={form.purchaseCode} onChange={(e) => set('purchaseCode', e.target.value)} placeholder="El del proveedor, ej. 8762378" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Unidad">
            <Select
              value={form.unit}
              disabled={isPkg}
              onChange={(e) => onUnitChange(e.target.value as typeof form.unit)}
            >
              {UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
            </Select>
          </Field>
          <Field label="Categoría">
            <Select value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
              <option value="">Sin categoría</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Proveedor">
            <Select value={form.supplierId} onChange={(e) => set('supplierId', e.target.value)}>
              <option value="">Sin proveedor</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Subcategoría">
            <Input
              list="sug-sub"
              value={form.subcategory}
              onChange={(e) => set('subcategory', e.target.value)}
              placeholder="Ej. Pintura de agua"
            />
            <datalist id="sug-sub">
              {subs.map((s) => <option key={s} value={s} />)}
            </datalist>
          </Field>
          <Field label="Sub-subcategoría">
            <Input
              list="sug-subsub"
              value={form.subsubcategory}
              onChange={(e) => set('subsubcategory', e.target.value)}
              placeholder="Ej. Vinílica"
            />
            <datalist id="sug-subsub">
              {subsubs.map((s) => <option key={s} value={s} />)}
            </datalist>
          </Field>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input
            type="checkbox"
            checked={isPkg}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                isPackage: e.target.checked,
                ...(e.target.checked ? { unit: 'pieza' as const, fractional: false } : {}),
              }))
            }
            className="h-4 w-4 accent-blue-700"
          />
          Lo compro por paquete y lo vendo por pieza
        </label>

        {!isPkg && (
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={form.fractional}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  fractional: e.target.checked,
                  presentations: e.target.checked ? defaultPresentations(f.unit, true) : [{ unit: f.unit, factor: 1 }],
                }))
              }
              className="h-4 w-4 accent-blue-700"
            />
            Se vende en cantidades fraccionadas {isLiquid(form.unit) ? '(1 cuarto, 1 medio, 1 L, 2 L)' : '(0.5, 1.25, …)'}
          </label>
        )}

        {!isPkg && form.fractional && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Presentaciones de venta
            </p>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Define cómo vendes este producto y el precio de cada presentación. Ej.: 1 caja = 50 {unitPlural(form.unit)} o 1 medio = $60.
            </p>
            <div className="mt-2 space-y-1.5">
              {form.presentations.map((s) => (
                <div
                  key={s.unit}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-1.5 text-sm dark:bg-slate-900"
                >
                  <span className="text-slate-700 dark:text-slate-200">
                    1 {UNIT_LABELS[s.unit]} = {s.factor} {s.factor === 1 ? UNIT_LABELS[form.unit] : unitPlural(form.unit)}
                  </span>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      className="w-24"
                      placeholder={s.unit === form.unit ? 'Precio base' : 'Proporcional'}
                      value={s.price != null ? String(s.price) : ''}
                      onChange={(e) =>
                        set(
                          'presentations',
                          form.presentations.map((x) =>
                            x.unit === s.unit ? { ...x, price: e.target.value === '' ? undefined : Number(e.target.value) } : x,
                          ),
                        )
                      }
                    />
                    {s.unit !== form.unit && (
                      <button
                        type="button"
                        onClick={() => removePresentation(s.unit)}
                        className="rounded-md p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {!isLiquid(form.unit) && (
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
                <Field label="Presentación">
                  <Select value={pack.unit} onChange={(e) => setPack((p) => ({ ...p, unit: e.target.value as Unit }))}>
                    {UNITS.filter((u) => u.value !== form.unit).map((u) => (
                      <option key={u.value} value={u.value}>{u.label}</option>
                    ))}
                  </Select>
                </Field>
                <Field label={`${unitPlural(form.unit)} por ${UNIT_LABELS[pack.unit]}`}>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min="1"
                    step="1"
                    value={pack.qty}
                    onChange={(e) => setPack((p) => ({ ...p, qty: e.target.value }))}
                    placeholder="Ej. 50"
                  />
                </Field>
                <Button type="button" className="shrink-0" onClick={addPack}>Agregar</Button>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Precio de venta *">
            <Input type="number" inputMode="decimal" min="0" step="0.01" value={form.price} onChange={(e) => set('price', e.target.value)} />
          </Field>
          <Field label={isPkg ? 'Costo por paquete *' : 'Costo (para utilidad)'}>
            {isPkg ? (
              <Input type="number" inputMode="decimal" min="0" step="0.01" value={form.pkgCost} onChange={(e) => set('pkgCost', e.target.value)} />
            ) : (
              <Input type="number" inputMode="decimal" min="0" step="0.01" value={form.cost} onChange={(e) => set('cost', e.target.value)} />
            )}
          </Field>
        </div>

        {!isPkg && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-800 dark:bg-amber-900/20">
            <p className="flex items-center gap-1.5 font-display text-sm font-semibold text-slate-800 dark:text-slate-100">
              <Calculator className="h-4 w-4 text-accent" />
              Calcular precio (tu método)
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Costo, más {calc.margin}% de margen y vender al {calc.factor}x.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-3">
              <Field label="Costo (valor)">
                <Input type="number" inputMode="decimal" min="0" step="0.01" placeholder="Ej. 500" value={calc.value} onChange={(e) => handleCalcInput('value', e.target.value)} />
              </Field>
              <Field label="Margen %">
                <Input type="number" inputMode="decimal" min="0" step="0.1" value={calc.margin} onChange={(e) => handleCalcInput('margin', e.target.value)} />
              </Field>
              <Field label="Multiplicador (2 = doble)">
                <Input type="number" inputMode="decimal" min="1" step="0.5" value={calc.factor} onChange={(e) => handleCalcInput('factor', e.target.value)} />
              </Field>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Field label="Costo">
                <Input type="number" inputMode="decimal" min="0" step="0.01" value={res.cost} onChange={(e) => setRes((r) => ({ ...r, cost: e.target.value }))} />
              </Field>
              <Field label="Precio de venta (editable)">
                <Input type="number" inputMode="decimal" min="0" step="0.01" value={res.price} onChange={(e) => setRes((r) => ({ ...r, price: e.target.value }))} />
              </Field>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Puedes editar el precio para redondearlo (ej. $889 → $900).
            </p>
            <div className="mt-2 flex justify-end">
              <Button className="btn-accent px-3 py-1.5 text-xs" onClick={applyCalc}>
                <Check className="h-4 w-4" />
                Aplicar costo y precio
              </Button>
            </div>
          </div>
        )}

        {isPkg && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Piezas por paquete *">
                <Input type="number" inputMode="decimal" min="1" step="1" value={form.pkgUnits} onChange={(e) => set('pkgUnits', e.target.value)} />
              </Field>
              <Field label="Paquetes en stock">
                <Input type="number" inputMode="decimal" min="0" step="0.01" value={form.pkgQty} onChange={(e) => set('pkgQty', e.target.value)} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3 rounded-lg bg-slate-100 p-3 dark:bg-slate-700">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Costo por pieza (calculado)</p>
                <p className="font-semibold text-slate-800 dark:text-slate-100">{formatMoney(computedCost)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Stock en piezas (calculado)</p>
                <p className="font-semibold text-slate-800 dark:text-slate-100">{computedStock}</p>
              </div>
            </div>
          </>
        )}

        {isPkg ? (
          <div className="grid grid-cols-1 gap-3">
            <Field label="Stock mínimo en piezas (para resurtir)">
              <Input type="number" inputMode="decimal" min="0" step="0.01" value={form.minStock} onChange={(e) => set('minStock', e.target.value)} />
            </Field>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Stock actual">
              <Input type="number" inputMode="decimal" min="0" step="0.01" value={form.stock} onChange={(e) => set('stock', e.target.value)} />
            </Field>
            <Field label="Stock mínimo (para resurtir)">
              <Input type="number" inputMode="decimal" min="0" step="0.01" value={form.minStock} onChange={(e) => set('minStock', e.target.value)} />
            </Field>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button className="btn-secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => void save()}>Guardar</Button>
        </div>
      </div>
    </Modal>
  )
}