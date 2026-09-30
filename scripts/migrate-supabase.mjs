import pg from 'pg'
const { Pool } = pg

const DATABASE_URL = 'postgresql://postgres.gefouqifcquqdxwxsreb:alanalcantara2006*@aws-0-us-east-2.pooler.supabase.com:6543/postgres'

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15_000,
})

const SQL = `
  create table if not exists public.sync_data (
    id integer primary key,
    data jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now()
  );

  alter table public.sync_data enable row level security;

  drop policy if exists service_role_all on public.sync_data;
  create policy service_role_all on public.sync_data for all to service_role using (true) with check (true);
`

const client = await pool.connect()
try {
  await client.query(SQL)
  console.log('✅ Tabla sync_data creada correctamente en Supabase')
} catch (e) {
  console.error('❌ ERROR:', e.message)
} finally {
  client.release()
  await pool.end()
}
