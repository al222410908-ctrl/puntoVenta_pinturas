import pg from 'pg'

const connStr = process.env.DATABASE_URL.replace(':6543/', ':5432/')
const pool = new pg.Pool({
  connectionString: connStr,
  ssl: { rejectUnauthorized: false },
})

console.log('1. Conectando a Supabase...')
const { rows } = await pool.query('SELECT data FROM public.sync_data WHERE id = 1')
const data = rows[0].data
const products = data.products || {}

let updated = 0
for (const p of Object.values(products)) {
  if (p.salePresentations && p.salePresentations.length > 0) {
    if (p.unit === 'galon') {
      for (const s of p.salePresentations) {
        if (s.unit === 'galon' && s.factor !== 1) {
          console.log(`Corrigiendo factor de galón para: ${p.name} (era ${s.factor} -> 1)`)
          s.factor = 1
          updated++
        } else if (s.unit === 'litro' && s.factor !== 0.25) {
          s.factor = 0.25
          updated++
        } else if (s.unit === 'medio' && s.factor !== 0.125) {
          s.factor = 0.125
          updated++
        } else if (s.unit === 'cuarto' && s.factor !== 0.0625) {
          s.factor = 0.0625
          updated++
        } else if (s.unit === 'cubeta' && s.factor !== 4.75) {
          s.factor = 4.75
          updated++
        }
      }
    } else if (p.unit === 'cubeta') {
      for (const s of p.salePresentations) {
        if (s.unit === 'cubeta' && s.factor !== 1) {
          s.factor = 1
          updated++
        } else if (s.unit === 'galon' && Math.abs(s.factor - 4 / 19) > 1e-4) {
          s.factor = Math.round((4 / 19) * 100000) / 100000
          updated++
        } else if (s.unit === 'litro' && Math.abs(s.factor - 1 / 19) > 1e-4) {
          s.factor = Math.round((1 / 19) * 100000) / 100000
          updated++
        } else if (s.unit === 'medio' && Math.abs(s.factor - 0.5 / 19) > 1e-4) {
          s.factor = Math.round((0.5 / 19) * 100000) / 100000
          updated++
        } else if (s.unit === 'cuarto' && Math.abs(s.factor - 0.25 / 19) > 1e-4) {
          s.factor = Math.round((0.25 / 19) * 100000) / 100000
          updated++
        }
      }
    }
  }
}

console.log(`2. Total de factores de presentación normalizados: ${updated}`)

if (updated > 0) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      'UPDATE public.sync_data SET data = $1::jsonb, updated_at = now() WHERE id = 1',
      [JSON.stringify(data)]
    )
    await client.query('COMMIT')
    console.log('✅ Presentaciones corregidas exitosamente en Supabase.')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

await pool.end()
