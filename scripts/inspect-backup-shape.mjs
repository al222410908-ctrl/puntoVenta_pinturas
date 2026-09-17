import { readFileSync } from 'node:fs'

const f = process.argv[2] || 'C:/Users/Alan Alcantara/Downloads/sync-data-recompressed.json'
const d = JSON.parse(readFileSync(f, 'utf8'))
const p = Object.values(d.products)[0]
console.log(JSON.stringify(p, null, 1).slice(0, 700))
console.log('keys:', Object.keys(p))

let withBase = 0
let withStock = 0
const total = Object.values(d.products).length
for (const prod of Object.values(d.products)) {
  if (prod._baseStock != null) withBase++
  if (prod.stock != null) withStock++
}
console.log(`total=${total} con _baseStock=${withBase} con stock=${withStock}`)

const prods = Object.values(d.products).slice(0, 3).map((x) => ({ name: x.name, stock: x.stock, base: x._baseStock, updatedAt: x.updatedAt }))
console.log('muestra:', prods)