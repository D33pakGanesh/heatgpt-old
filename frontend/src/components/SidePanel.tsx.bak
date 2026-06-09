import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ScatterChart, Scatter, ZAxis,
} from 'recharts'
import ChatInterface from './ChatInterface'

interface HeatStats {
  lgaId: string; lgaName: string; avgLstCelsius: number; avgNdvi: number
  uhiIntensity: number; dataSource: string; dateRangeStart: string
  dateRangeEnd: string; processedAt: string; stale?: boolean
}

type Timespan = '30d' | '90d' | '180d' | '1yr'

interface SidePanelProps {
  lgaId: string | null
  onCollapse: (collapsed: boolean) => void
  onTileLayerChange: (layer: { url: string; type: 'lst' | 'ndvi'; bbox?: { west: number; south: number; east: number; north: number }; dateRangeStart?: string; dateRangeEnd?: string } | null) => void
}

function fmt(d: Date) { return d.toISOString().slice(0, 10) }

function computeDateRange(timespan: Timespan) {
  const end = new Date(), start = new Date()
  start.setDate(start.getDate() - (timespan === '30d' ? 30 : timespan === '90d' ? 90 : timespan === '180d' ? 180 : 365))
  return { start: fmt(start), end: fmt(end) }
}

function getHeatRiskBadge(uhi: number) {
  if (uhi > 3.0) return { label: 'Extreme Heat Risk', color: '#dc2626' }
  if (uhi > 1.5) return { label: 'High Heat Risk', color: '#ea580c' }
  if (uhi > 0.0) return { label: 'Moderate Heat Risk', color: '#ca8a04' }
  return { label: 'Low Heat Risk', color: '#16a34a' }
}

const PANEL_WIDTH = 420

