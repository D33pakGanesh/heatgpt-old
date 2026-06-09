import 'leaflet/dist/leaflet.css'
import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import L from 'leaflet'
import type { SymbologySettings, BasemapType } from './SymbologyPanel'

interface MapViewProps {
  onLgaSelect: (lgaId: string) => void
  activeTileLayer?: {
    url: string
    type: 'lst' | 'ndvi' | 'suhi'
    bbox?: { west: number; south: number; east: number; north: number }
    lgaGeometry?: GeoJSON.Geometry | null
  } | null
  symbology?: SymbologySettings
  basemap?: BasemapType
  mapRefCallback?: (map: L.Map) => void
}

export default function MapView({ onLgaSelect, activeTileLayer, symbology, basemap = 'map', mapRefCallback }: MapViewProps) {
  const mapRef = useRef<L.Map | null>(null)
  const mapInitialised = useRef(false)
  const geeLayerRef = useRef<any>(null)
  const lgaLayerRef = useRef<L.GeoJSON | null>(null)
  const basemapLayerRef = useRef<L.TileLayer | null>(null)

  const { data, isError } = useQuery<GeoJSON.FeatureCollection>({
    queryKey: ['lgas'],
    queryFn: () => fetch('/api/lgas').then(res => {
      if (!res.ok) throw new Error('Failed to fetch LGA boundaries')
      return res.json()
    }),
  })

  useEffect(() => {
    if (mapInitialised.current) return
    mapInitialised.current = true
    mapRef.current = L.map('map').fitBounds([[-38.5, 144.4], [-37.4, 145.8]])
    basemapLayerRef.current = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    })
    basemapLayerRef.current.addTo(mapRef.current)
    if (mapRefCallback) mapRefCallback(mapRef.current)
  }, [])

  useEffect(() => {
    if (!data || !mapRef.current) return
    lgaLayerRef.current = L.geoJSON(data, {
      style: feature => ({
        fillColor: symbology?.solidColor ?? '#3b82f6',
        fillOpacity: symbology?.fillOpacity ?? 0.7,
        weight: symbology?.strokeWeight ?? 1,
        color: symbology?.strokeColor ?? '#666',
      }),
      onEachFeature: (feature, layer) => {
        layer.on('click', () => onLgaSelect(feature.properties.lga_id))
      },
    }).addTo(mapRef.current)
  }, [data, onLgaSelect])

  // Re-apply symbology when settings change
  useEffect(() => {
    if (!lgaLayerRef.current || !symbology) return
    lgaLayerRef.current.eachLayer((layer: any) => {
      layer.setStyle({
        fillColor: symbology.solidColor,
        fillOpacity: activeTileLayer ? 0.05 : symbology.fillOpacity,
        weight: activeTileLayer ? 0.3 : symbology.strokeWeight,
        color: symbology.strokeColor,
      })
    })
  }, [symbology, activeTileLayer])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (geeLayerRef.current) {
      geeLayerRef.current.remove()
      geeLayerRef.current = null
    }

    if (!activeTileLayer?.bbox) return

    const { url, bbox, lgaGeometry } = activeTileLayer

    if (lgaGeometry) {
      const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      svgEl.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:500;'

      const updateSvg = () => {
        const size = map.getSize()
        svgEl.setAttribute('width', String(size.x))
        svgEl.setAttribute('height', String(size.y))

        const clipId = 'lga-clip'
        const coordsToD = (coords: number[][]): string =>
          coords.map((c, i) => {
            const pt = map.latLngToContainerPoint(L.latLng(c[1], c[0]))
            return `${i === 0 ? 'M' : 'L'}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`
          }).join(' ') + ' Z'

        let pathD = ''
        if (lgaGeometry.type === 'Polygon') {
          ;(lgaGeometry as GeoJSON.Polygon).coordinates.forEach(ring => { pathD += coordsToD(ring) + ' ' })
        } else if (lgaGeometry.type === 'MultiPolygon') {
          ;(lgaGeometry as GeoJSON.MultiPolygon).coordinates.forEach(poly =>
            poly.forEach(ring => { pathD += coordsToD(ring) + ' ' })
          )
        }

        const imgBounds = L.latLngBounds([[bbox.south, bbox.west], [bbox.north, bbox.east]])
        const tl = map.latLngToContainerPoint(imgBounds.getNorthWest())
        const br = map.latLngToContainerPoint(imgBounds.getSouthEast())

        svgEl.innerHTML = `
          <defs>
            <clipPath id="${clipId}">
              <path d="${pathD}" fill-rule="evenodd"/>
            </clipPath>
          </defs>
          <image
            href="${url}"
            x="${tl.x}" y="${tl.y}"
            width="${br.x - tl.x}" height="${br.y - tl.y}"
            clip-path="url(#${clipId})"
            opacity="0.85"
            preserveAspectRatio="none"
          />
        `
      }

      updateSvg()
      map.on('move zoom moveend zoomend', updateSvg)
      map.getContainer().appendChild(svgEl)

      geeLayerRef.current = {
        remove: () => {
          svgEl.remove()
          map.off('move zoom moveend zoomend', updateSvg)
        }
      }
    } else {
      const bounds: L.LatLngBoundsExpression = [[bbox.south, bbox.west], [bbox.north, bbox.east]]
      const overlay = L.imageOverlay(url, bounds, { opacity: 0.85, zIndex: 500 })
      overlay.addTo(map)
      overlay.bringToFront()
      geeLayerRef.current = overlay
    }
  }, [activeTileLayer])


  // Swap basemap tiles when basemap prop changes
  const TILE_URLS: Record<BasemapType, { url: string; attribution: string; maxZoom?: number }> = {
    map: {
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '© OpenStreetMap contributors',
    },
    satellite: {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attribution: '© Esri, Maxar, Earthstar Geographics',
      maxZoom: 19,
    },
    hybrid: {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attribution: '© Esri, Maxar, Earthstar Geographics',
      maxZoom: 19,
    },
  }

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (basemapLayerRef.current) {
      basemapLayerRef.current.remove()
    }
    const cfg = TILE_URLS[basemap]
    basemapLayerRef.current = L.tileLayer(cfg.url, {
      attribution: cfg.attribution,
      maxZoom: cfg.maxZoom ?? 18,
    })
    basemapLayerRef.current.addTo(map)
    basemapLayerRef.current.bringToBack()

    // For hybrid: add a labels overlay on top
    if (basemap === 'hybrid') {
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        opacity: 0.4,
        attribution: '',
      }).addTo(map)
    }
  }, [basemap])

  if (isError) return <div>Failed to load LGA boundaries.</div>
  return <div id="map" style={{ height: '100%', width: '100%' }} />
}
