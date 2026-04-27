import { pool } from '../db/pool'
import { HeatStats, BBox, DateRange } from '../types'
import { getLgaById } from './lgaService'
import {
  computeLST,
  computeNDVI,
  computeUHI,
  computeRegionalMeanLST,
} from './earthEngineService'

export function isStale(processedAt: Date, maxAgeDays: number = 7): boolean {
  return (Date.now() - processedAt.getTime()) > maxAgeDays * 86400000
}

export function defaultDateRange(): DateRange {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 90)

  const fmt = (d: Date): string => d.toISOString().slice(0, 10)
  return { start: fmt(start), end: fmt(end) }
}

function mapRowToHeatStats(row: Record<string, unknown>): HeatStats {
  return {
    lgaId: row.lga_id as string,
    lgaName: row.lga_name as string,
    avgLstCelsius: parseFloat(row.avg_lst_celsius as string),
    avgNdvi: parseFloat(row.avg_ndvi as string),
    uhiIntensity: parseFloat(row.uhi_intensity as string),
    dataSource: row.data_source as string,
    dateRangeStart: (row.date_range_start as Date).toISOString().slice(0, 10),
    dateRangeEnd: (row.date_range_end as Date).toISOString().slice(0, 10),
    processedAt: (row.processed_at as Date).toISOString(),
  }
}

export async function computeAndStore(lgaId: string, bbox: BBox): Promise<HeatStats> {
  const dateRange = defaultDateRange()

  const [lgaLST, regionalMeanLST, ndvi] = await Promise.all([
    computeLST(bbox, dateRange),
    computeRegionalMeanLST(dateRange),
    computeNDVI(bbox, dateRange),
  ])

  const uhi = computeUHI(lgaLST, regionalMeanLST)

  const lgaResult = await pool.query(
    `SELECT lga_name FROM lgas WHERE lga_id = $1`,
    [lgaId]
  )
  const lgaName: string = lgaResult.rows[0]?.lga_name ?? lgaId

  await pool.query(
    `INSERT INTO heat_stats
       (lga_id, avg_lst_celsius, avg_ndvi, uhi_intensity, data_source,
        date_range_start, date_range_end, processed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (lga_id) DO UPDATE SET
       avg_lst_celsius  = EXCLUDED.avg_lst_celsius,
       avg_ndvi         = EXCLUDED.avg_ndvi,
       uhi_intensity    = EXCLUDED.uhi_intensity,
       data_source      = EXCLUDED.data_source,
       date_range_start = EXCLUDED.date_range_start,
       date_range_end   = EXCLUDED.date_range_end,
       processed_at     = NOW()`,
    [lgaId, lgaLST, ndvi, uhi, 'landsat9', dateRange.start, dateRange.end]
  )

  return {
    lgaId,
    lgaName,
    avgLstCelsius: lgaLST,
    avgNdvi: ndvi,
    uhiIntensity: uhi,
    dataSource: 'landsat9',
    dateRangeStart: dateRange.start,
    dateRangeEnd: dateRange.end,
    processedAt: new Date().toISOString(),
  }
}

export async function getHeatStatsForRange(
  lgaId: string,
  dateRange: DateRange
): Promise<HeatStats> {
  const lga = await getLgaById(lgaId)
  if (!lga) {
    const err = new Error(`LGA not found: ${lgaId}`) as any
    err.status = 404
    throw err
  }

  const [lgaLST, regionalMeanLST, ndvi] = await Promise.all([
    computeLST(lga.bbox, dateRange),
    computeRegionalMeanLST(dateRange),
    computeNDVI(lga.bbox, dateRange),
  ])

  const uhi = computeUHI(lgaLST, regionalMeanLST)

  const lgaResult = await pool.query(
    `SELECT lga_name FROM lgas WHERE lga_id = $1`,
    [lgaId]
  )
  const lgaName: string = lgaResult.rows[0]?.lga_name ?? lgaId

  return {
    lgaId,
    lgaName,
    avgLstCelsius: lgaLST,
    avgNdvi: ndvi,
    uhiIntensity: uhi,
    dataSource: 'landsat9',
    dateRangeStart: dateRange.start,
    dateRangeEnd: dateRange.end,
    processedAt: new Date().toISOString(),
  }
}

export async function getHeatStats(
  lgaId: string
): Promise<HeatStats & { stale?: boolean }> {
  // Check cache
  const cacheResult = await pool.query(
    `SELECT hs.*, l.lga_name
     FROM heat_stats hs
     JOIN lgas l ON l.lga_id = hs.lga_id
     WHERE hs.lga_id = $1`,
    [lgaId]
  )

  const cached = cacheResult.rows[0] ?? null

  if (cached && !isStale(new Date(cached.processed_at))) {
    return mapRowToHeatStats(cached)
  }

  // Need to recompute — first verify LGA exists
  const lga = await getLgaById(lgaId)
  if (!lga) {
    const err = new Error(`LGA not found: ${lgaId}`) as any
    err.status = 404
    throw err
  }

  try {
    const fresh = await computeAndStore(lgaId, lga.bbox)
    return fresh
  } catch (eeErr) {
  console.error("Earth Engine computation error:", eeErr)
    // EE unavailable — return stale cache if available
    if (cached) {
      return { ...mapRowToHeatStats(cached), stale: true }
    }
    // No cache and EE unavailable
    const err = new Error('Earth Engine unavailable and no cached data') as any
    err.status = 503
    throw err
  }
}
