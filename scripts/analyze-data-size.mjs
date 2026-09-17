import { readFileSync } from 'node:fs'

const dataFile = process.argv[2] || 'C:/Users/Alan Alcantara/Downloads/sync-data.json'
const d = JSON.parse(readFileSync(dataFile, 'utf8'))

const bytes = {}
for (const [k, v] of Object.entries(d)) {
  if (typeof v !== 'object' || !v) continue
  bytes[k] = JSON.stringify(v).length
}
console.log('tamaño por tabla (KB):')
for (const [k, v] of Object.entries(bytes)) console.log(' ', k, (v / 1024).toFixed(1))

let photoBytes = 0
let photoCount = 0
for (const p of Object.values(d.products || {})) {
  if (p && p.photo) {
    photoBytes += p.photo.length
    photoCount++
  }
}
console.log(`fotos: ${photoCount} productos con foto, ${(photoBytes / 1024 / 1024).toFixed(1)} MB`)

let maxLen = 0
let maxPhoto = ''
for (const p of Object.values(d.products || {})) {
  if (p && p.photo && p.photo.length > maxLen) {
    maxLen = p.photo.length
    maxPhoto = p.name
  }
}
console.log(`foto más grande: "${maxPhoto}" = ${(maxLen / 1024 / 1024).toFixed(1)} MB`)

const total = JSON.stringify(d).length
console.log(`total archivo: ${(total / 1024 / 1024).toFixed(1)} MB`)