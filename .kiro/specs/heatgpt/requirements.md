# Requirements Document

## Introduction

HeatGPT is a cloud-based GIS web application that enables users to explore Urban Heat Islands (UHI)
across Australian Local Government Areas (LGAs). Users interact with a full-screen interactive map,
click on any LGA to retrieve satellite-derived heat analysis statistics (land surface temperature,
NDVI, UHI intensity), and engage with an AI chat interface — HeatGPT — that explains heat patterns
in plain language. The system is hosted on a GCP Ubuntu VM and uses Google Earth Engine for
satellite processing, PostGIS for spatial data storage, a Node.js/Express REST API, and n8n for
scheduled batch processing.

---

## Glossary

- **LGA**: Local Government Area — an administrative boundary unit in Australia defined by the ABS.
- **LST**: Land Surface Temperature — the radiative skin temperature of the land surface, derived from Landsat thermal band ST_B10, expressed in degrees Celsius.
- **NDVI**: Normalised Difference Vegetation Index — a measure of vegetation density computed from Sentinel-2 NIR (B8) and Red (B4) bands, ranging from -1 to 1.
- **UHI**: Urban Heat Island — the phenomenon where urban areas are significantly warmer than surrounding rural areas. Quantified as UHI Intensity.
- **UHI_Intensity**: The difference between an LGA's average LST and the regional mean LST for Australia, expressed in degrees Celsius.
- **HeatStats**: A data object containing `lgaId`, `lgaName`, `avgLstCelsius`, `avgNdvi`, `uhiIntensity`, `dataSource`, `dateRangeStart`, `dateRangeEnd`, and `processedAt`.
- **MapView**: The React/Leaflet full-screen map component that renders LGA polygons and heat choropleth.
- **SidePanel**: The slide-in React component that displays LGA heat statistics and hosts the ChatInterface.
- **ChatInterface**: The React component that provides the conversational HeatGPT interface.
- **API**: The Node.js/Express backend REST API.
- **LgaService**: The backend service responsible for retrieving LGA boundary data from PostGIS.
- **HeatService**: The backend service responsible for retrieving or computing heat statistics for an LGA.
- **EarthEngineService**: The backend service that executes Google Earth Engine scripts and returns computed metrics.
- **ChatService**: The backend service that builds LLM prompts and calls the LLM API.
- **Scheduler**: The n8n automation service that runs weekly batch processing of heat statistics.
- **PostGIS**: The PostgreSQL database with spatial extensions used to store LGA boundaries and heat statistics.
- **BBox**: A bounding box defined by `{west, south, east, north}` coordinates in EPSG:4326.
- **Stale**: A `heat_stats` record is considered stale when its `processed_at` timestamp is more than 7 days in the past.
- **GeeLayerCache**: A cached satellite layer record in the `gee_layers` table containing tile URL, bbox, date range, and computed metrics for a specific LGA and layer type.
- **TileURL**: The proxied URL path used by the frontend to fetch the satellite layer image without requiring Earth Engine authentication.

---

## Requirements

### Requirement 1: LGA Map Rendering

**User Story:** As a user, I want to see all Australian LGA boundaries on a full-screen interactive map, so that I can visually explore and select any LGA to investigate its heat profile.

#### Acceptance Criteria

1. WHEN the application loads, THE MapView SHALL fetch LGA boundary data from `GET /api/lgas` and render all LGA polygons on the Leaflet map.
2. WHEN LGA polygons are rendered, THE MapView SHALL apply a heat choropleth colouring to each polygon based on its average LST value.
3. WHEN the application loads, THE MapView SHALL fit the map viewport to the bounds of Australia.
4. WHEN a user clicks an LGA polygon, THE MapView SHALL emit the selected `lga_id` to the parent component via the `onLgaSelect` callback.
5. IF the `GET /api/lgas` request fails, THEN THE MapView SHALL display an error message to the user.

---

### Requirement 2: LGA Boundary Data API

**User Story:** As a frontend client, I want to retrieve all LGA boundaries as GeoJSON, so that I can render them on the map.

#### Acceptance Criteria

