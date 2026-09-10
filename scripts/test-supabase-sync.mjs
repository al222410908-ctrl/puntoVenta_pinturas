// Prueba del endpoint /sync desplegado en Supabase, igual que lo llama el cliente.
// Uso:
//   node scripts/test-supabase-sync.mjs "C:\Users\Alan Alcantara\Downloads\sync-data.json"
//
// Lee el respaldo para obtener el pinHash real del gate (Authorization), y hace un
// POST since=0 con payload vacío, que es lo que dispara una descarga completa.

import { readFileSync } from 'node:fs'

const dataFile = process.argv[2]
if (!dataFile) {
  console.error('Falta la ruta del archivo JSON de respaldo.')
  process.exit(1)
}

const ENDPOINT = 'https://liibcmfsvxdqybpftnia.supabase.co/functions/v1/sync'

const raw = readFileSync(dataFile, 'utf8')
const data = JSON.parse(raw)

const pinHash = data?.gate?.pinHash
console.log('pinHash encontrado:', pinHash ? 'sí' : 'NO')

if (!pinHash) {
  console.error('El respaldo no tiene gate.pinHash. No se puede autenticar.')
  process.exit(1)
}

const body = JSON.stringify({ since: 0, payload: {} })
console.log('POST a', ENDPOINT, 'con since=0, payload={}')

const start = Date.now()
const resp = await fetch(ENDPOINT, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${pinHash}`,
  },
  body,
})
const elapsed = ((Date.now() - start) / 1000).toFixed(2)
console.log('Status:', resp.status, `(${elapsed}s total)`)

const text = await resp.text()
console.log('Tamaño respuesta:', (text.length / 1024 / 1024).toFixed(2), 'MB')

let parsed = null
try {
  parsed = JSON.parse(text)
} catch {
  console.log('Respuesta no-JSON (primeros 300 chars):', text.slice(0, 300))
}

if (parsed && parsed.ok) {
  const p = parsed.payload || {}
  const counts = {
    products: p.products?.length,
    categories: p.categories?.length,
    suppliers: p.suppliers?.length,
    sales: p.sales?.length,
    purchases: p.purchases?.length,
    movements: p.stockMovements?.length,
    tombstones: p.tombstones?.length,
  }
  console.log('Registros devueltos:', JSON.stringify(counts))
} else if (parsed) {
  console.log('Respuesta:', JSON.stringify(parsed).slice(0, 300))
  const err = parsed.error
  if (err && err.message) {
    require('node:fs').writeFileSync('supabase-error-dump.txt', err.message, 'utf8')
    console.log('Mensaje completo guardado en supabase-error-dump.txt')
  }
}