import pg from 'pg'
const { Client } = pg

const connectionString = process.env.DATABASE_URL
const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } })

await client.connect()
const { rows } = await client.query(`select data from public.sync_data where id = 1`)
const data = rows[0].data

let total = 0
let withBase = 0
let withStock = 0
for (const p of Object.values(data.products || {})) {
  total++
  if (p._baseStock != null) withBase++
  if (p.stock != null) withStock++
}
console.log(`total=${total} con _baseStock=${withBase} con stock=${withStock}`)
console.log('ejemplo:', JSON.stringify(Object.values(data.products || {})[0], null, 1).slice(0, 400))
await client.end()