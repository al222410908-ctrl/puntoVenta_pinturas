import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const DATA_FILE = process.env.SYNC_DATA_FILE || '/home/ubuntu/puntoVenta_pinturas/sync-data.json'
const PORT = Number(process.env.PORT || '3457')
const __dirname = dirname(fileURLToPath(import.meta.url))

mkdirSync(dirname(DATA_FILE), { recursive: true })

let data = normalize(load())
function normalize(d) {
  const base = empty()
  for (const key of Object.keys(base)) {
    if (!d[key] || typeof d[key] !== 'object') d[key] = base[key]
  }
  return d
}
function load() {
  try {
    return JSON.parse(readFileSync(DATA_FILE, 'utf8'))
  } catch {
    return empty()
  }
}
function empty() {
  return {
    products: {},
    categories: {},
    suppliers: {},
    sales: {},
    purchases: {},
    purchaseOrders: {},
    stockMovements: {},
    cashEntries: {},
    tombstones: {},
  }
}
let saving = Promise.resolve()
function save() {
  saving = saving.then(() => {
    try {
      const tmp = DATA_FILE + '.tmp'
      writeFileSync(tmp, JSON.stringify(data))
      try {
        writeFileSync(DATA_FILE, JSON.stringify(data))
      } finally {
        if (existsSync(tmp)) { /* keep tmp harmless */ }
      }
    } catch (e) {
      console.error('save failed', e)
    }
  })
  return saving
}

const EDITABLE = ['products', 'categories', 'suppliers']
const APPEND = ['sales', 'purchases', 'purchaseOrders', 'stockMovements', 'cashEntries']
const TABLES = [...EDITABLE, ...APPEND]

function recordAt(rec) {
  return rec && rec.id ? (rec.updatedAt ?? rec.date ?? 0) : 0
}

function ensureStore(key) {
  if (!data[key]) data[key] = {}
  return data[key]
}

function applyMerge(clientPayload) {
  let changed = 0

  const clientTombstones = Array.isArray(clientPayload.tombstones) ? clientPayload.tombstones : []
  for (const t of clientTombstones) {
    if (!t || !t.id || !t.table || !t.recordId) continue
    const cur = data.tombstones[t.id]
    if (!cur || t.at >= (cur.at ?? 0)) {
      data.tombstones[t.id] = t
      changed++
    }
    const store = data[t.table]
    if (store && store[t.recordId]) {
      const recAt = recordAt(store[t.recordId])
      if (t.at >= recAt) delete store[t.recordId]
    }
  }

  for (const key of TABLES) {
    if (!clientPayload[key]) continue
    const store = ensureStore(key)
    const list = Array.isArray(clientPayload[key]) ? clientPayload[key] : []
    for (const rec of list) {
      if (!rec || !rec.id) continue
      const incomingAt = recordAt(rec)
      // no resucitar un registro ya borrado más recientemente
      const tomb = data.tombstones[`${key}:${rec.id}`]
      if (tomb && tomb.at > incomingAt) continue

      const cur = store[rec.id]
      if (key === 'products') {
        const base = cur && cur._baseStock != null ? cur._baseStock : (rec.stock ?? 0)
        const merged = { ...cur, ...rec }
        merged._baseStock = base
        delete merged.stock
        if (incomingAt >= recordAt(cur)) {
          store[rec.id] = merged
          changed++
        }
      } else if (APPEND.includes(key)) {
        if (!cur) {
          store[rec.id] = rec
          changed++
        }
      } else {
        if (!cur || incomingAt > recordAt(cur)) {
          store[rec.id] = { ...cur, ...rec }
          changed++
        }
      }
    }
  }

  return changed
}

function stockFor(product) {
  let stock = product._baseStock ?? product.stock ?? 0
  for (const m of Object.values(data.stockMovements || {})) {
    if (m && m.productId === product.id) stock += (m.qty ?? 0)
  }
  return Math.round(stock * 100) / 100
}

function snapshot(since = 0) {
  const out = {}
  for (const key of [...TABLES, 'tombstones']) {
    out[key] = []
  }
  for (const key of TABLES) {
    for (const rec of Object.values(data[key] || {})) {
      const at = recordAt(rec)
      // sin timestamp (at === 0) se envía solo en la primera sincronización (since === 0)
      if (at > since) {
        out[key].push(JSON.parse(JSON.stringify(rec)))
      } else if (since === 0 && at === 0) {
        out[key].push(JSON.parse(JSON.stringify(rec)))
      }
    }
  }
  for (const rec of out.products) {
    rec.stock = stockFor(rec)
    delete rec._baseStock
  }
  out.tombstones = Object.values(data.tombstones || {}).filter((t) => (t.at ?? 0) > since)
  return out
}

const server = createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  res.setHeader('Content-Type', 'application/json; charset=utf-8')

  if (req.method === 'POST' && url.pathname === '/api/sync') {
    let body = ''
    req.on('data', (c) => { body += c; if (body.length > 50_000_000) req.destroy() })
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body || '{}')
        const since = Number(parsed.since ?? 0) || 0
        const changed = applyMerge(parsed.payload || {})
        save().then(() => {
          res.statusCode = 200
          res.end(JSON.stringify({ ok: true, changedCount: changed, since: Date.now(), payload: snapshot(since) }))
        })
      } catch (e) {
        res.statusCode = 400
        res.end(JSON.stringify({ ok: false, error: String(e) }))
      }
    })
    return
  }

  if (req.method === 'GET' && url.pathname === '/api/sync') {
    res.end(JSON.stringify({ ok: true, payload: snapshot(0) }))
    return
  }

  if (req.method === 'GET' && url.pathname === '/health') {
    res.end(JSON.stringify({ ok: true, time: Date.now() }))
    return
  }

  res.statusCode = 404
  res.end(JSON.stringify({ ok: false, error: 'not found' }))
})

server.listen(PORT, () => {
  console.log(`sync server listening on :${PORT}`)
})
