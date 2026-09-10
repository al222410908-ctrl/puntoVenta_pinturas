// @ts-nocheck
// Edge Function de Supabase que reemplaza /api/access de server/sync-server.mjs
// Endpoint: <project>.supabase.co/functions/v1/access

import { createClient } from 'npm:@supabase/supabase-js@2'
import { normalize, empty } from '../_shared/sync-core.ts'
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

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  const service = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })
  const bearer = bearerFrom(req)

  try {
    if (req.method === 'GET') {
      const { data: row } = await service.from(SYNC_DATA_TABLE).select('data').eq('id', ROW_ID).maybeSingle()
      const doc = normalize(row?.data ?? empty())
      if (!isAuthed(doc, bearer, SYNC_TOKEN)) {
        return jsonResponse({ ok: false, error: 'unauthorized' }, 401)
      }
      return jsonResponse({ ok: true, pinHash: doc.gate?.pinHash || '', updatedAt: doc.gate?.updatedAt || 0 })
    }

    if (req.method === 'POST') {
      const body = await req.json()
      const pinHash = typeof body.pinHash === 'string' ? body.pinHash.trim() : ''
      if (!/^[0-9a-f]{64}$/.test(pinHash)) {
        return jsonResponse({ ok: false, error: 'pinHash inválido' }, 400)
      }

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const { data: row } = await service.from(SYNC_DATA_TABLE).select('data, updated_at').eq('id', ROW_ID).maybeSingle()
        const prevUpdatedAt = row?.updated_at ?? null
        const doc = normalize(row?.data ?? empty())

        if (!isAuthed(doc, bearer, SYNC_TOKEN)) {
          return jsonResponse({ ok: false, error: 'unauthorized' }, 401)
        }

        doc.gate = { pinHash, updatedAt: Date.now() }
        const nextUpdatedAt = new Date().toISOString()

        if (prevUpdatedAt === null) {
          const { error: insErr } = await service.from(SYNC_DATA_TABLE).insert({
            id: ROW_ID,
            data: doc,
            updated_at: nextUpdatedAt,
          })
          if (insErr) {
            if (String(insErr.message ?? insErr).includes('duplicate')) continue
            throw insErr
          }
          return jsonResponse({ ok: true, pinHash, updatedAt: doc.gate.updatedAt })
        }

        const { data: updated, error: upErr } = await service
          .from(SYNC_DATA_TABLE)
          .update({ data: doc, updated_at: nextUpdatedAt })
          .eq('id', ROW_ID)
          .eq('updated_at', prevUpdatedAt)
          .select('id')
        if (upErr) throw upErr
        if (!updated || updated.length === 0) continue
        return jsonResponse({ ok: true, pinHash, updatedAt: doc.gate.updatedAt })
      }

      return jsonResponse({ ok: false, error: 'Demasiados conflictos, intente de nuevo' }, 409)
    }
  } catch (e) {
    console.error('access error', e)
    return jsonResponse({ ok: false, error: String(e) }, 500)
  }

  return jsonResponse({ ok: false, error: 'method not allowed' }, 405)
})