export default function SidePanel({ lgaId, onCollapse, onTileLayerChange }: SidePanelProps) {
  const [collapsed, setCollapsed] = useState(true)
  const [hasData, setHasData] = useState(false)
  const [timespan, setTimespan] = useState<Timespan>('30d')
  const [activeLayer, setActiveLayer] = useState<'lst' | 'ndvi' | null>(null)
  const [vizStart, setVizStart] = useState('')
  const [vizEnd, setVizEnd] = useState('')
  const [vizDateRange, setVizDateRange] = useState<{ start: string; end: string } | null>(null)
  const [tileError, setTileError] = useState<string | null>(null)
  const [showSaved, setShowSaved] = useState(false)

  const dateRange = computeDateRange(timespan)

  // Reset on new LGA — start collapsed, clear state
  useEffect(() => {
    setCollapsed(true)
    setHasData(false)
    setActiveLayer(null)
    setVizDateRange(null)
    setVizStart('')
    setVizEnd('')
    setTileError(null)
    onTileLayerChange(null)
  }, [lgaId])

  // Notify parent of collapse state so other controls can shift
  useEffect(() => { onCollapse(collapsed) }, [collapsed])

  const { data: heatStats, isLoading, isError } = useQuery<HeatStats>({
    queryKey: ['heat', lgaId, dateRange.start, dateRange.end],
    queryFn: () => fetch(`/api/lga/${lgaId}/heat?start=${dateRange.start}&end=${dateRange.end}`)
      .then(r => { if (!r.ok) throw new Error('Failed'); return r.json() }),
    enabled: lgaId !== null,
  })

  // Auto-expand once data arrives for the first time
  useEffect(() => {
    if (heatStats && !hasData) {
      setHasData(true)
      setCollapsed(false)
    }
  }, [heatStats])

  const tileQueryRange = vizDateRange ?? dateRange

  const { data: tileData, isFetching: isTileFetching, isError: isTileError } = useQuery<{ tileUrl: string; bbox?: { west: number; south: number; east: number; north: number } }>({
    queryKey: ['tiles', lgaId, activeLayer, tileQueryRange.start, tileQueryRange.end],
    queryFn: () => fetch(`/api/lga/${lgaId}/tiles?type=${activeLayer}&start=${tileQueryRange.start}&end=${tileQueryRange.end}`)
      .then(r => { if (r.status === 422) throw new Error('no_data'); if (!r.ok) throw new Error('Failed'); return r.json() }),
    enabled: lgaId !== null && activeLayer !== null && heatStats !== undefined,
    retry: false,
  })

  useEffect(() => { setTileError(isTileError ? 'No satellite data found for this period' : null) }, [isTileError])

  const { data: trendResponse } = useQuery<{ trend: Array<{ date: string; lst: number }> }>({
    queryKey: ['lst-trend', lgaId, dateRange.start, dateRange.end],
    queryFn: () => fetch(`/api/lga/${lgaId}/lst-trend?start=${dateRange.start}&end=${dateRange.end}`)
      .then(r => { if (!r.ok) throw new Error('Failed'); return r.json() }),
    enabled: lgaId !== null && heatStats !== undefined,
    retry: false,
  })

  const trendData = (trendResponse?.trend ?? []).map(p => ({ label: p.date.slice(5), temp: p.lst }))

  const { data: ndviTrendResponse } = useQuery<{ trend: Array<{ date: string; ndvi: number }> }>({
    queryKey: ['ndvi-trend', lgaId, dateRange.start, dateRange.end],
    queryFn: () => fetch(`/api/lga/${lgaId}/ndvi-trend?start=${dateRange.start}&end=${dateRange.end}`)
      .then(r => { if (!r.ok) throw new Error('Failed'); return r.json() }),
    enabled: lgaId !== null && heatStats !== undefined,
    retry: false,
  })

  const scatterData = (() => {
    const lstMap = new Map((trendResponse?.trend ?? []).map(p => [p.date, p.lst]))
    return (ndviTrendResponse?.trend ?? []).filter(p => lstMap.has(p.date))
      .map(p => ({ date: p.date.slice(5), lst: lstMap.get(p.date)!, ndvi: p.ndvi }))
  })()

  const { data: savedLayersData, refetch: refetchSaved } = useQuery<{
    layers: Array<{ id: number; layer_type: string; date_range_start: string; date_range_end: string; tile_url: string; avg_lst_celsius: number; avg_ndvi: number; uhi_intensity: number; exported_at: string }>
  }>({
    queryKey: ['saved-layers', lgaId],
    queryFn: () => fetch(`/api/lga/${lgaId}/saved-layers`).then(r => r.json()),
    enabled: lgaId !== null,
  })
  const savedLayers = savedLayersData?.layers ?? []

  useEffect(() => {
    if (tileData && activeLayer) {
      onTileLayerChange({
        url: tileData.tileUrl,
        type: activeLayer,
        bbox: tileData.bbox,
        dateRangeStart: tileQueryRange.start,
        dateRangeEnd: tileQueryRange.end,
      })
    }
  }, [tileData, activeLayer])

  if (lgaId === null) return null

  const card: React.CSSProperties = { backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '16px', marginBottom: '12px' }
  const lbl: React.CSSProperties = { fontSize: '12px', color: '#6b7280', marginBottom: '4px' }
  const val: React.CSSProperties = { fontSize: '22px', fontWeight: 600, color: '#111827' }
  const skel: React.CSSProperties = { backgroundColor: '#e5e7eb', borderRadius: '8px', height: '72px', marginBottom: '12px', animation: 'pulse 1.5s ease-in-out infinite' }

  return (
    <>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
        @keyframes spin { to { transform: rotate(360deg) } }
      `}</style>

      {/* Expand tab — always visible when lgaId is set */}
      <button
        onClick={() => setCollapsed(c => !c)}
        aria-label={collapsed ? 'Expand panel' : 'Collapse panel'}
        style={{
          position: 'fixed',
          top: '50%',
          right: collapsed ? '0px' : `${PANEL_WIDTH}px`,
          transform: 'translateY(-50%)',
          zIndex: 10000,
          width: '20px',
          height: '56px',
          backgroundColor: '#1e293b',
          color: '#fff',
          border: 'none',
          borderRadius: '6px 0 0 6px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '12px',
          boxShadow: '-2px 0 8px rgba(0,0,0,0.2)',
          transition: 'right 0.3s ease',
        }}
      >
        {collapsed ? '‹' : '›'}
      </button>

      {/* Panel */}
      <div style={{
        position: 'fixed',
        right: collapsed ? `-${PANEL_WIDTH}px` : '0px',
        top: 0,
        height: '100vh',
        width: `${PANEL_WIDTH}px`,
        backgroundColor: '#fff',
        borderLeft: '1px solid #e5e7eb',
        boxShadow: '-4px 0 16px rgba(0,0,0,0.12)',
        zIndex: 9999,
        overflowY: 'auto',
        padding: '24px',
        boxSizing: 'border-box',
        transition: 'right 0.3s ease',
      }}>

        {/* Timespan selector */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '20px', marginTop: '8px', flexWrap: 'wrap' }}>
          {(['30d', '90d', '180d', '1yr'] as Timespan[]).map(ts => (
            <button key={ts} onClick={() => setTimespan(ts)} style={{
              padding: '5px 12px', borderRadius: '6px', border: '1px solid', fontSize: '13px', fontWeight: 500, cursor: 'pointer',
              backgroundColor: timespan === ts ? '#2563eb' : '#f3f4f6',
              color: timespan === ts ? '#fff' : '#374151',
              borderColor: timespan === ts ? '#2563eb' : '#d1d5db',
            }}>{ts}</button>
          ))}
        </div>

        {isLoading && (
          <>
            <div style={{ height: '28px', width: '60%', backgroundColor: '#e5e7eb', borderRadius: '4px', marginBottom: '20px', animation: 'pulse 1.5s ease-in-out infinite' }} />
            <div style={skel} /><div style={skel} /><div style={skel} />
          </>
        )}

        {isError && <p style={{ color: '#dc2626', marginTop: '8px' }}>Failed to load heat data</p>}

        {heatStats && (
          <>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#111827', marginBottom: '12px', paddingRight: '8px' }}>
              {heatStats.lgaName}
            </h2>

            {(() => {
              const { label, color } = getHeatRiskBadge(heatStats.uhiIntensity)
              return (
                <div style={{ display: 'inline-block', backgroundColor: color + '18', color, border: `1px solid ${color}55`, borderRadius: '6px', padding: '4px 10px', fontSize: '13px', fontWeight: 600, marginBottom: '16px' }}>
                  {label}
                </div>
              )
            })()}

            {heatStats.stale && (
              <span style={{ display: 'inline-block', backgroundColor: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d', borderRadius: '4px', padding: '2px 8px', fontSize: '12px', marginBottom: '16px' }}>
                Data may be outdated
              </span>
            )}

            <div style={card}><div style={lbl}>Avg Temperature</div><div style={val}>{heatStats.avgLstCelsius.toFixed(1)}°C</div></div>
            <div style={card}><div style={lbl}>NDVI (Vegetation)</div><div style={val}>{heatStats.avgNdvi.toFixed(3)}</div></div>
            <div style={card}><div style={lbl}>UHI Intensity</div><div style={val}>{heatStats.uhiIntensity.toFixed(1)}°C</div></div>

            {/* Satellite layer toggles */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              {(['lst', 'ndvi', null] as const).map(layer => {
                const label = layer === 'lst' ? 'LST Heatmap' : layer === 'ndvi' ? 'NDVI Vegetation' : 'None'
                const isActive = activeLayer === layer
                const loading = isTileFetching && activeLayer === layer
                return (
                  <button key={String(layer)} onClick={() => { setActiveLayer(layer); setTileError(null); if (layer === null) onTileLayerChange(null) }}
                    style={{ padding: '5px 12px', borderRadius: '6px', border: '1px solid', fontSize: '13px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: isActive ? '#2563eb' : '#f3f4f6', color: isActive ? '#fff' : '#374151', borderColor: isActive ? '#2563eb' : '#d1d5db' }}>
                    {label}
                    {loading && <span style={{ display: 'inline-block', width: '10px', height: '10px', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />}
                  </button>
                )
              })}
            </div>

            {activeLayer && (
              <div style={{ backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '12px', marginBottom: '16px' }}>
                <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px', fontWeight: 500 }}>
                  Custom date range for {activeLayer === 'lst' ? 'LST' : 'NDVI'} layer
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <input type="date" value={vizStart} onChange={e => setVizStart(e.target.value)}
                    style={{ flex: 1, padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', minWidth: '120px' }} />
                  <span style={{ fontSize: '12px', color: '#9ca3af' }}>to</span>
                  <input type="date" value={vizEnd} onChange={e => setVizEnd(e.target.value)}
                    style={{ flex: 1, padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', minWidth: '120px' }} />
                  <button onClick={() => { if (vizStart && vizEnd && vizStart < vizEnd) { setVizDateRange({ start: vizStart, end: vizEnd }); setTileError(null) } }}
                    disabled={!vizStart || !vizEnd || vizStart >= vizEnd}
                    style={{ padding: '5px 12px', borderRadius: '6px', border: 'none', fontSize: '13px', fontWeight: 500, cursor: (!vizStart || !vizEnd || vizStart >= vizEnd) ? 'not-allowed' : 'pointer', backgroundColor: (!vizStart || !vizEnd || vizStart >= vizEnd) ? '#e5e7eb' : '#2563eb', color: (!vizStart || !vizEnd || vizStart >= vizEnd) ? '#9ca3af' : '#fff' }}>
                    Apply
                  </button>
                  {vizDateRange && (
                    <button onClick={() => { setVizDateRange(null); setVizStart(''); setVizEnd(''); setTileError(null) }}
                      style={{ padding: '5px 8px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '12px', cursor: 'pointer', backgroundColor: '#fff', color: '#6b7280' }}>
                      Reset
                    </button>
                  )}
                </div>
                {vizDateRange && <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '6px' }}>Showing mean for {vizDateRange.start} → {vizDateRange.end}</div>}
                {tileError && <div style={{ fontSize: '12px', color: '#dc2626', marginTop: '6px' }}>⚠ {tileError}</div>}
              </div>
            )}

            {trendData.length > 0 && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>Temperature Trend — per Landsat pass ({timespan})</div>
                <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '8px' }}>Each point = mean LST for one satellite overpass (cloud &lt; 20%)</div>
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={trendData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} unit="°C" />
                    <Tooltip formatter={(v: number) => [`${v}°C`, 'Temp']} />
                    <Line type="monotone" dataKey="temp" stroke="#ef4444" strokeWidth={2} dot={{ r: 3, fill: '#ef4444' }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {scatterData.length > 1 && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>LST vs NDVI Scatter ({timespan})</div>
                <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '8px' }}>Each point = one satellite overpass. Higher NDVI = cooler temps expected.</div>
                <ResponsiveContainer width="100%" height={180}>
                  <ScatterChart margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                    <XAxis dataKey="lst" name="LST" unit="°C" tick={{ fontSize: 11 }} label={{ value: 'LST (°C)', position: 'insideBottom', offset: -2, fontSize: 11 }} />
                    <YAxis dataKey="ndvi" name="NDVI" tick={{ fontSize: 11 }} label={{ value: 'NDVI', angle: -90, position: 'insideLeft', fontSize: 11 }} />
                    <ZAxis range={[40, 40]} />
                    <Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ payload }) => {
                      if (!payload?.length) return null
                      const d = payload[0].payload
                      return <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '6px 10px', fontSize: '12px' }}><div style={{ color: '#6b7280' }}>{d.date}</div><div>LST: <strong>{d.lst}°C</strong></div><div>NDVI: <strong>{d.ndvi}</strong></div></div>
                    }} />
                    <Scatter data={scatterData} fill="#ef4444" opacity={0.8} />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            )}

            <div style={{ ...card, marginBottom: '16px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '12px' }}>NDVI vs LST</div>
              <div style={{ marginBottom: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}><span>Temperature</span><span>{heatStats.avgLstCelsius.toFixed(1)}°C</span></div>
                <div style={{ height: '8px', backgroundColor: '#e5e7eb', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.min(100, Math.max(0, (heatStats.avgLstCelsius / 70) * 100))}%`, backgroundColor: '#ef4444', borderRadius: '4px', transition: 'width 0.4s ease' }} />
                </div>
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}><span>Vegetation</span><span>{heatStats.avgNdvi.toFixed(3)}</span></div>
                <div style={{ height: '8px', backgroundColor: '#e5e7eb', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.min(100, Math.max(0, ((heatStats.avgNdvi + 1) / 2) * 100))}%`, backgroundColor: '#16a34a', borderRadius: '4px', transition: 'width 0.4s ease' }} />
                </div>
              </div>
            </div>

            <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '16px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>Saved Layers</span>
                <button onClick={() => setShowSaved(s => !s)} style={{ padding: '5px 12px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '12px', fontWeight: 500, cursor: 'pointer', backgroundColor: showSaved ? '#f3f4f6' : '#fff', color: '#374151' }}>
                  {showSaved ? 'Hide' : `Show (${savedLayers.length})`}
                </button>
              </div>
              {showSaved && savedLayers.length === 0 && <p style={{ fontSize: '12px', color: '#9ca3af' }}>No saved layers yet.</p>}
              {showSaved && savedLayers.map(layer => (
                <div key={layer.id} style={{ backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '10px', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#374151', textTransform: 'uppercase' }}>{layer.layer_type}</span>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button onClick={() => { onTileLayerChange({ url: layer.tile_url, type: layer.layer_type as 'lst' | 'ndvi', dateRangeStart: layer.date_range_start, dateRangeEnd: layer.date_range_end }); setActiveLayer(layer.layer_type as 'lst' | 'ndvi') }} style={{ padding: '3px 8px', borderRadius: '4px', border: 'none', fontSize: '11px', cursor: 'pointer', backgroundColor: '#2563eb', color: '#fff' }}>Load on map</button>
                      <button onClick={async () => { if (!confirm('Delete this saved layer?')) return; await fetch(`/api/lga/${lgaId}/saved-layers/${layer.id}`, { method: 'DELETE' }); refetchSaved() }} style={{ padding: '3px 8px', borderRadius: '4px', border: 'none', fontSize: '11px', cursor: 'pointer', backgroundColor: '#fee2e2', color: '#dc2626' }}>Delete</button>
                    </div>
                  </div>
                  <div style={{ fontSize: '11px', color: '#6b7280' }}>{layer.date_range_start} → {layer.date_range_end}</div>
                  {layer.avg_lst_celsius != null && <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>LST {layer.avg_lst_celsius}°C · NDVI {layer.avg_ndvi} · UHI {layer.uhi_intensity}°C</div>}
                  <div style={{ fontSize: '10px', color: '#d1d5db', marginTop: '2px' }}>Saved {new Date(layer.exported_at).toLocaleDateString()}</div>
                </div>
              ))}
            </div>

            <ChatInterface lgaId={lgaId} heatStats={heatStats} />
          </>
        )}
      </div>
    </>
  )
}
