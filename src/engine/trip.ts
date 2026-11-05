/**
 * Trip planner: pay a flight or hotel fare in cash with the best card, or cover it
 * with points from the cards the user holds. Fares come from the user (for example
 * from a Skyscanner search); award seat prices are not modelled, so the points side
 * values each point at its realistic route value and is labelled an estimate.
 */
import { scorePurchase } from './purchase';
import { redemptionRoutes } from './redemption';
import type { Card, Catalog, Experience, PurchaseResult } from './types';

export type TripHolding = { card: Card; points: number };

export type PointsUse = {
  id: string;
  cardId: string;
  cardName: string;
  route: string;
  rupeesPerPoint: number;
  pointsUsed: number;
  valueRs: number;
  awardTaxesRs: number;
  netValueRs: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  source: string | null;
  verifiedAt: string | null;
  ruleSource: string | null;
  ruleVerifiedAt: string | null;
  estimated: boolean;
};

export type TripPlan = {
  fareRs: number;
  /** Best card to pay the fare in cash (travel spend, portal allowed for non-beginners). */
  payCash: PurchaseResult | null;
  /** Separate route choices. Balances from different programmes are never combined. */
  pointsOptions: PointsUse[];
  notes: string[];
};

export const CITY_AIRPORT_MAP: Record<string, string> = {
  pune: 'PNQ',
  mumbai: 'BOM',
  bombay: 'BOM',
  delhi: 'DEL',
  'new delhi': 'DEL',
  bengaluru: 'BLR',
  bangalore: 'BLR',
  goa: 'GOI',
  chennai: 'MAA',
  madras: 'MAA',
  kolkata: 'CCU',
  calcutta: 'CCU',
  hyderabad: 'HYD',
  ahmedabad: 'AMD',
  kochi: 'COK',
  cochin: 'COK',
  jaipur: 'JAI',
  lucknow: 'LKO',
  chandigarh: 'IXC',
  varanasi: 'VNS',
  srinagar: 'SXR',
  amritsar: 'ATQ',
  dubai: 'DXB',
  singapore: 'SIN',
  london: 'LHR',
  bangkok: 'BKK',
};

export function resolveAirportCode(query: string): string {
  const clean = (query ?? '').trim().toLowerCase();
  if (!clean) return '';
  if (CITY_AIRPORT_MAP[clean]) return CITY_AIRPORT_MAP[clean];
  if (/^[a-z]{3}$/i.test(clean)) return clean.toUpperCase();
  for (const [city, code] of Object.entries(CITY_AIRPORT_MAP)) {
    if (city.startsWith(clean) || clean.startsWith(city)) return code;
  }
  return clean.toUpperCase();
}

export const KNOWN_INTERNATIONAL_AIRPORTS = new Set([
  'DXB', 'SIN', 'LHR', 'BKK', 'JFK', 'SFO', 'EWR', 'CDG', 'FRA', 'AMS',
  'DOH', 'AUH', 'KUL', 'HND', 'NRT', 'SYD', 'MEL', 'YYZ', 'YVR', 'ORD',
]);

export const INDIAN_DOMESTIC_AIRPORT_CODES = new Set([
  'PNQ', 'BOM', 'DEL', 'BLR', 'GOI', 'MAA', 'CCU', 'HYD', 'AMD', 'COK',
  'JAI', 'LKO', 'IXC', 'VNS', 'SXR', 'ATQ', 'IXB', 'IXR', 'PAT', 'BBI',
  'TRV', 'CCJ', 'NAG', 'IDR', 'BHO', 'GAU', 'VTZ', 'UDR', 'BDQ', 'STV',
  'IXE', 'CJB', 'IXM', 'TIR', 'DED', 'IXA', 'GOX', 'AYJ', 'HJR',
]);

/**
 * Returns true if both origin and destination represent a domestic Indian surface route
 * where trains (IRCTC) or intercity buses (redBus) are realistic travel alternatives.
 */
export function isDomesticSurfaceRoute(from: string, to: string): boolean {
  const f = (from ?? '').trim().toLowerCase();
  const t = (to ?? '').trim().toLowerCase();
  if (!f || !t) return false;

  const fromCode = resolveAirportCode(f);
  const toCode = resolveAirportCode(t);

  // International airport codes can never be domestic surface routes
  if (KNOWN_INTERNATIONAL_AIRPORTS.has(fromCode) || KNOWN_INTERNATIONAL_AIRPORTS.has(toCode)) {
    return false;
  }

  // If both airport codes are known Indian domestic airports
  if (INDIAN_DOMESTIC_AIRPORT_CODES.has(fromCode) && INDIAN_DOMESTIC_AIRPORT_CODES.has(toCode)) {
    return true;
  }

  // If city map knows them and neither is mapped to an international code
  const isFromDomestic = INDIAN_DOMESTIC_AIRPORT_CODES.has(fromCode) || (Boolean(CITY_AIRPORT_MAP[f]) && !KNOWN_INTERNATIONAL_AIRPORTS.has(CITY_AIRPORT_MAP[f]));
  const isToDomestic = INDIAN_DOMESTIC_AIRPORT_CODES.has(toCode) || (Boolean(CITY_AIRPORT_MAP[t]) && !KNOWN_INTERNATIONAL_AIRPORTS.has(CITY_AIRPORT_MAP[t]));

  return Boolean(isFromDomestic && isToDomestic);
}

