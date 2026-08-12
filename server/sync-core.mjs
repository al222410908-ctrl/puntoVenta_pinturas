export const EDITABLE = ['products', 'categories', 'suppliers']
export const APPEND = ['sales', 'purchases', 'purchaseOrders', 'stockMovements', 'cashEntries']
export const TABLES = [...EDITABLE, ...APPEND]

export function empty() {
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

export function normalize(d) {
  const base = empty()
  for (const key of Object.keys(base)) {
    if (!d[key] || typeof d[key] !== 'object') d[key] = base[key]
  }
  return d
}

export function recordAt(rec) {
  return rec && rec.id ? (rec.updatedAt ?? rec.date ?? 0) : 0
}

export function ensureStore(data, key) {
  if (!data[key]) data[key] = {}
  return data[key]
}

export function applyMerge(data, clientPayload) {
  let changed = 0
  const client = clientPayload || {}

  const clientTombstones = Array.isArray(client.tombstones) ? client.tombstones : []
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
    if (!client[key]) continue
    const store = ensureStore(data, key)
    const list = Array.isArray(client[key]) ? client[key] : []
    for (const rec of list) {
      if (!rec || !rec.id) continue
      const incomingAt = recordAt(rec)
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

export function stockFor(data, product) {
  let stock = product._baseStock ?? product.stock ?? 0
  for (const m of Object.values(data.stockMovements || {})) {
    if (m && m.productId === product.id) stock += (m.qty ?? 0)
  }
  return Math.round(stock * 100) / 100
}

export function snapshot(data, since = 0) {
  const out = {}
  for (const key of [...TABLES, 'tombstones']) {
    out[key] = []
  }
  for (const key of TABLES) {
    for (const rec of Object.values(data[key] || {})) {
      const at = recordAt(rec)
      if (at > since) {
        out[key].push(JSON.parse(JSON.stringify(rec)))
      } else if (since === 0 && at === 0) {
        out[key].push(JSON.parse(JSON.stringify(rec)))
      }
    }
  }
  for (const rec of out.products) {
    rec.stock = stockFor(data, rec)
    delete rec._baseStock
  }
  out.tombstones = Object.values(data.tombstones || {}).filter((t) => (t.at ?? 0) > since)
  return out
}