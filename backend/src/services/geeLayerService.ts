import { pool } from '../db/pool'
import { BBox, DateRange } from '../types'
import { getLgaById } from './lgaService'
import {
  getMapTileUrl,
  computeLST,
  computeNDVI,
  computeUHI,
  computeRegionalMeanLST,
} from './earthEngineService'

export interface GeeLayerRecord {
  id: number
  lgaId: string
  layerType: 'lst' | 'ndvi'
  dateRangeStart: string
  dateRangeEnd: string
  tileUrl: string
  eeUrl: string | null
  bbox: BBox
  avgLstCelsius: number | null
  avgNdvi: number | null
  uhiIntensity: number | null
  exportedAt: string
}

function mapRowToGeeLayerRecord(row: Record<string, unknown>): GeeLayerRecord {
  return {
    id: row.id as number,
    lgaId: row.lga_id as string,
    layerType: row.layer_type as 'lst' | 'ndvi',
    dateRangeStart: (row.date_range_start as Date).toISOString().slice(0, 10),
    dateRangeEnd: (row.date_range_end as Date).toISOString().slice(0, 10),
    tileUrl: row.tile_url as string,
    eeUrl: (row.ee_url as string | null),
    bbox: row.bbox as BBox,
    avgLstCelsius: row.avg_lst_celsius ? parseFloat(row.avg_lst_celsius as string) : null,
    avgNdvi: row.avg_ndvi ? parseFloat(row.avg_ndvi as string) : null,
    uhiIntensity: row.uhi_intensity ? parseFloat(row.uhi_intensity as string) : null,
    exportedAt: (row.exported_at as Date).toISOString(),
  }
}

export async function getGeeLayer(
  lgaId: string,
  layerType: 'lst' | 'ndvi',
  dateRange: DateRange
): Promise<GeeLayerRecord> {
  // Check cache first
  const cacheResult = await pool.query(
    `SELECT gl.*, l.bbox
     FROM gee_layers gl
     JOIN lgas l ON l.lga_id = gl.lga_id
     WHERE gl.lga_id = $1 AND gl.layer_type = $2
       AND gl.date_range_start = $3 AND gl.date_range_end = $4`,
    [lgaId, layerType, dateRange.start, dateRange.end]
  )

  const cached = cacheResult.rows[0] ?? null

  if (cached) {
    return mapRowToGeeLayerRecord(cached)
  }

  // Cache miss — verify LGA exists
  const lga = await getLgaById(lgaId)
  if (!lga) {
    const err = new Error(`LGA not found: ${lgaId}`) as any
    err.status = 404
    throw err
  }

  // Compute and store
  const geeLayer = await computeAndStoreGeeLayer(lgaId, layerType, lga.bbox, dateRange)
  return geeLayer
}

export async function computeAndStoreGeeLayer(
  lgaId: string,
  layerType: 'lst' | 'ndvi',
  bbox: BBox,
  dateRange: DateRange
): Promise<GeeLayerRecord> {
  // Fetch tile URL from Earth Engine
  const eeUrl = await getMapTileUrl(layerType, bbox, dateRange)

  // Build proxied tile URL
  const tileUrl = `/api/lga/${lgaId}/tile-image?type=${layerType}&start=${dateRange.start}&end=${dateRange.end}`

  // Compute metrics (optional)
  let avgLstCelsius: number | null = null
  let avgNdvi: number | null = null
  let uhiIntensity: number | null = null

  if (layerType === 'lst') {
    avgLstCelsius = await computeLST(bbox, dateRange)
    const regionalMeanLST = await computeRegionalMeanLST(dateRange)
    uhiIntensity = computeUHI(avgLstCelsius, regionalMeanLST)
  } else if (layerType === 'ndvi') {
    avgNdvi = await computeNDVI(bbox, dateRange)
  }

  // Insert into database
  await pool.query(
    `INSERT INTO gee_layers
       (lga_id, layer_type, date_range_start, date_range_end, tile_url, ee_url,
        avg_lst_celsius, avg_ndvi, uhi_intensity)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [lgaId, layerType, dateRange.start, dateRange.end, tileUrl, eeUrl,
     avgLstCelsius, avgNdvi, uhiIntensity]
  )

  return {
    id: 0, // Will be assigned by database
    lgaId,
    layerType,
    dateRangeStart: dateRange.start,
    dateRangeEnd: dateRange.end,
    tileUrl,
    eeUrl,
    bbox,
    avgLstCelsius,
    avgNdvi,
    uhiIntensity,
    exportedAt: new Date().toISOString(),
  }
}
