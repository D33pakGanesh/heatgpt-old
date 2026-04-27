import { useEffect, useState } from 'react'
import L from 'leaflet'

interface MapControlsProps {
  mapRef: React.MutableRefObject<L.Map | null>
  activeTileLayer?: { type: 'lst' | 'ndvi' } | null
  sidePanelOpen?: boolean
}

function getScaleInfo(map: L.Map): { width: number; label: string } {
  const center = map.getCenter()
  const zoom = map.getZoom()
  const metersPerPixel =
    (156543.03392 * Math.cos((center.lat * Math.PI) / 180)) / Math.pow(2, zoom)
  const targetWidth = 100
  const meters = metersPerPixel * targetWidth
  if (meters >= 1000) {
    const km = Math.round(meters / 100) / 10
    return { width: targetWidth, label: `${km} km` }
  }
  return { width: targetWidth, label: `${Math.round(meters)} m` }
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

export default function MapControls({ mapRef, activeTileLayer, sidePanelOpen }: MapControlsProps) {
  const [scaleInfo, setScaleInfo] = useState<{ width: number; label: string } | null>(null)
  const arrowRight = sidePanelOpen ? '436px' : '16px'

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const update = () => setScaleInfo(getScaleInfo(map))
    update()
    map.on('zoomend moveend', update)
    return () => { map.off('zoomend moveend', update) }
  }, [mapRef.current])

  const palette = activeTileLayer?.type === 'ndvi' ? NDVI_PALETTE : activeTileLayer?.type === 'lst' ? LST_PALETTE : null

  return (
    <>
      {/* North Arrow — top right, shifts left when side panel is open */}
      <div style={{
        position: 'fixed', top: '16px', right: arrowRight, zIndex: 2000,
        backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: '8px',
        padding: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
        width: '36px',
        transition: 'right 0.3s ease',
      }}>
        <svg width="24" height="32" viewBox="0 0 24 32">
          <polygon points="12,2 18,18 12,14 6,18" fill="#1e293b" />
          <polygon points="12,30 18,14 12,18 6,14" fill="#94a3b8" />
          <circle cx="12" cy="16" r="2.5" fill="#fff" stroke="#1e293b" strokeWidth="1" />
        </svg>
        <span style={{ fontSize: '9px', fontWeight: 700, color: '#1e293b', letterSpacing: '0.05em' }}>N</span>
      </div>

      {/* Scale bar — bottom left */}
      {scaleInfo && (
        <div style={{
          position: 'fixed', bottom: '28px', left: '16px', zIndex: 2000,
          backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: '6px',
          padding: '6px 10px', boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        }}>
          <div style={{ fontSize: '10px', color: '#6b7280', marginBottom: '3px', textAlign: 'center' }}>
            {scaleInfo.label}
          </div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ width: '1px', height: '8px', backgroundColor: '#1e293b' }} />
            <div style={{ flex: 1, height: '3px', backgroundColor: '#1e293b', width: `${scaleInfo.width}px` }} />
            <div style={{ width: '1px', height: '8px', backgroundColor: '#1e293b' }} />
          </div>
        </div>
      )}

      {/* Legend — bottom right, shifts left when side panel is open */}
      {palette && (
        <div style={{
          position: 'fixed', bottom: '28px', right: arrowRight, zIndex: 2000,
          backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: '8px',
          padding: '10px 12px', boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          minWidth: '110px',
          transition: 'right 0.3s ease',
        }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>
            {activeTileLayer?.type === 'lst' ? 'LST (°C)' : 'NDVI'}
          </div>
          {palette.map(({ color, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
              <div style={{ width: '16px', height: '12px', backgroundColor: color, borderRadius: '2px', flexShrink: 0 }} />
              <span style={{ fontSize: '10px', color: '#374151' }}>{label}</span>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
