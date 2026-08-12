import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { empty, normalize, applyMerge, snapshot } from './sync-core.mjs'

const DATA_FILE = process.env.SYNC_DATA_FILE || '/home/ubuntu/puntoVenta_pinturas/sync-data.json'
const PORT = Number(process.env.PORT || '3457')
const SYNC_TOKEN = process.env.SYNC_TOKEN || ''
const __dirname = dirname(fileURLToPath(import.meta.url))

mkdirSync(dirname(DATA_FILE), { recursive: true })

let data = normalize(load())
function load() {
  try {
    return JSON.parse(readFileSync(DATA_FILE, 'utf8'))
  } catch {
    return empty()
  }
}
let saving = Promise.resolve()
function save() {
  saving = saving.then(() => {
    try {
      // Escritura atómica: escribe en .tmp y luego renombra.
      // Si el proceso muere a media escritura, el archivo original queda intacto.
      const tmp = DATA_FILE + '.tmp'
      writeFileSync(tmp, JSON.stringify(data))
      renameSync(tmp, DATA_FILE)
    } catch (e) {
      console.error('save failed', e)
    }
  })
  return saving
}

function isAuthed(req) {
  const header = req.headers.authorization || ''
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : ''

  // 1. Token maestro del servidor (env var, solo en backend, nunca en el cliente)
  if (SYNC_TOKEN && bearer === SYNC_TOKEN) return true

  // 2. PIN hash: el cliente envía el SHA-256(PIN) que el servidor ya conoce.
  //    El hash es one-way, así que si alguien lo intercepta no obtiene el PIN.
  const pinHash = data.gate?.pinHash
  if (pinHash && /^[0-9a-f]{64}$/.test(bearer)) {
    return bearer.length === pinHash.length && bearer.split('').every((c, i) => c === pinHash[i])
  }

  // 3. Sin configuración aún (primera ejecución): permitir para que el cliente pueda
  //    registrar el PIN inicial.
  if (!SYNC_TOKEN && !pinHash) return true

  return false
}

function send401(res) {
  res.statusCode = 401
  res.end(JSON.stringify({ ok: false, error: 'unauthorized' }))
}

const server = createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  res.setHeader('Content-Type', 'application/json; charset=utf-8')

  if (req.method === 'POST' && url.pathname === '/api/sync') {
    if (!isAuthed(req)) return send401(res)
    let body = ''
    req.on('data', (c) => { body += c; if (body.length > 50_000_000) req.destroy() })
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body || '{}')
        const since = Number(parsed.since ?? 0) || 0
        const changed = applyMerge(data, parsed.payload || {})
        save().then(() => {
          res.statusCode = 200
          res.end(JSON.stringify({ ok: true, changedCount: changed, since: Date.now(), payload: snapshot(data, since) }))
        })
      } catch (e) {
        res.statusCode = 400
        res.end(JSON.stringify({ ok: false, error: String(e) }))
      }
    })
    return
  }

  if (req.method === 'GET' && url.pathname === '/api/sync') {
    if (!isAuthed(req)) return send401(res)
    res.end(JSON.stringify({ ok: true, payload: snapshot(data, 0) }))
    return
  }

  if (req.method === 'GET' && url.pathname === '/health') {
    res.end(JSON.stringify({ ok: true, time: Date.now() }))
    return
  }

  if (url.pathname === '/api/access') {
    if (!isAuthed(req)) return send401(res)
    if (req.method === 'GET') {
      res.end(JSON.stringify({ ok: true, pinHash: data.gate?.pinHash || '', updatedAt: data.gate?.updatedAt || 0 }))
      return
    }
    if (req.method === 'POST') {
      let body = ''
      req.on('data', (c) => { body += c; if (body.length > 10_000) req.destroy() })
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body || '{}')
          const pinHash = typeof parsed.pinHash === 'string' ? parsed.pinHash.trim() : ''
          if (!/^[0-9a-f]{64}$/.test(pinHash)) {
            res.statusCode = 400
            res.end(JSON.stringify({ ok: false, error: 'pinHash inválido' }))
            return
          }
          data.gate = { pinHash, updatedAt: Date.now() }
          save().then(() => {
            res.statusCode = 200
            res.end(JSON.stringify({ ok: true, pinHash, updatedAt: data.gate.updatedAt }))
          })
        } catch (e) {
          res.statusCode = 400
          res.end(JSON.stringify({ ok: false, error: String(e) }))
        }
      })
      return
    }
  }

  res.statusCode = 404
  res.end(JSON.stringify({ ok: false, error: 'not found' }))
})

server.listen(PORT, () => {
  console.log(`sync server listening on :${PORT}`)
})
