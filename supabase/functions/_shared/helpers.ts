// @ts-nocheck
// Utilidades compartidas de los Edge Functions (CORS + auth con hash del PIN).

export function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
  }
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders() },
  })
}

export function handleOptions(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() })
  }
  return null
}

/**
 * Misma lógica que sync-server.mjs:
 *  1. Token maestro vía env SYNC_TOKEN (solo backend, nunca en bundle).
 *  2. Hash SHA-256 del PIN que el servidor ya conoce (data.gate.pinHash).
 *  3. Sin configuración aún (primera ejecución): permitir.
 */
export function isAuthed(data: any, bearer: string, masterToken?: string): boolean {
  const master = masterToken || ''
  if (master && bearer === master) return true

  const pinHash = data?.gate?.pinHash
  if (pinHash && /^[0-9a-f]{64}$/.test(bearer)) {
    return bearer.length === pinHash.length && bearer.split('').every((c, i) => c === pinHash[i])
  }

  if (!master && !pinHash) return true
  return false
}

export const SYNC_DATA_TABLE = 'sync_data'