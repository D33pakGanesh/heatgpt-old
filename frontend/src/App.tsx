import { useState, useCallback, useRef } from 'react'
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import L from 'leaflet'
import MapView from './components/MapView'
import SidePanel from './components/SidePanel'
import SymbologyPanel, { SymbologySettings } from './components/SymbologyPanel'
import MapControls from './components/MapControls'

const queryClient = new QueryClient()

type TileLayer = {
  url: string
  type: 'lst' | 'ndvi'
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

function AppInner() {
  const qc = useQueryClient()
  const [selectedLgaId, setSelectedLgaId] = useState<string | null>(null)
  const [panelCollapsed, setPanelCollapsed] = useState(true)
  const [activeTileLayer, setActiveTileLayer] = useState<TileLayer | null>(null)
  const [symbology, setSymbology] = useState<SymbologySettings>(DEFAULT_SYMBOLOGY)
  const mapRef = useRef<L.Map | null>(null)

  // Panel is "open" (shifts other controls) when an LGA is selected AND panel is expanded
  const panelOpen = selectedLgaId !== null && !panelCollapsed

  const handleLgaSelect = useCallback((id: string) => {
    setSelectedLgaId(id)
    setActiveTileLayer(null)
    const cached = qc.getQueryData<GeoJSON.FeatureCollection>(['lgas'])
    const feature = cached?.features.find(f => f.properties?.lga_id === id)
    ;(window as any).__selectedLgaGeometry = feature?.geometry ?? null

    // Zoom to the selected LGA's bounds
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
    // Zoom to the tile layer bbox when a satellite layer is activated
    if (layer.bbox && mapRef.current) {
      const { west, south, east, north } = layer.bbox
      mapRef.current.fitBounds([[south, west], [north, east]], { padding: [40, 40], maxZoom: 13 })
    }
  }, [])

  return (
    <>
      <MapView
        onLgaSelect={handleLgaSelect}
        activeTileLayer={activeTileLayer}
        symbology={symbology}
        mapRefCallback={(map) => { mapRef.current = map }}
      />
      <MapControls
        mapRef={mapRef}
        activeTileLayer={activeTileLayer}
        sidePanelOpen={panelOpen}
      />
      <SymbologyPanel settings={symbology} onChange={setSymbology} />
      <SidePanel
        lgaId={selectedLgaId}
        onCollapse={setPanelCollapsed}
        onTileLayerChange={handleTileLayerChange}
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
