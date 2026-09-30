/**
 * Utilidades compartidas para los Vercel Serverless Functions.
 * Equivalente de supabase/functions/_shared/helpers.ts pero para Node.js.
 */

export const SYNC_DATA_TABLE = 'sync_data'

export function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type',
  }
}

/**
 * Envía una respuesta JSON con los headers CORS correctos.
 * @param {import('node:http').ServerResponse} res
 * @param {unknown} body
 * @param {number} status
 */
export function jsonResponse(res, body, status = 200) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders() }
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v)
  res.statusCode = status
  res.end(JSON.stringify(body))
}

/**
 * Si la petición es OPTIONS (preflight CORS), responde 204 y devuelve true.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 */
export function handleOptions(req, res) {
  if (req.method === 'OPTIONS') {
    const headers = corsHeaders()
    for (const [k, v] of Object.entries(headers)) res.setHeader(k, v)
    res.statusCode = 204
    res.end()
    return true
  }
  return false
}

/**
 * Extrae el token Bearer del header Authorization.
 * @param {import('node:http').IncomingMessage} req
 */
export function bearerFrom(req) {
  const header = req.headers['authorization'] || ''
  return header.startsWith('Bearer ') ? header.slice(7) : ''
}

/**
 * Misma lógica de autenticación que sync-server.mjs y helpers.ts de Supabase:
 *  1. Token maestro vía env SYNC_TOKEN (solo backend, nunca en el bundle JS).
 *  2. Hash SHA-256 del PIN que el servidor ya conoce (data.gate.pinHash).
 *  3. Sin configuración aún (primera ejecución): permitir para registrar el PIN inicial.
 *
 * @param {any} data  - Documento completo de sync_data
 * @param {string} bearer - Token extraído del header Authorization
 * @param {string} [masterToken] - SYNC_TOKEN del entorno
 */
export function isAuthed(data, bearer, masterToken = '') {
  if (masterToken && bearer === masterToken) return true

  const pinHash = data?.gate?.pinHash
  if (pinHash && /^[0-9a-f]{64}$/.test(bearer)) {
    return bearer.length === pinHash.length && bearer.split('').every((c, i) => c === pinHash[i])
  }

  if (!masterToken && !pinHash) return true
  return false
}

/**
 * Lee el body de una petición HTTP como string y lo parsea como JSON.
 * @param {import('node:http').IncomingMessage} req
 * @param {number} [maxBytes=50_000_000]
 * @returns {Promise<unknown>}
 */
export function readBody(req, maxBytes = 50_000_000) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
      if (body.length > maxBytes) {
        req.destroy(new Error('Payload demasiado grande'))
      }
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'))
      } catch (e) {
        reject(e)
      }
    })
    req.on('error', reject)
  })
}