1. WHEN `GET /api/lgas` is called, THE API SHALL return HTTP 200 with a `GeoJSON.FeatureCollection` body.
2. WHEN returning LGA features, THE API SHALL include `lga_id`, `lga_name`, and `state` as properties on each GeoJSON feature.
3. WHEN returning LGA features, THE API SHALL include a valid geometry of type `MultiPolygon` or `Polygon` on each feature.
4. IF the PostGIS database is unavailable, THEN THE API SHALL return HTTP 500 with an error message.
5. THE API SHALL serve the `GET /api/lgas` response with gzip compression enabled.

---

### Requirement 3: Heat Statistics Retrieval

**User Story:** As a user, I want to view heat statistics for a selected LGA, so that I can understand its land surface temperature, vegetation index, and urban heat island intensity.

#### Acceptance Criteria

1. WHEN `GET /api/lga/:id/heat` is called with a valid LGA ID, THE API SHALL return HTTP 200 with a `HeatStats` JSON body.
2. WHEN returning heat statistics, THE API SHALL include `avgLstCelsius`, `avgNdvi`, `uhiIntensity`, `dataSource`, `dateRangeStart`, `dateRangeEnd`, and `processedAt` in the response.
3. WHEN heat statistics exist in PostGIS and are not stale, THE HeatService SHALL return the cached statistics without calling the EarthEngineService.
4. WHEN heat statistics are stale or absent, THE HeatService SHALL invoke the EarthEngineService to recompute metrics and upsert the result into `heat_stats` before returning.
5. IF the LGA ID does not exist in the database, THEN THE API SHALL return HTTP 404 with `{ "error": "LGA not found" }`.
6. IF the EarthEngineService is unavailable during on-demand computation, THEN THE API SHALL return HTTP 503 with `{ "error": "Heat data temporarily unavailable. Please try again later." }`.
7. WHERE a stale cached record exists and the EarthEngineService is unavailable, THE API SHALL return the stale record with a `stale: true` flag in the response body.

---

### Requirement 4: Staleness Detection

**User Story:** As the system, I want to detect when cached heat statistics are outdated, so that I can trigger recomputation and keep data fresh.

#### Acceptance Criteria

1. WHEN `isStale` is called with a `processedAt` date and a `maxAgeDays` value, THE HeatService SHALL return `true` if the elapsed time since `processedAt` exceeds `maxAgeDays` multiplied by 86400000 milliseconds.
2. WHEN `isStale` is called with a `processedAt` date within the `maxAgeDays` threshold, THE HeatService SHALL return `false`.
3. THE HeatService SHALL use a default `maxAgeDays` value of 7 when none is provided.
4. THE `isStale` function SHALL produce no side effects.

---

### Requirement 5: Earth Engine Metric Computation

**User Story:** As the system, I want to compute LST, NDVI, and UHI intensity from satellite imagery for a given LGA bounding box, so that accurate heat statistics can be stored and served.

#### Acceptance Criteria

1. WHEN `computeLST` is called with a valid `BBox` and `DateRange`, THE EarthEngineService SHALL query the Landsat 9 Collection 2 Tier 1 Level 2 image collection (`LANDSAT/LC09/C02/T1_L2`), filter by bounds and date range, exclude images with cloud cover ≥ 20%, and return the mean LST in degrees Celsius.
2. WHEN `computeNDVI` is called with a valid `BBox` and `DateRange`, THE EarthEngineService SHALL query the Sentinel-2 SR Harmonized collection (`COPERNICUS/S2_SR_HARMONIZED`), filter by bounds and date range, exclude images with cloudy pixel percentage ≥ 20%, and return the median NDVI computed from bands B8 and B4.
3. WHEN `computeUHI` is called with an LGA LST value and a regional mean LST value, THE EarthEngineService SHALL return the arithmetic difference `lgaLST - regionMeanLST`.
4. WHEN computing UHI intensity, THE EarthEngineService SHALL derive the regional mean LST from the full Australian bounding box at a 1000-metre scale.
5. IF the filtered Landsat image collection is empty for the requested `BBox` and `DateRange`, THEN THE EarthEngineService SHALL raise an error indicating no imagery is available.
6. IF the filtered Landsat collection is empty and a retry with a date range extended to 90 days also yields no imagery, THEN THE API SHALL return HTTP 422 with `{ "error": "Insufficient satellite imagery for this area and period" }`.
7. WHEN returning computed metrics, THE EarthEngineService SHALL ensure `avgNdvi` is in the range [-1, 1] and `avgLstCelsius` is in the range [-10, 70].
8. THE EarthEngineService SHALL produce no mutations to its input parameters.

