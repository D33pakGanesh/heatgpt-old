export interface HeatStats {
  lgaId: string
  lgaName: string
  avgLstCelsius: number
  avgNdvi: number
  uhiIntensity: number
  dataSource: string
  dateRangeStart: string  // ISO date
  dateRangeEnd: string    // ISO date
  processedAt: string     // ISO datetime
}

export interface LgaRecord {
  lgaId: string
  lgaName: string
  state: string
  bbox: BBox
  areaKm2: number
}

export interface BBox {
  west: number
  south: number
  east: number
  north: number
}

export interface DateRange {
  start: string  // 'YYYY-MM-DD'
  end: string    // 'YYYY-MM-DD'
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

export interface ImportResult {
  inserted: number
  updated: number
  repaired: number
  errors: string[]
}
