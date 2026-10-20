/**
 * Mapbox APIs used by the Best Card screen.
 *
 *  - Search Box API, category search: up to 25 places of a type (restaurants, fuel...)
 *    near a point. This is the main source for "places within 5 km".
 *  - Search Box API, forward search: what the user types ("DMart Karve Nagar").
 *  - Search Box API, list categories: the category ids Mapbox supports today.
 *  - Geocoding v6 reverse: the area name for the header ("Near Kothrud, Pune").
 *  - Geocoding v5: fallback for search and nearby where the Search Box API has
 *    no result, since Mapbox's POI coverage varies by country.
 *
 * Docs: https://docs.mapbox.com/api/search/search-box/ and /api/search/geocoding/
 *
 * Free tier, per month (mapbox.com/pricing): Geocoding (temporary) 100,000 requests;
 * Search Box /category and /reverse 25,000 requests; Search Box forward search only
 * 500 sessions. So typing uses Geocoding, and Search Box forward runs only when the user
 * presses Search. Results are kept in memory for a few minutes to avoid repeat calls;
 * Mapbox allows search results for temporary use only, so nothing is saved to the phone.
 */
import type { MerchantCategory } from '../utils/merchantClassifier';
import { haversineDistance } from '../utils/geospatial';

export const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '';
/** False when the .env file or the EXPO_PUBLIC_MAPBOX_TOKEN line is missing. */
export const HAS_MAPBOX_TOKEN = MAPBOX_TOKEN.trim().length > 0;

const SEARCH_BOX = 'https://api.mapbox.com/search/searchbox/v1';
const LANGUAGE = 'en';
const COUNTRY = 'in';
/** Search Box API maximum per category request. */
const CATEGORY_LIMIT = 25;
const SEARCH_LIMIT = 10;
const REQUEST_TIMEOUT_MS = 12000;

export type LatLon = { lat: number; lon: number };

/** One place from any Mapbox source, normalised. */
export type MapPlace = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lon: number;
  /** Mapbox's own category names, for classifying the spend type. */
  categories: string[];
  maki: string | null;
  /** True for shops and venues; false for areas, streets and addresses. */
  isPoi: boolean;
};

export class MapboxError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

async function getJson(url: string): Promise<any> {
  if (!HAS_MAPBOX_TOKEN) throw new MapboxError('Mapbox key missing', 401);
  // AbortSignal.timeout is not available in every React Native runtime.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, { signal: controller.signal });
  } catch {
    throw new MapboxError('No connection to the map service');
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const reason = res.status === 401 ? 'Mapbox key rejected' : res.status === 429 ? 'Too many map requests, try again' : `Map service error ${res.status}`;
    throw new MapboxError(reason, res.status);
  }
  return res.json();
}

/** In-memory cache for this app session only (Mapbox results are for temporary use). */
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 200;
const cache = new Map<string, { at: number; value: unknown }>();
async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value as T;
  const value = await load();
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(key, { at: Date.now(), value });
  return value;
}
const near = (c: LatLon | null) => (c ? `${c.lat.toFixed(3)},${c.lon.toFixed(3)}` : 'none');

const qs = (params: Record<string, string | number | undefined>) =>
  Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&');

/** Bounding box around a point, for limiting results to a radius. */
export function bboxAround(center: LatLon, radiusKm: number): string {
  const dLat = radiusKm / 111;
  const dLon = radiusKm / (111 * Math.cos((center.lat * Math.PI) / 180));
  return [center.lon - dLon, center.lat - dLat, center.lon + dLon, center.lat + dLat].map((n) => n.toFixed(5)).join(',');
}

// ── Search Box feature → MapPlace ──────────────────────
function fromSearchBox(f: any): MapPlace | null {
  const [lon, lat] = f?.geometry?.coordinates ?? [];
  if (typeof lat !== 'number' || typeof lon !== 'number') return null;
  const p = f.properties ?? {};
  return {
    id: p.mapbox_id ?? `${lat},${lon},${p.name}`,
    name: p.name ?? p.name_preferred ?? 'Unnamed place',
    address: p.full_address ?? p.place_formatted ?? p.address ?? '',
    lat,
    lon,
    categories: [...(p.poi_category ?? []), ...(p.poi_category_ids ?? [])].map((c: string) => String(c).toLowerCase()),
    maki: p.maki ?? null,
    isPoi: p.feature_type === 'poi' || (p.poi_category?.length ?? 0) > 0,
  };
}

// ── Geocoding v5 feature → MapPlace (fallback) ─────────
function fromGeocodingV5(f: any): MapPlace | null {
  const [lon, lat] = f?.center ?? [];
  if (typeof lat !== 'number' || typeof lon !== 'number') return null;
  const types: string[] = f.place_type ?? [];
  return {
    id: f.id,
    name: f.text ?? 'Unnamed place',
    address: f.place_name ?? '',
    lat,
    lon,
    categories: String(f.properties?.category ?? '')
      .toLowerCase()
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    maki: f.properties?.maki ?? null,
    isPoi: types.includes('poi'),
  };
}

