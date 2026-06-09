import { useEffect, useState } from 'react'
import L from 'leaflet'

interface MapControlsProps {
  mapRef: React.MutableRefObject<L.Map | null>
  activeTileLayer?: { type: 'lst' | 'ndvi' | 'suhi' } | null
  sidePanelOpen?: boolean
  headerHeight?: number
}

function getScaleInfo(map: L.Map): { width: number; label: string } {
  const center = map.getCenter()
  const zoom = map.getZoom()
  const metersPerPixel = (156543.03392 * Math.cos((center.lat * Math.PI) / 180)) / Math.pow(2, zoom)
  const meters = metersPerPixel * 100
  if (meters >= 1000) return { width: 100, label: `${Math.round(meters / 100) / 10} km` }
  return { width: 100, label: `${Math.round(meters)} m` }
}

const LST_PALETTE = [
  { color: '#313695', label: '≤20°C' },
  { color: '#4575b4', label: '25°C' },
  { color: '#74add1', label: '30°C' },
  { color: '#abd9e9', label: '35°C' },
  { color: '#fee090', label: '40°C' },
  { color: '#fdae61', label: '45°C' },
  { color: '#f46d43', label: '50°C' },
  { color: '#d73027', label: '55°C' },
  { color: '#a50026', label: '>55°C' },
]
const NDVI_PALETTE = [
  { color: '#d73027', label: '-0.2' },
  { color: '#fee090', label: '0.0' },
  { color: '#ffffbf', label: '0.2' },
  { color: '#d9ef8b', label: '0.4' },
  { color: '#91cf60', label: '0.6' },
  { color: '#1a9850', label: '0.8' },
]
const SUHI_PALETTE = [
  { color: '#313695', label: '−3°C' },
  { color: '#4575b4', label: '−2°C' },
  { color: '#74add1', label: '−1°C' },
  { color: '#ffffbf', label: '0°C' },
  { color: '#fdae61', label: '+1°C' },
  { color: '#f46d43', label: '+2°C' },
  { color: '#a50026', label: '+3°C' },
]

const card: React.CSSProperties = {
  backgroundColor: 'rgba(255,255,255,0.96)',
  borderRadius: '8px',
  boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
  border: '1px solid #e2e8f0',
}

export default function MapControls({ mapRef, activeTileLayer, sidePanelOpen, headerHeight = 0 }: MapControlsProps) {
  const [scaleInfo, setScaleInfo] = useState<{ width: number; label: string } | null>(null)
  const offset = sidePanelOpen ? '476px' : '16px'

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const update = () => setScaleInfo(getScaleInfo(map))
    update()
    map.on('zoomend moveend', update)
    return () => { map.off('zoomend moveend', update) }
  }, [mapRef.current])

  const palette =
    activeTileLayer?.type === 'ndvi' ? NDVI_PALETTE :
    activeTileLayer?.type === 'lst'  ? LST_PALETTE  :
    activeTileLayer?.type === 'suhi' ? SUHI_PALETTE : null

  const legendTitle =
    activeTileLayer?.type === 'lst'  ? 'LST (°C)' :
    activeTileLayer?.type === 'ndvi' ? 'NDVI' :
    activeTileLayer?.type === 'suhi' ? 'SUHI (°C)' : ''

  return (
    <>
      {/* North arrow */}
      <div style={{ ...card, position: 'fixed', top: `${headerHeight + 16}px`, right: offset, zIndex: 2000,
        padding: '8px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
        transition: 'right 0.3s ease' }}>
        <svg width="20" height="28" viewBox="0 0 24 32">
          <polygon points="12,2 18,18 12,14 6,18" fill="#0f172a" />
          <polygon points="12,30 18,14 12,18 6,14" fill="#cbd5e1" />
          <circle cx="12" cy="16" r="2.5" fill="#fff" stroke="#0f172a" strokeWidth="1.2" />
        </svg>
        <span style={{ fontSize: '9px', fontWeight: 700, color: '#0f172a', letterSpacing: '0.08em' }}>N</span>
      </div>

      {/* Scale bar */}
      {scaleInfo && (
        <div style={{ ...card, position: 'fixed', bottom: '24px', left: '16px', zIndex: 2000, padding: '7px 12px' }}>
          <div style={{ fontSize: '10px', fontWeight: 500, color: '#64748b', marginBottom: '4px', textAlign: 'center', letterSpacing: '0.02em' }}>
            {scaleInfo.label}
          </div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ width: '1px', height: '7px', backgroundColor: '#0f172a' }} />
            <div style={{ height: '2px', backgroundColor: '#0f172a', width: `${scaleInfo.width}px` }} />
            <div style={{ width: '1px', height: '7px', backgroundColor: '#0f172a' }} />
          </div>
        </div>
      )}

      {/* Legend */}
      {palette && (
        <div style={{ ...card, position: 'fixed', bottom: '24px', right: offset, zIndex: 2000,
          padding: '12px 14px', minWidth: '110px', transition: 'right 0.3s ease' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#0f172a', marginBottom: '8px', letterSpacing: '0.01em' }}>
            {legendTitle}
          </div>
          {palette.map(({ color, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <div style={{ width: '14px', height: '10px', backgroundColor: color, borderRadius: '2px', flexShrink: 0 }} />
              <span style={{ fontSize: '11px', color: '#475569', fontWeight: 500 }}>{label}</span>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
