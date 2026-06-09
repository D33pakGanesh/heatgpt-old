import { Router, Request, Response } from 'express'
import axios from 'axios'
import { pool } from '../db/pool'
import { getAllLgas, getLgaById } from '../services/lgaService'
import { getHeatStats, getHeatStatsForRange } from '../services/heatService'
import { getAccessToken, computeLSTTrend, computeNDVITrend } from '../services/earthEngineService'
import { getGeeLayer } from '../services/geeLayerService'
import { DateRange } from '../types'

const router = Router()

// Cache EE tile URLs to avoid recomputing on every image request
const tileUrlCache = new Map<string, { url: string; expires: number }>()

router.get('/lgas', async (req: Request, res: Response) => {
  try {
    const featureCollection = await getAllLgas()
    console.log(`  [LGAs] Returned ${featureCollection.features?.length ?? 0} boundaries`)
    res.status(200).json(featureCollection)
  } catch (err) {
    console.error('GET /lgas error:', err)
    res.status(500).json({ error: 'Failed to retrieve LGA boundaries' })
  }
})

router.get('/lga/:id/tiles', async (req: Request, res: Response) => {
  const { type, start, end } = req.query as { type?: string; start?: string; end?: string }

  if (!type || (type !== 'lst' && type !== 'ndvi')) {
    return res.status(400).json({ error: 'type must be "lst" or "ndvi"' })
  }

  try {
    const dateRange: DateRange = {
      start: start ?? new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      end: end ?? new Date().toISOString().slice(0, 10),
    }

    console.log(`  [Tiles] Requesting ${type.toUpperCase()} tile for LGA ${req.params.id} (${dateRange.start} → ${dateRange.end})`)
    // Use DB-first caching pattern via geeLayerService
    const geeLayer = await getGeeLayer(req.params.id, type as 'lst' | 'ndvi', dateRange)

    // Cache the EE URL for tile-image proxy endpoint
    const cacheKey = `${req.params.id}-${type}-${dateRange.start}-${dateRange.end}`
    if (geeLayer.eeUrl) {
      tileUrlCache.set(cacheKey, { url: geeLayer.eeUrl, expires: Date.now() + 55 * 60 * 1000 })
    }

    res.status(200).json({
      tileUrl: geeLayer.tileUrl,
      bbox: geeLayer.bbox,
    })
  } catch (err: any) {
    console.error('GET /lga/:id/tiles error:', err.message)
    if (err.status === 404) {
      return res.status(404).json({ error: err.message })
    }
    if (err.message?.includes('No Landsat imagery') || err.message?.includes('No imagery')) {
      return res.status(422).json({ error: err.message })
    }
    res.status(503).json({ error: 'Earth Engine service unavailable' })
  }
})

// Per-pass LST trend for the given date range
router.get('/lga/:id/lst-trend', async (req: Request, res: Response) => {
  const { start, end } = req.query as { start?: string; end?: string }
  if (!start || !end) return res.status(400).json({ error: 'start and end required' })

  try {
    const lga = await getLgaById(req.params.id)
    if (!lga) return res.status(404).json({ error: 'LGA not found' })

    const trend = await computeLSTTrend(lga.bbox, { start, end })
    res.status(200).json({ trend })
  } catch (err: any) {
    console.error('GET /lga/:id/lst-trend error:', err.message)
    res.status(503).json({ error: 'Earth Engine service unavailable' })
  }
})

// Per-pass NDVI trend for the given date range
router.get('/lga/:id/ndvi-trend', async (req: Request, res: Response) => {
  const { start, end } = req.query as { start?: string; end?: string }
  if (!start || !end) return res.status(400).json({ error: 'start and end required' })

  try {
    const lga = await getLgaById(req.params.id)
    if (!lga) return res.status(404).json({ error: 'LGA not found' })

    const trend = await computeNDVITrend(lga.bbox, { start, end })
    res.status(200).json({ trend })
  } catch (err: any) {
    console.error('GET /lga/:id/ndvi-trend error:', err.message)
    res.status(503).json({ error: 'Earth Engine service unavailable' })
  }
})

