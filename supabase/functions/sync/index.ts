// @ts-nocheck
// Edge Function de Supabase que reemplaza a server/sync-server.mjs
// Endpoint: <project>.supabase.co/functions/v1/sync
//
// Usa conexión directa a Postgres (pg con DATABASE_URL) en vez de supabase-js/PostgREST,
// porque reescribir ~17MB por PostgREST excedía el statement_timeout de esa capa.

import { Pool } from 'npm:pg@8'
import { normalize, empty, applyMerge, snapshot } from '../_shared/sync-core.ts'
import { jsonResponse, handleOptions, isAuthed, SYNC_DATA_TABLE } from '../_shared/helpers.ts'

const DATABASE_URL = Deno.env.get('DATABASE_URL') ?? ''
const SYNC_TOKEN = Deno.env.get('SYNC_TOKEN') ?? ''

const ROW_ID = 1
const MAX_RETRIES = 8

const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 5,
  connectionTimeoutMillis: 15_000,
  ssl: { rejectUnauthorized: false },
})

async function readData(client: any) {
  const { rows } = await client.query(
    `select data as data, updated_at as updated_at from public.${SYNC_DATA_TABLE} where id = $1`,
    [ROW_ID],
  )
  return rows[0] ?? null
}

/**
 * Lee el documento, aplica `mutate` y lo guarda bajo un bloqueo de fila
 * (SELECT ... FOR UPDATE). Así concurrencias de varios dispositivos se serializan
 * y no dependemos de comparar updated_at (que fallaba por precisión de
 * microsegundos: timestamptz → JS Date pierde precisión → 0 filas → no se guardaba).
 */
async function updateData(
  client: any,
  mutate: (data: any) => unknown,
): Promise<{ data: any; ret: unknown; changed: number }> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      await client.query('begin')
      const { rows } = await client.query(
        `select data as data, updated_at as updated_at
         from public.${SYNC_DATA_TABLE}
         where id = $1
         for update`,
        [ROW_ID],
      )
      const row = rows[0]
      const prevUpdatedAt = row?.updated_at ?? null
      const base = normalize(row?.data ?? empty())

      const changed = mutate(base)

      if (prevUpdatedAt === null) {
        await client.query(
          `insert into public.${SYNC_DATA_TABLE} (id, data, updated_at)
           values ($1, $2::jsonb, now())`,
          [ROW_ID, JSON.stringify(base)],
        )
      } else if (changed !== 0) {
        await client.query(
          `update public.${SYNC_DATA_TABLE}
           set data = $2::jsonb, updated_at = now()
           where id = $1`,
          [ROW_ID, JSON.stringify(base)],
        )
      }
      await client.query('commit')
      return { data: base, ret: changed, changed }
    } catch (e) {
      await client.query('rollback').catch(() => {})
      const code = (e as any)?.code
      if (code === '40P01' || code === '40001') continue // deadlock / serialización
      throw e
    }
  }
  throw new Error('Demasiados conflictos de sincronización, intente de nuevo')
}

function bearerFrom(req: Request): string {
  const header = req.headers.get('authorization') || ''
  return header.startsWith('Bearer ') ? header.slice(7) : ''
}

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  const url = new URL(req.url)
  if (url.pathname !== '/sync' && !url.pathname.endsWith('/sync')) {
    return jsonResponse({ ok: false, error: 'not found' }, 404)
  }

  const bearer = bearerFrom(req)
  const client = await pool.connect()

  try {
    if (req.method === 'POST') {
      const body = await req.json()
      const since = Number(body.since ?? 0) || 0
      const payload = body.payload || {}

      const { data, changed } = await updateData(client, (doc) => {
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
      const row = await readData(client)
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
    const msg = e instanceof Error ? e.message : JSON.stringify(e)
    return jsonResponse({ ok: false, error: msg }, 500)
  } finally {
    client.release()
  }

  return jsonResponse({ ok: false, error: 'method not allowed' }, 405)
})