import ee from '@google/earthengine'
import fs from 'fs'
import axios from 'axios'
import { GoogleAuth } from 'google-auth-library'
import { BBox, DateRange } from '../types'

// Shared auth client for REST API calls
let _projectId: string | null = null

export async function getAccessToken(): Promise<{ token: string; projectId: string }> {
  const keyPath = process.env.EE_KEY_FILE!
  const key = JSON.parse(fs.readFileSync(keyPath, 'utf8'))
  if (!_projectId) _projectId = key.project_id
  const auth = new GoogleAuth({
    keyFile: keyPath,
    scopes: ['https://www.googleapis.com/auth/earthengine'],
  })
  const client = await auth.getClient()
  const t = await client.getAccessToken()
  return { token: t.token!, projectId: _projectId! }
}

export async function initEarthEngine(): Promise<void> {
  console.log('Initialising Earth Engine...')
  const keyPath = process.env.EE_KEY_FILE
  if (!keyPath) throw new Error('EE_KEY_FILE not set')
  const key = JSON.parse(fs.readFileSync(keyPath, 'utf8'))

  await new Promise<void>((resolve, reject) => {
    ee.data.authenticateViaPrivateKey(
      key,
      () => {
        ee.initialize(
          null, null,
          () => { console.log('Earth Engine ready'); resolve() },
          (err: Error) => reject(err)
        )
      },
      (err: Error) => reject(err)
    )
  })
}

function getInfo<T>(obj: any): Promise<T> {
  return new Promise((resolve, reject) => {
    obj.getInfo((result: T, err: Error) => {
      if (err) reject(err)
      else resolve(result)
    })
  })
}

export async function computeLST(bbox: BBox, dateRange: DateRange): Promise<number> {
  const region = ee.Geometry.Rectangle([bbox.west, bbox.south, bbox.east, bbox.north])

  const collection = ee.ImageCollection('LANDSAT/LC09/C02/T1_L2')
    .filterBounds(region)
    .filterDate(dateRange.start, dateRange.end)
    .filter(ee.Filter.lt('CLOUD_COVER', 20))

  const size = await getInfo<number>(collection.size())
  if (size === 0) throw new Error('No Landsat imagery available')

  const lstImage = collection
    .select('ST_B10')
    .mean()
    .multiply(0.00341802)
    .add(149.0)
    .subtract(273.15)

  const result = await getInfo<Record<string, number>>(
    lstImage.reduceRegion({ reducer: ee.Reducer.mean(), geometry: region, scale: 30, maxPixels: 1e9 })
  )

  if (result['ST_B10'] == null) throw new Error('No LST value returned')
  return result['ST_B10']
}

export async function computeRegionalMeanLST(dateRange: DateRange): Promise<number> {
  const region = ee.Geometry.Rectangle([113.0, -44.0, 154.0, -10.0])

  const collection = ee.ImageCollection('LANDSAT/LC09/C02/T1_L2')
    .filterBounds(region)
    .filterDate(dateRange.start, dateRange.end)
    .filter(ee.Filter.lt('CLOUD_COVER', 20))

  const lstImage = collection
    .select('ST_B10')
    .mean()
    .multiply(0.00341802)
    .add(149.0)
    .subtract(273.15)

  const result = await getInfo<Record<string, number>>(
    lstImage.reduceRegion({ reducer: ee.Reducer.mean(), geometry: region, scale: 1000, maxPixels: 1e9 })
  )

  if (result['ST_B10'] == null) throw new Error('No regional LST returned')
  return result['ST_B10']
}

export async function computeNDVI(bbox: BBox, dateRange: DateRange): Promise<number> {
  const region = ee.Geometry.Rectangle([bbox.west, bbox.south, bbox.east, bbox.north])

  const collection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(region)
    .filterDate(dateRange.start, dateRange.end)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))

  const ndviImage = collection.median().normalizedDifference(['B8', 'B4'])

  const result = await getInfo<Record<string, number>>(
    ndviImage.reduceRegion({ reducer: ee.Reducer.mean(), geometry: region, scale: 10, maxPixels: 1e9 })
  )

  if (result['nd'] == null) throw new Error('No NDVI value returned')
  return result['nd']
}

export function computeUHI(lgaLST: number, regionMeanLST: number): number {
  return lgaLST - regionMeanLST
}

