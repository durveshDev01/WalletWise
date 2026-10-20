/// <reference types="node" />
import { strict as assert } from 'node:assert';
import { describe, it, beforeEach } from 'node:test';

import { classifyMapboxPlace } from '../../utils/merchantClassifier';

// The service reads the key when it loads, so set it before importing.
process.env.EXPO_PUBLIC_MAPBOX_TOKEN = 'pk.test';
const mapbox = await import('../mapbox');

const CENTER = { lat: 18.5074, lon: 73.8077 }; // Kothrud, Pune

function feature(id: string, name: string, lat: number, lon: number, cats: string[] = []) {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lon, lat] },
    properties: { mapbox_id: id, name, full_address: `${name}, Pune`, poi_category: cats, poi_category_ids: cats, feature_type: 'poi' },
  };
}

type Route = (url: string) => unknown;
let calls: string[] = [];
function mockFetch(route: Route) {
  calls = [];
  globalThis.fetch = (async (url: string) => {
    calls.push(url);
    const body = route(url);
    if (body === 401) return { ok: false, status: 401, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => body };
  }) as unknown as typeof fetch;
}

describe('classifyMapboxPlace', () => {
  it('uses brand names before generic Mapbox tags', () => {
    assert.equal(classifyMapboxPlace('DMart', ['department_store'], null, 'Unknown'), 'Grocery');
    assert.equal(classifyMapboxPlace('Croma', ['shop'], null, 'Unknown'), 'Electronics');
  });

  it('maps Mapbox categories to spend types', () => {
    assert.equal(classifyMapboxPlace('Shiv Ganga Stores', ['supermarket'], null, 'Unknown'), 'Grocery');
    assert.equal(classifyMapboxPlace('HP Petrol Pump', ['gas_station'], null, 'Unknown'), 'Fuel');
    assert.equal(classifyMapboxPlace('Vaishali', ['restaurant'], null, 'Unknown'), 'Dining');
    assert.equal(classifyMapboxPlace('Wellness Forever', ['pharmacy'], null, 'Unknown'), 'Pharmacy / Health');
    assert.equal(classifyMapboxPlace('City Pride', ['cinema'], null, 'Unknown'), 'Entertainment');
  });

  it('keeps grocery stores out of dining', () => {
    assert.equal(classifyMapboxPlace('Fresh Mart', ['food_and_drink_stores'], null, 'Unknown'), 'Grocery');
  });

  it('falls back to the chosen chip', () => {
    assert.equal(classifyMapboxPlace('Some Place', [], null, 'Shopping'), 'Shopping');
  });
});

describe('Mapbox service', () => {
  beforeEach(() => {
    calls = [];
  });

  it('builds a bounding box around a point', () => {
    const [w, s, e, n] = mapbox.bboxAround(CENTER, 5).split(',').map(Number);
    assert.ok(w < CENTER.lon && e > CENTER.lon && s < CENTER.lat && n > CENTER.lat);
    assert.ok(Math.abs(n - s - 0.09) < 0.001);
  });

  it('finds category places within the radius, nearest first, without duplicates', async () => {
    mockFetch((url) => {
      if (url.includes('/list/category')) return { listItems: [{ canonical_id: 'supermarket' }, { canonical_id: 'grocery' }] };
      if (url.includes('/category/supermarket'))
        return {
          features: [
            feature('a', 'DMart Karve Nagar', 18.4893, 73.8203), // about 2.4 km
            feature('b', 'Near Store', 18.508, 73.808), // about 0.1 km
            feature('c', 'Far Store', 18.6, 73.9), // about 14 km, outside 5 km
          ],
        };
      if (url.includes('/category/grocery')) return { features: [feature('b', 'Near Store', 18.508, 73.808)] };
      return { features: [] };
    });
    const list = await mapbox.nearbyPlaces(CENTER, 'Grocery', 5);
    assert.deepEqual(
      list.map((p) => p.id),
      ['b', 'a'],
    );
    assert.ok(calls.some((u) => u.includes('bbox=')));
  });

  it('falls back to Geocoding v5 when category search returns nothing', async () => {
    mockFetch((url) => {
      if (url.includes('/list/category')) return { listItems: [{ canonical_id: 'gas_station' }] };
      if (url.includes('/category/')) return { features: [] };
      if (url.includes('/geocoding/v5/')) return { features: [{ id: 'poi.1', text: 'BPCL Petrol Pump', place_name: 'BPCL, Kothrud', center: [73.81, 18.51], place_type: ['poi'], properties: { category: 'gas station, fuel' } }] };
      return {};
    });
    const list = await mapbox.nearbyPlaces(CENTER, 'Fuel', 5);
    assert.equal(list[0]?.name, 'BPCL Petrol Pump');
  });

  it('reports a rejected key clearly', async () => {
    mockFetch(() => 401);
    await assert.rejects(mapbox.searchPlaces('dmart', CENTER), /Mapbox key rejected/);
  });

  it('search returns shops first and areas after', async () => {
    mockFetch((url) => {
      if (url.includes('/forward')) return { features: [feature('s1', 'DMart Karve Nagar', 18.4893, 73.8203, ['supermarket'])] };
      if (url.includes('/geocoding/v5/')) return { features: [{ id: 'locality.1', text: 'Karve Nagar', place_name: 'Karve Nagar, Pune', center: [73.82, 18.49], place_type: ['locality'] }] };
      return {};
    });
    const list = await mapbox.searchPlaces('dmart karve nagar', CENTER, { thorough: true });
    assert.equal(list[0].isPoi, true);
    assert.equal(list[1].isPoi, false);
  });

  it('typing searches use Geocoding only, so the small Search Box quota is kept for Search', async () => {
    const urls: string[] = [];
    mockFetch((url) => {
      urls.push(url);
      return { features: [] };
    });
    await mapbox.searchPlaces('phoenix mall', CENTER);
    assert.ok(urls.length > 0);
    assert.ok(urls.every((u) => !u.includes('/forward')));
  });

  it('repeats of the same search come from memory', async () => {
    let calls = 0;
    mockFetch(() => {
      calls++;
      return { features: [] };
    });
    await mapbox.searchPlaces('kothrud depot', CENTER);
    await mapbox.searchPlaces('Kothrud Depot', CENTER);
    assert.equal(calls, 1);
  });
});
