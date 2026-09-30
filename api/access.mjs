/**
 * Vercel Serverless Function: /api/access
 *
 * Equivalente de supabase/functions/access/index.ts pero en Node.js + pg.
 * Ya NO usa @supabase/supabase-js — conecta directamente a Neon.
 *
 * Endpoints:
 *   GET  /api/access  → devuelve el pinHash actual
 *   POST /api/access  → registra/actualiza el PIN hash
 */

import pg from 'pg'
import { empty, normalize } from '../server/sync-core.mjs'
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

// Pool compartido con api/sync.mjs si corre en el mismo contenedor.
const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 5,
  connectionTimeoutMillis: 15_000,
  ssl: { rejectUnauthorized: false },
})

// ─── Handler de Vercel ───────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (handleOptions(req, res)) return

  const bearer = bearerFrom(req)
  const client = await pool.connect()

  try {
    // GET /api/access — devuelve el pinHash almacenado
    if (req.method === 'GET') {
      const { rows } = await client.query(
        `SELECT data FROM public.${SYNC_DATA_TABLE} WHERE id = $1`,
        [ROW_ID],
      )
      const doc = normalize(rows[0]?.data ?? empty())
      if (!isAuthed(doc, bearer, SYNC_TOKEN)) {
        return jsonResponse(res, { ok: false, error: 'unauthorized' }, 401)
      }
      return jsonResponse(res, {
        ok: true,
        pinHash: doc.gate?.pinHash || '',
        updatedAt: doc.gate?.updatedAt || 0,
      })
    }

    // POST /api/access — actualiza el PIN hash con OCC (optimistic concurrency)
    if (req.method === 'POST') {
      let body
      try {
        body = await readBody(req, 10_000)
      } catch {
        return jsonResponse(res, { ok: false, error: 'JSON inválido' }, 400)
      }

      const pinHash = typeof body.pinHash === 'string' ? body.pinHash.trim() : ''
      if (!/^[0-9a-f]{64}$/.test(pinHash)) {
        return jsonResponse(res, { ok: false, error: 'pinHash inválido' }, 400)
      }

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        await client.query('BEGIN')
        try {
          const { rows } = await client.query(
            `SELECT data, updated_at
             FROM public.${SYNC_DATA_TABLE}
             WHERE id = $1
             FOR UPDATE`,
            [ROW_ID],
          )
          const row = rows[0]
          const prevUpdatedAt = row?.updated_at ?? null
          const doc = normalize(row?.data ?? empty())

          if (!isAuthed(doc, bearer, SYNC_TOKEN)) {
            await client.query('ROLLBACK')
            return jsonResponse(res, { ok: false, error: 'unauthorized' }, 401)
          }

          doc.gate = { pinHash, updatedAt: Date.now() }

          if (prevUpdatedAt === null) {
            await client.query(
              `INSERT INTO public.${SYNC_DATA_TABLE} (id, data, updated_at)
               VALUES ($1, $2::jsonb, now())`,
              [ROW_ID, JSON.stringify(doc)],
            )
          } else {
            await client.query(
              `UPDATE public.${SYNC_DATA_TABLE}
               SET data = $2::jsonb, updated_at = now()
               WHERE id = $1`,
              [ROW_ID, JSON.stringify(doc)],
            )
          }

          await client.query('COMMIT')
          return jsonResponse(res, { ok: true, pinHash, updatedAt: doc.gate.updatedAt })
        } catch (e) {
          await client.query('ROLLBACK').catch(() => {})
          const code = e?.code
          if (code === '40P01' || code === '40001') continue
          throw e
        }
      }

      return jsonResponse(res, { ok: false, error: 'Demasiados conflictos, intente de nuevo' }, 409)
    }

    return jsonResponse(res, { ok: false, error: 'method not allowed' }, 405)
  } catch (e) {
    console.error('[api/access] error:', e)
    return jsonResponse(res, { ok: false, error: String(e) }, 500)
  } finally {
    client.release()
  }
}
