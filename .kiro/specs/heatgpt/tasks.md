# Implementation Plan: HeatGPT

## Overview

Incremental build following the design's three-phase approach:
1. Manual data prep — load ABS LGA Shapefile into PostGIS via pgShapeLoader + pgAdmin4 (operator step, no code)
2. Map + LGA boundaries (`/api/lgas`, MapView)
3. Earth Engine integration (heat stats API, HeatService, EarthEngineService, SidePanel)
4. Chat interface (ChatService, `/api/chat`, ChatInterface)

Stack: TypeScript (Node.js/Express backend, React frontend), PostgreSQL + PostGIS, Google Earth Engine, fast-check for property tests.

---

## Tasks

- [x] 1. Project scaffold and database schema
  - Initialise monorepo with `backend/` and `frontend/` directories
  - Create `backend/src/db/schema.sql` with `lgas` and `heat_stats` table DDL, GIST index, and UNIQUE constraint as specified in the design
  - Create `backend/src/db/pool.ts` exporting a `pg.Pool` instance configured from environment variables, with exponential-backoff retry (max 3 attempts)
  - Create shared TypeScript types file `backend/src/types.ts` defining `HeatStats`, `LgaRecord`, `BBox`, `DateRange`, `ChatMessage`, `ImportResult`
  - Set up `backend/tsconfig.json`, `package.json` with dependencies: `express`, `pg`, `zod`, `express-rate-limit`, `@google/earthengine`, `openai`, `multer`, `compression`
  - Set up `frontend/` with Vite + React + TypeScript, install `leaflet`, `react-leaflet`, `@tanstack/react-query`, `tailwindcss`
  - _Requirements: 12.1, 12.2, 12.3, 12.4_

- [x] 2. Manual LGA Shapefile import (operator pre-requisite)
  - This is a one-time manual data preparation step using pgShapeLoader and pgAdmin4 — no code to write.
  - [x] 2.1 Load the ABS LGA Shapefile using pgShapeLoader
    - Open pgShapeLoader (Start > PostGIS Bundle > PostGIS Shapefile Import/Export Manager)
    - Connect to local PostgreSQL: host `localhost`, database `heatgpt`, user `postgres`
    - Add the ABS LGA `.shp` file; set Schema = `public`, Table = `lgas`, Geo Column = `geom`, SRID = `7844` (GDA2020) or `4283` (GDA94)
    - Enable the spatial index option (`-I` flag) before importing
    - Click Import
    - _Requirements: 15.1, 15.7_

  - [x] 2.2 Run post-import SQL in pgAdmin4 Query Tool
    - Rename ABS attribute columns to match app schema:
      ```sql
      ALTER TABLE lgas RENAME COLUMN "LGA_CODE22" TO lga_id;
      ALTER TABLE lgas RENAME COLUMN "LGA_NAME22" TO lga_name;
      ALTER TABLE lgas RENAME COLUMN "STE_NAME21" TO state;
      ```
    - Reproject geometry to WGS84 (EPSG:4326):
      ```sql
      UPDATE lgas SET geom = ST_Transform(geom, 4326);
      SELECT UpdateGeometrySRID('lgas', 'geom', 4326);
      ```
    - Populate `bbox` column:
      ```sql
      UPDATE lgas SET bbox = jsonb_build_object(
        'west',  ST_XMin(geom::geometry),
        'south', ST_YMin(geom::geometry),
        'east',  ST_XMax(geom::geometry),
        'north', ST_YMax(geom::geometry)
      );
      ```
    - Populate `area_km2` column:
      ```sql
      UPDATE lgas SET area_km2 = ST_Area(geom::geography) / 1000000;
      ```
    - Repair any invalid geometries:
      ```sql
      UPDATE lgas SET geom = ST_MakeValid(geom) WHERE NOT ST_IsValid(geom);
      ```
    - _Requirements: 15.2, 15.3, 15.4, 15.5, 15.6, 15.8_

