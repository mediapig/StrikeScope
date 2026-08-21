import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Circle, Polygon, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { area as turfArea, bbox, bboxPolygon, circle as turfCircle, featureCollection, intersect, polygon as turfPolygon, union } from '@turf/turf'
import 'leaflet/dist/leaflet.css'
import plants from '../data/plants.json'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const STATUS_COLOR = { operating: '#22c55e', decommissioned: '#6b7280', construction: '#f59e0b' }
const REFERENCE_ZONES = [
  { radius: 16000, color: '#f97316', key: 'plume' },
  { radius: 80000, color: '#eab308', key: 'ingestion' },
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
    title: '☢ StrikeScope — 全球核电站场景推演', statusTitle: '核电站状态', reactor: '堆型', capacity: '装机容量', selectPlant: '选择电站', planning: '规划参考区', simulation: '模拟范围', core: '全向近场警戒', downwind: '（顺风）', scenario: '事故场景推演', selectHint: '请先点击地图上的核电站', release: '放射性释放规模', direction: '扩散方向', wind: '风力', rainfall: '降雨强度', duration: '释放持续时间（小时）', trigger: '触发模拟', clear: '清除模拟', ongoing: '输入 0 代表持续释放；远场仅表示稀释后的参考影响。', rainHint: '降雨越强，模拟越偏向近场湿沉降。', windHint: '0级无风 · 3级微风 · 6级强风 · 9级烈风 · 12级飓风', directionHint: '0° 北 · 90° 东 · 180° 南 · 270° 西', populationTitle: '模拟区域估算人口', populationLoading: '正在计算人口…', populationError: '暂时无法取得人口估算', populationNote: '基于 WorldPop 人口栅格；为模拟区域内常住人口估算，不代表实际暴露或撤离人数。', disclaimer: '仅为可视化推演：结合装机容量、释放时间与风向生成示意羽流；不是剂量预测或应急指令。', status: { operating: '运营中', decommissioned: '已关闭', construction: '建设中' }, reference: { plume: '羽流应急规划参考区 (16km)', ingestion: '摄入途径规划参考区 (80km)' }, level: { low: '小规模释放', medium: '中等规模释放', high: '大规模释放' }, zone: { plume: '羽流防护参考', monitoring: '监测参考' }, rain: { none: '无雨', light: '小雨', moderate: '中雨', heavy: '大雨' }, unknown: '未知', north: '北', east: '东', south: '南', west: '西', mw: 'MW', forceSuffix: '级', unitSeparator: ' · ', searchPlaceholder: '搜索电站或国家…', dataSource: '数据来源：Global Energy Monitor 全球核电追踪（Global Nuclear Power Tracker）', units: '机组数', commissioned: '投产年份', plannedStart: '计划投产', operator: '运营商',
  },
  en: {
    title: '☢ StrikeScope — Nuclear Scenario Explorer', statusTitle: 'Plant status', reactor: 'Reactor type', capacity: 'Installed capacity', selectPlant: 'Select plant', planning: 'Planning references', simulation: 'Simulation zones', core: 'All-direction near-field alert', downwind: ' (downwind)', scenario: 'Accident scenario', selectHint: 'Select a nuclear plant on the map first', release: 'Radioactive release scale', direction: 'Plume direction', wind: 'Wind force', rainfall: 'Rainfall', duration: 'Release duration (hours)', trigger: 'Run simulation', clear: 'Clear simulation', ongoing: 'Enter 0 for an ongoing release; the far field is a diluted reference only.', rainHint: 'Stronger rain shifts this illustration toward near-field wet deposition.', windHint: '0 calm · 3 gentle breeze · 6 strong breeze · 9 strong gale · 12 hurricane', directionHint: '0° N · 90° E · 180° S · 270° W', populationTitle: 'Estimated residents in simulation area', populationLoading: 'Calculating population…', populationError: 'Population estimate is currently unavailable', populationNote: 'Based on WorldPop population grids; this estimates resident population in the simulated area, not actual exposure or evacuation.', disclaimer: 'Visualization only: this illustrative plume uses capacity, duration, and wind. It is not a dose forecast or emergency instruction.', status: { operating: 'Operating', decommissioned: 'Closed', construction: 'Under construction' }, reference: { plume: 'Plume planning reference (16 km)', ingestion: 'Ingestion planning reference (80 km)' }, level: { low: 'Small release', medium: 'Moderate release', high: 'Large release' }, zone: { plume: 'Plume protection reference', monitoring: 'Monitoring reference' }, rain: { none: 'No rain', light: 'Light rain', moderate: 'Moderate rain', heavy: 'Heavy rain' }, unknown: 'Unknown', north: 'N', east: 'E', south: 'S', west: 'W', mw: 'MW', forceSuffix: '', unitSeparator: ' · ', searchPlaceholder: 'Search plant or country…', dataSource: 'Data: Global Energy Monitor Global Nuclear Power Tracker', units: 'Units', commissioned: 'Commissioned', plannedStart: 'Planned start', operator: 'Operator',
  },
}

