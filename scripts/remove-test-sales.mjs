import pg from 'pg'

const connStr = process.env.DATABASE_URL.replace(':6543/', ':5432/')
const pool = new pg.Pool({
  connectionString: connStr,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
})

console.log('Conectando a Supabase...')
const client = await pool.connect()
console.log('Conectado exitosamente.')
try {

  await client.query('BEGIN')
  const { rows } = await client.query('SELECT data FROM public.sync_data WHERE id = 1 FOR UPDATE')
  const data = rows[0].data

  const testSaleIds = new Set([
    '404f0ee6-6a01-4b27-8a51-564b221eceb9',
    '6db29248-0e68-4ac4-a67c-505f9fee700d',
    '815f1a19-2926-463e-beb7-a63e64f5e933',
    'dc327119-be1b-4f58-a50e-767b47d241e9',
    'f152fba6-39d2-4b75-8fdf-e2b269c20890',
  ])

  // 1. Eliminar ventas de prueba
  let salesRemoved = 0
  for (const id of testSaleIds) {
    if (data.sales && data.sales[id]) {
      delete data.sales[id]
      salesRemoved++
    }
  }

  // 2. Eliminar movimientos de prueba (incluyendo los que tienen refId de estas ventas o fecha en ventana de prueba)
  const testTimeMin = new Date('2026-10-15T22:50:00-06:00').getTime()
  const testTimeMax = new Date('2026-10-15T23:59:59-06:00').getTime()

  let movsRemoved = 0
  for (const [id, m] of Object.entries(data.stockMovements || {})) {
    if (
      (m.refId && testSaleIds.has(m.refId)) ||
      (m.productName && m.productName.includes('GLOSI BLANCO SUELTA') && m.date >= testTimeMin && m.date <= testTimeMax)
    ) {
      delete data.stockMovements[id]
      movsRemoved++
    }
  }

  // 3. Eliminar cashEntries asociadas a las ventas de prueba
  let cashRemoved = 0
  for (const [id, c] of Object.entries(data.cashEntries || {})) {
    if (c.refId && testSaleIds.has(c.refId)) {
      delete data.cashEntries[id]
      cashRemoved++
    }
  }

  console.log(`Ventas de prueba eliminadas: ${salesRemoved}`)
  console.log(`Movimientos de prueba eliminados: ${movsRemoved}`)
  console.log(`Entradas de caja de prueba eliminadas: ${cashRemoved}`)

  // 4. Guardar en Supabase
  await client.query(
    'UPDATE public.sync_data SET data = $1::jsonb, updated_at = now() WHERE id = 1',
    [JSON.stringify(data)]
  )
  await client.query('COMMIT')
  console.log('✅ Base de datos restaurada al estado real y limpio.')
} catch (err) {
  await client.query('ROLLBACK').catch(() => {})
  console.error(err)
} finally {
  client.release()
  await pool.end()
}