- [x] 3. LGA boundary API and MapView
  - [x] 3.1 Implement `LgaService` in `backend/src/services/lgaService.ts`
    - `getAllLgas()`: query `lgas` table, return `GeoJSON.FeatureCollection` with `lga_id`, `lga_name`, `state` properties and geometry simplified to 4 decimal places
    - `getLgaById(lgaId)`: return `LgaRecord | null`
    - Use parameterised queries; enable gzip via `compression` middleware
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 13.1, 14.2, 14.3_

  - [x] 3.2 Implement `GET /api/lgas` route in `backend/src/routes/lga.ts`
    - Return HTTP 200 with `GeoJSON.FeatureCollection`; HTTP 500 on DB failure
    - _Requirements: 2.1, 2.4_

  - [ ]* 3.3 Write property test for LGA GeoJSON feature completeness (Property 2)
    - **Property 2: LGA GeoJSON feature completeness**
    - For any feature in the response, `lga_id`, `lga_name`, `state` are present and geometry type is MultiPolygon or Polygon
    - **Validates: Requirements 2.1, 2.2, 2.3**

  - [x] 3.4 Implement `MapView` React component in `frontend/src/components/MapView.tsx`
    - Full-screen Leaflet map; fetch `/api/lgas` on mount via React Query
    - Render LGA polygons with `heatChoropleth` colouring based on `avg_lst`
    - Fit viewport to Australia bounds on load
    - Emit `onLgaSelect(lga_id)` on polygon click
    - Display error message if `/api/lgas` fails
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [ ]* 3.5 Write property test for choropleth colour coverage (Property 12)
    - **Property 12: Choropleth assigns a colour to every LST value**
    - For any LST in [-10, 70], `heatChoropleth(lst)` returns a non-null, non-empty colour string
    - **Validates: Requirements 1.2**

  - [ ]* 3.6 Write property test for LGA click callback (Property 13)
    - **Property 13: LGA click emits correct lga_id**
    - For any rendered LGA feature, clicking the polygon emits exactly `feature.properties.lga_id` via `onLgaSelect`
    - **Validates: Requirements 1.4**

- [ ] 4. Checkpoint — map and import working
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Staleness detection and HeatService core
  - [x] 5.1 Implement `isStale` in `backend/src/services/heatService.ts`
    - `isStale(processedAt: Date, maxAgeDays = 7): boolean`
    - Returns `true` iff `(Date.now() - processedAt.getTime()) > maxAgeDays * 86400000`
    - No side effects
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [ ]* 5.2 Write property test for isStale correctness (Property 4)
    - **Property 4: isStale correctness**
    - For any `processedAt` and positive `maxAgeDays`, result is true iff elapsed time exceeds threshold; no side effects
    - **Validates: Requirements 4.1, 4.2, 4.4**

  - [x] 5.3 Implement `EarthEngineService` in `backend/src/services/earthEngineService.ts`
    - `initEarthEngine()`: authenticate via service account key from env
    - `computeLST(bbox, dateRange)`: Landsat 9 `LANDSAT/LC09/C02/T1_L2`, cloud cover < 20%, mean ST_B10 converted to Celsius; raise error if collection empty
    - `computeNDVI(bbox, dateRange)`: Sentinel-2 `COPERNICUS/S2_SR_HARMONIZED`, cloudy pixel % < 20%, median NDVI from B8/B4
    - `computeUHI(lgaLST, regionMeanLST)`: return `lgaLST - regionMeanLST`; regional mean from Australia bbox at 1000m scale
    - No mutations to input parameters
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.7, 5.8, 6.1, 6.2, 6.3_

  - [ ]* 5.4 Write property test for UHI arithmetic difference (Property 3)
    - **Property 3: UHI is the arithmetic difference**
    - For any finite `lgaLST` and `regionMeanLST`, `computeUHI` returns exactly `lgaLST - regionMeanLST` with no side effects
    - **Validates: Requirements 5.3, 6.1, 6.3**

  - [x] 5.5 Implement `HeatService.getHeatStats` in `backend/src/services/heatService.ts`
    - Query `heat_stats` for cached record; if fresh, return mapped `HeatStats`
    - If stale or absent: fetch LGA bbox, call `EarthEngineService`, upsert `heat_stats`, return result
    - If EE unavailable and stale cache exists, return stale record with `stale: true`
    - If LGA not found, throw 404 error
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

  - [ ]* 5.6 Write property test for cache hit avoids Earth Engine (Property 5)
    - **Property 5: Cache hit avoids Earth Engine**
    - For any LGA with a fresh `heat_stats` record, `getHeatStats` returns cached data without invoking `EarthEngineService`
    - **Validates: Requirements 3.3**

  - [ ]* 5.7 Write property test for cache miss triggers recomputation (Property 6)
    - **Property 6: Cache miss triggers recomputation and upsert**
    - For any LGA with absent or stale stats, `getHeatStats` calls `EarthEngineService` and upserts the result
    - **Validates: Requirements 3.4**

  - [x] 5.8 Implement `GET /api/lga/:id/heat` route
    - Delegate to `HeatService.getHeatStats`; return HTTP 200, 404, 503, or 422 per design error scenarios
    - Retry EE with 90-day date range before returning 422
    - _Requirements: 3.1, 3.5, 3.6, 5.6_

  - [ ]* 5.9 Write property test for heat stats response shape and value ranges (Property 1)
    - **Property 1: Heat stats response shape and value ranges**
    - For any valid LGA ID, response is HTTP 200 with all required `HeatStats` fields; `avgNdvi` in [-1,1], `avgLstCelsius` in [-10,70]
    - **Validates: Requirements 3.1, 3.2, 5.7**

