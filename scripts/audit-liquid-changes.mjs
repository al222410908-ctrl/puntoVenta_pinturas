// AUDITORÍA SOLO LECTURA: lista los productos que alteraron los scripts automáticos
// (Conversión a litros / Saneamiento / Ajuste de 1 cubeta / Ajuste de 1 Litro exacto).
// Uso: node --env-file=.env.local scripts/audit-liquid-changes.mjs
import pg from 'pg'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })

const { rows } = await pool.query(`SELECT data FROM public.sync_data WHERE id = 1`)
const data = rows[0].data
const products = data.products ?? {}
const movements = Object.values(data.stockMovements ?? {})

const PATTERNS = [/^Conversión a litros/, /^Saneamiento de stock inflado/, /^Ajuste de 1 cubeta de 19L/, /^Ajuste de 1 Litro exacto/]
const bad = movements
  .filter((m) => m.type === 'ajuste' && PATTERNS.some((r) => r.test(m.note ?? '')))
  .sort((a, b) => a.date - b.date)

console.log(`Movimientos automáticos encontrados: ${bad.length}\n`)
const byProduct = new Map()
for (const m of bad) {
  if (!byProduct.has(m.productId)) byProduct.set(m.productId, [])
  byProduct.get(m.productId).push(m)
}
for (const [pid, list] of byProduct) {
  const p = products[pid]
  console.log(`== ${list[0].productName} [${pid.slice(0, 8)}]`)
  for (const m of list) console.log(`   ${new Date(m.date).toLocaleString('es-MX')} | ${m.note}`)
  if (p) {
    console.log(`   ACTUAL: unit=${p.unit} stock=${p.stock} price=${p.price} cost=${p.cost} minStock=${p.minStock} fractional=${p.fractional}`)
    console.log(`   presentaciones: ${JSON.stringify(p.salePresentations ?? null)}`)
  } else console.log('   (producto no existe)')
  // ventas posteriores al primer cambio
  const first = list[0].date
  const sales = movements.filter((m) => m.productId === pid && m.date > first && m.type !== 'ajuste')
  for (const s of sales) console.log(`   mov. posterior: ${s.type} qty=${s.qty} ${s.unit} ${new Date(s.date).toLocaleString('es-MX')}`)
  console.log()
}

// Productos líquidos con presentaciones del script (primer elemento con price propio y litro) aunque no tengan movimiento
const suspicious = Object.values(products).filter(
  (p) => p.unit === 'litro' && Array.isArray(p.salePresentations) && p.salePresentations[0] && ['cubeta', 'galon'].includes(p.salePresentations[0].unit) && p.salePresentations[0].price != null && !byProduct.has(p.id),
)
console.log(`Otros productos con huella del script sin movimiento registrado: ${suspicious.length}`)
for (const p of suspicious) console.log(`   ${p.name} unit=${p.unit} stock=${p.stock} pres0=${JSON.stringify(p.salePresentations[0])}`)

await pool.end()
