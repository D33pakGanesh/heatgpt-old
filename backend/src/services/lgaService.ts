import { pool } from '../db/pool'
import { LgaRecord } from '../types'
import GeoJSON from 'geojson'

export async function getAllLgas(): Promise<GeoJSON.FeatureCollection> {
  const result = await pool.query(`
    SELECT
      lga_id,
      lga_name,
      state,
      ST_AsGeoJSON(ST_SnapToGrid(geom, 0.0001)) AS geometry
    FROM lgas
  `)

  const features: GeoJSON.Feature[] = result.rows.map(row => ({
    type: 'Feature',
    properties: {
      lga_id: row.lga_id,
      lga_name: row.lga_name,
      state: row.state,
    },
    geometry: JSON.parse(row.geometry),
  }))

  return {
    type: 'FeatureCollection',
    features,
  }
}

export async function getLgaById(lgaId: string): Promise<LgaRecord | null> {
  const result = await pool.query(
    `SELECT lga_id, lga_name, state, bbox, area_km2 FROM lgas WHERE lga_id = $1`,
    [lgaId]
  )

  if (result.rows.length === 0) {
    return null
  }

  const row = result.rows[0]
  return {
    lgaId: row.lga_id,
    lgaName: row.lga_name,
    state: row.state,
    bbox: row.bbox,
    areaKm2: parseFloat(row.area_km2),
  }
}
