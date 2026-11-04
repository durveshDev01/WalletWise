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

export function planTripPayment(
  catalog: Catalog,
  holdings: TripHolding[],
  fareRs: number,
  options: { experience?: Experience; kind?: 'FLIGHT' | 'HOTEL'; today?: string; /** @deprecated ignored: monthly values cannot predict award pricing. */ monthlyRewardRs?: number } = {},
): TripPlan {
  const { experience = 'SOME', kind = 'FLIGHT', today } = options;
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

  const pointsOptions: PointsUse[] = options_.map(({ h, route }) => ({
    id: `${h.card.id}:${route.partnerId ?? route.label}`,
    cardId: h.card.id,
    cardName: h.card.name,
    route: route.label,
    rupeesPerPoint: Math.round(route.rupeesPerPoint * 100) / 100,
    pointsUsed: h.points,
    valueRs: Math.round(h.points * route.rupeesPerPoint),
    confidence: route.confidence,
    source: route.valuationSource,
    verifiedAt: route.valuationVerifiedAt,
    ruleSource: route.ruleSource,
    ruleVerifiedAt: route.ruleVerifiedAt,
    estimated: route.estimated,
  }));

  if (pointsOptions.length > 0) notes.push('These are route-specific point-value estimates, not live award prices. Check availability and the required points, taxes and fees with the programme before transferring. Balances from separate programmes are not combined.');
  if (pointsOptions.some((p) => p.confidence !== 'HIGH')) notes.push('At least one displayed route is based on medium- or low-confidence data; check its source and verification date.');
  if (experience === 'NEW' && pointsOptions.length > 0) notes.push('Transfers can be one-way. Do not transfer before confirming an award booking.');
  if (payCash?.usesPortal) notes.push(`Paying cash earns most when booked through ${payCash.row?.merchantsText ?? "the bank's travel portal"}.`);

  return { fareRs, payCash, pointsOptions, notes };
}

/** Skyscanner search link for the user to check real cash fares (YYMMDD date slug). */
export function skyscannerUrl(from: string, to: string, dateIso: string, adults = 1, cabin: 'economy' | 'premiumeconomy' | 'business' | 'first' = 'economy') {
  const [y, m, d] = dateIso.split('-');
  const slug = `${y.slice(2)}${m}${d}`;
  return `https://www.skyscanner.co.in/transport/flights/${from.toLowerCase()}/${to.toLowerCase()}/${slug}/?adultsv2=${adults}&cabinclass=${cabin}`;
}
