// Diagnóstico de borrados: crea un producto diagnóstico en el servidor,
// lo borra con un tombstone y luego revisa que ya no aparezca en el snapshot.
//
// Uso:
//   node scripts/test-sync-delete.mjs "C:\Users\Alan Alcantara\Downloads\sync-data.json"

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
const id = `diag-delete-${now}`

async function post(payload) {
  const body = JSON.stringify({ since: 0, payload })
  const start = Date.now()
  const resp = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pinHash}` },
    body,
  })
  const elapsed = ((Date.now() - start) / 1000).toFixed(2)
  let text = ''
  try {
    text = await resp.text()
  } catch {
    text = '(sin cuerpo)'
  }
  console.log(`POST -> HTTP ${resp.status} en ${elapsed}s (${(text.length / 1024).toFixed(1)} KB)`)
  return { status: resp.status, text }
}

function parse(text) {
  try {
    return JSON.parse(text)
  } catch (e) {
    console.log('  [AVISO] no se pudo parsear la respuesta:', String(e).slice(0, 120))
    return null
  }
}

console.log('PASO 1: insertar producto diagnóstico...')
let r = await post({
  products: [
    {
      id,
      name: 'PRUEBA-BORRADO',
      unit: 'litro',
      cost: 1,
      price: 2,
      stock: 0,
      updatedAt: now,
      createdAt: now,
    },
  ],
})
let j = parse(r.text)
const present1 = (j?.payload?.products ?? []).some((p) => p.id === id)
console.log(`  ¿Aparece creado en el servidor? ${present1 ? 'SÍ' : 'NO'}`)

console.log('PASO 2: borrarlo con tombstone (simula el borrado del celular)...')
r = await post({
  tombstones: [{ id: `products:${id}`, table: 'products', recordId: id, at: now + 1 }],
})
j = parse(r.text)

const present2 = (j?.payload?.products ?? []).some((p) => p.id === id)
const tom2 = (j?.payload?.tombstones ?? []).some((t) => t.recordId === id && t.table === 'products')
console.log(`  ¿Sigue en el snapshot tras borrarlo? ${present2 ? 'SÍ (PROBLEMA)' : 'NO (bien)'}`)
console.log(`  ¿El tombstone está en data.tombstones? ${tom2 ? 'SÍ' : 'NO'}`)

console.log('PASO 3: descarga un celular/PC (post with since=0, payload vacío)...')
r = await post({})
j = parse(r.text)
const present3 = (j?.payload?.products ?? []).some((p) => p.id === id)
const allToms3 = (j?.payload?.tombstones ?? []).length
const tom3 = (j?.payload?.tombstones ?? []).some((t) => t.recordId === id && t.table === 'products')
console.log(`  ¿El producto sigue en el snapshot? ${present3 ? 'SÍ (PROBLEMA)' : 'NO (bien)'}`)
console.log(`  Total de tombstones recibidos: ${allToms3}`)
console.log(`  ¿El tombstone llega a otros dispositivos? ${tom3 ? 'SÍ' : 'NO (PROBLEMA)'}`)

console.log('PASO 4: limpiar el tombstone diagnóstico para no dejar basura...')
r = await post({
  tombstones: [
    // Tombstone inverso no existe; dejamos constancia. El producto NO debe volver.
  ],
})
j = parse(r.text)
const present4 = (j?.payload?.products ?? []).some((p) => p.id === id)
console.log(`  Tras limpieza, ¿existe el producto en el servidor? ${present4 ? 'SÍ (PROBLEMA)' : 'NO'}`)

console.log('\nRESULTADO:', present3 ? 'el producto resucita (PROBLEMA)' : tom3 ? 'borrado y propagado correctamente' : 'revisar arriba el paso problemático')