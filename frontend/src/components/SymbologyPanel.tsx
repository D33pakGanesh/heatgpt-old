import { useState } from 'react'

export interface SymbologySettings {
  fillOpacity: number
  strokeColor: string
  strokeWeight: number
  solidColor: string
}

export type BasemapType = 'map' | 'satellite' | 'hybrid'

interface SymbologyPanelProps {
  settings: SymbologySettings
  onChange: (s: SymbologySettings) => void
  basemap: BasemapType
  onBasemapChange: (b: BasemapType) => void
  headerHeight?: number
}

const STROKE_COLORS = ['#64748b', '#ffffff', '#0f172a', '#ef4444', '#2563eb', '#16a34a']

const BASEMAPS: { value: BasemapType; label: string }[] = [
  { value: 'map',       label: 'Street' },
  { value: 'satellite', label: 'Satellite' },
  { value: 'hybrid',    label: 'Hybrid' },
]

const label: React.CSSProperties = {
  display: 'block',
  fontSize: '11px',
  fontWeight: 600,
  color: '#64748b',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: '8px',
  marginTop: '16px',
}

const divider: React.CSSProperties = {
  borderTop: '1px solid #f1f5f9',
  marginTop: '16px',
  paddingTop: '16px',
}

export default function SymbologyPanel({ settings, onChange, basemap, onBasemapChange, headerHeight = 0 }: SymbologyPanelProps) {
  const [open, setOpen] = useState(false)
  const update = (patch: Partial<SymbologySettings>) => onChange({ ...settings, ...patch })

  return (
    <div style={{ position: 'fixed', left: 0, top: `calc(${headerHeight}px + (100vh - ${headerHeight}px) / 2)`, transform: 'translateY(-50%)', zIndex: 2000, display: 'flex', flexDirection: 'row', alignItems: 'stretch' }}>
      {/* Panel */}
      <div style={{
        backgroundColor: '#fff',
        borderRight: '1px solid #e2e8f0',
        boxShadow: '4px 0 16px rgba(0,0,0,0.10)',
        padding: '20px',
        width: '232px',
        display: open ? 'block' : 'none',
        borderRadius: '0 12px 12px 0',
        maxHeight: '80vh',
        overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.01em' }}>Map Settings</div>
        <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>Basemap &amp; layer style</div>

        {/* Basemap */}
        <span style={label}>Base Map</span>
        <div style={{ display: 'flex', gap: '6px' }}>
          {BASEMAPS.map(({ value, label: lbl }) => {
            const active = basemap === value
            return (
              <button key={value} onClick={() => onBasemapChange(value)} style={{
                flex: 1, padding: '8px 4px', borderRadius: '6px',
                border: `1px solid ${active ? '#2563eb' : '#e2e8f0'}`,
                fontSize: '12px', fontWeight: active ? 600 : 500,
                cursor: 'pointer', textAlign: 'center',
                backgroundColor: active ? '#eff6ff' : '#f8fafc',
                color: active ? '#2563eb' : '#475569',
                transition: 'all 0.15s',
              }}>{lbl}</button>
            )
          })}
        </div>

        {/* LGA Symbology */}
        <div style={divider}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>LGA Symbology</div>
        </div>

        <span style={label}>Fill Colour</span>
        <input type="color" value={settings.solidColor}
          onChange={e => update({ solidColor: e.target.value })}
          style={{ width: '100%', height: '34px', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer', padding: '2px' }} />

        <span style={label}>Fill Opacity — {Math.round(settings.fillOpacity * 100)}%</span>
        <div style={{ position: 'relative', height: '20px', display: 'flex', alignItems: 'center' }}>
          <div style={{ position: 'absolute', left: 0, right: 0, height: '4px', borderRadius: '2px',
            background: 'linear-gradient(to right, rgba(37,99,235,0.05), rgba(37,99,235,1))', pointerEvents: 'none' }} />
          <input type="range" min={0} max={1} step={0.05} value={settings.fillOpacity}
            onChange={e => update({ fillOpacity: parseFloat(e.target.value) })} />
        </div>

        <span style={label}>Border Colour</span>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {STROKE_COLORS.map(c => (
            <button key={c} onClick={() => update({ strokeColor: c })} style={{
              width: '26px', height: '26px', borderRadius: '50%', backgroundColor: c,
              border: settings.strokeColor === c ? '3px solid #2563eb' : '2px solid #e2e8f0',
              cursor: 'pointer', flexShrink: 0,
            }} />
          ))}
        </div>

        <span style={label}>Border Width — {settings.strokeWeight}px</span>
        <div style={{ position: 'relative', height: '20px', display: 'flex', alignItems: 'center' }}>
          <div style={{ position: 'absolute', left: 0, right: 0, height: '4px', borderRadius: '2px',
            background: 'linear-gradient(to right, #e2e8f0, #0f172a)', pointerEvents: 'none' }} />
          <input type="range" min={0} max={4} step={0.5} value={settings.strokeWeight}
            onChange={e => update({ strokeWeight: parseFloat(e.target.value) })} />
        </div>

        <button onClick={() => onChange({ fillOpacity: 0.7, strokeColor: '#64748b', strokeWeight: 1, solidColor: '#2563eb' })}
          style={{ marginTop: '16px', width: '100%', padding: '7px', borderRadius: '6px',
            border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 500, cursor: 'pointer',
            backgroundColor: '#f8fafc', color: '#475569', letterSpacing: '0.01em' }}>
          Reset to Defaults
        </button>
      </div>

      {/* Tab */}
      <button onClick={() => setOpen(o => !o)} style={{
        writingMode: 'vertical-rl', textOrientation: 'mixed', transform: 'rotate(180deg)',
        backgroundColor: '#0f172a', color: '#fff', border: 'none',
        padding: '14px 9px', cursor: 'pointer', fontSize: '11px', fontWeight: 600,
        letterSpacing: '0.08em', textTransform: 'uppercase',
        borderRadius: '0 6px 6px 0', boxShadow: '3px 0 10px rgba(0,0,0,0.15)',
      }}>
        {open ? 'Close' : 'Settings'}
      </button>
    </div>
  )
}
