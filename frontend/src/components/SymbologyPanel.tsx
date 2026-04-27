import { useState } from 'react'

export interface SymbologySettings {
  fillOpacity: number
  strokeColor: string
  strokeWeight: number
  solidColor: string
}

interface SymbologyPanelProps {
  settings: SymbologySettings
  onChange: (s: SymbologySettings) => void
}

const STROKE_COLORS = ['#666666', '#ffffff', '#000000', '#ef4444', '#3b82f6', '#22c55e']

export default function SymbologyPanel({ settings, onChange }: SymbologyPanelProps) {
  const [open, setOpen] = useState(false)

  const update = (patch: Partial<SymbologySettings>) =>
    onChange({ ...settings, ...patch })

  const tabStyle: React.CSSProperties = {
    position: 'fixed',
    left: 0,
    top: '50%',
    transform: 'translateY(-50%)',
    zIndex: 2000,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'stretch',
  }

  const toggleStyle: React.CSSProperties = {
    writingMode: 'vertical-rl',
    textOrientation: 'mixed',
    transform: 'rotate(180deg)',
    backgroundColor: '#1e293b',
    color: '#fff',
    border: 'none',
    padding: '12px 8px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 600,
    letterSpacing: '0.05em',
    borderRadius: '0 6px 6px 0',
    boxShadow: '2px 0 8px rgba(0,0,0,0.2)',
  }

  const panelStyle: React.CSSProperties = {
    backgroundColor: '#fff',
    borderRight: '1px solid #e5e7eb',
    boxShadow: '2px 0 12px rgba(0,0,0,0.15)',
    padding: '16px',
    width: '220px',
    display: open ? 'block' : 'none',
    borderRadius: '0 8px 8px 0',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: '11px',
    fontWeight: 600,
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '6px',
    marginTop: '12px',
    display: 'block',
  }

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    gap: '6px',
    flexWrap: 'wrap',
  }

  return (
    <div style={tabStyle}>
      <style>{`
        .sym-range::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 16px; height: 16px;
          border-radius: 50%;
          background: #fff;
          border: 2px solid #1e293b;
          box-shadow: 0 1px 4px rgba(0,0,0,0.2);
          cursor: pointer;
        }
        .sym-range::-moz-range-thumb {
          width: 16px; height: 16px;
          border-radius: 50%;
          background: #fff;
          border: 2px solid #1e293b;
          box-shadow: 0 1px 4px rgba(0,0,0,0.2);
          cursor: pointer;
        }
        .sym-range::-webkit-slider-runnable-track { background: transparent; }
        .sym-range::-moz-range-track { background: transparent; }
      `}</style>
      <div style={panelStyle}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: '#111827', marginBottom: '4px' }}>
          LGA Symbology
        </div>

        {/* Fill colour */}
        <span style={labelStyle}>Fill colour</span>
        <input
          type="color"
          value={settings.solidColor}
          onChange={e => update({ solidColor: e.target.value })}
          style={{ width: '100%', height: '32px', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer' }}
        />

        {/* Fill opacity */}
        <span style={labelStyle}>Fill opacity — {Math.round(settings.fillOpacity * 100)}%</span>
        <div style={{ position: 'relative', height: '20px', display: 'flex', alignItems: 'center' }}>
          <div style={{
            position: 'absolute', left: 0, right: 0, height: '6px',
            borderRadius: '3px',
            background: `linear-gradient(to right, rgba(59,130,246,0) 0%, rgba(59,130,246,1) 100%)`,
            pointerEvents: 'none',
          }} />
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={settings.fillOpacity}
            onChange={e => update({ fillOpacity: parseFloat(e.target.value) })}
            style={{ width: '100%', margin: 0, appearance: 'none', WebkitAppearance: 'none', background: 'transparent', cursor: 'pointer' }}
            className="sym-range"
          />
        </div>

        {/* Stroke colour */}
        <span style={labelStyle}>Border colour</span>
        <div style={rowStyle}>
          {STROKE_COLORS.map(c => (
            <button
              key={c}
              onClick={() => update({ strokeColor: c })}
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                backgroundColor: c,
                border: settings.strokeColor === c ? '3px solid #2563eb' : '2px solid #d1d5db',
                cursor: 'pointer',
              }}
            />
          ))}
        </div>

        {/* Stroke weight */}
        <span style={labelStyle}>Border width — {settings.strokeWeight}px</span>
        <div style={{ position: 'relative', height: '20px', display: 'flex', alignItems: 'center' }}>
          <div style={{
            position: 'absolute', left: 0, right: 0, height: '6px',
            borderRadius: '3px',
            background: 'linear-gradient(to right, #e5e7eb 0%, #1e293b 100%)',
            pointerEvents: 'none',
          }} />
          <input
            type="range"
            min={0}
            max={4}
            step={0.5}
            value={settings.strokeWeight}
            onChange={e => update({ strokeWeight: parseFloat(e.target.value) })}
            style={{ width: '100%', margin: 0, appearance: 'none', WebkitAppearance: 'none', background: 'transparent', cursor: 'pointer' }}
            className="sym-range"
          />
        </div>

        {/* Reset */}
        <button
          onClick={() => onChange({
            fillOpacity: 0.7,
            strokeColor: '#666666',
            strokeWeight: 1,
            solidColor: '#3b82f6',
          })}
          style={{
            marginTop: '12px',
            width: '100%',
            padding: '6px',
            borderRadius: '6px',
            border: '1px solid #d1d5db',
            fontSize: '12px',
            cursor: 'pointer',
            backgroundColor: '#f9fafb',
            color: '#374151',
          }}
        >
          Reset to defaults
        </button>
      </div>

      <button style={toggleStyle} onClick={() => setOpen(o => !o)}>
        {open ? 'Close' : 'Symbology'}
      </button>
    </div>
  )
}
