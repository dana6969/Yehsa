// Roads and property lines for the Map and Hunt map: the switches (saved on the phone), the road
// lines for what is on screen (read from the offline road graphs routing ships, one state at a
// time), and the property lines for what is on screen.

import { useCallback, useEffect, useRef, useState } from "react";
import { Dimensions, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { routeService } from "./route/useRoute.js";
import { regionsAt } from "../../symbolic/routing/route_service.js";
import { boxInside, padBox, roadLinesFromGraph, roadMaxClassForZoom } from "../../symbolic/roads.js";
import { parcelCache, parcelStorage, parcelsSupported } from "./parcel_store";
import { PARCEL_MIN_ZOOM, parcelGeoJson, parcelNote } from "../../symbolic/parcels.js";
import { viewBoxFrom } from "../../symbolic/map_view_box.js";

const KEY = "yehsa.mapLayers.v1";
const EMPTY = { type: "FeatureCollection", features: [] };

export function useMapExtras({ active = true } = {}) {
  const [roadsOn, setRoadsOn] = useState(true);
  const [parcelsOn, setParcelsOn] = useState(false);
  const [roadLines, setRoadLines] = useState(null);
  const [roadsNote, setRoadsNote] = useState("");
  const roadRead = useRef(null); // { region, maxClass, box } last read
  const roadSeq = useRef(0);
  const [parcels, setParcels] = useState(EMPTY);
  const [parcelText, setParcelText] = useState("");
  const [busy, setBusy] = useState(false);
  const view = useRef(null);
  const refreshed = useRef(false);
  const seq = useRef(0);
  const loaded = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((raw) => {
      const saved = raw ? JSON.parse(raw) : null;
      if (saved && typeof saved.roads === "boolean") setRoadsOn(saved.roads);
      if (saved && typeof saved.parcels === "boolean") setParcelsOn(saved.parcels);
    }).catch(() => {}).finally(() => {
      loaded.current = true;
    });
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    AsyncStorage.setItem(KEY, JSON.stringify({ roads: roadsOn, parcels: parcelsOn })).catch(() => {});
  }, [roadsOn, parcelsOn]);

  // Road lines for the view: the state under the middle of the map, main roads when zoomed out,
  // every street and track close in. Re-read only when the view leaves the last padded box.
  const loadRoads = useCallback(async (box, zoom) => {
    const maxClass = roadMaxClassForZoom(zoom);
    if (maxClass < 0) {
      setRoadLines(null);
      setRoadsNote("Zoom in to see roads and street names.");
      return;
    }
    const center = { longitude: (box.west + box.east) / 2, latitude: (box.south + box.north) / 2 };
    const region = regionsAt(center)[0];
    if (!region) {
      setRoadLines(null);
      setRoadsNote("No built-in roads here (they cover the map-pack states).");
      return;
    }
    const last = roadRead.current;
    if (last && last.region === region.id && last.maxClass === maxClass && boxInside(box, last.box)) return;
    const padded = padBox(box, 0.4);
    const mine = ++roadSeq.current;
    try {
      const fc = await routeService().roadsInBox(region.id, padded, { maxClass });
      if (mine !== roadSeq.current) return;
      roadRead.current = { region: region.id, maxClass, box: padded };
      setRoadLines(roadLinesFromGraph([fc]));
      setRoadsNote("");
    } catch {
      if (mine === roadSeq.current) setRoadsNote("The road data could not be read on this phone.");
    }
  }, []);

  useEffect(() => {
    if (!roadsOn) {
      setRoadLines(null);
      roadRead.current = null;
      return;
    }
    const v = view.current;
    if (v) loadRoads(v.box, v.zoom);
  }, [roadsOn, loadRoads]);

  const loadParcels = useCallback(async (box, zoom) => {
    if (!box) return;
    const mine = ++seq.current;
    setBusy(true);
    try {
      const result = await parcelCache.linesFor(box, { zoom, online: true });
      if (mine !== seq.current) return;
      setParcels(result.rings.length ? parcelGeoJson(result.rings) : EMPTY);
      const center = { longitude: (box.west + box.east) / 2, latitude: (box.south + box.north) / 2 };
      setParcelText(parcelNote(result, { center }));
      // Once a session, when online, bring every saved cell older than the refresh interval up to date.
      if (!refreshed.current && result.fetched > 0) {
        refreshed.current = true;
        parcelCache.refreshStale().catch(() => {});
      }
    } catch {
      if (mine === seq.current) setParcelText("Property lines could not load.");
    } finally {
      if (mine === seq.current) setBusy(false);
    }
  }, []);

  // Called with every map camera event. Property lines load after the map stops moving.
  const timer = useRef(null);
  const roadTimer = useRef(null);
  const onView = useCallback((event) => {
    const { width, height } = Dimensions.get("window");
    const next = viewBoxFrom(event, { width, height });
    if (!next) return;
    view.current = next;
    clearTimeout(roadTimer.current);
    if (roadsOn && Platform.OS !== "web") roadTimer.current = setTimeout(() => loadRoads(next.box, next.zoom), 400);
    if (!parcelsOn || !active) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (next.zoom < PARCEL_MIN_ZOOM) {
        setParcelText("Zoom in closer to see property lines.");
        return;
      }
      loadParcels(next.box, next.zoom);
    }, 700);
  }, [parcelsOn, active, loadParcels, roadsOn, loadRoads]);

  useEffect(() => {
    if (!parcelsOn) {
      setParcels(EMPTY);
      setParcelText("");
      return;
    }
    if (!active) return;
    const v = view.current;
    if (v && v.zoom >= PARCEL_MIN_ZOOM) loadParcels(v.box, v.zoom);
    else setParcelText("Zoom in closer to see property lines.");
  }, [parcelsOn, active, loadParcels]);

  useEffect(() => () => {
    clearTimeout(timer.current);
    clearTimeout(roadTimer.current);
  }, []);

  return {
    roadsOn,
    setRoadsOn,
    roadLines,
    roadsNote,
    roadsAvailable: Platform.OS !== "web",
    parcelsOn,
    setParcelsOn,
    parcelsAvailable: parcelsSupported,
    parcels,
    parcelText,
    parcelBusy: busy,
    clearParcels: async () => {
      await parcelStorage.clear();
      setParcels(EMPTY);
      setParcelText("Saved property lines removed from this phone.");
    },
    onView
  };
}
