import { useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import plants from '../data/plants.json'

// Fix default marker icon issue with Vite
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const STATUS_COLOR = {
  operating: '#22c55e',
  decommissioned: '#6b7280',
  construction: '#f59e0b',
}

const IMPACT_ZONES = [
  { radius: 5000,   color: '#ef4444', label: '立即危险区 (5km)' },
  { radius: 30000,  color: '#f97316', label: '紧急疏散区 (30km)' },
  { radius: 80000,  color: '#eab308', label: '预防行动区 (80km)' },
  { radius: 300000, color: '#3b82f6', label: '放射性沉降区 (300km)' },
]

function PlantMarker({ plant, selected, onClick }) {
  const color = STATUS_COLOR[plant.status] || '#6b7280'

  const icon = L.divIcon({
    className: '',
    html: `<div style="
      width:12px;height:12px;
      border-radius:50%;
      background:${color};
      border:2px solid white;
      box-shadow:0 0 4px rgba(0,0,0,0.5);
      cursor:pointer;
      ${selected ? 'width:16px;height:16px;box-shadow:0 0 8px ' + color : ''}
    "></div>`,
    iconSize: selected ? [16, 16] : [12, 12],
    iconAnchor: selected ? [8, 8] : [6, 6],
  })

  return (
    <>
      <Marker
        position={[plant.lat, plant.lng]}
        icon={icon}
        eventHandlers={{ click: () => onClick(plant) }}
      >
        <Popup>
          <div style={{ minWidth: 180 }}>
            <strong>{plant.name}</strong>
            <div style={{ color: '#6b7280', fontSize: 12, marginTop: 2 }}>{plant.country}</div>
            <div style={{ marginTop: 6, fontSize: 13 }}>
              <span>堆型：{plant.reactorType}</span><br />
              <span>状态：
                <span style={{ color }}>{plant.status === 'operating' ? '运营中' : plant.status === 'decommissioned' ? '已关闭' : '建设中'}</span>
              </span><br />
              {plant.capacity > 0 && <span>装机容量：{plant.capacity} MW</span>}
            </div>
            <button
              onClick={() => onClick(plant)}
              style={{
                marginTop: 8, padding: '4px 10px', fontSize: 12,
                background: '#ef4444', color: 'white', border: 'none',
                borderRadius: 4, cursor: 'pointer', width: '100%'
              }}
            >
              显示影响范围
            </button>
          </div>
        </Popup>
      </Marker>

      {selected && IMPACT_ZONES.map(zone => (
        <Circle
          key={zone.radius}
          center={[plant.lat, plant.lng]}
          radius={zone.radius}
          pathOptions={{
            color: zone.color,
            fillColor: zone.color,
            fillOpacity: 0.08,
            weight: 1.5,
            dashArray: zone.radius === 300000 ? '6,4' : null,
          }}
        />
      ))}
    </>
  )
}

export default function NuclearMap() {
  const [selectedPlant, setSelectedPlant] = useState(null)

  const handleClick = (plant) => {
    setSelectedPlant(prev => prev?.id === plant.id ? null : plant)
  }

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      <MapContainer
        center={[30, 10]}
        zoom={3}
        minZoom={2}
        style={{ width: '100%', height: '100%' }}
        zoomControl={true}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          noWrap={true}
        />
        {plants.map(plant => (
          <PlantMarker
            key={plant.id}
            plant={plant}
            selected={selectedPlant?.id === plant.id}
            onClick={handleClick}
          />
        ))}
      </MapContainer>

      {/* 图例 */}
      <div style={{
        position: 'absolute', bottom: 30, left: 16, zIndex: 1000,
        background: 'rgba(15,15,15,0.85)', color: 'white',
        padding: '12px 16px', borderRadius: 8, fontSize: 12,
        backdropFilter: 'blur(4px)',
      }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>核电站状态</div>
        {Object.entries(STATUS_COLOR).map(([k, v]) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: v }} />
            <span>{{ operating: '运营中', decommissioned: '已关闭', construction: '建设中' }[k]}</span>
          </div>
        ))}

        {selectedPlant && (
          <>
            <div style={{ fontWeight: 600, margin: '12px 0 8px' }}>影响范围</div>
            {IMPACT_ZONES.map(z => (
              <div key={z.radius} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <div style={{ width: 20, height: 2, background: z.color }} />
                <span>{z.label}</span>
              </div>
            ))}
          </>
        )}
      </div>

      {/* 选中电站信息 */}
      {selectedPlant && (
        <div style={{
          position: 'absolute', top: 16, right: 16, zIndex: 1000,
          background: 'rgba(15,15,15,0.9)', color: 'white',
          padding: '16px 20px', borderRadius: 8, fontSize: 13,
          backdropFilter: 'blur(4px)', minWidth: 200,
        }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{selectedPlant.name}</div>
          <div style={{ color: '#9ca3af', marginBottom: 10 }}>{selectedPlant.country}</div>
          <div style={{ lineHeight: 1.8 }}>
            <div>堆型：{selectedPlant.reactorType}</div>
            {selectedPlant.capacity > 0 && <div>装机：{selectedPlant.capacity} MW</div>}
            <div>坐标：{selectedPlant.lat.toFixed(2)}, {selectedPlant.lng.toFixed(2)}</div>
          </div>
          <button
            onClick={() => setSelectedPlant(null)}
            style={{
              marginTop: 12, padding: '4px 10px', fontSize: 12,
              background: '#374151', color: 'white', border: 'none',
              borderRadius: 4, cursor: 'pointer', width: '100%'
            }}
          >
            关闭
          </button>
        </div>
      )}

      {/* 标题 */}
      <div style={{
        position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
        zIndex: 1000, color: 'white', fontSize: 18, fontWeight: 700,
        textShadow: '0 1px 4px rgba(0,0,0,0.8)', letterSpacing: 2,
        pointerEvents: 'none',
      }}>
        ☢ StrikeScope — 全球核电站影响范围
      </div>
    </div>
  )
}
