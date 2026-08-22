#!/usr/bin/env node

/* Resample a WorldPop global population-count GeoTIFF (1km native resolution)
 * into a compact binary grid bundled with the app, so population estimates
 * for accident/detonation zones can be computed locally instead of hitting
 * the live WorldPop task-submission API on every simulation.
 *
 * Source data: WorldPop Global 2015-2030 constrained population counts,
 * https://www.worldpop.org (CC-BY 4.0), served anonymously (no account
 * needed) from data.worldpop.org's public directory listing.
 *
 * Usage:
 *   node build-population-grid.mjs                    # auto-discover this year's mosaic
 *   node build-population-grid.mjs --year 2027         # auto-discover a specific year
 *   node build-population-grid.mjs --url <tif url>     # skip discovery, read a known URL
 *   node build-population-grid.mjs --input <local .tif> # read a local file (for testing)
 * All forms accept --resolution <degrees> (default 0.1). */
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import { fromFile } from 'geotiff'

const root = resolve(import.meta.dirname, '..')
// Named .dat rather than .bin.gz/.gz on purpose: some static hosts (Vite's
// own preview server included) auto-detect a .gz suffix, serve it with
// Content-Encoding: gzip, and let the browser transparently decompress it -
// which then breaks the app's own explicit DecompressionStream pass. A
// neutral extension keeps decompression entirely under the app's control
// regardless of hosting quirks.
const output = resolve(root, 'src/data/population-grid.dat')
const metaOutput = resolve(root, 'src/data/population-grid.json')

const argument = (name, fallback) => {
  const index = process.argv.indexOf(name)
  return index === -1 ? fallback : process.argv[index + 1]
}

// WorldPop tags each release "R<year><letter>" (R2024A, R2024B, R2025A, ...)
// and there is no way to know the current tag in advance. Rather than
// hardcoding one that will eventually go stale, discover every release
// folder listed and try the newest first for the target data-year, falling
// back to older releases only if the newest doesn't have that year yet.
// If nothing is found at all, this throws - a scheduled sync run should
// fail loudly on a WorldPop layout change, not silently ship stale data.
async function resolveMosaicUrl(year) {
  const base = 'https://data.worldpop.org/GIS/Population/Global_2015_2030/'
  const listing = await fetch(base).then(response => response.text())
  const releases = [...listing.matchAll(/href="(R\d{4}[A-Z])\/"/g)].map(match => match[1]).sort()
  if (!releases.length) throw new Error(`No WorldPop release folders found at ${base} - the site layout may have changed.`)
  for (let index = releases.length - 1; index >= 0; index -= 1) {
    const release = releases[index]
    const url = `${base}${release}/${year}/0_Mosaicked/v1/1km/constrained/global_pop_${year}_CN_1km_${release}_v1.tif`
    // eslint-disable-next-line no-await-in-loop
    const head = await fetch(url, { method: 'HEAD' })
    if (head.ok) return url
  }
  throw new Error(`No WorldPop mosaic found for ${year} in any release (checked: ${releases.join(', ')}).`)
}

const explicitInputPath = argument('--input')
const explicitUrl = argument('--url')
const targetYear = argument('--year', String(new Date().getFullYear()))
const targetResolution = Number(argument('--resolution', '0.1'))

const sourceUrl = explicitInputPath ? null : (explicitUrl ?? await resolveMosaicUrl(targetYear))
// This server advertises Accept-Ranges but doesn't actually honor Range
// requests (always returns the full body), so geotiff's fromUrl windowed
// reads don't work against it - download to a temp file and read that
// instead, same as a human would with curl.
let inputPath = explicitInputPath
let downloadedTempPath = null
if (sourceUrl) {
  console.log(`Downloading ${sourceUrl}`)
  const response = await fetch(sourceUrl)
  if (!response.ok) throw new Error(`Download failed: HTTP ${response.status}`)
  downloadedTempPath = resolve(tmpdir(), `worldpop-population-${targetYear}.tif`)
  await writeFile(downloadedTempPath, Buffer.from(await response.arrayBuffer()))
  inputPath = downloadedTempPath
  console.log(`Downloaded to ${downloadedTempPath}`)
}

