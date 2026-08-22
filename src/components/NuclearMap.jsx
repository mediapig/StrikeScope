import { useEffect, useMemo, useRef, useState } from 'react'
import Map, { Marker, NavigationControl, Popup, Source, Layer } from 'react-map-gl/maplibre'
import { addProtocol, setWorkerUrl } from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import { area as turfArea, bbox, bboxPolygon, circle as turfCircle, distance as turfDistance, featureCollection, intersect, midpoint as turfMidpoint, polygon as turfPolygon, union } from '@turf/turf'
import QRCode from 'qrcode'
import plants from '../data/plants.json'

// Bundlers can't resolve maplibre-gl's own worker URL from inside its module
// graph, so it must be pointed at the worker chunk explicitly.
setWorkerUrl(maplibreWorkerUrl)

const MAP_STYLE = {
  version: 8,
  projection: { type: 'globe' },
  sky: { 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 7, 0] },
  sources: {
    carto: {
      type: 'raster',
      tiles: ['a', 'b', 'c'].map(sub => `https://${sub}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png`),
      tileSize: 256,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    },
  },
  layers: [{ id: 'carto-voyager', type: 'raster', source: 'carto' }],
}

const STATUS_COLOR = { operating: '#22c55e', decommissioned: '#6b7280', construction: '#f59e0b', planned: '#3b82f6' }
const REFERENCE_ZONES = [
  { radiusKm: 16, color: '#f97316', key: 'plume' },
  { radiusKm: 80, color: '#eab308', key: 'ingestion' },
]
const SCENARIO_LEVELS = {
  low: { coreRadius: 3, zones: [{ radius: 16, color: '#f97316', key: 'plume' }, { radius: 50, color: '#eab308', key: 'monitoring' }] },
  medium: { coreRadius: 5, zones: [{ radius: 30, color: '#f97316', key: 'plume' }, { radius: 100, color: '#eab308', key: 'monitoring' }] },
  high: { coreRadius: 10, zones: [{ radius: 60, color: '#f97316', key: 'plume' }, { radius: 200, color: '#eab308', key: 'monitoring' }] },
}
const RAINFALL = {
  none: { distanceFactor: 1, opacity: 0.15 },
  light: { distanceFactor: 0.9, opacity: 0.17 },
  moderate: { distanceFactor: 0.76, opacity: 0.2 },
  heavy: { distanceFactor: 0.62, opacity: 0.24 },
}

const COPY = {
  zh: {
    title: '☢ StrikeScope — 全球核电站场景推演', statusTitle: '核电站状态', reactor: '堆型', capacity: '装机容量', selectPlant: '选择电站', planning: '规划参考区', simulation: '模拟范围', core: '全向近场警戒', downwind: '（顺风）', scenario: '事故场景推演', selectHint: '请先点击地图上的核电站', release: '放射性释放规模', direction: '扩散方向', wind: '风力', rainfall: '降雨强度', duration: '释放持续时间（小时）', trigger: '触发模拟', clear: '清除模拟', ongoing: '输入 0 代表持续释放；远场仅表示稀释后的参考影响。', rainHint: '降雨越强，模拟越偏向近场湿沉降。', windHint: '0级无风 · 3级微风 · 6级强风 · 9级烈风 · 12级飓风', directionHint: '0° 北 · 90° 东 · 180° 南 · 270° 西', populationTitle: '模拟区域估算人口', populationLoading: '正在计算人口…', populationError: '暂时无法取得人口估算', populationNote: '基于 WorldPop 人口栅格；为模拟区域内常住人口估算，不代表实际暴露或撤离人数。', disclaimer: '仅为可视化推演：结合装机容量、释放时间与风向生成示意羽流；不是剂量预测或应急指令。', status: { operating: '运营中', decommissioned: '已关闭', construction: '建设中', planned: '计划中' }, reference: { plume: '羽流应急规划参考区 (16km)', ingestion: '摄入途径规划参考区 (80km)' }, level: { low: '小规模释放', medium: '中等规模释放', high: '大规模释放' }, zone: { plume: '羽流防护参考', monitoring: '监测参考' }, rain: { none: '无雨', light: '小雨', moderate: '中雨', heavy: '大雨' }, unknown: '未知', north: '北', east: '东', south: '南', west: '西', mw: 'MW', forceSuffix: '级', unitSeparator: ' · ', searchPlaceholder: '搜索电站或国家…', dataSource: '数据来源：Global Energy Monitor 全球核电追踪（Global Nuclear Power Tracker）', units: '机组数', commissioned: '投产年份', plannedStart: '计划投产', operator: '运营商', statusFilterHint: '点击可在地图上显示/隐藏该类电站', measure: '测量距离', measureHint: '在地图或核电站上依次点击多个点，测量折线总距离', measureClear: '清除测距', measureReset: '重新开始', measureTotal: '总距离', km: '公里', share: '分享结果', shareCopied: '内容已复制，可粘贴到微信或 Instagram 分享', shareImageCopied: '图片已复制（含二维码），可粘贴到微信或 Instagram 分享', shareDownloaded: '图片已保存（含二维码），可在聊天中作为图片发送', shareX: '分享到 X', close: '关闭',
  },
  en: {
    title: '☢ StrikeScope — Nuclear Scenario Explorer', statusTitle: 'Plant status', reactor: 'Reactor type', capacity: 'Installed capacity', selectPlant: 'Select plant', planning: 'Planning references', simulation: 'Simulation zones', core: 'All-direction near-field alert', downwind: ' (downwind)', scenario: 'Accident scenario', selectHint: 'Select a nuclear plant on the map first', release: 'Radioactive release scale', direction: 'Plume direction', wind: 'Wind force', rainfall: 'Rainfall', duration: 'Release duration (hours)', trigger: 'Run simulation', clear: 'Clear simulation', ongoing: 'Enter 0 for an ongoing release; the far field is a diluted reference only.', rainHint: 'Stronger rain shifts this illustration toward near-field wet deposition.', windHint: '0 calm · 3 gentle breeze · 6 strong breeze · 9 strong gale · 12 hurricane', directionHint: '0° N · 90° E · 180° S · 270° W', populationTitle: 'Estimated residents in simulation area', populationLoading: 'Calculating population…', populationError: 'Population estimate is currently unavailable', populationNote: 'Based on WorldPop population grids; this estimates resident population in the simulated area, not actual exposure or evacuation.', disclaimer: 'Visualization only: this illustrative plume uses capacity, duration, and wind. It is not a dose forecast or emergency instruction.', status: { operating: 'Operating', decommissioned: 'Closed', construction: 'Under construction', planned: 'Planned' }, reference: { plume: 'Plume planning reference (16 km)', ingestion: 'Ingestion planning reference (80 km)' }, level: { low: 'Small release', medium: 'Moderate release', high: 'Large release' }, zone: { plume: 'Plume protection reference', monitoring: 'Monitoring reference' }, rain: { none: 'No rain', light: 'Light rain', moderate: 'Moderate rain', heavy: 'Heavy rain' }, unknown: 'Unknown', north: 'N', east: 'E', south: 'S', west: 'W', mw: 'MW', forceSuffix: '', unitSeparator: ' · ', searchPlaceholder: 'Search plant or country…', dataSource: 'Data: Global Energy Monitor Global Nuclear Power Tracker', units: 'Units', commissioned: 'Commissioned', plannedStart: 'Planned start', operator: 'Operator', statusFilterHint: 'Click to show/hide this status on the map', measure: 'Measure distance', measureHint: 'Click multiple points on the map or on plants to measure the total path distance', measureClear: 'Clear measurement', measureReset: 'Restart', measureTotal: 'Total distance', km: 'km', share: 'Share result', shareCopied: 'Copied — paste into WeChat or Instagram to share', shareImageCopied: 'Image copied (with QR code) — paste into WeChat or Instagram to share', shareDownloaded: 'Image saved (with QR code) — send it as a photo in any chat app', shareX: 'Share on X', close: 'Close',
  },
}

