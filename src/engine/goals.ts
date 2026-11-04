/**
 * Rupee goals ("Diwali gifts ₹15,000", "a phone", "a bill credit") and the
 * "Is this redemption good?" check. planGoal() in redemption.ts stays for goals priced
 * in airline or hotel points; these goals are priced in rupees.
 */
import { walletValue } from './portfolio';
import { bestRupeesPerPoint, calculateRedemptionValue, pointsValue, safeRupeesPerPoint } from './redemption';
import type { Card, Catalog, UserProfile } from './types';

export type GoalCardProgress = {
  cardId: string;
  points: number;
  safeRs: number;
  bestRs: number;
  defaultRoute: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  source: string | null;
  verifiedAt: string | null;
};

export type GoalProgress = {
  targetRs: number;
  /** What the counted points are worth on each card's default route. */
  safeRs: number;
  /** With the best realistic redemptions. */
  bestRs: number;
  /** Progress at the safe value, 0 to 1. */
  progress: number;
  progressBest: number;
  /** Rupees still needed at the safe value. */
  shortfallRs: number;
  /** Rewards these cards earn in a month at the user's normal spend (safe value). */
  monthlyRewardRs: number;
  /** Months of normal spending to close the shortfall, or null if unknown. 0 when reached. */
  monthsToGoal: number | null;
  perCard: GoalCardProgress[];
};

/**
 * Progress towards a rupee goal from the points on the chosen cards. Months to goal use
 * the user's normal spend (never extra spend) valued at the safe route.
 */
export function goalProgress(
  catalog: Catalog,
  targetRs: number,
  holdings: { cardId: string; points: number }[],
  profile?: UserProfile | null,
): GoalProgress {
  const perCard: GoalCardProgress[] = [];
  const cards: Card[] = [];
  for (const h of holdings) {
    const card = catalog.byId.get(h.cardId);
    if (!card) continue;
    const v = pointsValue(catalog, card, h.points);
    perCard.push({
      cardId: card.id,
      points: h.points,
      safeRs: v.low,
      bestRs: v.high,
      defaultRoute: v.safeRoute.label,
      confidence: v.safeRoute.confidence,
      source: v.safeRoute.ruleSource,
      verifiedAt: v.safeRoute.ruleVerifiedAt,
    });
    cards.push(card);
  }
  // A single goal cannot be funded by adding unrelated points currencies together.
  // Report the strongest one-card option; route-level transfers remain separate.
  const safeRs = perCard.reduce((best, card) => Math.max(best, card.safeRs), 0);
  const bestRs = perCard.reduce((best, card) => Math.max(best, card.bestRs), 0);
  const target = Math.max(0, targetRs);
  const shortfallRs = Math.max(0, Math.round(target - safeRs));

  let monthlyRewardRs = 0;
  if (profile && cards.length > 0) {
    // Safe values only, so the estimate never depends on a lucky transfer.
    monthlyRewardRs = Math.max(0, ...cards.map((card) => walletValue(catalog, [card], { ...profile, experience: 'NEW' }).annualReward / 12));
  }
  const monthsToGoal = shortfallRs === 0 ? 0 : monthlyRewardRs > 0 ? Math.ceil(shortfallRs / monthlyRewardRs) : null;

  return {
    targetRs: target,
    safeRs,
    bestRs,
    progress: target > 0 ? Math.min(1, safeRs / target) : 1,
    progressBest: target > 0 ? Math.min(1, bestRs / target) : 1,
    shortfallRs,
    monthlyRewardRs,
    monthsToGoal,
    perCard,
  };
}

export type RedemptionBand = 'POOR' | 'FAIR' | 'GOOD' | 'UNKNOWN';

export type RedemptionCheck = {
  rupeesPerPoint: number;
  grossCashValueRs: number;
  costsRs: number;
  netValueRs: number;
  /** The card's default route value per point. */
  safeRupeesPerPoint: number;
  /** The card's best realistic route value per point. */
  bestRupeesPerPoint: number;
  band: RedemptionBand;
  /** Below this ₹/point the offer is poor. */
  poorBelow: number;
  /** From this ₹/point the offer is good. */
  goodFrom: number;
  message: string;
  quoteSource: string | null;
  quoteVerifiedAt: string | null;
};

/**
 * Is this redemption good? Compares the offer's ₹ per point with the card's own default
 * and best routes. Bands come from those two values, not fixed rupee thresholds:
 * poor below 90% of the default route, good from the better of 110% of the default
 * route and 90% of the best route.
 */
export function checkRedemption(
  catalog: Catalog,
  card: Card,
  pointsNeeded: number,
  cashPriceAvoidedRs: number,
  costsRs = 0,
  quoteEvidence: { source?: string; verifiedAt?: string } = {},
): RedemptionCheck {
  const safe = safeRupeesPerPoint(card);
  const best = Math.max(safe, bestRupeesPerPoint(catalog, card, 'SOME'));
  const value = calculateRedemptionValue({ pointsRequired: pointsNeeded, cashPriceAvoidedRs, taxesRs: 0, feesRs: costsRs, surchargesRs: 0, ...quoteEvidence });
  const netValueRs = value?.netValueRs ?? 0;
  const rpp = value?.netRupeesPerPoint ?? 0;
  const poorBelow = safe * 0.9;
  const goodFrom = Math.max(safe * 1.1, best * 0.9);
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const fmt = (n: number) => `₹${r2(n).toFixed(2)}`;

  let band: RedemptionBand;
  let message: string;
  if (!(pointsNeeded > 0) || !(cashPriceAvoidedRs > 0) || costsRs < 0 || safe <= 0) {
    band = 'UNKNOWN';
    message = safe <= 0 ? 'This card has no point value in our data, so we cannot judge this offer.' : 'Enter the points needed and the rupee value offered.';
  } else if (rpp < poorBelow) {
    band = 'POOR';
    message = `${fmt(rpp)} a point is less than this card's usual ${fmt(safe)}. Use the default route instead.`;
  } else if (rpp >= goodFrom) {
    band = 'GOOD';
    message = `${fmt(rpp)} a point is a good deal for this card (usual ${fmt(safe)}, best routes about ${fmt(best)}).`;
  } else {
    band = 'FAIR';
    message =
      best > safe * 1.1
        ? `${fmt(rpp)} a point is fair. The best routes for this card give about ${fmt(best)}, so you may do better.`
        : `${fmt(rpp)} a point is about what this card usually gives (${fmt(safe)}).`;
  }

  return {
    rupeesPerPoint: r2(rpp),
    grossCashValueRs: r2(cashPriceAvoidedRs),
    costsRs: r2(costsRs),
    netValueRs: r2(netValueRs),
    safeRupeesPerPoint: r2(safe),
    bestRupeesPerPoint: r2(best),
    band,
    poorBelow: r2(poorBelow),
    goodFrom: r2(goodFrom),
    message,
    quoteSource: value?.source ?? null,
    quoteVerifiedAt: value?.verifiedAt ?? null,
  };
}
