import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Location from 'expo-location';

import { areaName, HAS_MAPBOX_TOKEN, MapboxError, nearbyPlaces, searchPlaces } from '../services/mapbox';
import type { LatLon, MapPlace, SpendFilter } from '../services/mapbox';
import { useCardStore } from '../store/useCardStore';
import type { CardData } from '../store/useCardStore';
import { haversineDistance } from '../utils/geospatial';
import { classifyMapboxPlace, normalizeMerchant } from '../utils/merchantClassifier';
import type { MerchantCategory } from '../utils/merchantClassifier';
import { getRankedRecommendations } from '../utils/recommendationEngine';
import type { RecommendationResult } from '../utils/recommendationEngine';

export type LocationCoord = LatLon;

export type EnrichedPlace = {
  id: string;
  name: string;
  address: string;
  normalizedName: string;
  category: MerchantCategory;
  center: [number, number];
  distanceKm: number;
  recommendation: RecommendationResult | null;
  /** Every wallet card ranked for this place (₹2,000 sample spend). */
  ranked: RecommendationResult[];
  isPoi: boolean;
};

export type PermissionState = 'checking' | 'granted' | 'denied' | 'services-off';
export type LoadState = 'idle' | 'loading' | 'ready' | 'error';

/** Search radii offered on screen, in km. 5 km is the default. */
export const RADIUS_OPTIONS = [1, 2, 5, 10] as const;
export type RadiusKm = (typeof RADIUS_OPTIONS)[number];

/** Ignore GPS jitter: only a move of this many km re-runs the nearby search. */
const MOVE_THRESHOLD_KM = 0.15;
/** Last known position younger than this is good enough to start with. */
const LAST_KNOWN_MAX_AGE_MS = 10 * 60 * 1000;
/** Pause in typing before a search, and the shortest query searched while typing. */
const SEARCH_DEBOUNCE_MS = 450;
const SEARCH_MIN_CHARS = 3;

/** Turns a Mapbox place into a place with a spend type, distance and the best wallet card. */
export function enrichPlace(p: MapPlace, fallback: MerchantCategory, from: LatLon | null, cards: CardData[]): EnrichedPlace {
  const normalizedName = normalizeMerchant(p.name);
  const category = classifyMapboxPlace(p.name, p.categories, p.maki, fallback);
  const ranked = getRankedRecommendations(normalizedName, category, cards);
  return {
    id: p.id,
    name: p.name,
    address: p.address,
    normalizedName,
    category,
    center: [p.lon, p.lat],
    distanceKm: from ? haversineDistance(from.lat, from.lon, p.lat, p.lon) : 0,
    recommendation: ranked[0] ?? null,
    ranked,
    isPoi: p.isPoi,
  };
}

const errorText = (e: unknown) =>
  e instanceof MapboxError ? e.message : 'Something went wrong loading places. Check your connection and try again.';

