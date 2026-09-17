// Recomprime todas las fotos de sync-data.json para adelgazar el documento
// que se sincroniza (16.9MB de fotos base64 -> muchos menos). Genera
// sync-data-recompressed.json en la misma carpeta.
//
// Uso:
//   npm install sharp
//   node scripts/recompress-photos.mjs "C:\Users\Alan Alcantara\Downloads\sync-data.json"

import { readFileSync, writeFileSync } from 'node:fs'
import sharp from 'sharp'

const dataFile = process.argv[2]
if (!dataFile) {
  console.error('Falta la ruta del archivo JSON.')
  process.exit(1)
}

const MAX_DIM = 640
const QUALITY = 68

const raw = readFileSync(dataFile, 'utf8')
const data = JSON.parse(raw)
const products = Object.values(data.products || {})

let totalBefore = 0
let totalAfter = 0
let changed = 0

for (const p of products) {
  const photo = p ? p.photo : undefined
  if (!photo || typeof photo !== 'string' || !photo.startsWith('data:image')) continue

  const comma = photo.indexOf(',')
  const mime = photo.slice(5, photo.indexOf(';'))
  const base64 = photo.slice(comma + 1)
  const buf = Buffer.from(base64, 'base64')
  totalBefore += buf.length

  const out = await sharp(buf)
    .rotate()
    .resize({ width: MAX_DIM, height: MAX_DIM, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: QUALITY, mozjpeg: true })
    .toBuffer()

  totalAfter += out.length
  p.photo = `data:${mime};base64,${out.toString('base64')}`
  changed++
}

const outFile = dataFile.replace(/\.json$/i, '-recompressed.json')
writeFileSync(outFile, JSON.stringify(data))

console.log(`Productos con foto reprocesados: ${changed}`)
console.log(`Fotos antes: ${(totalBefore / 1024 / 1024).toFixed(2)} MB`)
console.log(`Fotos después: ${(totalAfter / 1024 / 1024).toFixed(2)} MB`)
console.log(`Archivo nuevo: ${outFile}`)
if (totalAfter > 0) {
  console.log(`Reducción: ${(100 - (totalAfter / totalBefore) * 100).toFixed(0)}%`)
}