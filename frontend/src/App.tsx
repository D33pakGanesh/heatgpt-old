import { useState, useCallback, useRef } from 'react'
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import L from 'leaflet'
import MapView from './components/MapView'
import SidePanel from './components/SidePanel'
import SymbologyPanel, { SymbologySettings, BasemapType } from './components/SymbologyPanel'
import MapControls from './components/MapControls'

const queryClient = new QueryClient()

type TileLayer = {
  url: string
  type: 'lst' | 'ndvi' | 'suhi'
  bbox?: { west: number; south: number; east: number; north: number }
  lgaGeometry?: GeoJSON.Geometry | null
  dateRangeStart?: string
  dateRangeEnd?: string
}

const DEFAULT_SYMBOLOGY: SymbologySettings = {
  fillOpacity: 0.7,
  strokeColor: '#666666',
  strokeWeight: 1,
  solidColor: '#3b82f6',
}

const HEADER_HEIGHT = 52

function Header({ hasSelection }: { hasSelection: boolean }) {
  return (
    <header style={{
      position: 'fixed', top: 0, left: 0, right: 0, height: `${HEADER_HEIGHT}px`,
      backgroundColor: '#0f172a', zIndex: 5000,
      display: 'flex', alignItems: 'center', padding: '0 20px',
      borderBottom: '1px solid rgba(255,255,255,0.07)',
    }}>
      <span style={{
        fontSize: '15px', fontWeight: 700, color: '#f1f5f9',
        letterSpacing: '-0.02em', fontFamily: 'Inter, sans-serif',
      }}>
        HeatGPT
      </span>
      <span style={{
        fontSize: '13px', color: '#475569', marginLeft: '12px',
        fontWeight: 400, fontFamily: 'Inter, sans-serif',
      }}>
        {hasSelection ? 'Urban Heat Island Explorer' : 'Click an LGA polygon to get started'}
      </span>

      <span style={{
        marginLeft: 'auto',
        fontSize: '12px', color: '#334155', fontWeight: 500,
        fontFamily: 'Inter, sans-serif', letterSpacing: '0.01em',
      }}>
        by Deepak S · 4053309
      </span>
    </header>
  )
}

function AppInner() {
  const qc = useQueryClient()
  const [selectedLgaId, setSelectedLgaId] = useState<string | null>(null)
  const [panelCollapsed, setPanelCollapsed] = useState(true)
  const [activeTileLayer, setActiveTileLayer] = useState<TileLayer | null>(null)
  const [symbology, setSymbology] = useState<SymbologySettings>(DEFAULT_SYMBOLOGY)
  const [basemap, setBasemap] = useState<BasemapType>('map')
  const mapRef = useRef<L.Map | null>(null)

  const panelOpen = selectedLgaId !== null && !panelCollapsed

  const handleLgaSelect = useCallback((id: string) => {
    setSelectedLgaId(id)
    setActiveTileLayer(null)
    const cached = qc.getQueryData<GeoJSON.FeatureCollection>(['lgas'])
    const feature = cached?.features.find(f => f.properties?.lga_id === id)
    ;(window as any).__selectedLgaGeometry = feature?.geometry ?? null
    if (feature?.geometry && mapRef.current) {
      const layer = L.geoJSON(feature as GeoJSON.Feature)
      mapRef.current.fitBounds(layer.getBounds(), { padding: [40, 40], maxZoom: 13 })
    }
  }, [qc])

  const handleTileLayerChange = useCallback((layer: Omit<TileLayer, 'lgaGeometry'> | null) => {
    if (!layer) { setActiveTileLayer(null); return }
    setActiveTileLayer({
      ...layer,
      lgaGeometry: (window as any).__selectedLgaGeometry ?? null,
    })
    if (layer.bbox && mapRef.current) {
      const { west, south, east, north } = layer.bbox
      mapRef.current.fitBounds([[south, west], [north, east]], { padding: [40, 40], maxZoom: 13 })
    }
  }, [])

  return (
    <>
      <Header hasSelection={selectedLgaId !== null} />

      {/* Map pushed down by header height */}
      <div style={{ position: 'fixed', top: `${HEADER_HEIGHT}px`, left: 0, right: 0, bottom: 0 }}>
        <MapView
          onLgaSelect={handleLgaSelect}
          activeTileLayer={activeTileLayer}
          symbology={symbology}
          basemap={basemap}
          mapRefCallback={(map) => { mapRef.current = map }}
        />
      </div>

      <MapControls
        mapRef={mapRef}
        activeTileLayer={activeTileLayer}
        sidePanelOpen={panelOpen}
        headerHeight={HEADER_HEIGHT}
      />
      <SymbologyPanel
        settings={symbology}
        onChange={setSymbology}
        basemap={basemap}
        onBasemapChange={setBasemap}
        headerHeight={HEADER_HEIGHT}
      />
      <SidePanel
        lgaId={selectedLgaId}
        onCollapse={setPanelCollapsed}
        onTileLayerChange={handleTileLayerChange}
        headerHeight={HEADER_HEIGHT}
      />
    </>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppInner />
    </QueryClientProvider>
  )
}
