// @ts-nocheck
// Edge Function de Supabase que reemplaza a server/sync-server.mjs
// Endpoint: <project>.supabase.co/functions/v1/sync

import { createClient } from 'npm:@supabase/supabase-js@2'
import { normalize, empty, applyMerge, snapshot } from '../_shared/sync-core.ts'
import { jsonResponse, handleOptions, isAuthed, SYNC_DATA_TABLE } from '../_shared/helpers.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const SYNC_TOKEN = Deno.env.get('SYNC_TOKEN') ?? ''

const ROW_ID = 1
const MAX_RETRIES = 8

function bearerFrom(req: Request): string {
  const header = req.headers.get('authorization') || ''
  return header.startsWith('Bearer ') ? header.slice(7) : ''
}

async function readData(supabase: any) {
  const { data: row, error } = await supabase
    .from(SYNC_DATA_TABLE)
    .select('data, updated_at')
    .eq('id', ROW_ID)
    .maybeSingle()
  if (error) throw error
  return row ?? null
}

/**
 * Lee el documento, aplica `mutate` y lo guarda con comparación de
 * updated_at (optimistic concurrency). Un solo Edge Function es stateless,
 * así que varios requests concurrentes re-intentan si chocan.
 */
async function updateData(
  supabase: any,
  mutate: (data: any) => unknown,
): Promise<{ data: any; ret: unknown; changed: number }> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const row = await readData(supabase)
    const prevUpdatedAt = row?.updated_at ?? null
    const base = normalize(row?.data ?? empty())

    const changed = mutate(base)
    const nextUpdatedAt = new Date().toISOString()

    if (prevUpdatedAt === null) {
      const { error: insErr } = await supabase.from(SYNC_DATA_TABLE).insert({
        id: ROW_ID,
        data: base,
        updated_at: nextUpdatedAt,
      })
      if (insErr) {
        // Probable conflicto de inserción (otra invocación la creó) → reintentar
        if (String(insErr.message ?? insErr).includes('duplicate')) continue
        throw insErr
      }
      return { data: base, ret: changed, changed }
    }

    const { data: updated, error: upErr } = await supabase
      .from(SYNC_DATA_TABLE)
      .update({ data: base, updated_at: nextUpdatedAt })
      .eq('id', ROW_ID)
      .eq('updated_at', prevUpdatedAt)
      .select('id')
    if (upErr) throw upErr
    if (!updated || updated.length === 0) {
      // Otro request escribió mientras tanto → reintentar con el dato fresco
      continue
    }
    return { data: base, ret: changed, changed }
  }
  throw new Error('Demasiados conflictos de sincronización, intente de nuevo')
}

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  const url = new URL(req.url)
  if (url.pathname !== '/sync' && !url.pathname.endsWith('/sync')) {
    return jsonResponse({ ok: false, error: 'not found' }, 404)
  }

  const service = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })
  const bearer = bearerFrom(req)

  try {
    if (req.method === 'POST') {
      const body = await req.json()
      const since = Number(body.since ?? 0) || 0
      const payload = body.payload || {}

      const { data, changed } = await updateData(service, (doc) => {
        if (!isAuthed(doc, bearer, SYNC_TOKEN)) {
          throw new Error('__UNAUTHORIZED__')
        }
        return applyMerge(doc, payload)
      })

      return jsonResponse({
        ok: true,
        changedCount: changed,
        since: Date.now(),
        payload: snapshot(data, since),
      })
    }

    if (req.method === 'GET') {
      const row = await readData(service)
      const doc = normalize(row?.data ?? empty())
      if (!isAuthed(doc, bearer, SYNC_TOKEN)) {
        return jsonResponse({ ok: false, error: 'unauthorized' }, 401)
      }
      return jsonResponse({ ok: true, payload: snapshot(doc, 0) })
    }
  } catch (e) {
    if (e instanceof Error && e.message === '__UNAUTHORIZED__') {
      return jsonResponse({ ok: false, error: 'unauthorized' }, 401)
    }
    console.error('sync error', e)
    return jsonResponse({ ok: false, error: String(e) }, 500)
  }

  return jsonResponse({ ok: false, error: 'method not allowed' }, 405)
})