// ── Category ids ───────────────────────────────────────
// Candidate Search Box category ids per spend type. The list Mapbox supports is
// fetched once at runtime and only ids it knows are used.
const CATEGORY_CANDIDATES: Record<Exclude<MerchantCategory, 'Unknown' | 'Business'>, string[]> = {
  Dining: ['restaurant', 'cafe', 'fast_food', 'food_and_drink', 'coffee', 'bakery'],
  Grocery: ['supermarket', 'grocery', 'convenience_store', 'food_and_drink_stores'],
  Fuel: ['gas_station', 'fuel'],
  Electronics: ['electronics_shop', 'electronics_store', 'electronics', 'mobile_phone_store'],
  Shopping: ['shopping_mall', 'shopping', 'clothing_store', 'department_store', 'shoe_store'],
  Travel: ['hotel', 'lodging', 'travel_agency', 'airport', 'train_station'],
  'Pharmacy / Health': ['pharmacy', 'chemist', 'hospital', 'clinic', 'health_services'],
  Entertainment: ['cinema', 'movie_theater', 'theatre', 'entertainment', 'amusement_park', 'bowling_alley'],
};
// Keyword searches for the Geocoding v5 fallback.
const FALLBACK_QUERIES: Record<string, string> = {
  Dining: 'restaurant',
  Grocery: 'supermarket',
  Fuel: 'petrol pump',
  Electronics: 'electronics store',
  Shopping: 'mall',
  Travel: 'hotel',
  'Pharmacy / Health': 'pharmacy',
  Entertainment: 'cinema',
};

let supportedCategories: Promise<Set<string>> | null = null;

/** Category ids Mapbox supports today (cached for the session). */
function getSupportedCategories(): Promise<Set<string>> {
  if (!supportedCategories) {
    supportedCategories = getJson(`${SEARCH_BOX}/list/category?${qs({ language: LANGUAGE, access_token: MAPBOX_TOKEN })}`)
      .then((d) => new Set<string>((d.listItems ?? []).map((i: any) => String(i.canonical_id))))
      .catch((e) => {
        supportedCategories = null; // retry next time
        throw e;
      });
  }
  return supportedCategories;
}

export type SpendFilter = MerchantCategory | 'All';
export const SPEND_FILTERS: SpendFilter[] = ['All', 'Dining', 'Grocery', 'Fuel', 'Electronics', 'Shopping', 'Travel', 'Pharmacy / Health', 'Entertainment'];

/** Category ids to query for a filter ("All" queries the main spend types). */
async function categoryIdsFor(filter: SpendFilter): Promise<string[]> {
  const supported = await getSupportedCategories();
  const groups =
    filter === 'All'
      ? (['Dining', 'Grocery', 'Fuel', 'Electronics', 'Shopping', 'Pharmacy / Health'] as const)
      : ([filter] as const);
  const ids: string[] = [];
  for (const g of groups) {
    const candidates = CATEGORY_CANDIDATES[g as keyof typeof CATEGORY_CANDIDATES] ?? [];
    // For "All", one id per spend type keeps the request count low.
    const usable = candidates.filter((c) => supported.has(c));
    ids.push(...(filter === 'All' ? usable.slice(0, 1) : usable.slice(0, 3)));
  }
  return [...new Set(ids)];
}

/**
 * Places of a spend type within `radiusKm` of `center`, nearest first.
 * Uses Search Box category search; falls back to Geocoding v5 if it returns nothing.
 */
export function nearbyPlaces(center: LatLon, filter: SpendFilter, radiusKm: number): Promise<MapPlace[]> {
  return cached(`nearby|${filter}|${radiusKm}|${near(center)}`, () => loadNearbyPlaces(center, filter, radiusKm));
}

async function loadNearbyPlaces(center: LatLon, filter: SpendFilter, radiusKm: number): Promise<MapPlace[]> {
  const bbox = bboxAround(center, radiusKm);
  const proximity = `${center.lon},${center.lat}`;
  let places: MapPlace[] = [];

  try {
    const ids = await categoryIdsFor(filter);
    const responses = await Promise.allSettled(
      ids.map((id) =>
        getJson(
          `${SEARCH_BOX}/category/${encodeURIComponent(id)}?${qs({
            proximity,
            bbox,
            limit: CATEGORY_LIMIT,
            language: LANGUAGE,
            country: COUNTRY,
            access_token: MAPBOX_TOKEN,
          })}`,
        ),
      ),
    );
    for (const r of responses) {
      if (r.status === 'fulfilled') places.push(...((r.value.features ?? []).map(fromSearchBox).filter(Boolean) as MapPlace[]));
    }
    const rejected = responses.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
    if (places.length === 0 && rejected?.reason instanceof MapboxError && rejected.reason.status === 401) throw rejected.reason;
  } catch (e) {
    if (e instanceof MapboxError && e.status === 401) throw e;
  }

  if (places.length === 0) places = await nearbyFallback(center, filter, bbox);

  return dedupeAndSort(places, center, radiusKm);
}

