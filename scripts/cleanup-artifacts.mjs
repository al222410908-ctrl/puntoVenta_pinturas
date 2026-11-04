import pg from 'pg'

const connStr = process.env.DATABASE_URL.replace(':6543/', ':5432/')
const pool = new pg.Pool({
  connectionString: connStr,
  ssl: { rejectUnauthorized: false },
})

const client = await pool.connect()
try {
  await client.query('BEGIN')
  const { rows } = await client.query('SELECT data FROM public.sync_data WHERE id = 1 FOR UPDATE')
  const data = rows[0].data
  const movements = data.stockMovements || {}
  const products = data.products || {}

  const deleteMovIds = [
    '42251808-2a0e-4223-a252-419b64e4334b',
    '74f23984-1603-4fd2-9169-cb8fa77b42c3',
    '916ac54c-b264-4807-91e7-3ac7325287ad',
  ]
  for (const id of deleteMovIds) {
    if (movements[id]) {
      console.log(`Eliminando movimiento artificial: ${id} (${movements[id].note || movements[id].qty})`)
      delete movements[id]
    }
  }

  for (const p of Object.values(products)) {
    if (p.name && p.name.includes('azul claro 5A')) {
      console.log(`Restaurando _baseStock de ${p.name} a 380`)
      p._baseStock = 380
      p.updatedAt = Date.now()
    }
  }

  data.stockMovements = movements
  data.products = products

  await client.query(
    'UPDATE public.sync_data SET data = $1::jsonb, updated_at = now() WHERE id = 1',
    [JSON.stringify(data)]
  )
  await client.query('COMMIT')
  console.log('✅ Base de datos completamente saneada.')
} catch (e) {
  await client.query('ROLLBACK').catch(() => {})
  console.error(e)
} finally {
  client.release()
  await pool.end()
}
