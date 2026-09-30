// Script de diagnóstico: lee sync_data de Neon y muestra cuántos registros hay
// Uso: node scripts/check-neon.mjs  (con DATABASE_URL en .env.local o como env var)

import pg from 'pg'

const { Pool } = pg
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

// Cuenta de registros usando jsonb_each (los datos son objetos, no arrays)
const { rows } = await pool.query(`
  SELECT
    id,
    updated_at,
    (SELECT count(*) FROM jsonb_each(data->'products'))      AS products,
    (SELECT count(*) FROM jsonb_each(data->'sales'))         AS sales,
    (SELECT count(*) FROM jsonb_each(data->'categories'))    AS categories,
    (SELECT count(*) FROM jsonb_each(data->'stockMovements')) AS stock_movements
  FROM public.sync_data WHERE id = 1
`)

if (!rows.length) {
  console.log('No hay fila con id=1 en sync_data')
} else {
  const r = rows[0]
  console.log('Fila encontrada en Neon:')
  console.log('  updated_at:   ', r.updated_at)
  console.log('  productos:    ', r.products)
  console.log('  ventas:       ', r.sales)
  console.log('  categorias:   ', r.categories)
  console.log('  movimientos:  ', r.stock_movements)
}

// Últimos 3 productos ordenados por updatedAt
const { rows: prods } = await pool.query(`
  SELECT val.value AS p
  FROM public.sync_data,
       jsonb_each(data->'products') AS val
  ORDER BY (val.value->>'updatedAt')::bigint DESC NULLS LAST
  LIMIT 3
`)

console.log('\nUltimos 3 productos en Neon:')
for (const row of prods) {
  const p = row.p
  const ts = p.updatedAt ? new Date(Number(p.updatedAt)).toLocaleString('es-MX') : 'sin fecha'
  console.log(`  [${String(p.id).slice(0,8)}] ${p.name} | updatedAt: ${ts}`)
}

await pool.end()