const COUNTRY_NAMES_ZH = {
  Argentina: '阿根廷', Armenia: '亚美尼亚', Bangladesh: '孟加拉国', Belarus: '白俄罗斯', Belgium: '比利时',
  Brazil: '巴西', Bulgaria: '保加利亚', Canada: '加拿大', China: '中国', 'Czech Republic': '捷克',
  Egypt: '埃及', Finland: '芬兰', France: '法国', Germany: '德国', Hungary: '匈牙利', India: '印度',
  Iran: '伊朗', Italy: '意大利', Japan: '日本', Kazakhstan: '哈萨克斯坦', Lithuania: '立陶宛', Mexico: '墨西哥',
  Netherlands: '荷兰', 'North Korea': '朝鲜', Pakistan: '巴基斯坦', Panama: '巴拿马', Philippines: '菲律宾',
  Poland: '波兰', 'Puerto Rico': '波多黎各', Romania: '罗马尼亚', Russia: '俄罗斯', Slovakia: '斯洛伐克',
  Slovenia: '斯洛文尼亚', 'South Africa': '南非', 'South Korea': '韩国', Spain: '西班牙', Sweden: '瑞典',
  Switzerland: '瑞士', Taiwan: '台湾', Türkiye: '土耳其', Ukraine: '乌克兰', 'United Arab Emirates': '阿联酋',
  'United Kingdom': '英国', 'United States': '美国', Uzbekistan: '乌兹别克斯坦',
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

function simulationArea(plant, simulation) {
  const level = SCENARIO_LEVELS[simulation.level]
  const capacityFactor = Math.max(0.65, 0.65 + (plant.capacity || 1000) / 4000)
  const durationFactor = simulation.duration === 0 ? 2.2 : 1 + Math.log1p(simulation.duration) * 0.16
  const spread = Math.max(30, 100 - simulation.windForce * 6)
  const rainfall = RAINFALL[simulation.rainfall]
  const core = turfCircle([plant.lng, plant.lat], level.coreRadius * capacityFactor, { units: 'kilometers', steps: 48 })
  const outerZone = level.zones.at(-1)
  const sectorPoints = plumeSector([plant.lat, plant.lng], outerZone.radius * capacityFactor * durationFactor * rainfall.distanceFactor, simulation.direction, spread)
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
      const clipped = intersect(featureCollection([area, bboxPolygon([lng, lat, Math.min(lng + 1, east), Math.min(lat + 1, north)])]))
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

function PlacementHandler({ active, onPlace }) {
  useMapEvents({ click: event => { if (active) onPlace(event.latlng) } })
  return null
}

function MapController({ onReady }) {
  const map = useMap()
  useEffect(() => { onReady(map) }, [map, onReady])
  return null
}

function PlantMarker({ plant, selected, simulation, copy, locale, onClick, onMove }) {
  const color = STATUS_COLOR[plant.status] || '#6b7280'
  const icon = L.divIcon({
    className: '',
    html: `<div style="width:${selected ? 16 : 12}px;height:${selected ? 16 : 12}px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 0 ${selected ? 8 : 4}px ${selected ? color : 'rgba(0,0,0,0.5)'};cursor:pointer"></div>`,
    iconSize: selected ? [16, 16] : [12, 12], iconAnchor: selected ? [8, 8] : [6, 6],
  })
  const simulationZones = simulation && selected ? (() => {
    const level = SCENARIO_LEVELS[simulation.level]
    // Electrical capacity is only a visual proxy for potential inventory, but
    // keep the scale distinct enough for different-sized stations to compare.
    const capacityFactor = Math.max(0.65, 0.65 + (plant.capacity || 1000) / 4000)
    // 0 represents an ongoing release. Its finite visual extent is a diluted
    // far-field reference, not a claim that the plume stops at that boundary.
    const durationFactor = simulation.duration === 0 ? 2.2 : 1 + Math.log1p(simulation.duration) * 0.16
    const spread = Math.max(30, 100 - simulation.windForce * 6)
    const rainfall = RAINFALL[simulation.rainfall]
    return <>
      <Circle center={[plant.lat, plant.lng]} radius={level.coreRadius * capacityFactor * 1000} pathOptions={{ color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.18, weight: 1.5 }} />
      {[...level.zones].reverse().map(zone => <Polygon key={zone.key} positions={plumeSector([plant.lat, plant.lng], zone.radius * capacityFactor * durationFactor * rainfall.distanceFactor, simulation.direction, spread)} pathOptions={{ color: zone.color, fillColor: zone.color, fillOpacity: rainfall.opacity, weight: 1.5 }} />)}
    </>
  })() : null

  return <>
    <Marker position={[plant.lat, plant.lng]} icon={icon} draggable={plant.custom} eventHandlers={{ click: () => onClick(plant), dragend: event => onMove?.(plant.id, event.target.getLatLng()) }}>
      <Popup>
        <div style={{ minWidth: 180 }}>
          <strong>{plantName(plant, locale)}</strong>
          <div style={{ color: '#6b7280', fontSize: 12, marginTop: 2 }}>{countryName(plant, locale)}</div>
          <div style={{ marginTop: 6, fontSize: 13 }}>{copy.reactor}: {plant.reactorType}<br />{copy.statusTitle}: <span style={{ color }}>{copy.status[plant.status]}</span><br />{plant.capacity > 0 && <>{copy.capacity}: {plant.capacity} {copy.mw}</>}{plant.unitCount > 0 && <><br />{copy.units}: {plant.unitCount}</>}{plant.startYear && <><br />{plant.status === 'operating' ? copy.commissioned : copy.plannedStart}: {plant.startYear}</>}{plant.operator && <><br />{copy.operator}: {plant.operator}</>}</div>
          <button onClick={() => onClick(plant)} style={{ marginTop: 8, padding: '4px 10px', fontSize: 12, background: '#ef4444', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', width: '100%' }}>{copy.selectPlant}</button>
        </div>
      </Popup>
    </Marker>
    {selected && !simulation && REFERENCE_ZONES.map(zone => <Circle key={zone.radius} center={[plant.lat, plant.lng]} radius={zone.radius} pathOptions={{ color: zone.color, fillColor: zone.color, fillOpacity: 0.08, weight: 1.5, dashArray: '6,4' }} />)}
    {simulationZones}
  </>
}

const fieldStyle = { width: '100%', padding: 7, borderRadius: 4, border: '1px solid #4b5563', background: '#1f2937', color: 'white' }
const panelStyle = { position: 'absolute', top: 16, right: 16, zIndex: 1000, background: 'rgba(15,15,15,0.92)', color: 'white', padding: 16, borderRadius: 8, fontSize: 13, backdropFilter: 'blur(4px)', width: 270 }

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
  const [map, setMap] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const selectPlant = plant => { setSelectedPlant(previous => previous?.id === plant.id ? null : plant); setSimulation(null); setPopulation({ status: 'idle', result: null }) }
  const update = (key, value) => setConditions(previous => ({ ...previous, [key]: value }))
  const updateNewPlant = (key, value) => setNewPlant(previous => ({ ...previous, [key]: value }))
  const copy = COPY[locale]
  useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en'
    localStorage.setItem('strikescope-locale', locale)
  }, [locale])
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
  const placePlant = ({ lat, lng }) => {
    const plant = { ...newPlant, id: `custom-${Date.now()}`, name: newPlant.name || customCopy.title, capacity: Number(newPlant.capacity) || 0, lat, lng, country: customCopy.location, custom: true }
    setCustomPlants(previous => [...previous, plant])
    setSelectedPlant(plant)
    setSimulation(null)
    setPopulation({ status: 'idle', result: null })
    setPlacingPlant(false)
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
  const searchMatches = (() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return []
    return [...plants, ...customPlants]
      .filter(plant => plantName(plant, locale).toLowerCase().includes(query) || countryName(plant, locale).toLowerCase().includes(query))
      .slice(0, 8)
  })()
  const searchSelect = plant => {
    selectPlant(plant)
    if (map) map.flyTo([plant.lat, plant.lng], Math.max(map.getZoom(), 6), { duration: 1 })
    setSearchQuery('')
  }

  return <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
    <MapContainer center={[30, 10]} zoom={3} minZoom={2} style={{ width: '100%', height: '100%' }} zoomControl>
      <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>' noWrap />
      <PlacementHandler active={placingPlant} onPlace={placePlant} />
      <MapController onReady={setMap} />
      {[...plants, ...customPlants].map(plant => <PlantMarker key={plant.id} plant={plant} selected={selectedPlant?.id === plant.id} simulation={simulation} copy={copy} locale={locale} onClick={selectPlant} onMove={movePlant} />)}
    </MapContainer>

    <div style={{ position: 'absolute', bottom: 30, left: 16, zIndex: 1000, background: 'rgba(15,15,15,0.85)', color: 'white', padding: '12px 16px', borderRadius: 8, fontSize: 12, backdropFilter: 'blur(4px)' }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>{copy.statusTitle}</div>
      {Object.entries(STATUS_COLOR).map(([key, color]) => <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}><div style={{ width: 10, height: 10, borderRadius: '50%', background: color }} /><span>{copy.status[key]}</span></div>)}
      {selectedPlant && !simulation && <><div style={{ fontWeight: 600, margin: '12px 0 8px' }}>{copy.planning}</div>{REFERENCE_ZONES.map(zone => <div key={zone.radius} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}><div style={{ width: 20, height: 2, background: zone.color }} /><span>{copy.reference[zone.key]}</span></div>)}</>}
      {simulation && <><div style={{ fontWeight: 600, margin: '12px 0 8px' }}>{copy.simulation}</div><div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}><div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444' }} /><span>{copy.core}</span></div>{SCENARIO_LEVELS[simulation.level].zones.map(zone => <div key={zone.key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}><div style={{ width: 20, height: 2, background: zone.color }} /><span>{copy.zone[zone.key]}{copy.downwind}</span></div>)}</>}
      <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid #374151', color: '#9ca3af', fontSize: 10, lineHeight: 1.4 }}>{copy.dataSource}</div>
    </div>

    <form onSubmit={runSimulation} style={panelStyle}>
      <div style={{ fontWeight: 700, fontSize: 15 }}>{copy.scenario}</div>
      <div style={{ color: selectedPlant ? '#9ca3af' : '#fbbf24', marginTop: 5, marginBottom: 12 }}>{selectedPlant ? `${plantName(selectedPlant, locale)}${copy.unitSeparator}${selectedPlant.capacity || copy.unknown} ${copy.mw}` : copy.selectHint}</div>
      <label style={{ display: 'block', marginBottom: 10 }}><span style={{ display: 'block', color: '#d1d5db', marginBottom: 4 }}>{copy.release}</span><select value={conditions.level} onChange={event => update('level', event.target.value)} style={fieldStyle}>{Object.keys(SCENARIO_LEVELS).map(key => <option key={key} value={key}>{copy.level[key]}</option>)}</select></label>
      <label style={{ display: 'block', marginBottom: 10 }}><span style={{ display: 'block', color: '#d1d5db', marginBottom: 4 }}>{copy.direction}: {conditions.direction}°</span><input type="range" min="0" max="359" value={conditions.direction} onChange={event => update('direction', event.target.value)} style={{ width: '100%' }} /><span style={{ color: '#9ca3af', fontSize: 11 }}>{copy.directionHint}</span></label>
      <label style={{ display: 'block', marginBottom: 10 }}><span style={{ display: 'block', color: '#d1d5db', marginBottom: 4 }}>{copy.wind}: {conditions.windForce}{copy.forceSuffix}</span><input type="range" min="0" max="12" step="1" value={conditions.windForce} onChange={event => update('windForce', event.target.value)} style={{ width: '100%' }} /><span style={{ color: '#9ca3af', fontSize: 11 }}>{copy.windHint}</span></label>
      <label style={{ display: 'block', marginBottom: 10 }}><span style={{ display: 'block', color: '#d1d5db', marginBottom: 4 }}>{copy.rainfall}</span><select value={conditions.rainfall} onChange={event => update('rainfall', event.target.value)} style={fieldStyle}>{Object.keys(RAINFALL).map(key => <option key={key} value={key}>{copy.rain[key]}</option>)}</select><span style={{ color: '#9ca3af', fontSize: 11 }}>{copy.rainHint}</span></label>
      <label style={{ display: 'block', marginBottom: 12 }}><span style={{ display: 'block', color: '#d1d5db', marginBottom: 4 }}>{copy.duration}</span><input type="number" min="0" step="1" value={conditions.duration} onChange={event => update('duration', event.target.value)} style={fieldStyle} /><span style={{ color: '#9ca3af', fontSize: 11 }}>{copy.ongoing}</span></label>
      <button type="submit" disabled={!selectedPlant} style={{ width: '100%', padding: '8px 10px', fontSize: 13, fontWeight: 600, background: selectedPlant ? '#dc2626' : '#4b5563', color: 'white', border: 'none', borderRadius: 4, cursor: selectedPlant ? 'pointer' : 'not-allowed' }}>{copy.trigger}</button>
      {simulation && <button type="button" onClick={() => { setSimulation(null); setPopulation({ status: 'idle', result: null }) }} style={{ width: '100%', padding: '7px 10px', marginTop: 8, fontSize: 12, background: '#374151', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>{copy.clear}</button>}
      {selectedPlant?.custom && <button type="button" onClick={() => removePlant(selectedPlant.id)} style={{ width: '100%', padding: '7px 10px', marginTop: 8, fontSize: 12, background: '#7f1d1d', color: 'white', border: '1px solid #ef4444', borderRadius: 4, cursor: 'pointer' }}>{customCopy.remove}</button>}
      {population.status !== 'idle' && <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #374151' }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>{copy.populationTitle}</div>
        {population.status === 'loading' && <div style={{ color: '#fbbf24' }}>{copy.populationLoading}</div>}
        {population.status === 'success' && <div style={{ fontSize: 20, fontWeight: 700, color: '#f8fafc' }}>{Math.round(population.result.total_population).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US')}</div>}
        {population.status === 'error' && <div style={{ color: '#fca5a5' }}>{copy.populationError}</div>}
        <div style={{ color: '#9ca3af', fontSize: 11, lineHeight: 1.45, marginTop: 5 }}>{copy.populationNote}</div>
      </div>}
      <div style={{ color: '#9ca3af', fontSize: 11, lineHeight: 1.45, marginTop: 10 }}>{copy.disclaimer}</div>
    </form>

    <form onSubmit={event => { event.preventDefault(); setPlacingPlant(true) }} style={{ ...panelStyle, top: 600 }}>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>{customCopy.title}</div>
      <label style={{ display: 'block', marginBottom: 9 }}><span style={{ display: 'block', color: '#d1d5db', marginBottom: 4 }}>{customCopy.name}</span><input value={newPlant.name} onChange={event => updateNewPlant('name', event.target.value)} placeholder={customCopy.title} style={fieldStyle} /></label>
      <label style={{ display: 'block', marginBottom: 9 }}><span style={{ display: 'block', color: '#d1d5db', marginBottom: 4 }}>{customCopy.reactor}</span><select value={newPlant.reactorType} onChange={event => updateNewPlant('reactorType', event.target.value)} style={fieldStyle}><option>PWR</option><option>BWR</option><option>PHWR</option><option>HTGR</option><option>FBR</option><option>SMR</option></select></label>
      <label style={{ display: 'block', marginBottom: 9 }}><span style={{ display: 'block', color: '#d1d5db', marginBottom: 4 }}>{customCopy.capacity}</span><input type="number" min="1" value={newPlant.capacity} onChange={event => updateNewPlant('capacity', event.target.value)} style={fieldStyle} /></label>
      <label style={{ display: 'block', marginBottom: 12 }}><span style={{ display: 'block', color: '#d1d5db', marginBottom: 4 }}>{customCopy.status}</span><select value={newPlant.status} onChange={event => updateNewPlant('status', event.target.value)} style={fieldStyle}>{Object.keys(STATUS_COLOR).map(key => <option key={key} value={key}>{copy.status[key]}</option>)}</select></label>
      <button type="submit" style={{ width: '100%', padding: '8px 10px', fontSize: 13, fontWeight: 600, background: placingPlant ? '#f59e0b' : '#2563eb', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>{placingPlant ? customCopy.placing : customCopy.place}</button>
    </form>

    <div style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 1000, color: 'white', fontSize: 18, fontWeight: 700, textShadow: '0 1px 4px rgba(0,0,0,0.8)', letterSpacing: 2, pointerEvents: 'none' }}>{copy.title}</div>
    <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 8, width: 220 }}>
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
    </div>
  </div>
}
