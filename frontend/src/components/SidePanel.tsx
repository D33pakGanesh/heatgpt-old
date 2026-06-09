import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ScatterChart, Scatter, ZAxis, Legend,
} from 'recharts'
import ChatInterface from './ChatInterface'

interface HeatStats {
  lgaId: string; lgaName: string; avgLstCelsius: number; avgNdvi: number
  uhiIntensity: number; dataSource: string; dateRangeStart: string
  dateRangeEnd: string; processedAt: string; stale?: boolean
}
interface SuhiStats {
  lgaId: string; lgaName: string; mode: string; year: number
  lgaLst: number; regionalLst: number; suhi: number
}
interface SuhiMonthly {
  lgaId: string; year: number
  monthly: Array<{ month: number; day: number | null; night: number | null }>
}
type Timespan = '30d' | '90d' | '180d' | '1yr'
type SuhiMode = 'annual_day' | 'annual_night' | 'summer_day' | 'summer_night' | 'winter_day' | 'winter_night'

const SUHI_MODES: { value: SuhiMode | 'none'; label: string }[] = [
  { value: 'none',         label: 'None' },
  { value: 'annual_day',   label: 'Annual Day' },
  { value: 'annual_night', label: 'Annual Night' },
  { value: 'summer_day',   label: 'Summer Day' },
  { value: 'summer_night', label: 'Summer Night' },
  { value: 'winter_day',   label: 'Winter Day' },
  { value: 'winter_night', label: 'Winter Night' },
]
const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

interface SidePanelProps {
  lgaId: string | null
  onCollapse: (collapsed: boolean) => void
  onTileLayerChange: (layer: { url: string; type: 'lst' | 'ndvi' | 'suhi'; bbox?: any; dateRangeStart?: string; dateRangeEnd?: string } | null) => void
  headerHeight?: number
}

