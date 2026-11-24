# Map layers: roads and property lines

Two layers added in round 5 at Dana's request ("You can also add streets and roads to the map. If at
all possible you can also add the property lines in for the hunting map with something that will
keep them updated", Nov 24, 2026). Both are switches in **Layers and packs → Roads and property lines**.

## Roads and streets (built in, offline)

| | |
| --- | --- |
| What | Roads, streets, tracks and logging roads with names, drawn as lines with name labels |
| Where it shows | Map and Hunt map (same map view), above the terrain picture, below marks and the scent cone. Also shows with no map pack yet |
| Data | The offline OpenStreetMap road graphs that routing (PR #33) already bundles, `assets/routing/<state>.yrg`, read with `createRouteService().roadsInBox(region, box, { maxClass })`. **No second copy of the roads is bundled; this layer adds no road data to the APK** |
| Source / license | OpenStreetMap via Geofabrik extracts, Open Database License (ODbL) 1.0. Credit "© OpenStreetMap contributors", shown in About this map |
| Coverage | The 15 map-pack states in `symbolic/routing/regions.js` (Colorado, Connecticut, Idaho, Maine, Massachusetts, Michigan, Minnesota, Montana, New Hampshire, New York, Pennsylvania, Rhode Island, Vermont, Wisconsin, Wyoming) |
| Detail by zoom | Below 9: none (the packs show the land). 9 to 10: motorways, trunk, primary, secondary. 10 to 11.5: plus tertiary. 11.5 to 13: plus local and residential streets. 13 and closer: plus service roads and tracks (dashed). Paths and trails stay with the packs |
| Kept | Road class and name only (`c`, `n`) |
| How | After the map stops moving, the road lines for the state under the middle of the screen are read for the view plus 40% padding; panning inside that box reads nothing new. One state graph is in memory at a time (shared with routing) |
| Search by name | Use the Map search from routing (streets in the graph and places) |
| Font | Noto Sans Regular map glyphs (ranges 0-255 and 8192-8447) from protomaps/basemaps-assets, SIL Open Font License 1.1 (`docs/fonts-OFL.txt`), in `symbolic/road_glyphs.js` (~190 KB), served by the loopback tile server at `/glyphs/{fontstack}/{range}.pbf` (127.0.0.1 only). Other ranges get an empty range |

To refresh the roads, rebuild the routing graphs (`tools/routing/build_all.sh`, see `docs/routing.md`).
Not every logging road, gate or closure is mapped.

The downloaded offline **areas** (terrain tiles) still carry no roads; this layer draws them.
The raster **map packs** (`tools/mappacks/`) are unchanged.

## Property lines (Hunt map; online, then saved)

| | |
| --- | --- |
| What | Parcel outlines only, as dashed yellow lines, from zoom 13 in |
| Where it shows | Hunt map, when "Property lines (Hunt map)" is on (off by default) |
| Fetch | Only while the switch is on and the Hunt map is open: for the cells (z14 map tiles, about 2 km) on screen, at most 6 at a time, an ArcGIS REST `query` to the state's public parcel service with `outFields=<record id>` and `f=geojson`. Owner, address and value fields are never requested. The record id is dropped before saving |
| Saved | On the phone (`documentDirectory/yehsa-parcels/`), one file per cell with the date it was fetched; up to 400 cells, least recently used dropped first; "Remove saved property lines" clears them |
| Offline | Saved cells draw with no signal; the note says "Offline: showing the copy saved on this phone" |
| Keeps updated | A saved cell older than **30 days** (`PARCEL_REFRESH_DAYS`) is fetched again the next time it is viewed online, and once per session every saved cell older than 30 days is refreshed in the background. The note always shows the data date |
| Note shown | "Property lines are approximate, not a legal survey. Data date X. Source: Y." |
| Privacy | The state service sees the map area asked about (like any web map), no account, no key, no personal info. No owner names are ever displayed or stored |
| Keys | None. No paid API (no Regrid, no onX), no scraping |

### Sources by state

All are free public ArcGIS REST services published by the state (or its GIS clearinghouse) for
public use. Yehsa does not redistribute the data: each phone asks the public service directly
for lines only, and shows the source and the "not a legal survey" disclaimer each publisher asks for.
Checked live on Nov 24, 2026 (a 2 km cell in each state returned outlines).

| State | Publisher / dataset | Service | License / terms (as published) | Coverage |
| --- | --- | --- | --- | --- |
| Maine | Maine GeoLibrary, Maine Parcels Organized Towns (towns that submitted data) | `https://services1.arcgis.com/RbMX0mRVOFNTdLzd/arcgis/rest/services/Maine_Parcels_Organized_Towns/FeatureServer/10` | Public access; user assumes risk; not survey grade (Maine GeoLibrary terms). | Organized towns that sent data to the Maine GeoLibrary. The Unorganized Territory and some towns are missing, and some towns' lines are many years old. |
| New Hampshire | NH GRANIT, NH Parcel Mosaic (data from NH Department of Revenue Administration) | `https://nhgeodata.unh.edu/hosting/rest/services/Hosted/CAD_ParcelMosaic/FeatureServer/1` | Public service for estimation and planning only, not for legal use (NH GRANIT terms). | Statewide mosaic of town parcel maps; completeness varies by town. |
| Vermont | VCGI, Vermont Statewide Standardized Parcel Data | `https://services1.arcgis.com/BkFxaEFNwHqX3tAw/arcgis/rest/services/FS_VCGI_OPENDATA_Cadastral_VTPARCELS_poly_standardized_parcels_SP_v1/FeatureServer/0` | VCGI open data; not a legal survey, planning use only (VCGI terms). | Statewide; updated weekly by VCGI from town data. |
| Massachusetts | MassGIS (Bureau of Geographic Information), Property Tax Parcels | `https://services1.arcgis.com/hGdibHYSPO59RG1h/arcgis/rest/services/Massachusetts_Property_Tax_Parcels/FeatureServer/0` | MassGIS public data; assessor mapping, not an authoritative boundary (MassGIS terms). | All 351 cities and towns. |
| Connecticut | Connecticut Office of Policy and Management / CT GIS Office, CAMA and Parcel Layer | `https://services3.arcgis.com/3FL1kr7L4LvwA2Kb/arcgis/rest/services/Connecticut_CAMA_and_Parcel_Layer/FeatureServer/0` | CC0 (public domain dedication). | All 169 towns. |
| New York | NYS ITS Geospatial Services, NYS Tax Parcels Public (contributing counties) | `https://services6.arcgis.com/EbVsqZ18sv1kVJ3k/arcgis/rest/services/NYS_Tax_Parcels_Public/FeatureServer/1` | Public map service, provided as is (NYS ITS terms). | Only counties that share parcels publicly (about 38 of 62). Missing counties include Allegany, Cattaraugus, Chemung, Chenango, Clinton, Columbia, Delaware, Dutchess, Essex, Franklin, Fulton, Herkimer, Jefferson, Madison, Monroe, Nassau, Niagara, Orleans, Saratoga, Schenectady, Schoharie, Seneca, Washington and Yates. |
| Wisconsin | Wisconsin State Cartographer's Office / WLIP, Statewide Parcel Map Database (V12) | `https://services3.arcgis.com/n6uYoouQZW75n5WI/arcgis/rest/services/Wisconsin_Statewide_Parcels_DB/FeatureServer/0` | Free for public use (Wisconsin Statewide Parcel Map Database terms). | All 72 counties; updated once a year. |
| Minnesota | MnGeo, Parcels compiled from opt-in open data counties | `https://enterprise.gisdata.mn.gov/aghost/rest/services/us_mn_state_mngeo/plan_parcels_open/FeatureServer/1` | Open data from counties that opted in to free distribution (MnGeo terms). | Only counties that opted in (about 59 of 87). |
| Colorado | State of Colorado OIT GIS, Colorado Public Parcels (accessed from gis.colorado.gov) | `https://gis.colorado.gov/public/rest/services/Address_and_Parcel/Colorado_Public_Parcels/FeatureServer/0` | Free with attribution to the State of Colorado; resale forbidden (Colorado OIT terms). | About 44 of 64 counties. |
| Montana | Montana State Library, Montana Cadastral Framework (Department of Revenue data) | `https://gisservice.mt.gov/arcgis/rest/services/msdi_cadastral_map_v1/MapServer/1` | Public, informational use only; not a legal survey (Montana State Library terms). | All 56 counties; updated monthly. |
| Idaho | State of Idaho, Public Idaho Parcels (participating county assessors) | `https://services1.arcgis.com/CNPdEkvnGl65jCX8/arcgis/rest/services/Public_Idaho_Parcels_/FeatureServer/7` | Public; county data as is; no mailing-list use (Idaho Parcel Data Exchange terms). | Only 13 of 44 counties: Ada, Bear Lake, Boise, Camas, Gooding, Jerome, Lincoln, Minidoka, Nez Perce, Oneida, Teton, Valley and Washington. |
| Wyoming | Wyoming Department of Revenue, Wyoming Parcels for 2026 | `https://services3.arcgis.com/r0iJ85SKZ4zAzz3P/arcgis/rest/services/Wyoming_Parcels_for_2026/FeatureServer/0` | Public service; no license text published (Wyoming Department of Revenue). | All 23 counties; a new service is published each tax year. |

### States with no free source

| State | Why |
| --- | --- |
| Rhode Island | Rhode Island has no statewide public parcel layer yet (RIGIS lists it as a work in progress), so there are no property lines for Rhode Island. |
| Pennsylvania | Pennsylvania has no free statewide parcel layer; only some counties publish their own, so there are no property lines for Pennsylvania yet. |
| Michigan | Michigan has no free statewide parcel layer; only some counties publish their own, so there are no property lines for Michigan yet. |

Some Pennsylvania and Michigan counties publish their own parcel services; they are not added
because each has its own terms. Regrid and onX have nationwide parcels but are paid and not used.
Service URLs that change (Wyoming publishes a new service each tax year) need an app update:
edit `PARCEL_SOURCES` in `symbolic/parcels.js`.