const COUNTRY_NAMES_ZH = {
  Argentina: '阿根廷', Armenia: '亚美尼亚', Bangladesh: '孟加拉国', Belarus: '白俄罗斯', Belgium: '比利时',
  Brazil: '巴西', Bulgaria: '保加利亚', Canada: '加拿大', China: '中国', 'Czech Republic': '捷克',
  Egypt: '埃及', Estonia: '爱沙尼亚', Finland: '芬兰', France: '法国', Germany: '德国', Ghana: '加纳',
  Hungary: '匈牙利', India: '印度', Indonesia: '印度尼西亚', Iran: '伊朗', Italy: '意大利', Japan: '日本',
  Kazakhstan: '哈萨克斯坦', Kenya: '肯尼亚', Kyrgyzstan: '吉尔吉斯斯坦', Lithuania: '立陶宛', Mexico: '墨西哥',
  Netherlands: '荷兰', Nigeria: '尼日利亚', Norway: '挪威', 'North Korea': '朝鲜', Pakistan: '巴基斯坦',
  Panama: '巴拿马', Philippines: '菲律宾', Poland: '波兰', 'Puerto Rico': '波多黎各', Romania: '罗马尼亚',
  Russia: '俄罗斯', 'Saudi Arabia': '沙特阿拉伯', Slovakia: '斯洛伐克', Slovenia: '斯洛文尼亚',
  'South Africa': '南非', 'South Korea': '韩国', Spain: '西班牙', 'Sri Lanka': '斯里兰卡', Sweden: '瑞典',
  Switzerland: '瑞士', Taiwan: '台湾', Thailand: '泰国', Türkiye: '土耳其', Uganda: '乌干达', Ukraine: '乌克兰',
  'United Arab Emirates': '阿联酋', 'United Kingdom': '英国', 'United States': '美国', Uzbekistan: '乌兹别克斯坦',
  Vietnam: '越南',
}

const plantName = (plant, locale) => locale === 'en' ? plant.nameEn || plant.name : plant.name
const countryName = (plant, locale) => locale === 'zh' ? COUNTRY_NAMES_ZH[plant.country] || plant.country : plant.country

function destination([lat, lng], bearing, distanceKm) {
  const distance = distanceKm / 6371
  const bearingRad = bearing * Math.PI / 180
  const latRad = lat * Math.PI / 180
  const lngRad = lng * Math.PI / 180
  const targetLat = Math.asin(Math.sin(latRad) * Math.cos(distance) + Math.cos(latRad) * Math.sin(distance) * Math.cos(bearingRad))
  const targetLng = lngRad + Math.atan2(Math.sin(bearingRad) * Math.sin(distance) * Math.cos(latRad), Math.cos(distance) - Math.sin(latRad) * Math.sin(targetLat))
  return [targetLat * 180 / Math.PI, ((targetLng * 180 / Math.PI + 540) % 360) - 180]
}

function plumeSector(center, radiusKm, direction, spreadDegrees) {
  const start = direction - spreadDegrees / 2
  return [center, ...Array.from({ length: 25 }, (_, index) => destination(center, start + spreadDegrees * index / 24, radiusKm))]
}

function wedgeGeometry(center, radiusKm, direction, spreadDegrees) {
  const points = plumeSector(center, radiusKm, direction, spreadDegrees)
  return { type: 'Polygon', coordinates: [[...points.map(([lat, lng]) => [lng, lat]), [center[1], center[0]]]] }
}

function circleGeometry(lng, lat, radiusKm) {
  return turfCircle([lng, lat], radiusKm, { units: 'kilometers', steps: 48 }).geometry
}

const toFeature = geometry => ({ type: 'Feature', properties: {}, geometry })

// Breaks text into lines that fit maxWidth, splitting on spaces where
// available (Latin scripts) and falling back to per-character breaks
// (CJK scripts, which carry no spaces) when a line has none.
function wrapCanvasText(ctx, text, maxWidth) {
  const units = text.includes(' ') ? text.split(' ') : [...text]
  const sep = text.includes(' ') ? ' ' : ''
  const lines = []
  let current = ''
  for (const unit of units) {
    const attempt = current ? current + sep + unit : unit
    if (current && ctx.measureText(attempt).width > maxWidth) {
      lines.push(current)
      current = unit
    } else {
      current = attempt
    }
  }
  if (current) lines.push(current)
  return lines
}