---

### Requirement 6: UHI Intensity Calculation

**User Story:** As the system, I want to calculate UHI intensity as the difference between an LGA's LST and the regional mean LST, so that users can understand how much hotter an area is compared to the broader region.

#### Acceptance Criteria

1. WHEN `computeUHI` is called with `lgaLST` and `regionMeanLST`, THE EarthEngineService SHALL return exactly `lgaLST - regionMeanLST`.
2. WHEN the result of `computeUHI` is positive, THE EarthEngineService SHALL indicate an urban heat island effect is present.
3. THE `computeUHI` function SHALL produce no side effects.

---

### Requirement 7: Side Panel Display

**User Story:** As a user, I want to see a slide-in panel with heat statistics when I select an LGA, so that I can read the metrics clearly without leaving the map view.

#### Acceptance Criteria

1. WHEN an LGA is selected, THE SidePanel SHALL display the LGA name and its heat metrics including `avgLstCelsius`, `avgNdvi`, and `uhiIntensity` as metric cards.
2. WHILE heat statistics are loading, THE SidePanel SHALL display skeleton loaders in place of metric cards.
3. WHEN heat statistics have loaded, THE SidePanel SHALL render the ChatInterface component with the selected `lgaId` and `heatStats` as props.
4. WHEN no LGA is selected, THE SidePanel SHALL not display heat metrics or the ChatInterface.

---

### Requirement 8: HeatGPT Chat Interface

**User Story:** As a user, I want to ask questions about a selected LGA's heat profile and receive plain-language AI explanations, so that I can understand the causes and implications of urban heat in that area.

#### Acceptance Criteria

1. WHEN a user submits a question in the ChatInterface, THE ChatInterface SHALL send a `POST /api/chat` request containing `lgaId`, `question`, `heatStats`, and the current message history.
2. WHEN an AI response is received, THE ChatInterface SHALL append the response as an assistant message to the local message history and display it in the chat panel.
3. THE ChatInterface SHALL display suggested prompt chips (e.g. "Why is this area hot?") to guide user interaction.
4. WHEN a chat response is received, THE ChatInterface SHALL maintain the full message history for the session.
5. IF the `POST /api/chat` request fails, THEN THE ChatInterface SHALL display a retry button and preserve the existing chat history.

---

### Requirement 9: Chat API Endpoint

**User Story:** As a frontend client, I want to send a question with heat context to the API and receive an AI-generated answer, so that the chat interface can display contextualised explanations.

#### Acceptance Criteria

1. WHEN `POST /api/chat` is called with a valid `lgaId`, non-empty `question`, and valid `heatStats`, THE API SHALL return HTTP 200 with `{ "answer": string }` where `answer` is non-empty.
2. IF `lgaId`, `question`, or `heatStats` are missing from the request body, THEN THE API SHALL return HTTP 400.
3. IF the `question` field exceeds 500 characters, THEN THE API SHALL return HTTP 400.
4. IF the LLM API returns an error or exceeds its timeout, THEN THE API SHALL return HTTP 500 with `{ "error": "HeatGPT is temporarily unavailable" }`.
5. THE API SHALL apply rate limiting to `POST /api/chat` to prevent excessive LLM API usage.

---

### Requirement 10: Chat Prompt Construction

**User Story:** As the system, I want to build a contextualised system prompt from heat statistics, so that the LLM can provide accurate and relevant answers about a specific LGA.

#### Acceptance Criteria

1. WHEN `buildSystemPrompt` is called with a valid `HeatStats` object and a non-empty `lgaName`, THE ChatService SHALL return a non-empty string that includes the LGA name, `avgLstCelsius`, `avgNdvi`, `uhiIntensity`, `dateRangeStart`, and `dateRangeEnd`.
2. WHEN `uhiIntensity` is greater than 3.0, THE ChatService SHALL include the description "severe urban heat island" in the prompt.
3. WHEN `uhiIntensity` is between 1.5 and 3.0 inclusive, THE ChatService SHALL include the description "moderate urban heat island" in the prompt.
4. WHEN `uhiIntensity` is between 0.0 and 1.5 inclusive, THE ChatService SHALL include the description "mild urban heat island" in the prompt.
5. WHEN `uhiIntensity` is 0.0 or below, THE ChatService SHALL include the description "no significant heat island effect" in the prompt.
6. WHEN `avgNdvi` is greater than 0.5, THE ChatService SHALL include the description "dense vegetation" in the prompt.
7. WHEN `avgNdvi` is between 0.3 and 0.5 inclusive, THE ChatService SHALL include the description "moderate vegetation" in the prompt.
8. WHEN `avgNdvi` is between 0.1 and 0.3 inclusive, THE ChatService SHALL include the description "sparse vegetation" in the prompt.
9. WHEN `avgNdvi` is 0.1 or below, THE ChatService SHALL include the description "minimal vegetation or urban surface" in the prompt.
10. THE `buildSystemPrompt` function SHALL be pure: given the same `heatStats` and `lgaName`, THE ChatService SHALL always return the same string.