// Proxy endpoint — fetches the EE image with auth and streams it to the browser
router.get('/lga/:id/tile-image', async (req: Request, res: Response) => {
  const { type, start, end } = req.query as { type?: string; start?: string; end?: string }
  if (!type || !start || !end) return res.status(400).send('Missing params')

  const cacheKey = `${req.params.id}-${type}-${start}-${end}`
  const cached = tileUrlCache.get(cacheKey)

  if (!cached || cached.expires <= Date.now()) {
    return res.status(404).send('Tile not ready — request /tiles first')
  }

  try {
    const { token } = await getAccessToken()
    const imageRes = await axios.get(cached.url, {
      headers: { Authorization: `Bearer ${token}` },
      responseType: 'arraybuffer',
    })
    res.set('Content-Type', 'image/png')
    res.set('Cache-Control', 'public, max-age=3600')
    res.send(imageRes.data)
  } catch (err: any) {
    console.error('Tile proxy error:', err.message)
    res.status(502).send('Failed to fetch tile from Earth Engine')
  }
})

router.get('/lga/:id/heat', async (req: Request, res: Response) => {
  try {
    const { start, end } = req.query as { start?: string; end?: string }

    let stats
    if (start && end) {
      const dateRange: DateRange = { start, end }
      stats = await getHeatStatsForRange(req.params.id, dateRange)
    } else {
      stats = await getHeatStats(req.params.id)
    }

    res.status(200).json(stats)
  } catch (err: any) {
    console.error('GET /lga/:id/heat error:', err)
    if (err.status === 404) {
      return res.status(404).json({ error: err.message })
    }
    if (err.status === 503) {
      return res.status(503).json({ error: err.message })
    }
    if (err.message?.includes('No Landsat imagery')) {
      return res.status(422).json({ error: err.message })
    }
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Export current heat stats + active tile layer to PostGIS
// DEPRECATED: This endpoint is no longer needed as layers are auto-saved
// Kept for backward compatibility but will be removed in future versions
router.post('/lga/:id/export', async (req: Request, res: Response) => {
  res.status(410).json({ 
    error: 'This endpoint is deprecated. Layers are now automatically saved to the database.',
    message: 'No action needed - your data is already persisted.'
  })
})

// Get saved GEE layers for an LGA from PostGIS
router.get('/lga/:id/saved-layers', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT id, layer_type, date_range_start, date_range_end, tile_url,
              avg_lst_celsius, avg_ndvi, uhi_intensity, exported_at
       FROM gee_layers
       WHERE lga_id = $1
       ORDER BY exported_at DESC`,
      [req.params.id]
    )
    res.status(200).json({ layers: result.rows })
  } catch (err: any) {
    console.error('GET /lga/:id/saved-layers error:', err.message)
    res.status(500).json({ error: 'Failed to fetch saved layers' })
  }
})

// Delete a saved GEE layer by ID
router.delete('/lga/:id/saved-layers/:layerId', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      'DELETE FROM gee_layers WHERE id = $1 AND lga_id = $2 RETURNING id',
      [req.params.layerId, req.params.id]
    )
    if (result.rowCount === 0) return res.status(404).json({ error: 'Layer not found' })
    res.status(200).json({ message: 'Deleted' })
  } catch (err: any) {
    console.error('DELETE /lga/:id/saved-layers/:layerId error:', err.message)
    res.status(500).json({ error: 'Failed to delete layer' })
  }
})

export default router

// ─── SUHI routes ─────────────────────────────────────────────────────────────
import { computeSUHI, computeSUHIMonthly, getSUHITileUrl } from '../services/earthEngineService'

const VALID_SUHI_MODES = ['annual_day','annual_night','summer_day','summer_night','winter_day','winter_night'] as const
type SuhiMode = typeof VALID_SUHI_MODES[number]

// Tile URL in-memory cache (EE URLs expire ~1h, keep 55 min)
const suhiTileCache = new Map<string, { url: string; ts: number }>()
const SUHI_TILE_TTL = 55 * 60 * 1000

router.get('/lga/:id/suhi', async (req: Request, res: Response) => {
  const { mode, year } = req.query as { mode?: string; year?: string }

  if (!mode || !VALID_SUHI_MODES.includes(mode as SuhiMode)) {
    return res.status(400).json({ error: `mode must be one of: ${VALID_SUHI_MODES.join(', ')}` })
  }
  const yr = year ? parseInt(year) : new Date().getFullYear() - 1
  if (isNaN(yr) || yr < 2000 || yr > new Date().getFullYear()) {
    return res.status(400).json({ error: 'Invalid year' })
  }

  // Check PostGIS cache first
  try {
    const dbCached = await pool.query(
      `SELECT lga_lst, regional_lst, suhi FROM suhi_stats_cache WHERE lga_id=$1 AND mode=$2 AND year=$3`,
      [req.params.id, mode, yr]
    )
    if (dbCached.rows.length > 0) {
      const r = dbCached.rows[0]
      const lga = await getLgaById(req.params.id)
      console.log(`  [SUHI] Cache hit for ${req.params.id} mode=${mode} year=${yr}`)
      return res.status(200).json({
        lgaId: req.params.id, lgaName: lga?.lgaName ?? req.params.id,
        mode, year: yr,
        lgaLst: parseFloat(r.lga_lst), regionalLst: parseFloat(r.regional_lst), suhi: parseFloat(r.suhi),
      })
    }
  } catch (_) {}

  try {
    const lga = await getLgaById(req.params.id)
    if (!lga) return res.status(404).json({ error: 'LGA not found' })

    console.log(`  [SUHI] Computing from GEE for ${lga.lgaName} mode=${mode} year=${yr}...`)
    const result = await computeSUHI(lga.bbox, yr, mode as SuhiMode)
    console.log(`  [SUHI] Done — SUHI=${result.suhi.toFixed(2)}°C (LGA=${result.lgaLst.toFixed(1)}°C ref=${result.regionalLst.toFixed(1)}°C)`)
    // Persist to DB
    await pool.query(
      `INSERT INTO suhi_stats_cache (lga_id, mode, year, lga_lst, regional_lst, suhi, computed_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW())
       ON CONFLICT (lga_id, mode, year) DO UPDATE SET
         lga_lst=EXCLUDED.lga_lst, regional_lst=EXCLUDED.regional_lst,
         suhi=EXCLUDED.suhi, computed_at=NOW()`,
      [req.params.id, mode, yr, result.lgaLst, result.regionalLst, result.suhi]
    )
    const data = { lgaId: req.params.id, lgaName: lga.lgaName, mode, year: yr, ...result }
    return res.status(200).json(data)
  } catch (err: any) {
    console.error('GET /lga/:id/suhi error:', err.message)
    if (err.message?.includes('No MODIS')) return res.status(422).json({ error: err.message })
    return res.status(503).json({ error: 'Earth Engine unavailable' })
  }
})

router.get('/lga/:id/suhi-tiles', async (req: Request, res: Response) => {
  const { mode, year } = req.query as { mode?: string; year?: string }

  if (!mode || !VALID_SUHI_MODES.includes(mode as SuhiMode)) {
    return res.status(400).json({ error: `mode must be one of: ${VALID_SUHI_MODES.join(', ')}` })
  }
  const yr = year ? parseInt(year) : new Date().getFullYear() - 1
  if (isNaN(yr) || yr < 2000 || yr > new Date().getFullYear()) {
    return res.status(400).json({ error: 'Invalid year' })
  }

  const cacheKey = `${req.params.id}-${mode}-${yr}`
  const cached = suhiTileCache.get(cacheKey)
  if (cached && Date.now() - cached.ts < SUHI_TILE_TTL) {
    const tileUrl = `/api/lga/${req.params.id}/suhi-tile-image?mode=${mode}&year=${yr}`
    return res.status(200).json({ tileUrl, eeUrl: cached.url })
  }

  try {
    const lga = await getLgaById(req.params.id)
    if (!lga) return res.status(404).json({ error: 'LGA not found' })

    const eeUrl = await getSUHITileUrl(lga.bbox, yr, mode as SuhiMode)
    suhiTileCache.set(cacheKey, { url: eeUrl, ts: Date.now() })
    const tileUrl = `/api/lga/${req.params.id}/suhi-tile-image?mode=${mode}&year=${yr}`
    return res.status(200).json({ tileUrl, eeUrl, bbox: lga.bbox })
  } catch (err: any) {
    console.error('GET /lga/:id/suhi-tiles error:', err.message)
    if (err.message?.includes('No MODIS')) return res.status(422).json({ error: err.message })
    return res.status(503).json({ error: 'Earth Engine unavailable' })
  }
})

// Proxy SUHI tile image (same pattern as existing tile-image endpoint)
router.get('/lga/:id/suhi-tile-image', async (req: Request, res: Response) => {
  const { mode, year } = req.query as { mode?: string; year?: string }
  if (!mode || !year) return res.status(400).send('Missing params')

  const cacheKey = `${req.params.id}-${mode}-${year}`
  const cached = suhiTileCache.get(cacheKey)
  if (!cached || Date.now() - cached.ts >= SUHI_TILE_TTL) {
    return res.status(404).send('Tile not ready — request /suhi-tiles first')
  }

  try {
    const { token } = await getAccessToken()
    const imageRes = await axios.get(cached.url, {
      headers: { Authorization: `Bearer ${token}` },
      responseType: 'arraybuffer',
    })
    res.set('Content-Type', 'image/png')
    res.set('Cache-Control', 'public, max-age=86400')
    res.send(imageRes.data)
  } catch (err: any) {
    console.error('SUHI tile proxy error:', err.message)
    res.status(502).send('Failed to fetch SUHI tile from Earth Engine')
  }
})

router.get('/lga/:id/suhi-monthly', async (req: Request, res: Response) => {
  const { year } = req.query as { year?: string }
  const yr = year ? parseInt(year) : new Date().getFullYear() - 1
  if (isNaN(yr) || yr < 2000 || yr > new Date().getFullYear()) {
    return res.status(400).json({ error: 'Invalid year' })
  }

  // Check PostGIS cache — if all 12 months present, return immediately
  try {
    const dbCached = await pool.query(
      `SELECT month, day_suhi, night_suhi FROM suhi_monthly_cache
       WHERE lga_id=$1 AND year=$2 ORDER BY month`,
      [req.params.id, yr]
    )
    if (dbCached.rows.length === 12) {
      console.log(`  [SUHI-Monthly] Cache hit for ${req.params.id} year=${yr}`)
      const monthly = dbCached.rows.map((r: any) => ({
        month: r.month,
        day:   r.day_suhi   != null ? parseFloat(r.day_suhi)   : null,
        night: r.night_suhi != null ? parseFloat(r.night_suhi) : null,
      }))
      return res.status(200).json({ lgaId: req.params.id, year: yr, monthly })
    }
  } catch (_) {}

  try {
    const lga = await getLgaById(req.params.id)
    if (!lga) return res.status(404).json({ error: 'LGA not found' })

    console.log(`  [SUHI-Monthly] Computing 12 months from GEE for ${lga.lgaName} year=${yr}...`)
    const monthly = await computeSUHIMonthly(lga.bbox, yr)
    console.log(`  [SUHI-Monthly] Done — ${monthly.filter(m => m.day !== null).length}/12 months with data`)

    // Persist each month to DB
    for (const m of monthly) {
      await pool.query(
        `INSERT INTO suhi_monthly_cache (lga_id, year, month, day_suhi, night_suhi, computed_at)
         VALUES ($1,$2,$3,$4,$5,NOW())
         ON CONFLICT (lga_id, year, month) DO UPDATE SET
           day_suhi=EXCLUDED.day_suhi, night_suhi=EXCLUDED.night_suhi, computed_at=NOW()`,
        [req.params.id, yr, m.month, m.day, m.night]
      )
    }

    const data = { lgaId: req.params.id, year: yr, monthly }
    return res.status(200).json(data)
  } catch (err: any) {
    console.error('GET /lga/:id/suhi-monthly error:', err.message)
    if (err.message?.includes('No MODIS')) return res.status(422).json({ error: err.message })
    return res.status(503).json({ error: 'Earth Engine unavailable' })
  }
})
