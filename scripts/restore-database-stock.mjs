import pg from 'pg'
import fs from 'fs'

const connStr = process.env.DATABASE_URL.replace(':6543/', ':5432/')
const pool = new pg.Pool({
  connectionString: connStr,
  ssl: { rejectUnauthorized: false },
})


console.log('1. Conectando a Supabase...')
const { rows } = await pool.query(`SELECT data, updated_at FROM public.sync_data WHERE id = 1`)
if (!rows || rows.length === 0) {
  console.error('No se encontró el documento sync_data id=1')
  process.exit(1)
}

const originalData = rows[0].data

// A. Realizar Backup de seguridad
const backupFileName = `backup_sync_data_${Date.now()}.json`
fs.writeFileSync(backupFileName, JSON.stringify(originalData, null, 2), 'utf8')
console.log(`2. Backup guardado exitosamente en: ${backupFileName}`)

const data = JSON.parse(JSON.stringify(originalData))
const movements = data.stockMovements || {}
const products = data.products || {}

const BAD_NOTE_PATTERNS = [
  /^Conversión a litros/,
  /^Saneamiento de stock inflado/,
  /^Ajuste de 1 cubeta/,
  /^Ajuste de 1 Litro/,
]

// Identificar movimientos espurios
const badMovementIds = []
for (const [id, m] of Object.entries(movements)) {
  if (m.type === 'ajuste' && BAD_NOTE_PATTERNS.some((p) => p.test(m.note || ''))) {
    badMovementIds.push(id)
  }
}

console.log(`3. Movimientos espurios a eliminar: ${badMovementIds.length}`)

// Eliminar movimientos de la colección
for (const id of badMovementIds) {
  delete movements[id]
}

// Para cada producto, si su unidad fue cambiada a litro por el script pero su presentación indica galón o cubeta original, restaurarlo
let productsRestored = 0
for (const p of Object.values(products)) {
  if (p.unit === 'litro' && Array.isArray(p.salePresentations) && p.salePresentations.length > 0) {
    const origPres = p.salePresentations[0]
    if (origPres && (origPres.unit === 'galon' || origPres.unit === 'cubeta')) {
      const origUnit = origPres.unit
      console.log(`   Restaurando producto: ${p.name} (litro -> ${origUnit})`)
      p.unit = origUnit
      if (origPres.price) {
        p.price = origPres.price
      }
      p.updatedAt = Date.now()
      p._serverAt = Date.now()
      productsRestored++
    }
  }
}

console.log(`4. Productos con unidad y presentación restaurada: ${productsRestored}`)

// Caso especial detectado en auditoría: "Vinilica glosi azul claro 5A satinada" donde _baseStock quedó en 380 en vez de 1 galón
for (const p of Object.values(products)) {
  if (p.name && p.name.includes('azul claro 5A') && p._baseStock === 380) {
    console.log(`   Corrigiendo baseStock anómalo de ${p.name}: 380 -> 1`)
    p._baseStock = 1
    p.updatedAt = Date.now()
  }
}

data.stockMovements = movements
data.products = products

console.log('5. Guardando documento restaurado en Supabase...')
const client = await pool.connect()
try {
  await client.query('BEGIN')
  await client.query(
    `UPDATE public.sync_data SET data = $1::jsonb, updated_at = now() WHERE id = 1`,
    [JSON.stringify(data)]
  )
  await client.query('COMMIT')
  console.log('✅ Base de datos restaurada con éxito.')
} catch (err) {
  await client.query('ROLLBACK').catch(() => {})
  throw err
} finally {
  client.release()
  await pool.end()
}