- [x] 6. SidePanel component
  - [x] 6.1 Implement `SidePanel` React component in `frontend/src/components/SidePanel.tsx`
    - Slide-in panel; fetch `/api/lga/:id/heat` via React Query when `lgaId` changes
    - Show skeleton loaders while loading
    - Render metric cards for `avgLstCelsius`, `avgNdvi`, `uhiIntensity` and LGA name when loaded
    - Render `ChatInterface` with `lgaId` and `heatStats` props once data is available
    - Hide panel when no LGA is selected
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [ ]* 6.2 Write property test for SidePanel renders all metrics (Property 14)
    - **Property 14: SidePanel renders all metrics for any HeatStats**
    - For any `HeatStats` object, rendered SidePanel contains LGA name, `avgLstCelsius`, `avgNdvi`, `uhiIntensity`, and `ChatInterface` with correct props
    - **Validates: Requirements 7.1, 7.3**

- [ ] 7. Checkpoint — map, heat stats, and side panel working
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Chat prompt construction and chat API
  - [x] 8.1 Implement `ChatService` in `backend/src/services/chatService.ts`
    - `buildSystemPrompt(heatStats, lgaName)`: pure function returning non-empty string with all required fields and UHI/vegetation descriptions per threshold logic in Algorithm 3
    - `sendMessage(messages, systemPrompt)`: call LLM API (OpenAI or Gemini), return answer string
    - _Requirements: 10.1–10.10, 9.1_

  - [ ]* 8.2 Write property test for buildSystemPrompt purity and completeness (Property 7)
    - **Property 7: buildSystemPrompt is pure and complete**
    - For any valid `HeatStats` and non-empty `lgaName`, result is non-empty, contains all required fields, and is deterministic
    - **Validates: Requirements 10.1, 10.10**

  - [ ]* 8.3 Write property test for UHI description thresholds (Property 8)
    - **Property 8: UHI description thresholds**
    - For any `HeatStats`, prompt includes exactly the correct UHI description based on `uhiIntensity` thresholds (>3.0, 1.5–3.0, 0.0–1.5, ≤0.0)
    - **Validates: Requirements 10.2, 10.3, 10.4, 10.5**

  - [ ]* 8.4 Write property test for vegetation description thresholds (Property 9)
    - **Property 9: Vegetation description thresholds**
    - For any `HeatStats`, prompt includes exactly the correct vegetation description based on `avgNdvi` thresholds (>0.5, 0.3–0.5, 0.1–0.3, ≤0.1)
    - **Validates: Requirements 10.6, 10.7, 10.8, 10.9**

  - [x] 8.5 Implement `POST /api/chat` route in `backend/src/routes/chat.ts`
    - Validate body with `zod`: require `lgaId`, `question` (non-empty, max 500 chars), `heatStats`; return HTTP 400 on failure
    - Apply `express-rate-limit` to this route
    - Delegate to `ChatService`; return HTTP 200 `{ answer }` or HTTP 500 on LLM failure
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 13.5_

  - [ ]* 8.6 Write property test for chat API valid inputs (Property 10)
    - **Property 10: Chat API returns non-empty answer for valid inputs**
    - For any valid `lgaId`, non-empty question ≤500 chars, and valid `HeatStats`, response is HTTP 200 with non-empty `answer`
    - **Validates: Requirements 9.1**

  - [ ]* 8.7 Write property test for chat API input rejection (Property 11)
    - **Property 11: Chat API rejects invalid inputs**
    - For any request missing `lgaId`, `question`, or `heatStats`, or with `question` > 500 chars, response is HTTP 400
    - **Validates: Requirements 9.2, 9.3**