// Composes a shareable snapshot: the current map canvas, a dark caption bar
// with the scenario headline and a disclaimer that this is a simulation
// (baked into the pixels, not just the share text - the text metadata gets
// stripped the moment someone saves and reposts just the image), and a
// small scannable QR code linking back to the app. Runs on a detached
// canvas so the live map is never touched.
async function composeShareImage(mapCanvas, caption, url, disclaimer) {
  const canvas = document.createElement('canvas')
  canvas.width = mapCanvas.width
  canvas.height = mapCanvas.height
  const ctx = canvas.getContext('2d')
  ctx.drawImage(mapCanvas, 0, 0)

  const scale = canvas.width / 1200
  const qrSize = Math.round(90 * scale)
  const qrMargin = Math.round(24 * scale)
  const textWidth = canvas.width - qrSize - qrMargin * 3
  const disclaimerFontSize = Math.round(17 * scale)
  const disclaimerLineHeight = Math.round(disclaimerFontSize * 1.35)
  ctx.font = `${disclaimerFontSize}px system-ui, sans-serif`
  const disclaimerLines = wrapCanvasText(ctx, disclaimer, textWidth)
  const barHeight = Math.max(Math.round(96 * scale) + disclaimerLines.length * disclaimerLineHeight, qrSize + qrMargin * 2)
  const barTop = canvas.height - barHeight

  const gradient = ctx.createLinearGradient(0, barTop, 0, canvas.height)
  gradient.addColorStop(0, 'rgba(0,0,0,0)')
  gradient.addColorStop(1, 'rgba(0,0,0,0.88)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, barTop, canvas.width, barHeight)

  const qrX = canvas.width - qrSize - qrMargin
  const qrY = canvas.height - qrSize - qrMargin
  const qrCanvas = document.createElement('canvas')
  await QRCode.toCanvas(qrCanvas, url, { width: qrSize, margin: 1, color: { dark: '#0f172a', light: '#ffffff' } })
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(qrX - 6 * scale, qrY - 6 * scale, qrSize + 12 * scale, qrSize + 12 * scale)
  ctx.drawImage(qrCanvas, qrX, qrY)

  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#ffffff'
  ctx.font = `700 ${Math.round(30 * scale)}px system-ui, sans-serif`
  ctx.fillText(caption[0], qrMargin, barTop + Math.round(38 * scale), textWidth)
  ctx.font = `${Math.round(22 * scale)}px system-ui, sans-serif`
  ctx.fillStyle = '#d1d5db'
  ctx.fillText(caption[1], qrMargin, barTop + Math.round(72 * scale), textWidth)

  ctx.font = `${disclaimerFontSize}px system-ui, sans-serif`
  ctx.fillStyle = '#fbbf24'
  let disclaimerY = barTop + Math.round(96 * scale)
  for (const line of disclaimerLines) {
    ctx.fillText(line, qrMargin, disclaimerY, textWidth)
    disclaimerY += disclaimerLineHeight
  }

  return canvas
}

// Subsolar point (the point on Earth directly under the sun) via the
// standard low-precision solar-position formulas (NOAA/Meeus).
function subsolarPoint(date) {
  const rad = Math.PI / 180
  const julianDate = date.getTime() / 86400000 + 2440587.5
  const daysSinceJ2000 = julianDate - 2451545
  const meanLongitude = (280.460 + 0.9856474 * daysSinceJ2000) % 360
  const meanAnomaly = (357.528 + 0.9856003 * daysSinceJ2000) % 360
  const eclipticLongitude = meanLongitude + 1.915 * Math.sin(meanAnomaly * rad) + 0.02 * Math.sin(2 * meanAnomaly * rad)
  const obliquity = 23.439 - 0.0000004 * daysSinceJ2000
  const rightAscension = Math.atan2(Math.cos(obliquity * rad) * Math.sin(eclipticLongitude * rad), Math.cos(eclipticLongitude * rad)) / rad
  const declination = Math.asin(Math.sin(obliquity * rad) * Math.sin(eclipticLongitude * rad)) / rad
  const greenwichMeanSiderealTime = (280.46061837 + 360.98564736629 * daysSinceJ2000) % 360
  const lng = (((rightAscension - greenwichMeanSiderealTime) % 360) + 540) % 360 - 180
  return { lat: declination, lng }
}
// Real Lambertian sun lighting (brightness ~ cos of the angle from the
// subsolar point), rendered as genuine per-pixel raster tiles rather than
// approximated with polygons. A custom protocol renders each requested
// tile on a small canvas using standard Web Mercator tile math, exactly
// like any other raster basemap layer - so it tiles seamlessly (no polygon
// edges to show seams between) and follows the globe's curvature exactly
// like the CARTO tiles already do (no 4-corner-quad distortion).
// (Three earlier attempts each had real problems, all found by direct
// inspection rather than assumption. Overlapping semi-transparent circles
// relying on alpha compounding toward the center rendered inconsistently
// under globe projection, likely a depth-test/z-fighting interaction with
// coplanar 3D fills. A single terminator-shaped polygon closing through a
// pole is topologically a full great circle that MapLibre's 2D fill can't
// triangulate. Non-overlapping concentric ring polygons avoided both of
// those, and looked smooth near the terminator where the eye is looking
// for a gradient - but every ring boundary is still a real polygon edge,
// and it shows as a visible seam line on close inspection, particularly
// deep on the night side where many thin rings stack up looking like
// radar circles. A raster tile source doesn't have this: there's no
// polygon edge anywhere, just pixels.)
const LIGHT_TILE_SIZE = 64
const LIGHT_DAY_PEAK_ALPHA = 0.14
const LIGHT_NIGHT_PEAK_ALPHA = 0.5
let currentSubsolarPoint = subsolarPoint(new Date())
function renderLightingTile(z, x, y) {
  const rad = Math.PI / 180
  const n = 2 ** z
  const canvas = document.createElement('canvas')
  canvas.width = LIGHT_TILE_SIZE
  canvas.height = LIGHT_TILE_SIZE
  const ctx = canvas.getContext('2d')
  const image = ctx.createImageData(LIGHT_TILE_SIZE, LIGHT_TILE_SIZE)
  const sunLatRad = currentSubsolarPoint.lat * rad
  const sunLngRad = currentSubsolarPoint.lng * rad
  const sinSunLat = Math.sin(sunLatRad)
  const cosSunLat = Math.cos(sunLatRad)
  for (let py = 0; py < LIGHT_TILE_SIZE; py += 1) {
    const yMerc = (y + (py + 0.5) / LIGHT_TILE_SIZE) / n
    const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * yMerc)))
    const sinLat = Math.sin(latRad)
    const cosLat = Math.cos(latRad)
    for (let px = 0; px < LIGHT_TILE_SIZE; px += 1) {
      const xMerc = (x + (px + 0.5) / LIGHT_TILE_SIZE) / n
      const lngRad = (xMerc * 360 - 180) * rad
      const cosAngle = sinLat * sinSunLat + cosLat * cosSunLat * Math.cos(lngRad - sunLngRad)
      const i = (py * LIGHT_TILE_SIZE + px) * 4
      if (cosAngle >= 0) {
        image.data[i] = 255; image.data[i + 1] = 247; image.data[i + 2] = 214
        image.data[i + 3] = Math.round(255 * LIGHT_DAY_PEAK_ALPHA * cosAngle)
      } else {
        image.data[i] = 0; image.data[i + 1] = 0; image.data[i + 2] = 0
        image.data[i + 3] = Math.round(255 * LIGHT_NIGHT_PEAK_ALPHA * -cosAngle)
      }
    }
  }
  ctx.putImageData(image, 0, 0)
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
}
// Caches generated tiles by their full URL (which embeds the current
// minute, so it self-invalidates) - avoids regenerating a tile MapLibre
// re-requests after panning back over already-seen ground.
let lightingTileCache = {}
let lightingTileCacheCount = 0
addProtocol('lighting', async params => {
  const cached = lightingTileCache[params.url]
  if (cached) return { data: cached }
  const match = params.url.match(/^lighting:\/\/(\d+)\/(\d+)\/(\d+)/)
  const [, z, x, y] = match
  const blob = await renderLightingTile(Number(z), Number(x), Number(y))
  const data = await blob.arrayBuffer()
  if (lightingTileCacheCount > 300) { lightingTileCache = {}; lightingTileCacheCount = 0 }
  lightingTileCache[params.url] = data
  lightingTileCacheCount += 1
  return { data }
})

// Midpoint wind speed (m/s) for each Beaufort force 0-12.
const BEAUFORT_MS = [0, 0.8, 2.4, 4.4, 6.7, 9.4, 12.3, 15.5, 18.9, 22.6, 26.4, 30.5, 34]
const windSpeedMs = force => BEAUFORT_MS[Math.min(12, Math.max(0, Math.round(force)))]

