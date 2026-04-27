import { Router, Request, Response } from 'express'
import axios from 'axios'
import { pool } from '../db/pool'
import { getAllLgas, getLgaById } from '../services/lgaService'
import { getHeatStats, getHeatStatsForRange } from '../services/heatService'
import { getMapTileUrl, getAccessToken, computeLSTTrend, computeNDVITrend } from '../services/earthEngineService'
import { DateRange } from '../types'

const router = Router()

// Cache EE tile URLs to avoid recomputing on every image request
const tileUrlCache = new Map<string, { url: string; expires: number }>()

router.get('/lgas', async (req: Request, res: Response) => {
  try {
    const featureCollection = await getAllLgas()
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
    const lga = await getLgaById(req.params.id)
    if (!lga) {
      return res.status(404).json({ error: 'LGA not found' })
    }

    const dateRange: DateRange = {
      start: start ?? new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      end: end ?? new Date().toISOString().slice(0, 10),
    }

    const cacheKey = `${req.params.id}-${type}-${dateRange.start}-${dateRange.end}`
    const cached = tileUrlCache.get(cacheKey)
    let eeUrl: string

    if (cached && cached.expires > Date.now()) {
      eeUrl = cached.url
    } else {
      eeUrl = await getMapTileUrl(type as 'lst' | 'ndvi', lga.bbox, dateRange)
      tileUrlCache.set(cacheKey, { url: eeUrl, expires: Date.now() + 55 * 60 * 1000 })
    }

    res.status(200).json({
      tileUrl: `/api/lga/${req.params.id}/tile-image?type=${type}&start=${dateRange.start}&end=${dateRange.end}`,
      bbox: lga.bbox,
    })
  } catch (err: any) {
    console.error('GET /lga/:id/tiles error:', err.message)
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
router.post('/lga/:id/export', async (req: Request, res: Response) => {
  const { layerType, dateRangeStart, dateRangeEnd, tileUrl, eeUrl,
          avgLstCelsius, avgNdvi, uhiIntensity } = req.body

  if (!layerType || !dateRangeStart || !dateRangeEnd || !tileUrl) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  try {
    await pool.query(
      `INSERT INTO gee_layers
         (lga_id, layer_type, date_range_start, date_range_end, tile_url, ee_url,
          avg_lst_celsius, avg_ndvi, uhi_intensity)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [req.params.id, layerType, dateRangeStart, dateRangeEnd, tileUrl, eeUrl ?? null,
       avgLstCelsius ?? null, avgNdvi ?? null, uhiIntensity ?? null]
    )
    res.status(200).json({ message: 'Exported successfully' })
  } catch (err: any) {
    console.error('POST /lga/:id/export error:', err.message)
    res.status(500).json({ error: 'Failed to export to database' })
  }
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