- [x] 9. ChatInterface component
  - [x] 9.1 Implement `ChatInterface` React component in `frontend/src/components/ChatInterface.tsx`
    - Maintain local `ChatMessage[]` state
    - Send `POST /api/chat` with `lgaId`, `question`, `heatStats`, and `history`
    - Append assistant response to message history on success
    - Display suggested prompt chips ("Why is this area hot?", etc.)
    - Show retry button and preserve history on request failure
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [ ]* 9.2 Write property test for chat message history growth (Property 15)
    - **Property 15: Chat message history grows monotonically**
    - For any sequence of AI responses, each appends exactly one assistant message; history length increases by 1 per response
    - **Validates: Requirements 8.2, 8.4**

- [ ] 10. Security, validation, and CORS hardening
  - Add `zod` validation schemas for all remaining routes (`GET /api/lga/:id/heat` param, admin import body)
  - Configure CORS middleware to allow only the frontend origin in production
  - Ensure all SQL uses parameterised queries (audit `pg` calls)
  - Confirm EE key and LLM key are read from env vars only, never logged or returned in responses
  - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.6_

- [x] 12. Wire everything together in App.tsx
  - [x] 12.1 Implement `App.tsx` with `MapView` and `SidePanel` composed together
    - Manage `selectedLgaId` state; pass `onLgaSelect` to `MapView` and `lgaId` to `SidePanel`
    - Wrap app in `QueryClientProvider` from React Query
    - _Requirements: 1.4, 7.1, 14.5_

  - [x] 12.2 Register all Express routes in `backend/src/app.ts`
    - Mount `/api/lgas`, `/api/lga/:id/heat`, `/api/chat`, `/api/internal/process-all-lgas`
    - Apply `compression` middleware globally
    - Apply `express-rate-limit` to `/api/chat`
    - Call `initEarthEngine()` on startup
    - _Requirements: 2.5, 9.5, 14.2_

- [ ] 13. Final checkpoint — all tests pass
  - Ensure all tests pass, ask the user if questions arise.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Property tests use `fast-check` as specified in the design's testing strategy
- Each property task references the property number from the design document for traceability
- The build order mirrors the design's incremental phases: map → heat stats → chat → scheduler