// How far the plume's leading edge has plausibly advected: wind speed times
// release duration, capped at 72h since a real plume dilutes to background
// well before that regardless of how long the release continues. An ongoing
// release (duration 0) uses a fixed 12h precautionary window rather than
// growing without bound.
function transportFactor(windForce, duration) {
  const hours = duration === 0 ? 12 : Math.min(duration, 72)
  return 1 + (windSpeedMs(windForce) / 10) * Math.log1p(hours) * 0.25
}

function scenarioGeometry(plant, simulation) {
  const level = SCENARIO_LEVELS[simulation.level]
  const capacityFactor = Math.max(0.65, 0.65 + (plant.capacity || 1000) / 4000)
  const transport = transportFactor(simulation.windForce, simulation.duration)
  const spread = Math.max(30, 100 - simulation.windForce * 6)
  const rainfall = RAINFALL[simulation.rainfall]
  return { level, capacityFactor, transport, spread, rainfall }
}

function simulationArea(plant, simulation) {
  const { level, capacityFactor, transport, spread, rainfall } = scenarioGeometry(plant, simulation)
  const core = turfCircle([plant.lng, plant.lat], level.coreRadius * capacityFactor, { units: 'kilometers', steps: 48 })
  const outerZone = level.zones.at(-1)
  const sectorPoints = plumeSector([plant.lat, plant.lng], outerZone.radius * capacityFactor * transport * rainfall.distanceFactor, simulation.direction, spread)
  const sector = turfPolygon([[...sectorPoints.map(([lat, lng]) => [lng, lat]), [plant.lng, plant.lat]]])
  return union(featureCollection([core, sector])).geometry
}

const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))

async function requestPopulation(area) {
  const submitted = await fetch('https://api.worldpop.org/v2/population', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ geojson: area, year: 2026, resolution: '1km' }),
  })
  if (!submitted.ok) throw new Error(`Population request failed (${submitted.status})`)
  const { task_id: taskId } = await submitted.json()
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await pause(1000)
    const task = await fetch(`https://api.worldpop.org/v2/tasks/${taskId}`)
    if (!task.ok) throw new Error(`Population task failed (${task.status})`)
    const result = await task.json()
    if (result.status === 'success') return result.result
    if (result.status === 'failure') throw new Error(result.error || 'Population task failed')
  }
  throw new Error('Population request timed out')
}

function splitPopulationArea(area) {
  if (turfArea(area) / 1e6 <= 45000) return [area]
  const [west, south, east, north] = bbox(area)
  const areas = []
  for (let lng = Math.floor(west); lng < Math.ceil(east); lng += 1) {
    for (let lat = Math.floor(south); lat < Math.ceil(north); lat += 1) {
      const clipped = intersect(featureCollection([toFeature(area), bboxPolygon([lng, lat, Math.min(lng + 1, east), Math.min(lat + 1, north)])]))
      if (clipped) areas.push(clipped.geometry)
    }
  }
  return areas
}

async function getPopulation(area) {
  const parts = splitPopulationArea(area)
  const results = []
  for (let index = 0; index < parts.length; index += 3) {
    results.push(...await Promise.all(parts.slice(index, index + 3).map(requestPopulation)))
  }
  return {
    ...results[0],
    total_population: results.reduce((total, result) => total + result.total_population, 0),
  }
}

const MARKER_SIZE_RANGE = [8, 22]
const MARKER_SIZE_MAX_CAPACITY = 11000

// Area-proportional (sqrt) scale so marker size reads as "installed capacity"
// rather than "radius", which would visually overstate large plants.
function capacityMarkerSize(capacity) {
  const ratio = Math.sqrt(Math.min(Math.max(capacity, 0), MARKER_SIZE_MAX_CAPACITY) / MARKER_SIZE_MAX_CAPACITY)
  return MARKER_SIZE_RANGE[0] + (MARKER_SIZE_RANGE[1] - MARKER_SIZE_RANGE[0]) * ratio
}

function PlantMarker({ plant, selected, simulation, onClick, onDragEnd }) {
  const color = STATUS_COLOR[plant.status] || '#6b7280'
  const size = capacityMarkerSize(plant.capacity || 0) + (selected ? 5 : 0)
  const simulationZones = simulation && selected ? (() => {
    const { level, capacityFactor, transport, spread, rainfall } = scenarioGeometry(plant, simulation)
    return <>
      <Source id={`core-${plant.id}`} type="geojson" data={toFeature(circleGeometry(plant.lng, plant.lat, level.coreRadius * capacityFactor))}>
        <Layer id={`core-${plant.id}-fill`} type="fill" paint={{ 'fill-color': '#ef4444', 'fill-opacity': 0.18 }} />
        <Layer id={`core-${plant.id}-line`} type="line" paint={{ 'line-color': '#ef4444', 'line-width': 1.5 }} />
      </Source>
      {[...level.zones].reverse().map(zone => (
        <Source key={zone.key} id={`zone-${plant.id}-${zone.key}`} type="geojson" data={toFeature(wedgeGeometry([plant.lat, plant.lng], zone.radius * capacityFactor * transport * rainfall.distanceFactor, simulation.direction, spread))}>
          <Layer id={`zone-${plant.id}-${zone.key}-fill`} type="fill" paint={{ 'fill-color': zone.color, 'fill-opacity': rainfall.opacity }} />
          <Layer id={`zone-${plant.id}-${zone.key}-line`} type="line" paint={{ 'line-color': zone.color, 'line-width': 1.5 }} />
        </Source>
      ))}
    </>
  })() : null

  return <>
    <Marker
      longitude={plant.lng} latitude={plant.lat} draggable={plant.custom} anchor="center"
      onClick={event => { event.originalEvent.stopPropagation(); onClick(plant) }}
      onDragEnd={event => onDragEnd?.(plant.id, event.lngLat)}
    >
      <div style={{ width: size, height: size, borderRadius: '50%', background: color, border: '2px solid white', boxShadow: `0 0 ${selected ? 8 : 4}px ${selected ? color : 'rgba(0,0,0,0.5)'}`, cursor: 'pointer' }} />
    </Marker>
    {selected && !simulation && REFERENCE_ZONES.map(zone => (
      <Source key={zone.key} id={`ref-${plant.id}-${zone.key}`} type="geojson" data={toFeature(circleGeometry(plant.lng, plant.lat, zone.radiusKm))}>
        <Layer id={`ref-${plant.id}-${zone.key}-fill`} type="fill" paint={{ 'fill-color': zone.color, 'fill-opacity': 0.08 }} />
        <Layer id={`ref-${plant.id}-${zone.key}-line`} type="line" paint={{ 'line-color': zone.color, 'line-width': 1.5, 'line-dasharray': [3, 2] }} />
      </Source>
    ))}
    {simulationZones}
  </>
}