---

### Requirement 11: Scheduled Batch Processing

**User Story:** As a system operator, I want heat statistics for all LGAs to be automatically recomputed on a weekly schedule, so that the data remains current without manual intervention.

#### Acceptance Criteria

1. WHEN the weekly cron trigger fires (Mondays at 02:00), THE Scheduler SHALL retrieve all LGA IDs and bounding boxes from PostGIS.
2. WHEN processing LGAs, THE Scheduler SHALL invoke the EarthEngineService in batches of 20 LGAs to avoid exceeding Earth Engine quota limits.
3. WHEN Earth Engine metrics are returned for a batch, THE Scheduler SHALL upsert the computed `avg_lst_celsius`, `avg_ndvi`, `uhi_intensity`, and `processed_at` values into the `heat_stats` table for each LGA.
4. WHEN batch processing completes, THE Scheduler SHALL log a completion record.
5. THE internal processing endpoint (`/api/internal/process-all-lgas`) SHALL require a valid `x-internal-key` header and return HTTP 401 if the header is absent or invalid.

---

### Requirement 12: Data Persistence

**User Story:** As the system, I want LGA boundaries and heat statistics to be stored in PostGIS, so that spatial queries and cached metrics can be served efficiently.

#### Acceptance Criteria

1. THE PostGIS database SHALL store LGA records with `lga_id`, `lga_name`, `state`, `geom` (MultiPolygon, EPSG:4326), `bbox` (JSONB), and `area_km2`.
2. THE PostGIS database SHALL store heat statistics with `lga_id`, `avg_lst_celsius`, `avg_ndvi`, `uhi_intensity`, `data_source`, `date_range_start`, `date_range_end`, and `processed_at`.
3. THE PostGIS database SHALL enforce a UNIQUE constraint on `lga_id` in the `heat_stats` table so that each LGA has at most one statistics record.
4. THE PostGIS database SHALL maintain a GIST spatial index on `lgas.geom` to support efficient spatial queries.
5. IF the PostgreSQL connection pool is exhausted or the server is unreachable, THEN THE API SHALL return HTTP 500 with a generic error message and retry the connection with exponential backoff up to 3 attempts.
6. WHEN LGA records are inserted into the `lgas` table, THE PostGIS database SHALL store the `bbox` column as a JSONB object with `west`, `south`, `east`, and `north` keys derived from `ST_XMin`, `ST_YMin`, `ST_XMax`, and `ST_YMax` of the geometry.
7. WHEN LGA records are inserted into the `lgas` table, THE PostGIS database SHALL store the `area_km2` column as the value of `ST_Area(geom::geography) / 1000000`.

---

### Requirement 13: Security and Input Validation

**User Story:** As a system operator, I want all API inputs to be validated and sensitive credentials to be protected, so that the application is secure against injection attacks and credential exposure.

#### Acceptance Criteria

1. THE API SHALL use parameterised SQL queries for all database interactions to prevent SQL injection.
2. THE API SHALL validate and sanitise all request inputs before processing.
3. THE API SHALL store the Earth Engine service account key and LLM API key as environment variables or GCP Secret Manager secrets, and SHALL NOT expose them in API responses or source control.
4. THE API SHALL configure CORS to allow only the frontend origin in production environments.
5. THE API SHALL apply rate limiting to the `POST /api/chat` endpoint.
6. THE API SHALL use the `zod` library for request body validation on all endpoints.

---

### Requirement 14: Performance

**User Story:** As a user, I want the application to respond quickly for cached data and handle large GeoJSON payloads efficiently, so that the map and statistics load without noticeable delay.

#### Acceptance Criteria

