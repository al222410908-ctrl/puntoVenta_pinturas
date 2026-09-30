/**
 * Vercel Serverless Function: /api/sync
 *
 * Equivalente de supabase/functions/sync/index.ts pero en Node.js + pg.
 * Conecta directamente a Neon (PostgreSQL) usando DATABASE_URL.
 *
 * Endpoints:
 *   GET  /api/sync  → devuelve snapshot completo de sync_data
 *   POST /api/sync  → aplica el payload del cliente y devuelve el delta del servidor
 */

import pg from 'pg'
import { empty, normalize, applyMerge, snapshot } from '../server/sync-core.mjs'
import {
  jsonResponse,
  handleOptions,
  bearerFrom,
  isAuthed,
  readBody,
  SYNC_DATA_TABLE,
} from './_helpers.mjs'

const { Pool } = pg

const DATABASE_URL = process.env.DATABASE_URL ?? ''
const SYNC_TOKEN = process.env.SYNC_TOKEN ?? ''

const ROW_ID = 1
const MAX_RETRIES = 8

// Pool de conexiones reutilizable entre invocaciones en el mismo contenedor.
const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 5,
  connectionTimeoutMillis: 15_000,
  ssl: { rejectUnauthorized: false },
})

// ─── Helpers de base de datos ───────────────────────────────────────────────

async function readData(client) {
  const { rows } = await client.query(
    `SELECT data, updated_at FROM public.${SYNC_DATA_TABLE} WHERE id = $1`,
    [ROW_ID],
  )
  return rows[0] ?? null
}

/**
 * Lee el documento, aplica `mutate` y lo guarda bajo un bloqueo de fila
 * (SELECT ... FOR UPDATE) para serializar concurrencias de varios dispositivos.
 *
 * @param {pg.PoolClient} client
 * @param {(data: any) => number} mutate  - Función que muta el documento y devuelve nº de cambios.
 */
async function updateData(client, mutate) {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      await client.query('BEGIN')

      const { rows } = await client.query(
        `SELECT data, updated_at
         FROM public.${SYNC_DATA_TABLE}
         WHERE id = $1
         FOR UPDATE`,
        [ROW_ID],
      )

      const row = rows[0]
      const prevUpdatedAt = row?.updated_at ?? null
      const base = normalize(row?.data ?? empty())

      const changed = mutate(base)

      if (prevUpdatedAt === null) {
        await client.query(
          `INSERT INTO public.${SYNC_DATA_TABLE} (id, data, updated_at)
           VALUES ($1, $2::jsonb, now())`,
          [ROW_ID, JSON.stringify(base)],
        )
      } else if (changed !== 0) {
        await client.query(
          `UPDATE public.${SYNC_DATA_TABLE}
           SET data = $2::jsonb, updated_at = now()
           WHERE id = $1`,
          [ROW_ID, JSON.stringify(base)],
        )
      }

      await client.query('COMMIT')
      return { data: base, changed }
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {})
      const code = e?.code
      // Reintentar en caso de deadlock o serialización
      if (code === '40P01' || code === '40001') continue
      throw e
    }
  }
  throw new Error('Demasiados conflictos de sincronización, intente de nuevo')
}

// ─── Handler de Vercel ───────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (handleOptions(req, res)) return

  const bearer = bearerFrom(req)
  const client = await pool.connect()

  try {
    // GET /api/sync — snapshot completo
    if (req.method === 'GET') {
      const row = await readData(client)
      const doc = normalize(row?.data ?? empty())
      if (!isAuthed(doc, bearer, SYNC_TOKEN)) {
        return jsonResponse(res, { ok: false, error: 'unauthorized' }, 401)
      }
      return jsonResponse(res, { ok: true, payload: snapshot(doc, 0) })
    }

    // POST /api/sync — merge + delta
    if (req.method === 'POST') {
      let body
      try {
        body = await readBody(req)
      } catch {
        return jsonResponse(res, { ok: false, error: 'JSON inválido' }, 400)
      }

      const since = Number(body.since ?? 0) || 0
      const payload = body.payload || {}

      const { data, changed } = await updateData(client, (doc) => {
        if (!isAuthed(doc, bearer, SYNC_TOKEN)) {
          throw new Error('__UNAUTHORIZED__')
        }
        return applyMerge(doc, payload)
      })

      const serverNow = Date.now()
      const CLOCK_SKEW_BUFFER_MS = 5_000
      return jsonResponse(res, {
        ok: true,
        changedCount: changed,
        since: Math.max(0, serverNow - CLOCK_SKEW_BUFFER_MS),
        serverTime: serverNow,
        payload: snapshot(data, since),
      })
    }

    return jsonResponse(res, { ok: false, error: 'method not allowed' }, 405)
  } catch (e) {
    if (e instanceof Error && e.message === '__UNAUTHORIZED__') {
      return jsonResponse(res, { ok: false, error: 'unauthorized' }, 401)
    }
    console.error('[api/sync] error:', e)
    const msg = e instanceof Error ? e.message : JSON.stringify(e)
    return jsonResponse(res, { ok: false, error: msg }, 500)
  } finally {
    client.release()
  }
}