const fieldStyle = { width: '100%', padding: 7, borderRadius: 4, border: '1px solid #4b5563', background: '#1f2937', color: 'white' }
const panelStyle = { background: 'rgba(15,15,15,0.92)', color: 'white', padding: 16, borderRadius: 8, fontSize: 13, backdropFilter: 'blur(4px)', flexShrink: 0 }
const panelColumnStyle = { display: 'flex', flexDirection: 'column', gap: 16, maxHeight: 'calc(100vh - 32px)', overflowY: 'auto', pointerEvents: 'auto' }
// Both floating columns live in one flex-wrap row: side by side while there's
// room (desktop), wrapping to a vertical stack when there isn't (mobile) -
// no fixed breakpoint needed, it just responds to actual available width.
const topRowStyle = { position: 'absolute', top: 16, left: 16, right: 16, zIndex: 1000, display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, pointerEvents: 'none' }

export default function NuclearMap() {
  const [locale, setLocale] = useState(() => {
    const saved = typeof localStorage !== 'undefined' && localStorage.getItem('strikescope-locale')
    return saved === 'zh' || saved === 'en' ? saved : (typeof navigator !== 'undefined' && (navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en')
  })
  const [selectedPlant, setSelectedPlant] = useState(null)
  const [conditions, setConditions] = useState({ level: 'medium', direction: 90, windForce: 3, rainfall: 'none', duration: 4 })
  const [simulation, setSimulation] = useState(null)
  const [population, setPopulation] = useState({ status: 'idle', result: null })
  const [customPlants, setCustomPlants] = useState([])
  const [placingPlant, setPlacingPlant] = useState(false)
  const [newPlant, setNewPlant] = useState({ name: '', reactorType: 'PWR', capacity: 1000, status: 'operating' })
  const [searchQuery, setSearchQuery] = useState('')
  const [zoom, setZoom] = useState(2)
  const [hiddenStatuses, setHiddenStatuses] = useState(() => new Set())
  const [measuring, setMeasuring] = useState(false)
  const [measurePoints, setMeasurePoints] = useState([])
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches)
  const [now, setNow] = useState(() => new Date())
  const [mobileCreateOpen, setMobileCreateOpen] = useState(false)
  const [scenarioOpen, setScenarioOpen] = useState(false)
  const [shareStatus, setShareStatus] = useState('idle')
  const mapRef = useRef(null)
  const selectPlant = plant => {
    setSelectedPlant(previous => {
      const next = previous?.id === plant.id ? null : plant
      if (next) setScenarioOpen(true)
      return next
    })
    setSimulation(null)
    setPopulation({ status: 'idle', result: null })
  }
  const toggleStatus = key => {
    setHiddenStatuses(previous => {
      const next = new Set(previous)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
    setSelectedPlant(previous => previous?.status === key ? null : previous)
  }
  const update = (key, value) => setConditions(previous => ({ ...previous, [key]: value }))
  const updateNewPlant = (key, value) => setNewPlant(previous => ({ ...previous, [key]: value }))
  const copy = COPY[locale]
  useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en'
    localStorage.setItem('strikescope-locale', locale)
  }, [locale])
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(timer)
  }, [])
  useEffect(() => {
    const query = window.matchMedia('(max-width: 640px)')
    const handleChange = event => setIsMobile(event.matches)
    query.addEventListener('change', handleChange)
    return () => query.removeEventListener('change', handleChange)
  }, [])
  const customCopy = locale === 'zh'
    ? { title: '新建核电站', name: '名称', reactor: '堆型', capacity: '装机容量（MW）', status: '状态', place: '在地图上放置', placing: '请在地图任意位置点击放置', location: '自定义位置', remove: '删除此核电站' }
    : { title: 'Create nuclear plant', name: 'Name', reactor: 'Reactor type', capacity: 'Capacity (MW)', status: 'Status', place: 'Place on map', placing: 'Click anywhere on the map to place it', location: 'Custom location', remove: 'Delete this plant' }
  const runSimulation = (event) => {
    event.preventDefault()
    if (!selectedPlant) return
    const nextSimulation = { level: conditions.level, direction: Number(conditions.direction), windForce: Number(conditions.windForce), rainfall: conditions.rainfall, duration: Number(conditions.duration) }
    setSimulation(nextSimulation)
    setPopulation({ status: 'loading', result: null })
    getPopulation(simulationArea(selectedPlant, nextSimulation))
      .then(result => setPopulation({ status: 'success', result }))
      .catch(() => setPopulation({ status: 'error', result: null }))
  }
  const shareCaption = () => {
    const populationText = population.status === 'success' ? Math.round(population.result.total_population).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US') : copy.unknown
    const headline = locale === 'zh'
      ? `${plantName(selectedPlant, locale)} · ${copy.level[simulation.level]}事故场景推演`
      : `${plantName(selectedPlant, locale)} · ${copy.level[simulation.level]} accident scenario`
    const populationLine = locale === 'zh' ? `模拟区域估算人口：${populationText}` : `Estimated residents in simulation area: ${populationText}`
    return [headline, populationLine]
  }
  const buildShareText = () => {
    const [headline, populationLine] = shareCaption()
    return `${headline}\n${populationLine}\n${copy.disclaimer}`
  }
  const shareResult = async () => {
    if (!selectedPlant || !simulation) return
    const mapCanvas = mapRef.current?.getMap()?.getCanvas()
    const url = window.location.href
    const text = buildShareText()
    const composed = mapCanvas && await composeShareImage(mapCanvas, shareCaption(), url, copy.disclaimer).catch(() => null)
    const blob = composed && await new Promise(resolve => composed.toBlob(resolve, 'image/png'))
    try {
      if (blob) {
        const file = new File([blob], 'strikescope.png', { type: 'image/png' })
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: copy.title, text })
          return
        }
      }
      if (navigator.share) {
        await navigator.share({ title: copy.title, text, url })
        return
      }
    } catch (error) {
      if (error?.name === 'AbortError') return
    }
    if (blob && navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
        setShareStatus('imageCopied')
        setTimeout(() => setShareStatus('idle'), 4000)
        return
      } catch { /* fall through to download */ }
    }
    if (blob) {
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = 'strikescope-scenario.png'
      link.click()
      URL.revokeObjectURL(link.href)
      setShareStatus('downloaded')
      setTimeout(() => setShareStatus('idle'), 4000)
      return
    }
    await navigator.clipboard?.writeText(`${text}\n${url}`)
    setShareStatus('copied')
    setTimeout(() => setShareStatus('idle'), 4000)
  }
  const placePlant = ({ lat, lng }) => {
    const plant = { ...newPlant, id: `custom-${Date.now()}`, name: newPlant.name || customCopy.title, capacity: Number(newPlant.capacity) || 0, lat, lng, country: customCopy.location, custom: true }
    setCustomPlants(previous => [...previous, plant])
    setSelectedPlant(plant)
    setSimulation(null)
    setPopulation({ status: 'idle', result: null })
    setPlacingPlant(false)
    setMobileCreateOpen(false)
    setScenarioOpen(true)
  }
  const movePlant = (id, { lat, lng }) => {
    setCustomPlants(previous => previous.map(plant => plant.id === id ? { ...plant, lat, lng } : plant))
    setSelectedPlant(previous => previous?.id === id ? { ...previous, lat, lng } : previous)
    setSimulation(null)
  }
  const removePlant = id => {
    setCustomPlants(previous => previous.filter(plant => plant.id !== id))
    setSelectedPlant(null)
    setSimulation(null)
    setPopulation({ status: 'idle', result: null })
  }
  const addMeasurePoint = point => setMeasurePoints(previous => [...previous, point])
  const handleMapClick = event => {
    if (placingPlant) { placePlant(event.lngLat); return }
    if (measuring) addMeasurePoint(event.lngLat)
  }
  const handlePlantClick = plant => {
    if (measuring) { addMeasurePoint({ lng: plant.lng, lat: plant.lat }); return }
    selectPlant(plant)
  }
  const toggleMeasuring = () => {
    setMeasuring(previous => !previous)
    setMeasurePoints([])
    setPlacingPlant(false)
  }
  const visiblePlants = [...plants, ...customPlants].filter(plant => !hiddenStatuses.has(plant.status))
  const searchMatches = (() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return []
    return visiblePlants
      .filter(plant => plantName(plant, locale).toLowerCase().includes(query) || countryName(plant, locale).toLowerCase().includes(query))
      .slice(0, 8)
  })()
  const searchSelect = plant => {
    selectPlant(plant)
    mapRef.current?.flyTo({ center: [plant.lng, plant.lat], zoom: Math.max(mapRef.current.getZoom(), 6), duration: 1000 })
    setSearchQuery('')
  }
  const measureSegments = measurePoints.slice(1).map((point, index) => {
    const from = [measurePoints[index].lng, measurePoints[index].lat]
    const to = [point.lng, point.lat]
    return { key: index, distanceKm: turfDistance(from, to, { units: 'kilometers' }), midpoint: turfMidpoint(from, to).geometry.coordinates }
  })
  const measureTotalKm = measureSegments.reduce((total, segment) => total + segment.distanceKm, 0)
  // Updates the module-level subsolar point the tile protocol reads from -
  // done in an effect, not during render, since it's a side effect on
  // state outside the component. Changing the tile URLs (embedding the
  // current minute) makes react-map-gl call source.setTiles() so MapLibre
  // re-requests the visible tiles once that's updated.
  useEffect(() => {
    currentSubsolarPoint = subsolarPoint(now)
  }, [now])
  const lightingTiles = useMemo(() => [`lighting://{z}/{x}/{y}?t=${Math.floor(now.getTime() / 60000)}`], [now])
  const mobilePanelStyle = isMobile ? { ...panelStyle, width: '100%' } : panelStyle
  const mobileSheetStyle = { position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '70vh', overflowY: 'auto', padding: '12px 12px calc(12px + env(safe-area-inset-bottom))', background: 'rgba(15,15,15,0.75)', backdropFilter: 'blur(10px)', borderTop: '1px solid #374151', borderRadius: '16px 16px 0 0' }

  const scenarioForm = (
    <form onSubmit={runSimulation} className="ss-panel" style={mobilePanelStyle}>
      <div style={{ fontWeight: 700, fontSize: 15 }}>{copy.scenario}</div>
      <div style={{ color: selectedPlant ? '#9ca3af' : '#fbbf24', marginTop: 5, marginBottom: 12 }}>{selectedPlant ? `${plantName(selectedPlant, locale)}${copy.unitSeparator}${selectedPlant.capacity || copy.unknown} ${copy.mw}` : copy.selectHint}</div>
      <label style={{ display: 'block', marginBottom: 10 }}><span style={{ display: 'block', color: '#d1d5db', marginBottom: 4 }}>{copy.release}</span><select value={conditions.level} onChange={event => update('level', event.target.value)} style={fieldStyle}>{Object.keys(SCENARIO_LEVELS).map(key => <option key={key} value={key}>{copy.level[key]}</option>)}</select></label>
      <label style={{ display: 'block', marginBottom: 10 }}><span style={{ display: 'block', color: '#d1d5db', marginBottom: 4 }}>{copy.direction}: {conditions.direction}°</span><input type="range" min="0" max="359" value={conditions.direction} onChange={event => update('direction', event.target.value)} style={{ width: '100%' }} /><span style={{ color: '#9ca3af', fontSize: 11 }}>{copy.directionHint}</span></label>
      <label style={{ display: 'block', marginBottom: 10 }}><span style={{ display: 'block', color: '#d1d5db', marginBottom: 4 }}>{copy.wind}: {conditions.windForce}{copy.forceSuffix}</span><input type="range" min="0" max="12" step="1" value={conditions.windForce} onChange={event => update('windForce', event.target.value)} style={{ width: '100%' }} /><span style={{ color: '#9ca3af', fontSize: 11 }}>{copy.windHint}</span></label>
      <label style={{ display: 'block', marginBottom: 10 }}><span style={{ display: 'block', color: '#d1d5db', marginBottom: 4 }}>{copy.rainfall}</span><select value={conditions.rainfall} onChange={event => update('rainfall', event.target.value)} style={fieldStyle}>{Object.keys(RAINFALL).map(key => <option key={key} value={key}>{copy.rain[key]}</option>)}</select><span style={{ color: '#9ca3af', fontSize: 11 }}>{copy.rainHint}</span></label>
      <label style={{ display: 'block', marginBottom: 12 }}><span style={{ display: 'block', color: '#d1d5db', marginBottom: 4 }}>{copy.duration}</span><input type="number" min="0" step="1" value={conditions.duration} onChange={event => update('duration', event.target.value)} style={fieldStyle} /><span style={{ color: '#9ca3af', fontSize: 11 }}>{copy.ongoing}</span></label>
      <button type="submit" disabled={!selectedPlant} style={{ width: '100%', padding: '8px 10px', fontSize: 13, fontWeight: 600, background: selectedPlant ? '#dc2626' : '#4b5563', color: 'white', border: 'none', borderRadius: 4, cursor: selectedPlant ? 'pointer' : 'not-allowed' }}>{copy.trigger}</button>
      {simulation && <button type="button" onClick={() => { setSimulation(null); setPopulation({ status: 'idle', result: null }) }} style={{ width: '100%', padding: '7px 10px', marginTop: 8, fontSize: 12, background: '#374151', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>{copy.clear}</button>}
      {simulation && <button type="button" onClick={shareResult} style={{ width: '100%', padding: '7px 10px', marginTop: 8, fontSize: 12, background: '#0f766e', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>{copy.share}</button>}
      {shareStatus !== 'idle' && simulation && <div style={{ marginTop: 8, padding: '6px 8px', fontSize: 11, color: '#5eead4', background: 'rgba(15,118,110,0.15)', border: '1px solid #0f766e', borderRadius: 4 }}>
        {{ copied: copy.shareCopied, imageCopied: copy.shareImageCopied, downloaded: copy.shareDownloaded }[shareStatus]}{' · '}<a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(buildShareText())}&url=${encodeURIComponent(window.location.href)}`} target="_blank" rel="noopener noreferrer" style={{ color: '#5eead4' }}>{copy.shareX}</a>
      </div>}
      {population.status !== 'idle' && <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #374151' }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>{copy.populationTitle}</div>
        {population.status === 'loading' && <div style={{ color: '#fbbf24' }}>{copy.populationLoading}</div>}
        {population.status === 'success' && <div style={{ fontSize: 20, fontWeight: 700, color: '#f8fafc' }}>{Math.round(population.result.total_population).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US')}</div>}
        {population.status === 'error' && <div style={{ color: '#fca5a5' }}>{copy.populationError}</div>}
        <div style={{ color: '#9ca3af', fontSize: 11, lineHeight: 1.45, marginTop: 5 }}>{copy.populationNote}</div>
      </div>}
      <div style={{ color: '#9ca3af', fontSize: 11, lineHeight: 1.45, marginTop: 10 }}>{copy.disclaimer}</div>
    </form>
  )

  const createForm = (
    <form onSubmit={event => { event.preventDefault(); setPlacingPlant(true); setMeasuring(false); setMeasurePoints([]) }} className="ss-panel" style={mobilePanelStyle}>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>{customCopy.title}</div>
      <label style={{ display: 'block', marginBottom: 9 }}><span style={{ display: 'block', color: '#d1d5db', marginBottom: 4 }}>{customCopy.name}</span><input value={newPlant.name} onChange={event => updateNewPlant('name', event.target.value)} placeholder={customCopy.title} style={fieldStyle} /></label>
      <label style={{ display: 'block', marginBottom: 9 }}><span style={{ display: 'block', color: '#d1d5db', marginBottom: 4 }}>{customCopy.reactor}</span><select value={newPlant.reactorType} onChange={event => updateNewPlant('reactorType', event.target.value)} style={fieldStyle}><option>PWR</option><option>BWR</option><option>PHWR</option><option>HTGR</option><option>FBR</option><option>SMR</option></select></label>
      <label style={{ display: 'block', marginBottom: 9 }}><span style={{ display: 'block', color: '#d1d5db', marginBottom: 4 }}>{customCopy.capacity}</span><input type="number" min="1" value={newPlant.capacity} onChange={event => updateNewPlant('capacity', event.target.value)} style={fieldStyle} /></label>
      <label style={{ display: 'block', marginBottom: 12 }}><span style={{ display: 'block', color: '#d1d5db', marginBottom: 4 }}>{customCopy.status}</span><select value={newPlant.status} onChange={event => updateNewPlant('status', event.target.value)} style={fieldStyle}>{Object.keys(STATUS_COLOR).map(key => <option key={key} value={key}>{copy.status[key]}</option>)}</select></label>
      <button type="submit" style={{ width: '100%', padding: '8px 10px', fontSize: 13, fontWeight: 600, background: placingPlant ? '#f59e0b' : '#2563eb', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>{placingPlant ? customCopy.placing : customCopy.place}</button>
    </form>
  )

  return <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
    <style>{`
      .maplibregl-popup-content { background: rgba(15,15,15,0.96); color: white; border-radius: 8px; padding: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.5); }
      .maplibregl-popup-anchor-bottom .maplibregl-popup-tip { border-top-color: rgba(15,15,15,0.96); }
      .maplibregl-popup-anchor-top .maplibregl-popup-tip { border-bottom-color: rgba(15,15,15,0.96); }
      .maplibregl-popup-close-button { color: white; font-size: 16px; padding: 4px 8px; }
      .ss-panel { width: 270px; }
      .ss-control-column { width: 220px; }
      @media (max-width: 640px) {
        .ss-panel, .ss-control-column { width: min(260px, calc(100vw - 24px)); }
        .ss-title { display: none; }
        .ss-legend { max-width: calc(100vw - 24px); }
      }
    `}</style>
    <Map
      ref={mapRef}
      initialViewState={{ longitude: 10, latitude: 30, zoom: 2 }}
      minZoom={1.2}
      style={{ width: '100%', height: '100%' }}
      mapStyle={MAP_STYLE}
      canvasContextAttributes={{ preserveDrawingBuffer: true }}
      onClick={handleMapClick}
      onMove={event => setZoom(event.viewState.zoom)}
      cursor={placingPlant || measuring ? 'crosshair' : 'grab'}
    >
      <NavigationControl position="top-right" />
      <Source id="lighting" type="raster" tiles={lightingTiles} tileSize={LIGHT_TILE_SIZE} maxzoom={3}>
        <Layer id="lighting-raster" type="raster" paint={{ 'raster-opacity': 1 }} />
      </Source>
      {visiblePlants.map(plant => <PlantMarker key={plant.id} plant={plant} selected={selectedPlant?.id === plant.id} simulation={simulation} onClick={handlePlantClick} onDragEnd={movePlant} />)}
      {measurePoints.map((point, index) => (
        <Marker key={index} longitude={point.lng} latitude={point.lat} anchor="center">
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#facc15', border: '2px solid white', boxShadow: '0 0 4px rgba(0,0,0,0.6)' }} />
        </Marker>
      ))}
      {measurePoints.length >= 2 && <>
        <Source id="measure-line" type="geojson" data={{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: measurePoints.map(point => [point.lng, point.lat]) } }}>
          <Layer id="measure-line-layer" type="line" paint={{ 'line-color': '#facc15', 'line-width': 2, 'line-dasharray': [2, 2] }} />
        </Source>
        {measureSegments.map(segment => (
          <Marker key={segment.key} longitude={segment.midpoint[0]} latitude={segment.midpoint[1]} anchor="bottom" offset={[0, -8]}>
            <div style={{ background: 'rgba(15,15,15,0.9)', color: '#facc15', padding: '3px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', border: '1px solid #facc15' }}>
              {Math.round(segment.distanceKm).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US')} {copy.km}
            </div>
          </Marker>
        ))}
      </>}
      {selectedPlant && <Popup longitude={selectedPlant.lng} latitude={selectedPlant.lat} anchor="bottom" offset={14} closeOnClick={false} onClose={() => setSelectedPlant(null)}>
        <div style={{ minWidth: 180 }}>
          <strong>{plantName(selectedPlant, locale)}</strong>
          <div style={{ color: '#9ca3af', fontSize: 12, marginTop: 2 }}>{countryName(selectedPlant, locale)}</div>
          <div style={{ marginTop: 6, fontSize: 13 }}>{copy.reactor}: {selectedPlant.reactorType}<br />{copy.statusTitle}: <span style={{ color: STATUS_COLOR[selectedPlant.status] || '#6b7280' }}>{copy.status[selectedPlant.status]}</span><br />{selectedPlant.capacity > 0 && <>{copy.capacity}: {selectedPlant.capacity} {copy.mw}</>}{selectedPlant.unitCount > 0 && <><br />{copy.units}: {selectedPlant.unitCount}</>}{selectedPlant.startYear && <><br />{selectedPlant.status === 'operating' ? copy.commissioned : copy.plannedStart}: {selectedPlant.startYear}</>}{selectedPlant.operator && <><br />{copy.operator}: {selectedPlant.operator}</>}</div>
          {selectedPlant.custom && <button type="button" onClick={() => removePlant(selectedPlant.id)} style={{ marginTop: 8, padding: '4px 10px', fontSize: 12, background: '#7f1d1d', color: 'white', border: '1px solid #ef4444', borderRadius: 4, cursor: 'pointer', width: '100%' }}>{customCopy.remove}</button>}
        </div>
      </Popup>}
    </Map>
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', mixBlendMode: 'overlay', opacity: Math.max(0, Math.min(1, (6 - zoom) / 3)), background: 'radial-gradient(ellipse 55% 55% at 46% 44%, rgba(255,244,214,0.95) 0%, rgba(255,244,214,0.4) 30%, rgba(255,244,214,0) 55%)' }} />

    <div className="ss-legend" style={{ position: 'absolute', bottom: 'calc(30px + env(safe-area-inset-bottom))', left: 16, zIndex: 1000, background: 'rgba(15,15,15,0.85)', color: 'white', padding: '12px 16px', borderRadius: 8, fontSize: 12, backdropFilter: 'blur(4px)' }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>{copy.statusTitle}</div>
      {Object.entries(STATUS_COLOR).map(([key, color]) => <button key={key} type="button" onClick={() => toggleStatus(key)} title={copy.statusFilterHint} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, width: '100%', background: 'transparent', border: 'none', padding: 0, color: 'white', font: 'inherit', textAlign: 'left', cursor: 'pointer', opacity: hiddenStatuses.has(key) ? 0.4 : 1 }}><div style={{ width: 10, height: 10, borderRadius: '50%', background: color }} /><span style={{ textDecoration: hiddenStatuses.has(key) ? 'line-through' : 'none' }}>{copy.status[key]}</span></button>)}
      {selectedPlant && !simulation && <><div style={{ fontWeight: 600, margin: '12px 0 8px' }}>{copy.planning}</div>{REFERENCE_ZONES.map(zone => <div key={zone.key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}><div style={{ width: 20, height: 2, background: zone.color }} /><span>{copy.reference[zone.key]}</span></div>)}</>}
      {simulation && <><div style={{ fontWeight: 600, margin: '12px 0 8px' }}>{copy.simulation}</div><div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}><div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444' }} /><span>{copy.core}</span></div>{SCENARIO_LEVELS[simulation.level].zones.map(zone => <div key={zone.key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}><div style={{ width: 20, height: 2, background: zone.color }} /><span>{copy.zone[zone.key]}{copy.downwind}</span></div>)}</>}
      <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid #374151', color: '#9ca3af', fontSize: 10, lineHeight: 1.4 }}>{copy.dataSource}</div>
    </div>

    <div className="ss-title" style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 1000, color: 'white', fontSize: 18, fontWeight: 700, textShadow: '0 1px 4px rgba(0,0,0,0.8)', letterSpacing: 2, pointerEvents: 'none' }}>{copy.title}</div>
    <div style={topRowStyle}>
      <div className="ss-control-column" style={{ display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'auto' }}>
        <div style={{ display: 'flex', overflow: 'hidden', border: '1px solid #6b7280', borderRadius: 6, background: 'rgba(15,15,15,0.88)', boxShadow: '0 1px 4px rgba(0,0,0,0.45)' }} aria-label="Language selector">
          {[['zh', '中文'], ['en', 'English']].map(([value, label]) => <button key={value} type="button" onClick={() => setLocale(value)} aria-pressed={locale === value} style={{ padding: '7px 10px', border: 'none', background: locale === value ? '#2563eb' : 'transparent', color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: locale === value ? 700 : 400 }}>{label}</button>)}
        </div>
        <div style={{ position: 'relative' }}>
          <input
            value={searchQuery}
            onChange={event => setSearchQuery(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter' && searchMatches.length > 0) searchSelect(searchMatches[0]) }}
            placeholder={copy.searchPlaceholder}
            aria-label={copy.searchPlaceholder}
            style={{ ...fieldStyle, background: 'rgba(15,15,15,0.88)', boxShadow: '0 1px 4px rgba(0,0,0,0.45)' }}
          />
          {searchMatches.length > 0 && <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: 'rgba(15,15,15,0.95)', border: '1px solid #4b5563', borderRadius: 6, maxHeight: 260, overflowY: 'auto' }}>
            {searchMatches.map(plant => <button key={plant.id} type="button" onClick={() => searchSelect(plant)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', background: 'transparent', border: 'none', borderBottom: '1px solid #27303f', color: 'white', cursor: 'pointer' }}>
              <div style={{ fontSize: 12 }}>{plantName(plant, locale)}</div>
              <div style={{ color: '#9ca3af', fontSize: 11 }}>{countryName(plant, locale)}</div>
            </button>)}
          </div>}
        </div>
        <button
          type="button"
          onClick={toggleMeasuring}
          style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #6b7280', background: measuring ? '#f59e0b' : 'rgba(15,15,15,0.88)', color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: measuring ? 700 : 400, boxShadow: '0 1px 4px rgba(0,0,0,0.45)' }}
        >{measuring ? copy.measureClear : copy.measure}</button>
        {measuring && <div style={{ color: '#d1d5db', fontSize: 11, background: 'rgba(15,15,15,0.85)', padding: '6px 8px', borderRadius: 6 }}>
          {measureSegments.length > 0
            ? <><span style={{ color: '#facc15', fontWeight: 700 }}>{copy.measureTotal}: {Math.round(measureTotalKm).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US')} {copy.km}</span>{' · '}<button type="button" onClick={() => setMeasurePoints([])} style={{ background: 'none', border: 'none', padding: 0, color: '#93c5fd', textDecoration: 'underline', cursor: 'pointer', font: 'inherit' }}>{copy.measureReset}</button></>
            : copy.measureHint}
        </div>}
      </div>

      {!isMobile && <div style={panelColumnStyle}>{scenarioForm}{createForm}</div>}
    </div>

    {isMobile && (scenarioOpen || mobileCreateOpen) && <div style={mobileSheetStyle}>
      <button
        type="button"
        onClick={() => { setScenarioOpen(false); setMobileCreateOpen(false) }}
        aria-label={copy.close}
        style={{ alignSelf: 'flex-end', width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', color: 'white', border: 'none', fontSize: 16, cursor: 'pointer' }}
      >×</button>
      {scenarioOpen && scenarioForm}
      {mobileCreateOpen && createForm}
    </div>}
    {isMobile && <button
      type="button"
      onClick={() => setScenarioOpen(previous => !previous)}
      aria-label={copy.scenario}
      style={{ position: 'fixed', bottom: 76, right: 16, zIndex: 1001, width: 48, height: 48, borderRadius: '50%', background: scenarioOpen ? '#7f1d1d' : '#dc2626', color: 'white', border: 'none', fontSize: 20, lineHeight: '48px', textAlign: 'center', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.5)' }}
    >☢</button>}
    {isMobile && <button
      type="button"
      onClick={() => setMobileCreateOpen(previous => !previous)}
      aria-label={customCopy.title}
      style={{ position: 'fixed', bottom: 16, right: 16, zIndex: 1001, width: 48, height: 48, borderRadius: '50%', background: mobileCreateOpen ? '#7f1d1d' : '#2563eb', color: 'white', border: 'none', fontSize: 24, lineHeight: '48px', textAlign: 'center', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.5)' }}
    >{mobileCreateOpen ? '×' : '+'}</button>}
  </div>
}