- [x] 14. Replace Leaflet MapView with CesiumJS 3D viewer
  - [x] 14.1 Install resium and cesium packages in frontend
    - Run `npm install cesium resium` in `frontend/`
    - Add Vite plugin for Cesium (`vite-plugin-cesium`) to `frontend/package.json` and configure in `vite.config.ts`
    - _Requirements: 16.1_

  - [x] 14.2 Add Cesium Ion token to environment config
    - Add `CESIUM_ION_TOKEN=` to `backend/.env.example`
    - Expose the token to the frontend via `vite.config.ts` `define` block as `import.meta.env.VITE_CESIUM_ION_TOKEN`
    - _Requirements: 16.1, 16.9_

  - [x] 14.3 Implement CesiumMapView component
    - Create `frontend/src/components/CesiumMapView.tsx`
    - Initialise a Resium `Viewer` with `Ion.defaultAccessToken` set from `import.meta.env.VITE_CESIUM_ION_TOKEN`
    - Load Cesium World Terrain via `createWorldTerrainAsync()`
    - Load OSM Buildings tileset via `Cesium3DTileset` with Ion asset ID `96188`
    - Fetch `/api/lgas` on mount via React Query; for each LGA feature add a `GeoJsonDataSource` entity extruded by `uhi_intensity * 500` metres and coloured via `heatChoropleth(avg_lst)`
    - Set default camera view centred over Australia (`Rectangle.fromDegrees(113, -44, 154, -10)`)
    - Wire click handler using `ScreenSpaceEventHandler` to call `onLgaSelect(lga_id)` on entity pick
    - Display error message if `/api/lgas` fails or Ion token is absent/invalid
    - Accept `onLgaSelect: (lgaId: string) => void` prop (same interface as `MapView`)
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7, 16.8, 16.9, 16.10_

  - [x] 14.4 Update App.tsx to use CesiumMapView
    - Replace `import MapView` with `import CesiumMapView` in `frontend/src/App.tsx`
    - Swap `<MapView onLgaSelect={...} />` for `<CesiumMapView onLgaSelect={...} />`
    - _Requirements: 16.10_

- [x] 15. GEE satellite layer overlay
  - [x] 15.1 Add `getMapTileUrl` to EarthEngineService using EE REST Thumbnails API with axios
  - [x] 15.2 Add `GET /api/lga/:id/tiles` route returning proxied tile URL and bbox
  - [x] 15.3 Add `GET /api/lga/:id/tile-image` proxy route that fetches EE image with auth and streams PNG
  - [x] 15.4 Add in-memory cache for EE thumbnail URLs (55 min TTL)
  - [x] 15.5 Update MapView to render SVG clip-masked image overlay matching LGA polygon shape
  - [x] 15.6 Add layer toggle buttons (LST Heatmap / NDVI Vegetation / None) to SidePanel
  - [x] 15.7 Reduce LGA polygon fill opacity when satellite layer is active
  - _Requirements: 17.1–17.10_

- [x] 16. Custom date range for satellite visualisation
  - [x] 16.1 Add From/To date inputs and Apply/Reset buttons below layer toggles in SidePanel
  - [x] 16.2 Wire custom date range to tile query — re-fetches layer for specified period
  - [x] 16.3 Show "No satellite data found for this period" on 422 response
  - [x] 16.4 Show active period label when custom range is applied
  - _Requirements: 18.1–18.6_

- [x] 17. Enhanced SidePanel analytics
  - [x] 17.1 Add heat risk badge with colour-coded UHI thresholds
  - [x] 17.2 Add temperature trend line chart (recharts) with 4 x 90-day windows
  - [x] 17.3 Add NDVI vs LST horizontal progress bars
  - [x] 17.4 Add timespan selector (30d/90d/180d/1yr) wired to heat stats fetch
  - _Requirements: 19.1–19.5_

- [x] 18. Move north arrow to right top corner
  - [x] 18.1 Update MapControls component positioning
    - Modify the north arrow div styling in `frontend/src/components/MapControls.tsx`
    - Change `left: '16px'` to `right: '16px'` to position it in the top-right corner
    - Ensure the arrow remains properly styled and visible against map backgrounds
    - _Requirements: Map UI positioning improvement_