function fmt(d: Date) { return d.toISOString().slice(0, 10) }
function computeDateRange(ts: Timespan) {
  const end = new Date(), start = new Date()
  start.setDate(start.getDate() - (ts === '30d' ? 30 : ts === '90d' ? 90 : ts === '180d' ? 180 : 365))
  return { start: fmt(start), end: fmt(end) }
}
function getRiskBadge(uhi: number) {
  if (uhi > 3.0) return { label: 'Extreme Heat Risk', bg: '#fef2f2', color: '#dc2626', border: '#fecaca' }
  if (uhi > 1.5) return { label: 'High Heat Risk',    bg: '#fff7ed', color: '#ea580c', border: '#fed7aa' }
  if (uhi > 0.0) return { label: 'Moderate Heat Risk',bg: '#fefce8', color: '#ca8a04', border: '#fde68a' }
  return                 { label: 'Low Heat Risk',     bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' }
}

const PANEL_WIDTH = 460

// Design tokens
const T = {
  sectionLabel: { fontSize: '10px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: '10px', display: 'block' },
  card: { backgroundColor: '#f8fafc', border: '1px solid #f1f5f9', borderRadius: '8px', padding: '14px 16px', marginBottom: '10px' },
  statLabel: { fontSize: '11px', color: '#64748b', fontWeight: 500, marginBottom: '3px' },
  statValue: { fontSize: '24px', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.02em', lineHeight: 1.1 },
  divider: { borderTop: '1px solid #f1f5f9', margin: '16px 0' },
}

function Btn({ active, loading: spin, onClick, children }: { active: boolean; loading?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      padding: '5px 12px', borderRadius: '6px', border: `1px solid ${active ? '#2563eb' : '#e2e8f0'}`,
      fontSize: '12px', fontWeight: active ? 600 : 500, cursor: 'pointer',
      backgroundColor: active ? '#eff6ff' : '#f8fafc',
      color: active ? '#2563eb' : '#475569',
      display: 'flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap' as const,
      transition: 'all 0.15s',
    }}>
      {children}
      {spin && <span style={{ display:'inline-block', width:'9px', height:'9px', border:'2px solid #bfdbfe', borderTopColor:'#2563eb', borderRadius:'50%', animation:'spin 0.7s linear infinite' }} />}
    </button>
  )
}

export default function SidePanel({ lgaId, onCollapse, onTileLayerChange, headerHeight = 0 }: SidePanelProps) {
  const [collapsed, setCollapsed] = useState(true)
  const [hasData, setHasData] = useState(false)
  const [timespan, setTimespan] = useState<Timespan>('30d')
  const [activeLayer, setActiveLayer] = useState<'lst' | 'ndvi' | null>(null)
  const [vizStart, setVizStart] = useState(''); const [vizEnd, setVizEnd] = useState('')
  const [vizDateRange, setVizDateRange] = useState<{ start: string; end: string } | null>(null)
  const [tileError, setTileError] = useState<string | null>(null)
  const [showSaved, setShowSaved] = useState(false)
  const [suhiMode, setSuhiMode] = useState<SuhiMode | 'none'>('none')
  const [suhiYear, setSuhiYear] = useState<number>(new Date().getFullYear() - 1)

  const dateRange = computeDateRange(timespan)
  const currentYear = new Date().getFullYear()
  const yearOptions = Array.from({ length: currentYear - 2000 + 1 }, (_, i) => currentYear - i)

  useEffect(() => {
    setCollapsed(true); setHasData(false); setActiveLayer(null)
    setVizDateRange(null); setVizStart(''); setVizEnd(''); setTileError(null)
    setSuhiMode('none'); onTileLayerChange(null)
  }, [lgaId])
  useEffect(() => { onCollapse(collapsed) }, [collapsed])

  const { data: heatStats, isLoading, isError } = useQuery<HeatStats>({
    queryKey: ['heat', lgaId, dateRange.start, dateRange.end],
    queryFn: () => fetch(`/api/lga/${lgaId}/heat?start=${dateRange.start}&end=${dateRange.end}`).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    enabled: lgaId !== null,
  })
  useEffect(() => { if (heatStats && !hasData) { setHasData(true); setCollapsed(false) } }, [heatStats])

  const tileQueryRange = vizDateRange ?? dateRange
  const { data: tileData, isFetching: isTileFetching, isError: isTileError } = useQuery<{ tileUrl: string; bbox?: any }>({
    queryKey: ['tiles', lgaId, activeLayer, tileQueryRange.start, tileQueryRange.end],
    queryFn: () => fetch(`/api/lga/${lgaId}/tiles?type=${activeLayer}&start=${tileQueryRange.start}&end=${tileQueryRange.end}`)
      .then(r => { if (r.status === 422) throw new Error('no_data'); if (!r.ok) throw new Error(); return r.json() }),
    enabled: lgaId !== null && activeLayer !== null && heatStats !== undefined, retry: false,
  })
  useEffect(() => { setTileError(isTileError ? 'No satellite data available for this period' : null) }, [isTileError])

  const { data: trendResponse } = useQuery<{ trend: Array<{ date: string; lst: number }> }>({
    queryKey: ['lst-trend', lgaId, dateRange.start, dateRange.end],
    queryFn: () => fetch(`/api/lga/${lgaId}/lst-trend?start=${dateRange.start}&end=${dateRange.end}`).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    enabled: lgaId !== null && heatStats !== undefined, retry: false,
  })
  const trendData = (trendResponse?.trend ?? []).map(p => ({ label: p.date.slice(5), temp: p.lst }))

  const { data: ndviTrendResponse } = useQuery<{ trend: Array<{ date: string; ndvi: number }> }>({
    queryKey: ['ndvi-trend', lgaId, dateRange.start, dateRange.end],
    queryFn: () => fetch(`/api/lga/${lgaId}/ndvi-trend?start=${dateRange.start}&end=${dateRange.end}`).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    enabled: lgaId !== null && heatStats !== undefined, retry: false,
  })
  const scatterData = (() => {
    const m = new Map((trendResponse?.trend ?? []).map(p => [p.date, p.lst]))
    return (ndviTrendResponse?.trend ?? []).filter(p => m.has(p.date)).map(p => ({ date: p.date.slice(5), lst: m.get(p.date)!, ndvi: p.ndvi }))
  })()

  const { data: suhiStats, isFetching: isSuhiFetching, isError: isSuhiError } = useQuery<SuhiStats>({
    queryKey: ['suhi', lgaId, suhiMode, suhiYear],
    queryFn: () => fetch(`/api/lga/${lgaId}/suhi?mode=${suhiMode}&year=${suhiYear}`).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    enabled: lgaId !== null && suhiMode !== 'none' && heatStats !== undefined, retry: false,
  })
  const { data: suhiTileData, isFetching: isSuhiTileFetching } = useQuery<{ tileUrl: string; eeUrl: string; bbox?: any }>({
    queryKey: ['suhi-tiles', lgaId, suhiMode, suhiYear],
    queryFn: () => fetch(`/api/lga/${lgaId}/suhi-tiles?mode=${suhiMode}&year=${suhiYear}`).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    enabled: lgaId !== null && suhiMode !== 'none' && heatStats !== undefined, retry: false,
  })
  const { data: suhiMonthlyData, isFetching: isSuhiMonthlyFetching, isError: isSuhiMonthlyError } = useQuery<SuhiMonthly>({
    queryKey: ['suhi-monthly', lgaId, suhiYear],
    queryFn: () => fetch(`/api/lga/${lgaId}/suhi-monthly?year=${suhiYear}`).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    enabled: lgaId !== null && suhiMode !== 'none' && heatStats !== undefined, retry: false,
  })
  const monthlyChartData = (suhiMonthlyData?.monthly ?? []).map(m => ({ month: MONTH_LABELS[m.month - 1], day: m.day, night: m.night }))

  useEffect(() => {
    if (suhiTileData && suhiMode !== 'none') onTileLayerChange({ url: suhiTileData.tileUrl, type: 'suhi', bbox: suhiTileData.bbox })
    else if (suhiMode === 'none' && !activeLayer) onTileLayerChange(null)
  }, [suhiTileData, suhiMode])
  useEffect(() => {
    if (tileData && activeLayer) onTileLayerChange({ url: tileData.tileUrl, type: activeLayer, bbox: tileData.bbox, dateRangeStart: tileQueryRange.start, dateRangeEnd: tileQueryRange.end })
  }, [tileData, activeLayer])

  const { data: savedLayersData, refetch: refetchSaved } = useQuery<{ layers: Array<any> }>({
    queryKey: ['saved-layers', lgaId],
    queryFn: () => fetch(`/api/lga/${lgaId}/saved-layers`).then(r => r.json()),
    enabled: lgaId !== null,
  })
  const savedLayers = savedLayersData?.layers ?? []

  if (lgaId === null) return null

  const skel = { backgroundColor: '#f1f5f9', borderRadius: '8px', height: '68px', marginBottom: '10px', animation: 'pulse 1.5s ease-in-out infinite' }

  return (
    <>
      <style>{`
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}
        @keyframes spin{to{transform:rotate(360deg)}}
      `}</style>

      {/* Expand tab */}
      <button onClick={() => setCollapsed(c => !c)} aria-label={collapsed ? 'Expand panel' : 'Collapse panel'} style={{
        position: 'fixed', top: `calc(${headerHeight}px + (100vh - ${headerHeight}px) / 2)`, right: collapsed ? '0px' : `${PANEL_WIDTH}px`,
        transform: 'translateY(-50%)', zIndex: 10000, width: '18px', height: '52px',
        backgroundColor: '#0f172a', color: '#fff', border: 'none', borderRadius: '6px 0 0 6px',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '11px', boxShadow: '-2px 0 8px rgba(0,0,0,0.18)', transition: 'right 0.3s ease',
      }}>{collapsed ? '‹' : '›'}</button>

      {/* Panel */}
      <div style={{
        position: 'fixed', right: collapsed ? `-${PANEL_WIDTH}px` : '0px', top: `${headerHeight}px`,
        height: `calc(100vh - ${headerHeight}px)`, width: `${PANEL_WIDTH}px`, backgroundColor: '#fff',
        borderLeft: '1px solid #e2e8f0', boxShadow: '-6px 0 24px rgba(0,0,0,0.08)',
        zIndex: 9999, overflowY: 'auto', padding: '24px 22px', boxSizing: 'border-box',
        transition: 'right 0.3s ease', fontFamily: 'inherit',
      }}>

        {/* Timespan tabs */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', backgroundColor: '#f8fafc', borderRadius: '8px', padding: '3px' }}>
          {(['30d','90d','180d','1yr'] as Timespan[]).map(ts => (
            <button key={ts} onClick={() => setTimespan(ts)} style={{
              flex: 1, padding: '5px 0', borderRadius: '6px', border: 'none',
              fontSize: '12px', fontWeight: timespan === ts ? 600 : 500, cursor: 'pointer',
              backgroundColor: timespan === ts ? '#fff' : 'transparent',
              color: timespan === ts ? '#0f172a' : '#64748b',
              boxShadow: timespan === ts ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              transition: 'all 0.15s',
            }}>{ts}</button>
          ))}
        </div>

        {/* Loading skeletons */}
        {isLoading && (<><div style={{ ...skel, height: '24px', width: '55%', marginBottom: '16px' }} /><div style={skel} /><div style={skel} /><div style={skel} /></>)}
        {isError && <p style={{ fontSize: '13px', color: '#dc2626' }}>Failed to load heat data.</p>}

        {heatStats && (
          <>
            {/* LGA name + badge */}
            <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#0f172a', marginBottom: '10px', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
              {heatStats.lgaName}
            </h2>
            {(() => {
              const { label, bg, color, border } = getRiskBadge(heatStats.uhiIntensity)
              return <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', backgroundColor: bg, color, border: `1px solid ${border}`, borderRadius: '6px', padding: '4px 10px', fontSize: '12px', fontWeight: 600, marginBottom: heatStats.stale ? '8px' : '16px' }}>{label}</div>
            })()}
            {heatStats.stale && <div style={{ fontSize: '11px', color: '#92400e', backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '5px', padding: '3px 9px', marginBottom: '16px', display: 'inline-block' }}>Displaying cached data</div>}

            {/* Stat cards */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '16px' }}>
              {[
                { label: 'Avg Temp', value: `${heatStats.avgLstCelsius.toFixed(1)}°C` },
                { label: 'NDVI', value: heatStats.avgNdvi.toFixed(3) },
                { label: 'UHI', value: `${heatStats.uhiIntensity.toFixed(1)}°C` },
              ].map(({ label, value }) => (
                <div key={label} style={{ backgroundColor: '#f8fafc', border: '1px solid #f1f5f9', borderRadius: '8px', padding: '12px' }}>
                  <div style={T.statLabel}>{label}</div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.02em' }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Landsat layers */}
            <div style={T.divider} />
            <span style={T.sectionLabel}>Landsat Layers</span>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
              {(['lst','ndvi',null] as const).map(layer => (
                <Btn key={String(layer)} active={activeLayer === layer} loading={isTileFetching && activeLayer === layer}
                  onClick={() => { setActiveLayer(layer); setTileError(null); if (layer === null) onTileLayerChange(null) }}>
                  {layer === 'lst' ? 'LST Heatmap' : layer === 'ndvi' ? 'NDVI Vegetation' : 'None'}
                </Btn>
              ))}
            </div>
            {activeLayer && (
              <div style={{ backgroundColor: '#f8fafc', border: '1px solid #f1f5f9', borderRadius: '8px', padding: '12px', marginBottom: '10px' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', marginBottom: '8px' }}>Custom date range</div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <input type="date" value={vizStart} onChange={e => setVizStart(e.target.value)}
                    style={{ flex: 1, padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', minWidth: '120px', fontFamily: 'inherit' }} />
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>to</span>
                  <input type="date" value={vizEnd} onChange={e => setVizEnd(e.target.value)}
                    style={{ flex: 1, padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', minWidth: '120px', fontFamily: 'inherit' }} />
                  <button onClick={() => { if (vizStart && vizEnd && vizStart < vizEnd) { setVizDateRange({ start: vizStart, end: vizEnd }); setTileError(null) } }}
                    disabled={!vizStart || !vizEnd || vizStart >= vizEnd}
                    style={{ padding: '5px 12px', borderRadius: '6px', border: 'none', fontSize: '12px', fontWeight: 600, cursor: (!vizStart||!vizEnd||vizStart>=vizEnd)?'not-allowed':'pointer', backgroundColor: (!vizStart||!vizEnd||vizStart>=vizEnd)?'#e2e8f0':'#2563eb', color: (!vizStart||!vizEnd||vizStart>=vizEnd)?'#94a3b8':'#fff' }}>Apply</button>
                  {vizDateRange && <button onClick={() => { setVizDateRange(null); setVizStart(''); setVizEnd(''); setTileError(null) }} style={{ padding: '5px 8px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '12px', cursor: 'pointer', backgroundColor: '#fff', color: '#64748b' }}>Reset</button>}
                </div>
                {tileError && <div style={{ fontSize: '11px', color: '#dc2626', marginTop: '6px' }}>{tileError}</div>}
              </div>
            )}

            {/* SUHI section */}
            <div style={T.divider} />
            <span style={T.sectionLabel}>Surface UHI — MODIS</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
              <span style={{ fontSize: '12px', fontWeight: 500, color: '#475569' }}>Year</span>
              <select value={suhiYear} onChange={e => setSuhiYear(parseInt(e.target.value))}
                style={{ padding: '5px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', backgroundColor: '#fff', cursor: 'pointer', fontFamily: 'inherit', color: '#0f172a' }}>
                {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              {(isSuhiFetching || isSuhiTileFetching || isSuhiMonthlyFetching) && suhiMode !== 'none' && (
                <span style={{ fontSize: '11px', color: '#64748b' }}>Computing...</span>
              )}
            </div>
            <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '10px' }}>
              {SUHI_MODES.map(({ value, label }) => (
                <Btn key={value} active={suhiMode === value}
                  loading={(isSuhiFetching || isSuhiTileFetching) && suhiMode === value && value !== 'none'}
                  onClick={() => { setSuhiMode(value); if (value === 'none' && !activeLayer) onTileLayerChange(null) }}>
                  {label}
                </Btn>
              ))}
            </div>
            {suhiMode !== 'none' && suhiStats && (
              <div style={{ ...T.card, marginBottom: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={T.statLabel}>{SUHI_MODES.find(m => m.value === suhiMode)?.label} SUHI — {suhiYear}</div>
                    <div style={{ fontSize: '26px', fontWeight: 700, letterSpacing: '-0.03em', color: suhiStats.suhi > 0 ? '#dc2626' : '#2563eb' }}>
                      {suhiStats.suhi > 0 ? '+' : ''}{suhiStats.suhi.toFixed(2)}°C
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '2px' }}>LGA: {suhiStats.lgaLst.toFixed(1)}°C</div>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>Region: {suhiStats.regionalLst.toFixed(1)}°C</div>
                  </div>
                </div>
                <div style={{ marginTop: '10px', height: '4px', backgroundColor: '#e2e8f0', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.min(100, Math.max(0, ((suhiStats.suhi + 5) / 10) * 100))}%`, backgroundColor: suhiStats.suhi > 0 ? '#ef4444' : '#3b82f6', borderRadius: '2px', transition: 'width 0.4s ease' }} />
                </div>
              </div>
            )}
            {suhiMode !== 'none' && isSuhiError && <div style={{ fontSize: '12px', color: '#dc2626', marginBottom: '10px' }}>No MODIS data available for this selection.</div>}

            {/* Monthly SUHI chart */}
            {suhiMode !== 'none' && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#0f172a', marginBottom: '2px' }}>Seasonal SUHI Variability — {suhiYear}</div>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '10px' }}>Monthly mean SUHI intensity: daytime vs nighttime (MODIS)</div>

                {isSuhiMonthlyFetching && (
                  <div style={{ backgroundColor: '#f8fafc', border: '1px solid #f1f5f9', borderRadius: '8px', padding: '32px 16px', textAlign: 'center' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: '#64748b', fontSize: '12px', fontWeight: 500 }}>
                      <span style={{ display:'inline-block', width:'14px', height:'14px', border:'2px solid #e2e8f0', borderTopColor:'#2563eb', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
                      Computing monthly SUHI from GEE — this may take up to 60 seconds
                    </div>
                  </div>
                )}

                {isSuhiMonthlyError && !isSuhiMonthlyFetching && (
                  <div style={{ fontSize: '12px', color: '#dc2626', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '8px 12px' }}>
                    Failed to compute monthly SUHI data.
                  </div>
                )}

                {!isSuhiMonthlyFetching && !isSuhiMonthlyError && monthlyChartData.length > 0 && (
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={monthlyChartData} margin={{ top: 4, right: 44, left: -14, bottom: 0 }}>
                      <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                      <YAxis yAxisId="day" tick={{ fontSize: 10, fill: '#dc2626' }} unit="°C" axisLine={false} tickLine={false}
                        label={{ value: 'Day (°C)', angle: -90, position: 'insideLeft', fontSize: 10, fill: '#dc2626', dx: 6 }} />
                      <YAxis yAxisId="night" orientation="right" tick={{ fontSize: 10, fill: '#2563eb' }} unit="°C" axisLine={false} tickLine={false}
                        label={{ value: 'Night (°C)', angle: 90, position: 'insideRight', fontSize: 10, fill: '#2563eb', dx: -6 }} />
                      <Tooltip contentStyle={{ fontSize: '12px', borderRadius: '6px', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
                        formatter={(v: any, name: string) => [`${Number(v).toFixed(2)}°C`, name === 'day' ? 'Daytime' : 'Nighttime']} />
                      <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '11px', paddingTop: '6px' }}
                        formatter={(v) => v === 'day' ? 'Daytime' : 'Nighttime'} />
                      <Line yAxisId="day" type="monotone" dataKey="day" stroke="#dc2626" strokeWidth={2} dot={{ r: 2.5, fill: '#dc2626' }} activeDot={{ r: 4 }} connectNulls />
                      <Line yAxisId="night" type="monotone" dataKey="night" stroke="#2563eb" strokeWidth={2} dot={{ r: 2.5, fill: '#2563eb' }} activeDot={{ r: 4 }} connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            )}

            {/* LST trend */}
            {trendData.length > 0 && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#0f172a', marginBottom: '2px' }}>Temperature Trend ({timespan})</div>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '10px' }}>Mean LST per Landsat overpass — cloud cover &lt;20%</div>
                <ResponsiveContainer width="100%" height={150}>
                  <LineChart data={trendData} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#64748b' }} unit="°C" axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ fontSize: '12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}
                      formatter={(v: number) => [`${v}°C`, 'LST']} />
                    <Line type="monotone" dataKey="temp" stroke="#ef4444" strokeWidth={2} dot={{ r: 2.5, fill: '#ef4444' }} activeDot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* LST vs NDVI scatter */}
            {scatterData.length > 1 && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#0f172a', marginBottom: '2px' }}>LST vs NDVI ({timespan})</div>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '10px' }}>Each point = one satellite overpass</div>
                <ResponsiveContainer width="100%" height={170}>
                  <ScatterChart margin={{ top: 4, right: 8, left: -18, bottom: 16 }}>
                    <XAxis dataKey="lst" name="LST" unit="°C" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false}
                      label={{ value: 'LST (°C)', position: 'insideBottom', offset: -8, fontSize: 10, fill: '#64748b' }} />
                    <YAxis dataKey="ndvi" name="NDVI" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false}
                      label={{ value: 'NDVI', angle: -90, position: 'insideLeft', fontSize: 10, fill: '#64748b' }} />
                    <ZAxis range={[35, 35]} />
                    <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ fontSize: '12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}
                      content={({ payload }) => {
                        if (!payload?.length) return null
                        const d = payload[0].payload
                        return <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '7px 11px', fontSize: '12px' }}>
                          <div style={{ color: '#94a3b8', marginBottom: '3px' }}>{d.date}</div>
                          <div>LST: <strong>{d.lst}°C</strong></div>
                          <div>NDVI: <strong>{d.ndvi}</strong></div>
                        </div>
                      }} />
                    <Scatter data={scatterData} fill="#ef4444" opacity={0.75} />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Progress bars */}
            <div style={{ ...T.card }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#0f172a', marginBottom: '12px' }}>Summary</div>
              {[
                { label: 'Temperature', value: `${heatStats.avgLstCelsius.toFixed(1)}°C`, pct: Math.min(100, Math.max(0, (heatStats.avgLstCelsius / 70) * 100)), color: '#ef4444' },
                { label: 'Vegetation (NDVI)', value: heatStats.avgNdvi.toFixed(3), pct: Math.min(100, Math.max(0, ((heatStats.avgNdvi + 1) / 2) * 100)), color: '#16a34a' },
              ].map(({ label, value, pct, color }) => (
                <div key={label} style={{ marginBottom: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b', fontWeight: 500, marginBottom: '5px' }}>
                    <span>{label}</span><span style={{ color: '#0f172a', fontWeight: 600 }}>{value}</span>
                  </div>
                  <div style={{ height: '5px', backgroundColor: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, backgroundColor: color, borderRadius: '3px', transition: 'width 0.4s ease' }} />
                  </div>
                </div>
              ))}
            </div>

            {/* Saved layers */}
            <div style={T.divider} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={T.sectionLabel}>Saved Layers</span>
              <button onClick={() => setShowSaved(s => !s)} style={{ padding: '4px 10px', borderRadius: '5px', border: '1px solid #e2e8f0', fontSize: '11px', fontWeight: 500, cursor: 'pointer', backgroundColor: '#f8fafc', color: '#475569' }}>
                {showSaved ? 'Hide' : `Show (${savedLayers.length})`}
              </button>
            </div>
            {showSaved && savedLayers.length === 0 && <p style={{ fontSize: '12px', color: '#94a3b8' }}>No saved layers.</p>}
            {showSaved && savedLayers.map((layer: any) => (
              <div key={layer.id} style={{ backgroundColor: '#f8fafc', border: '1px solid #f1f5f9', borderRadius: '8px', padding: '10px 12px', marginBottom: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{layer.layer_type}</span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button onClick={() => { onTileLayerChange({ url: layer.tile_url, type: layer.layer_type, dateRangeStart: layer.date_range_start, dateRangeEnd: layer.date_range_end }); setActiveLayer(layer.layer_type) }}
                      style={{ padding: '3px 9px', borderRadius: '5px', border: 'none', fontSize: '11px', fontWeight: 600, cursor: 'pointer', backgroundColor: '#eff6ff', color: '#2563eb' }}>Load</button>
                    <button onClick={async () => { if (!confirm('Delete this layer?')) return; await fetch(`/api/lga/${lgaId}/saved-layers/${layer.id}`, { method: 'DELETE' }); refetchSaved() }}
                      style={{ padding: '3px 9px', borderRadius: '5px', border: 'none', fontSize: '11px', fontWeight: 600, cursor: 'pointer', backgroundColor: '#fef2f2', color: '#dc2626' }}>Delete</button>
                  </div>
                </div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>{layer.date_range_start} — {layer.date_range_end}</div>
                {layer.avg_lst_celsius != null && <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>LST {layer.avg_lst_celsius}°C · NDVI {layer.avg_ndvi} · UHI {layer.uhi_intensity}°C</div>}
              </div>
            ))}

            <ChatInterface lgaId={lgaId} heatStats={heatStats} />
          </>
        )}
      </div>
    </>
  )
}
