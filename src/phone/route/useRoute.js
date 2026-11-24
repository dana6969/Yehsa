// State for search, destination, route and Start mode on the regular Map.
// Offline first: bundled place lists and road graphs. Online search and routes only when the
// person has turned "Online search & routes" on (saved on this phone); then any online failure
// falls back to offline. Nothing here runs on the symbol hot path.
import { useCallback, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createRouteService, ROAD_NOTE } from "../../../symbolic/routing/route_service.js";
import { followStep, initialFollow, prepareRoute } from "../../../symbolic/routing/nav_follow.js";
import { distanceM } from "../../../symbolic/routing/geo.js";
import { loadRouteAsset } from "./route_assets.js";
import { speakProse } from "../speech_provider.js";

const KEY = "yehsa.route.prefs.v1";
let service = null;
export function routeService() {
  if (!service) service = createRouteService({ loadAsset: loadRouteAsset });
  return service;
}

export { ROAD_NOTE };

export function useRoute({ origin, nearFallback }) {
  const [prefs, setPrefs] = useState({ online: false, profile: "drive", voice: true });
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [notes, setNotes] = useState([]);
  const [destination, setDestination] = useState(null);
  const [route, setRoute] = useState(null);
  const [routing, setRouting] = useState(false);
  const [routeError, setRouteError] = useState("");
  const [nav, setNav] = useState(null); // { on, follow, state }
  const prepared = useRef(null);
  const pickRef = useRef(null);
  const lastReroute = useRef(0);
  const originRef = useRef(origin);
  originRef.current = origin;

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((raw) => {
      if (!raw) return;
      try {
        const saved = JSON.parse(raw);
        setPrefs((p) => ({ ...p, ...saved }));
      } catch {
        // keep defaults
      }
    }).catch(() => {});
  }, []);
  const savePrefs = useCallback((patch) => {
    setPrefs((p) => {
      const next = { ...p, ...patch };
      AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const runSearch = useCallback(async (text, { autoPick = false, profile } = {}) => {
    const q = String(text ?? query).trim();
    if (q.length < 2) return null;
    setQuery(q);
    setSearching(true);
    setNotes([]);
    try {
      // Bias toward where you are, or toward where the map is looking when GPS is off.
      const near = originRef.current || (typeof nearFallback === "function" ? nearFallback() : null) || null;
      const res = await routeService().search(q, { near, online: prefs.online });
      setResults(res.results);
      setNotes(res.notes);
      if (autoPick && res.results.length) {
        const top = res.results[0];
        await pickRef.current?.(top, { profile });
      }
      return res;
    } catch {
      setResults([]);
      setNotes(["Search did not work this time."]);
      return null;
    } finally {
      setSearching(false);
    }
  }, [query, prefs.online]);

  const computeRoute = useCallback(async (dest, { profile = prefs.profile, quiet = false } = {}) => {
    const from = originRef.current;
    if (!dest) return null;
    if (!from) {
      setRoute(null);
      setRouteError("Turn on GPS to get a route from where you are. Location stays on this phone unless online routes are on.");
      return null;
    }
    setRouting(true);
    if (!quiet) setRouteError("");
    try {
      const res = await routeService().route(from, dest, { profile, online: prefs.online });
      if (!res.ok) {
        setRouteError([...(res.notes || []), res.reason].join(" "));
        if (!quiet) setRoute(null);
        return null;
      }
      setRoute(res.route);
      setRouteError(res.notes?.join(" ") || "");
      prepared.current = prepareRoute(res.route);
      return res.route;
    } catch {
      setRouteError("The route could not be worked out.");
      return null;
    } finally {
      setRouting(false);
    }
  }, [prefs.online, prefs.profile]);

  const pickDestination = useCallback(async (place, { profile } = {}) => {
    const dest = { name: place.name, detail: place.detail || "", latitude: place.latitude, longitude: place.longitude, region: place.region, house: place.house || null };
    setDestination(dest);
    setResults(null);
    if (profile && profile !== prefs.profile) savePrefs({ profile });
    return computeRoute(dest, { profile: profile || prefs.profile });
  }, [computeRoute, prefs.profile, savePrefs]);

  pickRef.current = pickDestination;

  const dropPin = useCallback((point) => pickDestination({
    name: "Dropped pin",
    detail: `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`,
    latitude: point.latitude,
    longitude: point.longitude
  }), [pickDestination]);

  const setProfile = useCallback((profile) => {
    savePrefs({ profile });
    if (destination) computeRoute(destination, { profile });
  }, [destination, computeRoute, savePrefs]);

  const speak = useCallback((text) => {
    if (prefs.voice && text) speakProse(text).catch(() => {});
  }, [prefs.voice]);

  const start = useCallback(() => {
    if (!route) return;
    prepared.current = prepareRoute(route);
    const first = route.steps[0];
    setNav({ on: true, state: initialFollow(), follow: null });
    speak(`${first ? first.instruction : "Starting"}. ${ROAD_NOTE.split(".")[0]}.`);
  }, [route, speak]);

  const stop = useCallback(() => setNav(null), []);

  const clear = useCallback(() => {
    setNav(null);
    setRoute(null);
    setDestination(null);
    setResults(null);
    setRouteError("");
    setQuery("");
    prepared.current = null;
  }, []);

  // Follow the GPS while Start is on: next turn, spoken prompts, reroute when off the line.
  useEffect(() => {
    if (!nav?.on || !origin || !prepared.current) return;
    const out = followStep(prepared.current, nav.state, origin, { profile: route?.profile });
    setNav((current) => (current?.on ? { ...current, state: out.state, follow: out } : current));
    if (out.say) speak(out.say);
    if (out.offRoute && destination && Date.now() - lastReroute.current > 15000) {
      lastReroute.current = Date.now();
      computeRoute(destination, { quiet: true }).then((next) => {
        if (!next) return;
        prepared.current = prepareRoute(next);
        setNav((current) => (current?.on ? { ...current, state: initialFollow() } : current));
      });
    }
  }, [origin?.latitude, origin?.longitude]);

  // Compute the route as soon as a fix arrives for a destination chosen before GPS was on.
  useEffect(() => {
    if (origin && destination && !route && !routing && !nav) computeRoute(destination);
  }, [Boolean(origin)]);

  return {
    prefs, savePrefs, query, setQuery, results, setResults, searching, notes,
    destination, route, routing, routeError, nav,
    runSearch, pickDestination, dropPin, setProfile, start, stop, clear,
    distanceToDestination: origin && destination ? distanceM(origin, destination) : null
  };
}