// Returns per-satellite-pass LST values for the given date range
// Each entry = { date: 'YYYY-MM-DD', lst: number }
export async function computeLSTTrend(
  bbox: BBox,
  dateRange: DateRange
): Promise<Array<{ date: string; lst: number }>> {
  const region = ee.Geometry.Rectangle([bbox.west, bbox.south, bbox.east, bbox.north])

  const collection = ee.ImageCollection('LANDSAT/LC09/C02/T1_L2')
    .filterBounds(region)
    .filterDate(dateRange.start, dateRange.end)
    .filter(ee.Filter.lt('CLOUD_COVER', 20))

  const size = await getInfo<number>(collection.size())
  if (size === 0) return []

  // Map each image to its mean LST and acquisition date
  const withLST = collection.map((img: any) => {
    const lst = img.select('ST_B10')
      .multiply(0.00341802)
      .add(149.0)
      .subtract(273.15)
    const mean = lst.reduceRegion({
      reducer: ee.Reducer.mean(),
      geometry: region,
      scale: 30,
      maxPixels: 1e9,
    })
    return img.set('lst_mean', mean.get('ST_B10'))
  })

  const features = await getInfo<{ features: Array<{ properties: { 'system:time_start': number; lst_mean: number } }> }>(
    withLST.map((img: any) =>
      ee.Feature(null, {
        date: img.date().format('YYYY-MM-dd'),
        lst: img.get('lst_mean'),
      })
    )
  )

  return (features.features || [])
    .filter((f: any) => f.properties.lst != null)
    .map((f: any) => ({
      date: f.properties.date as string,
      lst: parseFloat((f.properties.lst as number).toFixed(2)),
    }))
    .sort((a: any, b: any) => a.date.localeCompare(b.date))
}

// Returns per-satellite-pass NDVI values for the given date range
export async function computeNDVITrend(
  bbox: BBox,
  dateRange: DateRange
): Promise<Array<{ date: string; ndvi: number }>> {
  const region = ee.Geometry.Rectangle([bbox.west, bbox.south, bbox.east, bbox.north])

  const collection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(region)
    .filterDate(dateRange.start, dateRange.end)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))

  const size = await getInfo<number>(collection.size())
  if (size === 0) return []

  const withNDVI = collection.map((img: any) => {
    const ndvi = img.normalizedDifference(['B8', 'B4'])
    const mean = ndvi.reduceRegion({
      reducer: ee.Reducer.mean(),
      geometry: region,
      scale: 10,
      maxPixels: 1e9,
    })
    return ee.Feature(null, {
      date: img.date().format('YYYY-MM-dd'),
      ndvi: mean.get('nd'),
    })
  })

  const features = await getInfo<{ features: Array<{ properties: { date: string; ndvi: number } }> }>(withNDVI)

  return (features.features || [])
    .filter((f: any) => f.properties.ndvi != null)
    .map((f: any) => ({
      date: f.properties.date as string,
      ndvi: parseFloat((f.properties.ndvi as number).toFixed(4)),
    }))
    .sort((a: any, b: any) => a.date.localeCompare(b.date))
}

export async function getMapTileUrl(
  type: 'lst' | 'ndvi',
  bbox: BBox,
  dateRange: DateRange
): Promise<string> {
  const region = ee.Geometry.Rectangle([bbox.west, bbox.south, bbox.east, bbox.north])

  let image: any
  let visParams: Record<string, any>

  if (type === 'lst') {
    const collection = ee.ImageCollection('LANDSAT/LC09/C02/T1_L2')
      .filterBounds(region)
      .filterDate(dateRange.start, dateRange.end)
      .filter(ee.Filter.lt('CLOUD_COVER', 20))

    const size = await getInfo<number>(collection.size())
    if (size === 0) throw new Error('No Landsat imagery available')

    image = collection
      .select('ST_B10')
      .mean()
      .multiply(0.00341802)
      .add(149.0)
      .subtract(273.15)

    visParams = {
      min: 20,
      max: 50,
      palette: ['313695', '4575b4', '74add1', 'abd9e9', 'fee090', 'fdae61', 'f46d43', 'd73027', 'a50026'],
    }
  } else {
    const collection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
      .filterBounds(region)
      .filterDate(dateRange.start, dateRange.end)
      .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))

    image = collection.median().normalizedDifference(['B8', 'B4'])

    visParams = {
      min: -0.2,
      max: 0.8,
      palette: ['d73027', 'fee090', 'ffffbf', 'd9ef8b', '91cf60', '1a9850'],
    }
  }

  // Serialise the EE image expression for the REST API
  const eeExpression = image.visualize(visParams).serialize()

  // Call EE REST Thumbnails API directly with axios
  const { token, projectId } = await getAccessToken()

  let response: any
  try {
    response = await axios.post(
      `https://earthengine.googleapis.com/v1/projects/${projectId}/thumbnails`,
      {
        expression: JSON.parse(eeExpression),
        fileFormat: 'PNG',
        grid: {
          dimensions: { width: 512, height: 512 },
          affineTransform: {
            scaleX: (bbox.east - bbox.west) / 512,
            scaleY: -(bbox.north - bbox.south) / 512,
            translateX: bbox.west,
            translateY: bbox.north,
          },
          crsCode: 'EPSG:4326',
        },
      },
      { headers: { Authorization: `Bearer ${token}` } }
    )
  } catch (err: any) {
    const detail = err.response?.data?.error?.message || err.response?.data || err.message
    console.error('EE Thumbnails API error detail:', JSON.stringify(detail))
    throw new Error(`EE Thumbnails API: ${detail}`)
  }

  console.log('EE Thumbnails response:', JSON.stringify(response.data).substring(0, 200))
  return response.data.name
    ? `https://earthengine.googleapis.com/v1/${response.data.name}:getPixels`
    : response.data.downloadUrl || response.data.url
}