1. WHEN heat statistics exist in PostGIS and are not stale, THE API SHALL return the `GET /api/lga/:id/heat` response within 100 milliseconds.
2. THE API SHALL serve the `GET /api/lgas` response with gzip compression to reduce payload size for the ~550 LGA GeoJSON dataset.
3. THE API SHALL simplify LGA geometry precision to 4 decimal places for the map layer GeoJSON response.
4. WHILE on-demand Earth Engine computation is in progress, THE API SHALL accept the latency of 5–30 seconds without timing out the request.
5. THE Frontend SHALL use client-side caching (React Query or SWR) to avoid redundant API requests within a session.

---

### Requirement 15: LGA Shapefile Import

**User Story:** As a system operator, I want to import the ABS LGA boundary dataset from an ESRI Shapefile into PostGIS using pgShapeLoader and pgAdmin4, so that LGA geometries are available for spatial queries and map rendering before the application is started.

> **Note:** This is a one-time manual data preparation step performed by the operator using pgShapeLoader (bundled with PostGIS) and pgAdmin4. There is no automated import API endpoint. The `lgas` table must be populated before the application backend is started.

#### Acceptance Criteria

1. THE operator SHALL use pgShapeLoader (PostGIS Bundle GUI tool) to load the ABS LGA Shapefile (`.shp` with companion `.dbf`, `.shx`, `.prj` files) into the PostGIS `lgas` table, setting Schema to `public`, Table to `lgas`, Geo Column to `geom`, and SRID to `7844` (GDA2020) or `4283` (GDA94) as appropriate for the source file.
2. AFTER loading via pgShapeLoader, THE operator SHALL run the following SQL in pgAdmin4 Query Tool to rename ABS attribute columns to match the application schema:
   - `ALTER TABLE lgas RENAME COLUMN "LGA_CODE22" TO lga_id;`
   - `ALTER TABLE lgas RENAME COLUMN "LGA_NAME22" TO lga_name;`
   - `ALTER TABLE lgas RENAME COLUMN "STE_NAME21" TO state;`
3. AFTER column renaming, THE operator SHALL run a SQL `UPDATE` to reproject all geometries to WGS84 (EPSG:4326) if the source SRID is not already 4326:
   - `UPDATE lgas SET geom = ST_Transform(geom, 4326);`
   - `SELECT UpdateGeometrySRID('lgas', 'geom', 4326);`
4. AFTER reprojection, THE operator SHALL populate the `bbox` column by running:
   - `UPDATE lgas SET bbox = jsonb_build_object('west', ST_XMin(geom::geometry), 'south', ST_YMin(geom::geometry), 'east', ST_XMax(geom::geometry), 'north', ST_YMax(geom::geometry));`
5. AFTER reprojection, THE operator SHALL populate the `area_km2` column by running:
   - `UPDATE lgas SET area_km2 = ST_Area(geom::geography) / 1000000;`
6. AFTER all updates, THE operator SHALL repair any invalid geometries by running:
   - `UPDATE lgas SET geom = ST_MakeValid(geom) WHERE NOT ST_IsValid(geom);`
7. THE `lgas` table SHALL have a GIST spatial index on `geom` (pgShapeLoader creates this automatically when the index option is enabled during import).
8. WHEN the import and post-processing steps are complete, THE `lgas` table SHALL contain rows where `lga_id`, `lga_name`, `state`, `geom` (EPSG:4326), `bbox`, and `area_km2` are all populated.

---

### Requirement 16: Cesium 3D Map Visualisation

**User Story:** As a user, I want to explore urban heat data on a 3D globe with real terrain, OSM building footprints, and extruded LGA boundaries, so that I can understand heat patterns in spatial context with elevation and built-form.

#### Acceptance Criteria

