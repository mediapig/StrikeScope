#!/usr/bin/env node

/* Convert a GEM Global Nuclear Power Tracker CSV/JSON/XLSX export (unit-level)
 * into the facility-level data used by StrikeScope. */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { extname, resolve } from 'node:path'
import * as XLSX from 'xlsx'

const root = resolve(import.meta.dirname, '..')
const output = resolve(root, 'src/data/plants.json')
const metaOutput = resolve(root, 'src/data/plants.meta.json')

const fields = {
  id: ['GEM location ID', 'Location ID', 'Plant ID', 'Project ID', 'ID'],
  name: ['Project Name', 'Plant name', 'Facility name', 'Name'],
  localName: ['Project Name in Local Language / Script'],
  unit: ['Unit name', 'Unit Name', 'Unit'],
  country: ['Country/Area', 'Country', 'Country or area'],
  lat: ['Latitude', 'Latitude (decimal degrees)', 'lat'],
  lng: ['Longitude', 'Longitude (decimal degrees)', 'lon', 'lng'],
  status: ['Status', 'Project status'],
  reactorType: ['Reactor Type', 'Reactor type', 'Technology type', 'Technology Type'],
  capacity: ['Capacity (MW)', 'Capacity MW', 'Capacity', 'Net Capacity (MW)'],
  startYear: ['Start Year'],
  operator: ['Operator'],
}

const REACTOR_TYPE_ABBREVIATIONS = {
  'boiling water reactor': 'BWR',
  'fast breeder reactor': 'FBR',
  'gas-cooled reactor': 'GCR',
  'heavy water gas-cooled reactor': 'HWGCR',
  'heavy water light water reactor': 'HWLWR',
  'high temperature gas reactor': 'HTGR',
  'light water graphite reactor': 'LWGR',
  'liquid-metal-cooled fast reactor': 'LMFR',
  'microreactor': 'Microreactor',
  'pressurized heavy water reactor': 'PHWR',
  'pressurized water reactor': 'PWR',
  'small modular reactor': 'SMR',
  'steam-generating heavy water reactor': 'SGHWR',
}

const argument = (name) => {
  const index = process.argv.indexOf(name)
  return index === -1 ? undefined : process.argv[index + 1]
}

function parseCsv(text) {
  const records = []
  let row = []; let cell = ''; let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { cell += '"'; index += 1 } else quoted = !quoted
    } else if (char === ',' && !quoted) { row.push(cell.trim()); cell = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index += 1
      row.push(cell.trim()); if (row.some(Boolean)) records.push(row); row = []; cell = ''
    } else cell += char
  }
  row.push(cell.trim()); if (row.some(Boolean)) records.push(row)
  const [headers, ...rows] = records
  if (!headers) throw new Error('CSV has no header row.')
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])))
}

function parseSpreadsheet(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const sheet = workbook.Sheets.Data ?? workbook.Sheets[workbook.SheetNames[0]]
  if (!sheet) throw new Error('Spreadsheet has no worksheet.')
  return XLSX.utils.sheet_to_json(sheet, { defval: '' })
}

function get(row, field) {
  const key = Object.keys(row).find((candidate) => fields[field].includes(candidate.trim()))
  return key === undefined ? '' : row[key]
}

function asNumber(value) {
  const number = Number(String(value).replaceAll(',', '').replace(/[^0-9.-]/g, ''))
  return Number.isFinite(number) ? number : 0
}

function statusOf(value) {
  const valueLower = String(value).trim().toLowerCase()
  if (['operating', 'operational'].includes(valueLower)) return 'operating'
  if (['construction', 'under construction'].includes(valueLower)) return 'construction'
  if (['retired', 'permanent shutdown', 'mothballed', 'shelved'].includes(valueLower)) return 'decommissioned'
  if (['pre-construction', 'announced'].includes(valueLower)) return 'planned'
  return null
}

function abbreviateReactorType(value) {
  const label = String(value).trim()
  return REACTOR_TYPE_ABBREVIATIONS[label.toLowerCase()] || label
}

function cleanProjectName(value) {
  return String(value).trim().replace(/\s+nuclear power (plant|station)$/i, '')
}