const tiff = await fromFile(inputPath)
const image = await tiff.getImage()
const width = image.getWidth()
const height = image.getHeight()
const [west, south, east, north] = image.getBoundingBox()
const pixelWidth = (east - west) / width
const pixelHeight = (north - south) / height

console.log(`Source raster: ${width}x${height}, bbox [${west}, ${south}, ${east}, ${north}]`)

// Output grid always covers the full globe at targetResolution-degree cells,
// row-major from the north-west corner, regardless of the source bbox.
const cols = Math.round(360 / targetResolution)
const rows = Math.round(180 / targetResolution)
const grid = new Float64Array(cols * rows)

// Read the source raster in horizontal row-block chunks to bound memory -
// the full raster at float32 would be several GB uncompressed - and, when
// reading from a URL, to keep each HTTP range request a reasonable size.
const bytesPerPixel = 4
const chunkBudgetBytes = 512 * 1024 * 1024
const rowsPerChunk = Math.max(1, Math.floor(chunkBudgetBytes / (width * bytesPerPixel)))

for (let y0 = 0; y0 < height; y0 += rowsPerChunk) {
  const y1 = Math.min(height, y0 + rowsPerChunk)
  // eslint-disable-next-line no-await-in-loop
  const [raster] = await image.readRasters({ window: [0, y0, width, y1] })
  for (let row = 0; row < y1 - y0; row += 1) {
    const srcY = y0 + row
    const lat = north - (srcY + 0.5) * pixelHeight
    if (lat <= -90 || lat >= 90) continue
    const outRow = Math.min(rows - 1, Math.floor((90 - lat) / targetResolution))
    const rowBase = row * width
    for (let col = 0; col < width; col += 1) {
      const value = raster[rowBase + col]
      // WorldPop nodata is a large negative sentinel; skip it and any non-positive cell.
      if (!Number.isFinite(value) || value <= 0) continue
      const lng = west + (col + 0.5) * pixelWidth
      const outCol = Math.min(cols - 1, Math.floor((lng + 180) / targetResolution))
      grid[outRow * cols + outCol] += value
    }
  }
  console.log(`Processed rows ${y0}-${y1} of ${height}`)
}

// Uint32 is safe headroom: even a very dense 0.1 degree cell over a megacity
// core holds population counts in the low millions, far under 2^32.
const encoded = new Uint32Array(grid.length)
for (let i = 0; i < grid.length; i += 1) encoded[i] = Math.round(grid[i])

const compressed = gzipSync(Buffer.from(encoded.buffer), { level: 9 })

await mkdir(resolve(root, 'src/data'), { recursive: true })
await writeFile(output, compressed)
await writeFile(metaOutput, `${JSON.stringify({
  source: sourceUrl ?? explicitInputPath,
  resolutionDegrees: targetResolution,
  cols,
  rows,
  west: -180,
  north: 90,
  totalPopulation: encoded.reduce((total, value) => total + value, 0),
  generatedAt: new Date().toISOString(),
  note: 'Population count per cell, Uint32, row-major from the north-west corner, gzip-compressed. Generated by scripts/build-population-grid.mjs from a WorldPop Global 2015-2030 constrained 1km mosaic (CC-BY 4.0, https://www.worldpop.org).',
}, null, 2)}\n`)

console.log(`Wrote ${cols}x${rows} grid: ${(encoded.byteLength / 1e6).toFixed(1)} MB raw -> ${(compressed.byteLength / 1e6).toFixed(1)} MB gzipped, at ${output}`)

if (downloadedTempPath) await rm(downloadedTempPath, { force: true })
