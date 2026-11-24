// Roads and property lines for the Map and Hunt map: the switches (saved on the phone), the
// built-in road layer coming up, road search, and the property lines for what is on screen.

import { useCallback, useEffect, useRef, useState } from "react";
import { Dimensions, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { openRoads, roadsSupported, searchRoads } from "./roads_store";
import { parcelCache, parcelStorage, parcelsSupported } from "./parcel_store";
import { PARCEL_MIN_ZOOM, parcelGeoJson, parcelNote } from "../../symbolic/parcels.js";
import { viewBoxFrom } from "../../symbolic/map_view_box.js";

const KEY = "yehsa.mapLayers.v1";
const EMPTY = { type: "FeatureCollection", features: [] };

export function useMapExtras({ active = true } = {}) {
  const [roadsOn, setRoadsOn] = useState(true);
  const [parcelsOn, setParcelsOn] = useState(false);
  const [roadsReady, setRoadsReady] = useState(false);
  const [roadsNote, setRoadsNote] = useState("");
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

  useEffect(() => {
    if (!roadsOn || roadsReady || Platform.OS === "web" || !roadsSupported()) return undefined;
    let live = true;
    openRoads((text) => live && setRoadsNote(text)).then((roads) => {
      if (!live) return;
      setRoadsReady(Boolean(roads));
      setRoadsNote(roads ? "" : "The road layer could not open on this phone.");
    });
    return () => {
      live = false;
    };
  }, [roadsOn, roadsReady]);

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
  const onView = useCallback((event) => {
    const { width, height } = Dimensions.get("window");
    const next = viewBoxFrom(event, { width, height });
    if (!next) return;
    view.current = next;
    if (!parcelsOn || !active) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (next.zoom < PARCEL_MIN_ZOOM) {
        setParcelText("Zoom in closer to see property lines.");
        return;
      }
      loadParcels(next.box, next.zoom);
    }, 700);
  }, [parcelsOn, active, loadParcels]);

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

  useEffect(() => () => clearTimeout(timer.current), []);

  return {
    roadsOn,
    setRoadsOn,
    roadsReady,
    roadsNote,
    roadsAvailable: Platform.OS !== "web" && roadsSupported(),
    parcelsOn,
    setParcelsOn,
    parcelsAvailable: parcelsSupported,
    parcels,
    parcelText,
    parcelBusy: busy,
    search: (text, near) => searchRoads(text, { near }),
    clearParcels: async () => {
      await parcelStorage.clear();
      setParcels(EMPTY);
      setParcelText("Saved property lines removed from this phone.");
    },
    onView
  };
}
