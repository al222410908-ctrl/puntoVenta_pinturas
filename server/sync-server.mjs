import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
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
      writeFileSync(DATA_FILE, JSON.stringify(data))
    } catch (e) {
      console.error('save failed', e)
    }
  })
  return saving
}

function isAuthed(req) {
  if (!SYNC_TOKEN) return true
  const header = req.headers.authorization || ''
  const expected = `Bearer ${SYNC_TOKEN}`
  const a = header
  const b = expected
  return a.length === b.length && a.split('').every((c, i) => c === b[i])
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