export function useBestCardLogic() {
  const cards = useCardStore((s) => s.cards);

  // ── Location ───────────────────────────────────────
  const [permission, setPermission] = useState<PermissionState>('checking');
  const [userLocation, setUserLocation] = useState<LatLon | null>(null);
  const [customCenter, setCustomCenter] = useState<LatLon | null>(null);
  const [locationAttempt, setLocationAttempt] = useState(0);
  const activeLocation = customCenter ?? userLocation;

  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;

    const accept = (loc: Location.LocationObject | null) => {
      if (!loc || cancelled) return;
      const next = { lat: loc.coords.latitude, lon: loc.coords.longitude };
      setUserLocation((prev) => (prev && haversineDistance(prev.lat, prev.lon, next.lat, next.lon) < MOVE_THRESHOLD_KM ? prev : next));
    };

    (async () => {
      try {
        setPermission('checking');
        if (!(await Location.hasServicesEnabledAsync())) {
          if (!cancelled) setPermission('services-off');
          return;
        }
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;
        if (status !== 'granted') {
          setPermission('denied');
          return;
        }
        setPermission('granted');
        // Fast start from the last known fix, then a fresh fix, then follow movement.
        accept(await Location.getLastKnownPositionAsync({ maxAge: LAST_KNOWN_MAX_AGE_MS }));
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).then(accept, () => {});
        sub = await Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced, distanceInterval: 50, timeInterval: 10000 }, accept);
        if (cancelled) sub.remove();
      } catch {
        if (!cancelled) setPermission('denied');
      }
    })();

    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [locationAttempt]);

  const retryLocation = useCallback(() => setLocationAttempt((n) => n + 1), []);
  const backToMyLocation = useCallback(() => setCustomCenter(null), []);

  // ── Area name for the header ───────────────────────
  const [areaLabel, setAreaLabel] = useState<string | null>(null);
  const areaKey = activeLocation ? `${activeLocation.lat.toFixed(3)},${activeLocation.lon.toFixed(3)}` : null;
  useEffect(() => {
    if (!activeLocation || !HAS_MAPBOX_TOKEN) return;
    let live = true;
    areaName(activeLocation).then((name) => live && setAreaLabel(name));
    return () => {
      live = false;
    };
    // areaKey rounds the position so GPS jitter does not trigger a new lookup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaKey]);

  // ── Nearby places ──────────────────────────────────
  const [activeCategory, setActiveCategory] = useState<SpendFilter>('All');
  const [radiusKm, setRadiusKm] = useState<RadiusKm>(5);
  const [refreshKey, setRefreshKey] = useState(0);
  const nearbyKey = activeLocation ? `${activeLocation.lat.toFixed(3)},${activeLocation.lon.toFixed(3)}` : null;
  // Identifies one nearby request. A result belongs to the request whose key it carries,
  // so "loading" is simply "the latest result is for an older key".
  const requestKey = `${nearbyKey}|${activeCategory}|${radiusKm}|${refreshKey}`;
  const [result, setResult] = useState<{ key: string; places: MapPlace[]; error: string | null }>({ key: '', places: [], error: null });

  useEffect(() => {
    // Without a key the screen shows its own "key missing" message instead.
    if (!activeLocation || !HAS_MAPBOX_TOKEN) return;
    let live = true;
    nearbyPlaces(activeLocation, activeCategory, radiusKm).then(
      (list) => live && setResult({ key: requestKey, places: list, error: null }),
      (e) => live && setResult((prev) => ({ key: requestKey, places: prev.places, error: errorText(e) })),
    );
    return () => {
      live = false;
    };
    // requestKey covers position (rounded to about 100 m), category, radius and retries.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  const rawPlaces = result.places;
  const placesState: LoadState = !activeLocation || !HAS_MAPBOX_TOKEN ? 'idle' : result.key !== requestKey ? 'loading' : result.error ? 'error' : 'ready';
  const placesError = result.error;

  const refreshPlaces = useCallback(() => setRefreshKey((n) => n + 1), []);

  // Card recommendations update instantly when the wallet changes, without refetching.
  const places = useMemo(() => {
    const fallback: MerchantCategory = activeCategory === 'All' ? 'Unknown' : activeCategory;
    return rawPlaces.map((p) => enrichPlace(p, fallback, activeLocation, cards));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawPlaces, cards, nearbyKey]);

  // ── Search ─────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MapPlace[]>([]);
  const [searchState, setSearchState] = useState<LoadState>('idle');
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const latestSearch = useRef(0);

  useEffect(() => {
    const q = searchQuery.trim();
    const request = ++latestSearch.current;
    if (q.length < SEARCH_MIN_CHARS) return;
    const timer = setTimeout(() => {
      setSearchState('loading');
      setSearchError(null);
      searchPlaces(q, activeLocation ?? userLocation).then(
        (list) => {
          if (request !== latestSearch.current) return;
          setSearchResults(list);
          setSearchState('ready');
        },
        (e) => {
          if (request !== latestSearch.current) return;
          setSearchResults([]);
          setSearchState('error');
          setSearchError(errorText(e));
        },
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  // Pressing Search runs the fuller search (Search Box shops as well as Geocoding).
  const submitSearch = useCallback(() => {
    const q = searchQuery.trim();
    if (q.length < 2) return;
    const request = ++latestSearch.current;
    setSearchState('loading');
    setSearchError(null);
    searchPlaces(q, activeLocation ?? userLocation, { thorough: true }).then(
      (list) => {
        if (request !== latestSearch.current) return;
        setSearchResults(list);
        setSearchState('ready');
      },
      (e) => {
        if (request !== latestSearch.current) return;
        setSearchState('error');
        setSearchError(errorText(e));
      },
    );
  }, [searchQuery, activeLocation, userLocation]);

  const clearSearch = useCallback(() => {
    setSearchQuery('');
    setSearchResults([]);
    setIsSearching(false);
  }, []);

  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);

  return {
    // location
    permission,
    retryLocation,
    userLocation,
    customCenter,
    setCustomCenter,
    backToMyLocation,
    activeLocation,
    areaLabel,
    // nearby
    activeCategory,
    setActiveCategory,
    radiusKm,
    setRadiusKm,
    places,
    placesState,
    placesError,
    refreshPlaces,
    // search
    searchQuery,
    setSearchQuery,
    searchResults,
    // Under two characters there is no search, whatever the last request did.
    searchState: searchQuery.trim().length < 2 ? ('idle' as LoadState) : searchState,
    searchError,
    isSearching,
    setIsSearching,
    clearSearch,
    submitSearch,
    // selection
    selectedPlaceId,
    setSelectedPlaceId,
    hasMapboxKey: HAS_MAPBOX_TOKEN,
  };
}

