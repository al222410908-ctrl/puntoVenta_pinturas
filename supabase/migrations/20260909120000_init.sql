-- Migración inicial: tabla SyncData que guarda el documento completo de sincronización.
-- Una sola fila (id=1) con el JSON de productos, ventas, tombstones, gate (PIN), etc.

create table if not exists public.sync_data (
  id integer primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.sync_data enable row level security;

-- Solo el SERVICE_ROLE (usado por las Edge Functions) tiene acceso.
drop policy if exists service_role_all on public.sync_data;
create policy service_role_all on public.sync_data for all to service_role using (true) with check (true);

-- Ninguna política para anon/authenticated: el cliente SIEMPRE pasa por las Edge Functions.