- [x] 19. Map PDF Export
  - [x] 19.1 Install html2canvas and jsPDF in frontend
    - Run `npm install html2canvas jspdf` in `frontend/`
    - Add type declarations if needed (`@types/html2canvas` is bundled; jsPDF ships its own types)
    - _Requirements: 20.12_

  - [x] 19.2 Implement `exportMapPdf` utility in `frontend/src/utils/exportPdf.ts`
    - Export a single async function `exportMapPdf(options: ExportPdfOptions): Promise<void>`
    - `ExportPdfOptions`: `{ lgaName, layerType, dateRangeStart, dateRangeEnd, scaleInfo }`
    - Capture `document.getElementById('map')` with `html2canvas({ useCORS: true, scale: 2 })`
    - Create `jsPDF('landscape', 'mm', 'a4')` (297 × 210 mm)
    - Draw title bar (8 mm, dark background, white bold text): `"{lgaName} — LST Heatmap"` or `"{lgaName} — NDVI Vegetation"`
    - Scale canvas to fill page width (297 mm), max height ~170 mm; add map image via `doc.addImage`
    - Draw bottom strip (32 mm): legend swatches + labels | scale bar with tick marks | data sources text
    - Legend reuses `LST_PALETTE` / `NDVI_PALETTE` colour arrays (copy or import from MapControls)
    - Scale bar drawn with `doc.line` / `doc.text` using `scaleInfo.label`
    - Data sources: `"Satellite data: Landsat 9 (LST)"` or `"Satellite data: Sentinel-2 (NDVI)"` + `"Date range: {start} – {end}"`
    - Filename: `{lga-name-kebab}-{layer-type}-{YYYY-MM-DD}.pdf` (lowercase, hyphens, today's date)
    - Do not mutate any input fields
    - _Requirements: 20.3, 20.4, 20.5, 20.6, 20.7, 20.8, 20.11, 20.12, 20.13, 20.14_

  - [x] 19.3 Add "Export PDF" button to `MapControls.tsx`
    - Add `lgaName?: string | null`, `dateRangeStart?: string | null`, `dateRangeEnd?: string | null` to `MapControlsProps`
    - Add `isExporting` boolean state (default `false`)
    - Render button only when `activeTileLayer` is non-null, positioned in the top-right group alongside the north arrow
    - On click: set `isExporting = true`, call `exportMapPdf({ lgaName, layerType: activeTileLayer.type, dateRangeStart, dateRangeEnd, scaleInfo })`, then set `isExporting = false`
    - While `isExporting`: show spinner icon, set `disabled` on button
    - On error: catch, show inline error message near button, set `isExporting = false`
    - _Requirements: 20.1, 20.2, 20.9, 20.10_

  - [x] 19.4 Update `App.tsx` to pass new props to `MapControls`
    - Extend `TileLayer` type with `dateRangeStart?: string` and `dateRangeEnd?: string`
    - Derive `lgaName` from React Query cache: `qc.getQueryData<GeoJSON.FeatureCollection>(['lgas'])` → find feature where `properties.lga_id === selectedLgaId` → `properties.lga_name`
    - Pass `lgaName`, `dateRangeStart={activeTileLayer?.dateRangeStart}`, `dateRangeEnd={activeTileLayer?.dateRangeEnd}` to `<MapControls>`
    - Update `handleTileLayerChange` to forward `dateRangeStart` / `dateRangeEnd` from the layer object emitted by `SidePanel`
    - _Requirements: 20.4, 20.7_

  - [ ]* 19.5 Write property test for PDF title composition (Property 23)
    - **Property 23: PDF title contains LGA name and layer label**
    - Extract a pure `buildTitle(lgaName, layerType)` helper from `exportPdf.ts`
    - For any non-empty `lgaName` and `layerType` in `['lst', 'ndvi']`, result contains `lgaName` and the correct layer label
    - **Validates: Requirements 20.4**

  - [ ]* 19.6 Write property test for PDF filename generation (Property 24)
    - **Property 24: PDF filename is lowercase kebab-case**
    - Extract a pure `buildFilename(lgaName, layerType, date)` helper from `exportPdf.ts`
    - For any `lgaName` string, result is entirely lowercase, uses hyphens, ends with `.pdf`, contains layer type slug
    - **Validates: Requirements 20.8**

  - [ ]* 19.7 Write property test for scale label inclusion (Property 25)
    - **Property 25: Scale bar label appears in PDF output**
    - Mock jsPDF; for any `scaleInfo` with non-empty `label`, verify `doc.text` was called with that label
    - **Validates: Requirements 20.6**

  - [ ]* 19.8 Write property test for data source text (Property 26)
    - **Property 26: Data source text and date range appear in PDF output**
    - Mock jsPDF; for any `dateRangeStart`, `dateRangeEnd`, and `layerType`, verify correct source name and both date strings appear in `doc.text` calls
    - **Validates: Requirements 20.7**

  - [ ]* 19.9 Write property test for input immutability (Property 27)
    - **Property 27: exportMapPdf does not mutate its inputs**
    - Deep-clone `ExportPdfOptions` before call; after call (or rejection), assert deep equality with original
    - **Validates: Requirements 20.14**

- [ ] 20. Automatic Satellite Layer Persistence (Requirement 21)
  - [ ] 20.1 Add composite index to gee_layers table
    - Run SQL migration: `CREATE INDEX IF NOT EXISTS idx_gee_layers_lookup ON gee_layers(lga_id, layer_type, date_range_start, date_range_end);`
    - _Requirements: 21.9_

  - [ ] 20.2 Create geeLayerService.ts
    - Implement `getGeeLayer(lgaId, layerType, dateRange)` — DB-first lookup, fetch from GEE on cache miss
    - Implement `computeAndStoreGeeLayer(lgaId, layerType, bbox, dateRange)` — Fetch from GEE + auto-save to DB
    - Implement `mapRowToGeeLayerRecord(row)` — Map DB row to TypeScript type
    - Optional: `isGeeLayerStale(exportedAt, maxAgeDays)` (can reuse from heatService)
    - _Requirements: 21.1, 21.2, 21.3, 21.4, 21.5, 21.10_

  - [ ] 20.3 Update /api/lga/:id/tiles route
    - Replace in-memory `tileUrlCache` Map with `getGeeLayer()` calls
    - Remove 55-minute TTL logic (DB persistence is permanent)
    - Keep error handling for 422, 503, 404
    - _Requirements: 21.2, 21.3, 21.4_

  - [ ] 20.4 Remove manual export endpoint
    - Delete `POST /api/lga/:id/export` route
    - Keep `GET /api/lga/:id/saved-layers` and `DELETE /api/lga/:id/saved-layers/:layerId`
    - _Requirements: 21.6_

  - [ ] 20.5 Update SidePanel.tsx
    - Remove "Export to DB" button and related state (`exportStatus`)
    - Keep saved layers list and "Load on map" functionality
    - Optional: Add visual indicator for cached vs fresh layers
    - _Requirements: 21.6, 21.7_

  - [ ]* 20.6 Property tests for satellite layer caching
    - **Property 28: Cache hit avoids Earth Engine**
    - For any LGA with cached satellite layer data, `getGeeLayer` returns cached data without invoking Earth Engine
    - **Validates: Requirements 21.3**
    
    - **Property 29: Cache miss triggers recomputation**
    - For any LGA without cached data, `getGeeLayer` calls Earth Engine and inserts result into `gee_layers`
    - **Validates: Requirements 21.4**
    
    - **Property 30: Auto-save stores all required fields**
    - For any computed satellite layer, `computeAndStoreGeeLayer` stores `lga_id`, `layer_type`, `tile_url`, `ee_url`, date range, and metrics
    - **Validates: Requirements 21.5, 21.10**
    
    - **Property 31: Proxied and raw URLs stored**
    - For any cached layer, both `tile_url` (proxied) and `ee_url` (raw) are stored in separate columns
    - **Validates: Requirements 21.10**
    
    - **Property 32: Composite index used**
    - For any cache lookup query, the database query plan uses `idx_gee_layers_lookup` index
    - **Validates: Requirements 21.9**