async function source() {
  const input = argument('--input')
  const url = argument('--url')
  if ((input && url) || (!input && !url)) throw new Error('Use exactly one of --input <CSV/JSON/XLSX> or --url <CSV/JSON/XLSX>.')
  if (url) {
    const response = await fetch(url, { headers: { 'user-agent': 'StrikeScope data sync' } })
    if (!response.ok) throw new Error(`Download failed: HTTP ${response.status}`)
    return { body: Buffer.from(await response.arrayBuffer()), label: url, extension: extname(new URL(url).pathname) }
  }
  const path = resolve(input)
  return { body: await readFile(path), label: path, extension: extname(path) }
}

try {
  const input = await source()
  const extension = input.extension.toLowerCase()
  const text = input.body.toString('utf8')
  const rows = extension === '.json'
    ? JSON.parse(text)
    : ['.xlsx', '.xls'].includes(extension)
      ? parseSpreadsheet(input.body)
      : parseCsv(text)
  if (!Array.isArray(rows)) throw new Error('JSON source must be an array of records.')

  const sites = new Map(); let skipped = 0
  for (const row of rows) {
    const name = String(get(row, 'name') || get(row, 'unit')).trim()
    const lat = asNumber(get(row, 'lat')); const lng = asNumber(get(row, 'lng')); const status = statusOf(get(row, 'status'))
    if (!name || !status || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) { skipped += 1; continue }
    const locationId = String(get(row, 'id')).trim()
    const key = locationId || [name, get(row, 'country'), lat, lng].map((item) => String(item).trim().toLowerCase()).join('|')
    const previous = sites.get(key)
    const reactorType = String(get(row, 'reactorType')).trim(); const unit = String(get(row, 'unit')).trim()
    const localName = String(get(row, 'localName')).trim(); const operator = String(get(row, 'operator')).trim()
    const startYear = asNumber(get(row, 'startYear'))
    if (!previous) {
      sites.set(key, {
        name, localName, country: String(get(row, 'country')).trim() || 'Unknown', lat, lng, status,
        capacity: asNumber(get(row, 'capacity')), reactorTypes: new Set(reactorType ? [reactorType] : []),
        units: new Set(unit ? [unit] : []), operators: new Set(operator ? [operator] : []),
        startYears: startYear > 1900 ? [startYear] : [],
      })
    } else {
      previous.capacity += asNumber(get(row, 'capacity'))
      if (reactorType) previous.reactorTypes.add(reactorType)
      if (unit) previous.units.add(unit)
      if (operator) previous.operators.add(operator)
      if (startYear > 1900) previous.startYears.push(startYear)
      if (!previous.localName && localName) previous.localName = localName
      const rank = { operating: 4, construction: 3, planned: 2, decommissioned: 1 }
      if (rank[status] > rank[previous.status]) previous.status = status
    }
  }

  const plants = [...sites.values()].sort((a, b) => a.country.localeCompare(b.country) || a.name.localeCompare(b.name)).map((site, index) => ({
    id: index + 1, name: site.localName || cleanProjectName(site.name), nameEn: cleanProjectName(site.name), country: site.country,
    lat: Number(site.lat.toFixed(6)), lng: Number(site.lng.toFixed(6)), status: site.status,
    reactorType: [...site.reactorTypes].map(abbreviateReactorType).join(', ') || 'Unknown',
    capacity: Math.round(site.capacity), unitCount: site.units.size || 1,
    ...(site.startYears.length ? { startYear: Math.min(...site.startYears) } : {}),
    ...(site.operators.size ? { operator: [...site.operators].join(' / ') } : {}),
  }))
  await mkdir(resolve(root, 'src/data'), { recursive: true })
  await writeFile(output, `${JSON.stringify(plants, null, 2)}\n`)
  await writeFile(metaOutput, `${JSON.stringify({ source: input.label, syncedAt: new Date().toISOString(), inputRecords: rows.length, outputSites: plants.length, skippedRecords: skipped, note: 'Generated by scripts/sync-nuclear-data.mjs; unit records are grouped into facilities.' }, null, 2)}\n`)
  console.log(`Synced ${rows.length} records into ${plants.length} facilities (${skipped} skipped).`)
} catch (error) {
  console.error(`Data sync failed: ${error.message}`)
  process.exitCode = 1
}
