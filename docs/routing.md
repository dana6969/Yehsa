# Search, destinations and routes (regular Map)

Round 5. Dana, 24 Nov 2026: "set destinations and get routes like Waze or Google, and allow the search query to help you set destinations."

## What the person sees

- **Search bar** above the Map (not in Hunt view): places, streets, addresses. Results list → **Set as destination**. **Long-press** the map also sets a destination ("Dropped pin").
- **Route card** under the map: name, distance, time, **Online route / Offline route**, **Drive / Walk**, **Start**, **Steps (n)**, and always: *Check road conditions and obey all signs. Roads, tracks and trails can be closed, gated, washed out or private. No traffic data is used.*
- **Start**: follows GPS and recenters, shows the next turn and its distance, speaks turns through the existing voice (Expo Speech), says "Off route. Finding a new way." and reroutes (at most every 15 s), says "You have arrived." Voice mute, Recenter and End are on the banner.
- **Ask** can drive it: "directions to X", "route to X", "how far to X", "take me to X", "how do I get to X", "navigate to X" open the Map with X searched and the route ready. Coordinates and "last waypoint" questions stay with the existing waypoint tools.
- GPS stays opt-in. Online search and routes are **on by default** (Dana's call: pull whatever he asks); the "Online search & routes: On. Tap to turn off" line shows exactly what leaves the phone and turns it off. With it off, or with no signal, search and routes use only the bundled data.

## Offline (default)

- `assets/routing/<state>.yrg`: compact road graph per map-pack state (15 states), built by `tools/routing/build_graph.py` from Geofabrik OpenStreetMap extracts. Intersections are nodes; road pieces between them are edges with Douglas-Peucker (10 m) shape points, class, one-way flags and names. Varint/zigzag-delta encoded. Roads: motorway to residential, named service roads, tracks, paths and named footways. Driveways, parking aisles and unnamed sidewalks are left out. Islands smaller than 30 nodes are dropped.
- `assets/routing/<state>_places.ypl` (the `_places` suffix keeps it from sharing an Android raw-resource name with `<state>.yrg`; Android drops extensions, so `vt.yrg` and `vt.ypl` collided and failed the Gradle build): place list (towns, peaks, lakes incl. big multipolygon lakes, parks, protected areas, trailheads, campsites, fuel, hospitals, stores…), tab-separated text. Streets are searched in the road graph itself, so they are not duplicated here. No house numbers, no parcels, no owner names.
- `symbolic/routing/router.js`: A* by travel time over the graph (drive speeds by road class; walk 4–5 km/h, no motorways; one-way only for driving). Snaps to every road within a few metres of the nearest one, so a start at a junction can leave by any road.
- Offline routes stay inside one state's graph; a trip that crosses a state line needs online routing (the card says so).
- Rebuild: `PBF=/path/to/geofabrik OUT=assets/routing PY=python3 tools/routing/build_all.sh && node tools/routing/make_regions.mjs`.

## Online (only when turned on)

| Use | Service | Terms checked 24 Nov 2026 | How Yehsa complies |
| --- | --- | --- | --- |
| Routes | OSRM on **routing.openstreetmap.de** (FOSSGIS), `routed-car` and `routed-foot` | https://routing.openstreetmap.de/about.html: attribution and a "fix the map" link, valid User-Agent, max 1 request/s, no scraping or heavy use | `User-Agent: Yehsa/1.0 (...)`, one request per second, only when you route or are off route (≥15 s apart), credit + https://www.openstreetmap.org/fixthemap on the route card. The OSRM demo server (router.project-osrm.org) is **not** used. |
| Search | **Photon** by Komoot, photon.komoot.io | https://photon.komoot.io/: free to use, be fair, heavy use is throttled, no guarantee | Only on Search press (no search-as-you-type), cached, 1 request/s per host. |
| Search fallback | **OSM Nominatim**, nominatim.openstreetmap.org | https://operations.osmfoundation.org/policies/nominatim/: max 1 req/s, identifying User-Agent, attribution, no autocomplete, cache results, app must be able to switch the endpoint without an update | Only if Photon fails; same limits; cached. Endpoints are parameters (`settings.photonBase`, `settings.nominatimBase`, `endpoints` for routes), but there is **no remote switch yet**, so changing them today needs an app update. Open item before any wide release. |

Any online failure falls back to the offline graph and place list. No traffic data is used or claimed. All data: © OpenStreetMap contributors, ODbL 1.0.

## Not on the hot path

Nothing here is imported by `symbolic/symbolic_dictionary.js`. Road files load only when the Map searches or routes (or Ask opens a route). `getMappedAction` timing is unchanged (eval/hotpath.mjs).

## For the road layer (cursor/yehsa-r5-roads-parcels)

`createRouteService().roadsInBox(region, box, { maxClass })` returns GeoJSON road lines (with class and name) from the same `.yrg` graph, if the road layer ever wants to draw from it instead of a second copy of the roads.