export function planTripPayment(
  catalog: Catalog,
  holdings: TripHolding[],
  fareRs: number,
  options: {
    experience?: Experience;
    kind?: 'FLIGHT' | 'HOTEL';
    today?: string;
    awardTaxesRs?: number;
    /** @deprecated ignored: monthly values cannot predict award pricing. */
    monthlyRewardRs?: number;
  } = {},
): TripPlan {
  const { experience = 'SOME', kind = 'FLIGHT', today, awardTaxesRs = 0 } = options;
  const notes: string[] = [];

  const cashResults = holdings
    .map((h) =>
      scorePurchase(catalog, h.card, { amount: fareRs, category: 'TRAVEL', online: true, allowPortal: experience !== 'NEW' }, { experience, today }),
    )
    .filter((r): r is PurchaseResult => r !== null)
    .sort((a, b) => b.score - a.score);
  const payCash = cashResults[0] ?? null;

  // Only a real airline/hotel transfer can be considered for that trip type.
  // Cashback and statement-credit routes do not buy award seats or hotel nights.
  const options_ = holdings
    .filter((h) => h.points > 0)
    .flatMap((h) => redemptionRoutes(catalog, h.card)
      .filter((route) => route.kind === 'TRANSFER' && route.partnerKind === (kind === 'FLIGHT' ? 'AIRLINE' : 'HOTEL') && route.rupeesPerPoint > 0)
      .map((route) => ({ h, route })))
    .sort((a, b) => b.route.rupeesPerPoint * b.h.points - a.route.rupeesPerPoint * a.h.points);

  const pointsOptions: PointsUse[] = options_.map(({ h, route }) => {
    const valueRs = Math.round(h.points * route.rupeesPerPoint);
    const taxes = Math.max(0, awardTaxesRs);
    const netValueRs = Math.max(0, valueRs - taxes);
    return {
      id: `${h.card.id}:${route.partnerId ?? route.label}`,
      cardId: h.card.id,
      cardName: h.card.name,
      route: route.label,
      rupeesPerPoint: Math.round(route.rupeesPerPoint * 100) / 100,
      pointsUsed: h.points,
      valueRs,
      awardTaxesRs: taxes,
      netValueRs,
      confidence: route.confidence,
      source: route.valuationSource,
      verifiedAt: route.valuationVerifiedAt,
      ruleSource: route.ruleSource,
      ruleVerifiedAt: route.ruleVerifiedAt,
      estimated: route.estimated,
    };
  });

  if (pointsOptions.length > 0) notes.push('These are route-specific point-value estimates, not live award prices. Check availability and the required points, taxes and fees with the programme before transferring. Balances from separate programmes are not combined.');
  if (awardTaxesRs > 0) notes.push(`Estimated award redemption net value deducts ₹${awardTaxesRs.toLocaleString('en-IN')} in required cash taxes/carrier fees.`);
  if (pointsOptions.some((p) => p.confidence !== 'HIGH')) notes.push('At least one displayed route is based on medium- or low-confidence data; check its source and verification date.');
  if (experience === 'NEW' && pointsOptions.length > 0) notes.push('Transfers can be one-way. Do not transfer before confirming an award booking.');
  if (payCash?.usesPortal) notes.push(`Paying cash earns most when booked through ${payCash.row?.merchantsText ?? "the bank's travel portal"}.`);

  return { fareRs, payCash, pointsOptions, notes };
}

/** Skyscanner search link for the user to check real cash fares (YYMMDD date slug). */
export function skyscannerUrl(from: string, to: string, dateIso: string, adults = 1, cabin: 'economy' | 'premiumeconomy' | 'business' | 'first' = 'economy') {
  const fromCode = resolveAirportCode(from) || from.trim().toUpperCase();
  const toCode = resolveAirportCode(to) || to.trim().toUpperCase();
  const [y, m, d] = dateIso.split('-');
  const slug = `${y.slice(2)}${m}${d}`;
  return `https://www.skyscanner.co.in/transport/flights/${fromCode.toLowerCase()}/${toCode.toLowerCase()}/${slug}/?adultsv2=${adults}&cabinclass=${cabin}`;
}

/** IRCTC external search URL for Indian railway train availability. */
export function irctcSearchUrl(): string {
  return 'https://www.irctc.co.in/nget/train-search';
}

/** redBus external search URL for intercity bus routes in India. */
export function redbusSearchUrl(from: string, to: string): string {
  const f = encodeURIComponent((from || 'pune').trim().toLowerCase());
  const t = encodeURIComponent((to || 'goa').trim().toLowerCase());
  return `https://www.redbus.in/bus-tickets/${f}-to-${t}`;
}