1. WHEN the application loads, THE CesiumMapView SHALL initialise a CesiumJS 3D globe viewer authenticated with a Cesium Ion access token read from the environment.
2. WHEN the viewer initialises, THE CesiumMapView SHALL load Cesium World Terrain so that real elevation (hills, valleys) is visible across Australia.
3. WHEN the viewer initialises, THE CesiumMapView SHALL load the OSM Buildings tileset (Cesium Ion asset ID 96188) so that building footprints are rendered as 3D blocks.
4. WHEN LGA boundary GeoJSON is fetched from `GET /api/lgas`, THE CesiumMapView SHALL render each LGA polygon as an extruded GeoJSON entity whose extrusion height is proportional to its `uhi_intensity` value.
5. WHEN rendering extruded LGA entities, THE CesiumMapView SHALL colour each entity using the same heat choropleth scale as the existing `heatChoropleth` utility, based on the LGA's `avg_lst` value.
6. WHEN a user clicks an extruded LGA entity, THE CesiumMapView SHALL emit the selected `lga_id` to the parent component via the `onLgaSelect` callback.
7. WHEN the viewer initialises, THE CesiumMapView SHALL position the camera to a default view centred over Australia.
8. IF the `GET /api/lgas` request fails, THEN THE CesiumMapView SHALL display an error message to the user.
9. IF the Cesium Ion access token is absent or invalid, THEN THE CesiumMapView SHALL display a descriptive error message and not attempt to load Ion assets.
10. THE CesiumMapView SHALL accept the same `onLgaSelect` prop interface as the existing `MapView` component so that `App.tsx` requires no prop changes.

---

### Requirement 17: GEE Satellite Layer Visualisation

**User Story:** As a user, I want to overlay satellite-derived LST and NDVI layers directly on the selected LGA polygon on the map, so I can visually inspect the spatial distribution of heat and vegetation within the area.

#### Acceptance Criteria

1. WHEN an LGA is selected and heat stats are loaded, THE SidePanel SHALL display toggle buttons for "LST Heatmap", "NDVI Vegetation", and "None".
2. WHEN "LST Heatmap" is selected, THE system SHALL fetch a GEE-rendered PNG thumbnail of the LST image for the LGA bbox and overlay it on the map clipped to the LGA polygon shape.
3. WHEN "NDVI Vegetation" is selected, THE system SHALL fetch a GEE-rendered PNG thumbnail of the NDVI image and overlay it clipped to the LGA polygon shape.
4. WHEN "None" is selected, THE overlay SHALL be removed from the map.
5. THE LST layer SHALL use a blue-to-red colour palette (min 20°C, max 50°C).
6. THE NDVI layer SHALL use a red-to-green colour palette (min -0.2, max 0.8).
7. THE overlay SHALL be clipped to the exact LGA polygon shape using an SVG clip mask, not a rectangular bbox.
8. WHEN a layer is active, THE LGA polygon fill opacity SHALL be reduced to near-transparent so the satellite image is visible.
9. THE backend SHALL proxy the GEE thumbnail image through `/api/lga/:id/tile-image` so the browser does not need EE auth headers.
10. THE backend SHALL cache the EE thumbnail URL for 55 minutes to avoid redundant EE API calls.

---

### Requirement 18: Custom Date Range for Satellite Visualisation

**User Story:** As a user, I want to specify a custom date range for the satellite layer overlay, so I can explore how heat and vegetation patterns change over specific time periods.

#### Acceptance Criteria

1. WHEN a satellite layer (LST or NDVI) is active, THE SidePanel SHALL display a date range picker with "From" and "To" date inputs and an "Apply" button.
2. WHEN the user enters a valid date range (start < end) and clicks Apply, THE system SHALL re-fetch the satellite layer for that specific period.
3. IF no satellite imagery exists for the specified date range, THE system SHALL display "No satellite data found for this period".
4. WHEN the user clicks Reset, THE system SHALL revert to the default timespan date range.
5. THE Apply button SHALL be disabled when dates are invalid or start >= end.
6. WHEN the date range is applied, THE SidePanel SHALL show the active period as "Showing mean for {start} → {end}".

---

### Requirement 19: Enhanced SidePanel Analytics

**User Story:** As a user, I want richer analytics in the SidePanel including temperature trend charts, heat risk classification, and NDVI vs LST comparison bars.

#### Acceptance Criteria

1. THE SidePanel SHALL display a heat risk badge (Low/Moderate/High/Extreme) colour-coded by UHI intensity thresholds (≤0, >0, >1.5, >3.0).
2. THE SidePanel SHALL display a temperature trend line chart showing LST values across 4 non-overlapping 90-day windows over the past year.
3. THE SidePanel SHALL display horizontal progress bars comparing temperature (0–70°C scale) and vegetation (NDVI -1 to 1 scale).
4. THE SidePanel SHALL display timespan selector buttons (30d, 90d, 180d, 1yr) that re-fetch heat stats for the selected period.
5. IF a trend window has no Landsat imagery, THE chart SHALL skip that data point gracefully.

