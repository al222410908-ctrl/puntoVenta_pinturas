// Diagnóstico: ¿cuánto tarda ESCRIBIR los 17MB directamente en la DB (sin Edge Function)?
// Uso:
//   $env:DATABASE_URL="postgresql://..." ; node scripts/test-supabase-write.mjs
//
// Checa statement_timeout y mide un UPDATE del jsonb completo.

import pg from 'pg'

const { Client } = pg

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  await client.connect()
  console.log('Conectado.')

  const { rows: t } = await client.query('show statement_timeout')
  console.log('statement_timeout =', t[0].statement_timeout)

  const { rows } = await client.query(`select id, length(data::text) as len, updated_at from public.sync_data`)
  console.log('Fila:', JSON.stringify(rows[0]))

  const { rows: cur } = await client.query(`select data from public.sync_data where id = 1`)
  const data = cur[0].data
  data.__diag = data.__diag ?? { t: Date.now() }
  delete data.__diag

  console.log('Probando UPDATE del jsonb completo id=1...')
  const start = Date.now()
  const res = await client.query(
    `update public.sync_data set data = $1::jsonb, updated_at = now() where id = 1`,
    [JSON.stringify(data)],
  )
  console.log('UPDATE OK en', ((Date.now() - start) / 1000).toFixed(2), 's — filas:', res.rowCount)

  const { rows: h } = await client.query(`select pg_size_pretty(pg_column_size(data)) as size from public.sync_data where id = 1`)
  console.log('Tamaño columna:', h[0].size)

  await client.end()
}

main().catch(async (e) => {
  console.error('ERROR:', e.message || e)
  process.exit(1)
})