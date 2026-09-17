// Prueba REAL de escritura con cambios a través del Edge Function desplegado.
// Manda un registro nuevo mínimo (categoría __diag__) → fuerza applyMerge con
// changed>0 → la función debe reescribir el jsonb completo (~17MB) vía PostgREST.
// Luego lo borra con un tombstone para dejar la data limpia.
//
// Uso:
//   node scripts/test-supabase-write-edge.mjs "C:\Users\Alan Alcantara\Downloads\sync-data.json"

import { readFileSync } from 'node:fs'

const dataFile = process.argv[2]
if (!dataFile) {
  console.error('Falta la ruta del respaldo JSON.')
  process.exit(1)
}

const ENDPOINT = 'https://liibcmfsvxdqybpftnia.supabase.co/functions/v1/sync'

const raw = readFileSync(dataFile, 'utf8')
const data = JSON.parse(raw)
const pinHash = data?.gate?.pinHash
if (!pinHash) {
  console.error('Sin gate.pinHash.')
  process.exit(1)
}

const now = Date.now()
const id = `__diag__${now}`

async function post(payload) {
  const body = JSON.stringify({ since: 0, payload })
  const start = Date.now()
  const resp = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pinHash}` },
    body,
  })
  const elapsed = ((Date.now() - start) / 1000).toFixed(2)
  const text = await resp.text()
  console.log(`POST -> HTTP ${resp.status} en ${elapsed}s (${(text.length / 1024).toFixed(1)} KB)`)
  console.log('  Detalle:', text.slice(0, 400))
  return { status: resp.status, text }
}

// 1) Agregar una categoría de diagnóstico (cambia > 0 → escribe todo)
console.log('PASO 1: insertar categoría __diag__ (fuerza reescritura ~17MB)...')
await post({
  categories: [{ id, name: '__diag__', updatedAt: now, createdAt: now }],
})

// 2) Borrarla con tombstone para no dejar basura
console.log('PASO 2: borrar la categoría con tombstone...')
await post({
  tombstones: [
    { id: `categories:${id}`, table: 'categories', recordId: id, at: now + 1 },
  ],
})