async function nearbyFallback(center: LatLon, filter: SpendFilter, bbox: string): Promise<MapPlace[]> {
  const queries = filter === 'All' ? ['restaurant', 'supermarket', 'petrol pump', 'mall', 'pharmacy'] : [FALLBACK_QUERIES[filter] ?? 'store'];
  const responses = await Promise.allSettled(
    queries.map((q) =>
      getJson(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?${qs({
          proximity: `${center.lon},${center.lat}`,
          bbox,
          types: 'poi',
          limit: SEARCH_LIMIT,
          country: COUNTRY,
          language: LANGUAGE,
          access_token: MAPBOX_TOKEN,
        })}`,
      ),
    ),
  );
  const out: MapPlace[] = [];
  for (const r of responses) {
    if (r.status === 'fulfilled') out.push(...((r.value.features ?? []).map(fromGeocodingV5).filter(Boolean) as MapPlace[]));
    else if (r.reason instanceof MapboxError && r.reason.status === 401) throw r.reason;
  }
  return out;
}

function dedupeAndSort(places: MapPlace[], center: LatLon, radiusKm: number): MapPlace[] {
  const seen = new Set<string>();
  return places
    .filter((p) => {
      const key = p.id || `${p.name}|${p.lat.toFixed(4)}|${p.lon.toFixed(4)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return haversineDistance(center.lat, center.lon, p.lat, p.lon) <= radiusKm;
    })
    .sort((a, b) => haversineDistance(center.lat, center.lon, a.lat, a.lon) - haversineDistance(center.lat, center.lon, b.lat, b.lon));
}

/**
 * Text search for shops, brands, areas and addresses near `center`
 * ("DMart Karve Nagar", "Phoenix Mall", "Kothrud"). While typing, Geocoding v5 only;
 * with `thorough` (the user pressed Search), Search Box forward search is added for
 * better shop coverage.
 */
export function searchPlaces(query: string, center: LatLon | null, options: { thorough?: boolean } = {}): Promise<MapPlace[]> {
  const q = query.trim().slice(0, 256);
  if (q.length < 2) return Promise.resolve([]);
  return cached(`search|${options.thorough ? 'full' : 'quick'}|${q.toLowerCase()}|${near(center)}`, () => loadSearch(q, center, !!options.thorough));
}

async function loadSearch(q: string, center: LatLon | null, thorough: boolean): Promise<MapPlace[]> {
  const proximity = center ? `${center.lon},${center.lat}` : undefined;

  const [primary, fallback] = await Promise.allSettled([
    thorough
      ? getJson(`${SEARCH_BOX}/forward?${qs({ q, proximity, limit: SEARCH_LIMIT, language: LANGUAGE, country: COUNTRY, auto_complete: 'true', access_token: MAPBOX_TOKEN })}`)
      : Promise.resolve({ features: [] }),
    getJson(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?${qs({
        proximity,
        limit: 5,
        country: COUNTRY,
        language: LANGUAGE,
        autocomplete: 'true',
        access_token: MAPBOX_TOKEN,
      })}`,
    ),
  ]);

  // Fail only when every request that actually ran failed.
  if (fallback.status === 'rejected' && (primary.status === 'rejected' || !thorough)) {
    const reason = primary.status === 'rejected' ? primary.reason : fallback.reason;
    throw reason instanceof MapboxError ? reason : new MapboxError('Search failed');
  }
  const results: MapPlace[] = [];
  if (primary.status === 'fulfilled') results.push(...((primary.value.features ?? []).map(fromSearchBox).filter(Boolean) as MapPlace[]));
  if (fallback.status === 'fulfilled') results.push(...((fallback.value.features ?? []).map(fromGeocodingV5).filter(Boolean) as MapPlace[]));

  // Shops first, then areas; drop near-duplicates (same name within ~100 m).
  const out: MapPlace[] = [];
  for (const p of results.sort((a, b) => Number(b.isPoi) - Number(a.isPoi))) {
    if (out.some((o) => o.name.toLowerCase() === p.name.toLowerCase() && haversineDistance(o.lat, o.lon, p.lat, p.lon) < 0.1)) continue;
    out.push(p);
  }
  return out.slice(0, SEARCH_LIMIT);
}

/** Area name for a point, for example "Kothrud, Pune". Null if unknown. */
export function areaName(center: LatLon): Promise<string | null> {
  return cached(`area|${near(center)}`, () => loadAreaName(center));
}

async function loadAreaName(center: LatLon): Promise<string | null> {
  try {
    const d = await getJson(
      `https://api.mapbox.com/search/geocode/v6/reverse?${qs({
        longitude: center.lon,
        latitude: center.lat,
        types: 'neighborhood,locality,place',
        language: LANGUAGE,
        access_token: MAPBOX_TOKEN,
      })}`,
    );
    const f = d.features?.[0]?.properties;
    if (!f) return null;
    const city = f.context?.place?.name;
    return city && city !== f.name ? `${f.name}, ${city}` : f.name ?? null;
  } catch {
    return null;
  }
}