---

### Requirement 20: Map PDF Export

**User Story:** As a user, I want to export the current map view to a PDF, so that I can save, share, or print a snapshot of the satellite layer analysis with its legend, scale, title, and data source information.

#### Acceptance Criteria

1. WHEN a satellite layer (LST or NDVI) is active, THE MapControls SHALL display an "Export PDF" button visible on the map.
2. WHEN no satellite layer is active, THE MapControls SHALL hide the "Export PDF" button.
3. WHEN the user clicks "Export PDF", THE PDFExporter SHALL capture the current map view including the active satellite overlay using html2canvas.
4. WHEN generating the PDF, THE PDFExporter SHALL include a title composed of the selected LGA name and the active layer type (e.g. "City of Melbourne — LST Heatmap").
5. WHEN generating the PDF, THE PDFExporter SHALL include the legend for the active layer (LST or NDVI colour palette with labels) rendered below the map image.
6. WHEN generating the PDF, THE PDFExporter SHALL include a traditional scale bar showing the current map scale, with tick marks at both ends and a distance label (in metres or kilometres).
7. WHEN generating the PDF, THE PDFExporter SHALL include a data sources section stating the satellite data origin (Landsat 9 for LST, Sentinel-2 for NDVI) and the date range of the active layer.
8. WHEN the PDF is ready, THE PDFExporter SHALL trigger a browser download of the file named `{lga-name}-{layer-type}-{date}.pdf` using lowercase kebab-case.
9. WHILE the PDF is being generated, THE MapControls SHALL display a loading indicator on the "Export PDF" button and disable further clicks.
10. IF html2canvas fails to capture the map, THEN THE PDFExporter SHALL display an error message to the user and re-enable the export button.
11. THE PDFExporter SHALL produce a PDF in A4 landscape orientation with the map image scaled to fill the page width.
12. THE PDFExporter SHALL use jsPDF for PDF generation and html2canvas for DOM-to-canvas capture.
13. WHEN the map is captured, THE PDFExporter SHALL capture the element with id `"map"` including any active SVG clip-masked satellite overlay rendered within it.
14. THE PDFExporter SHALL accept `lgaName`, `activeTileLayer`, and `scaleInfo` as inputs and produce no mutations to those inputs.

---

### Requirement 21: Automatic Satellite Layer Data Persistence

**User Story:** As a user, I want satellite layer data to be automatically cached in the database when I view an LGA, so that subsequent views of the same LGA load instantly without redundant API calls to Google Earth Engine.

#### Acceptance Criteria

1. WHEN satellite layer processing completes for an LGA, THE EarthEngineService SHALL automatically save the tile URL, bbox, date range, layer type, and computed metrics to the `gee_layers` table in PostGIS.
2. WHEN a user clicks an LGA polygon to view satellite layers, THE API SHALL first query the `gee_layers` table for cached data matching the LGA ID, layer type, and date range.
3. WHEN cached satellite layer data exists in the `gee_layers` table for the requested LGA and date range, THE API SHALL return the cached tile URL and metrics without calling the Google Earth Engine API.
4. WHEN no cached satellite layer data exists for the requested LGA and date range, THE API SHALL fetch data from Google Earth Engine, render the layer, and automatically save the result to the `gee_layers` table before returning.
5. WHEN saving satellite layer data to the `gee_layers` table, THE API SHALL store `lga_id`, `layer_type` ('lst' or 'ndvi'), `date_range_start`, `date_range_end`, `tile_url`, `ee_url`, `avg_lst_celsius`, `avg_ndvi`, `uhi_intensity`, and `exported_at` timestamp.
6. THE SidePanel SHALL NOT display a manual "Export" button for satellite layers — all persistence SHALL occur automatically.
7. THE API SHALL maintain the existing "Load" functionality to retrieve and display cached satellite layer data from the `gee_layers` table.
8. WHEN multiple requests for the same LGA and date range occur concurrently, THE API SHALL prevent duplicate Google Earth Engine API calls by checking the cache before each request.
9. THE `gee_layers` table SHALL use composite indexes on `(lga_id, layer_type)` to optimize cache lookup queries.
10. WHEN satellite layer data is cached, THE API SHALL store both the proxied tile URL (for client use) and the raw Earth Engine URL (for reference) in separate columns.
