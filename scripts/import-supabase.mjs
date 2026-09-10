// Script para cargar sync-data.json (respaldo de AWS) en Supabase.
// Uso:
//   DATABASE_URL="postgresql://postgres.liibcmfsvxdqybpftnia:PASSWORD@aws-0-us-east-1.pooler.supabase.com:5432/postgres" \
//   node scripts/import-supabase.mjs "C:\Users\Alan Alcantara\Downloads\sync-data.json"
//
// Necesita: DATABASE_URL (URL del pooler de Supabase con contraseña) en el entorno.
// Crea la tabla sync_data si no existe y hace UPSERT de la fila id=1.

import { readFileSync } from 'node:fs'
import pg from 'pg'

const { Client } = pg

const dataFile = process.argv[2]
const connectionString = process.env.DATABASE_URL

if (!dataFile) {
  console.error('Falta la ruta del archivo JSON a importar.')
  process.exit(1)
}
if (!connectionString) {
  console.error('Falta DATABASE_URL en el entorno.')
  process.exit(1)
}

console.log('Lectura del archivo:', dataFile)
const raw = readFileSync(dataFile, 'utf8')
const data = JSON.parse(raw)

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } })

async function main() {
  await client.connect()
  console.log('Conectado a la base de datos.')

  await client.query(`
    create table if not exists public.sync_data (
      id integer primary key,
      data jsonb not null default '{}'::jsonb,
      updated_at timestamptz not null default now()
    );
    alter table public.sync_data enable row level security;
  `)
  await client.query(`
    drop policy if exists service_role_all on public.sync_data;
    create policy service_role_all on public.sync_data for all to service_role using (true) with check (true);
  `)
  console.log('Tabla sync_data lista.')

  await client.query(
    `insert into public.sync_data (id, data, updated_at)
     values (1, $1::jsonb, now())
     on conflict (id) do update set data = excluded.data, updated_at = excluded.updated_at`,
    [JSON.stringify(data)],
  )
  console.log('Datos insertados (fila id=1).')

  console.log('Verificación (conteos):')
  const { rows: summary } = await client.query(`
    select
      (select count(*) from jsonb_each(data->'products'))        as products,
      (select count(*) from jsonb_each(data->'categories'))      as categories,
      (select count(*) from jsonb_each(data->'suppliers'))       as suppliers,
      (select count(*) from jsonb_each(data->'sales'))           as sales,
      (select count(*) from jsonb_each(data->'purchases'))       as purchases,
      (select count(*) from jsonb_each(data->'stockMovements'))  as movements,
      (select count(*) from jsonb_each(data->'tombstones'))      as tombstones,
      (data ? 'gate')                                          as has_gate
    from public.sync_data
  `)
  console.log(summary[0])
  if (summary[0]?.has_gate === false) {
    console.warn('AVISO: el respaldo no contiene gate (PIN). El primer dispositivo que sincronice re-registrará el PIN compartido.')
  }

  await client.end()
  console.log('Importación completada.')
}

main().catch(async (e) => {
  console.error('ERROR:', e.message || e)
  try { await client.end() } catch {}
  process.exit(1)
})