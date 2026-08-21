#!/usr/bin/env node

/* Adds English display names to the curated facility list by matching it to
 * GeoNuclearData reactor coordinates. Facility names stay intact as `name`,
 * while the English UI uses `nameEn` when available. */
import { readFile, writeFile } from 'node:fs/promises'

const input = process.argv[2]
if (!input) throw new Error('Usage: node scripts/add-english-plant-names.mjs <GeoNuclearData CSV>')

const plantsPath = new URL('../src/data/plants.json', import.meta.url)
const plants = JSON.parse(await readFile(plantsPath, 'utf8'))
const csv = await readFile(input, 'utf8')

function parseCsvLine(line) {
  const cells = []; let cell = ''; let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (char === '"') quoted = !quoted
    else if (char === ',' && !quoted) { cells.push(cell); cell = '' }
    else cell += char
  }
  cells.push(cell)
  return cells
}

const reactors = csv.trim().split(/\r?\n/).slice(1).map(parseCsvLine).map(cells => ({
  name: cells[1], lat: Number(cells[2]), lng: Number(cells[3]),
})).filter(reactor => reactor.name && Number.isFinite(reactor.lat) && Number.isFinite(reactor.lng))

const distance = (plant, reactor) => Math.hypot(reactor.lat - plant.lat, (reactor.lng - plant.lng) * Math.cos(plant.lat * Math.PI / 180))
const facilityName = name => name.replace(/(?:[- ]|\s*\()\d+(?:\)|\s.*)?$/, '').trim()
const manualNames = {
  '红沿河核电站': 'Hongyanhe', '宁德核电站': 'Ningde', '阳江核电站': 'Yangjiang',
  '昌江核电站': 'Changjiang', '三门核电站': 'Sanmen', '海阳核电站': 'Haiyang',
  '台山核电站': 'Taishan', '徐大堡核电站': 'Xudabao', '三澳核电站': "San'ao",
  '陆丰核电站': 'Lufeng', '廉江核电站': 'Lianjiang', '金七门核电站': 'Jinqimen',
  '太平岭核电站': 'Taipingling', '沃尔夫克里克核电站': 'Wolf Creek', '美滨核电站': 'Mihama',
  '罗斯托夫核电站': 'Rostov', '学术院士罗蒙诺索夫号(浮动)': 'Akademik Lomonosov',
  '戈尔普尔核电站': 'Gorakhpur Haryana', '莫霍夫采核电站': 'Mochovce', '克尔什科核电站': 'Krško',
  '阿图查核电站': 'Atucha', '马鞍山核电站': 'Maanshan',
}

let matched = 0; let manualMatched = 0
const updated = plants.map(plant => {
  const closest = reactors.reduce((best, reactor) => !best || distance(plant, reactor) < distance(plant, best) ? reactor : best, null)
  if (manualNames[plant.name]) { manualMatched += 1; return { ...plant, nameEn: manualNames[plant.name] } }
  if (!closest || distance(plant, closest) > 0.12) return plant
  matched += 1
  return { ...plant, nameEn: facilityName(closest.name) }
})

await writeFile(plantsPath, `${JSON.stringify(updated, null, 2)}\n`)
console.log(`Added English names to ${matched + manualMatched}/${plants.length} facilities.`)
