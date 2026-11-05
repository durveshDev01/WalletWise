import { catalog } from '../data/catalog';
import { rankCardsForPurchase, toEngineCategory } from '../engine';
import type { Purchase, PurchaseResult } from '../engine';
import type { CardData } from '../store/useCardStore';
import type { MerchantCategory } from './merchantClassifier';

export type WinningMargin = {
  diffRs: number;
  runnerUpName: string;
  explanation: string;
};

export type RecommendationResult = {
  card: CardData;
  score: number;
  /** Rupees back at the safe (default) redemption value. */
  estimatedValue: number;
  /** Rupees back if points are transferred to the best realistic partner. */
  bestValue: number;
  spendAmount: number;
  /** Points or miles credited (rupees for cashback cards). */
  pointsEarned: number;
  rewardUnit: 'POINTS' | 'MILES' | 'CASHBACK';
  effectiveRatePct: number;
  confidence: PurchaseResult['confidence'];
  source: string | null;
  verifiedAt: string | null;
  assumptions: string[];
  reason: string;
  warnings: string[];
  winningMargin?: WinningMargin;
};

/** Typical ticket size used when the user has not entered an amount. */
export const DEFAULT_SPEND = 2000;

/**
 * Returns a clear explanation of why a card cannot be used or earned on for a given channel/category.
 */
export function getCardIneligibilityReason(
  card: CardData,
  channel?: 'CARD' | 'UPI',
  category?: string,
): string {
  const catCard = catalog.byId.get(card.catalogId);
  if (channel === 'UPI') {
    if (catCard && catCard.network !== 'RUPAY') {
      return 'Ineligible: Only RuPay credit cards can be linked to UPI apps.';
    }
    const upi = catCard?.inclusion?.upi;
    if (upi && !upi.earnsRewards) {
      return 'Zero rewards: Issuer explicitly excludes UPI payments from rewards.';
    }
  }
  if (category === 'Fuel') {
    return 'Fuel purchases receive surcharge waivers only; standard rewards excluded.';
  }
  return 'Not eligible for rewards on this payment channel or category.';
}

/**
 * Ranks the user's cards for a merchant, using the WalletWise engine (src/engine).
 * Explains winning margin against the runner-up and flags exclusions and caps.
 * Spec: research/algorithm-spec.md §3.
 */
export function getRankedRecommendations(
  merchantName: string,
  category: MerchantCategory,
  cards: CardData[],
  options: Partial<Pick<Purchase, 'amount' | 'online' | 'channel' | 'international' | 'allowPortal'>> = {},
): RecommendationResult[] {
  const byCatalogId = new Map(cards.map((c) => [c.catalogId, c]));
  const engineCards = cards.map((c) => catalog.byId.get(c.catalogId)).filter((c) => c !== undefined);
  const amount = options.amount ?? DEFAULT_SPEND;
  const ranked: PurchaseResult[] = rankCardsForPurchase(catalog, engineCards, {
    amount,
    category: toEngineCategory(category, options.online),
    merchant: merchantName,
    online: options.online,
    channel: options.channel,
    international: options.international,
    allowPortal: options.allowPortal,
  });

  const results: RecommendationResult[] = ranked.map((r) => ({
    card: byCatalogId.get(r.card.id)!,
    score: r.score,
    estimatedValue: r.safeValue,
    bestValue: r.bestValue,
    spendAmount: amount,
    pointsEarned: r.pointsEarned,
    rewardUnit: r.rewardUnit,
    effectiveRatePct: r.effectiveRatePct,
    confidence: r.confidence,
    source: r.source,
    verifiedAt: r.verifiedAt,
    assumptions: r.assumptions,
    reason: r.reason,
    warnings: r.warnings,
  }));

  // Explain winning margin when 2 or more cards are compared
  if (results.length >= 2) {
    const winner = results[0];
    const runnerUp = results[1];
    const diffRs = Math.round((winner.estimatedValue - runnerUp.estimatedValue) * 100) / 100;
    const runnerUpName = `${runnerUp.card.bankName} ${runnerUp.card.cardName}`;

    let explanation = '';
    if (diffRs > 0) {
      explanation = `Beats ${runnerUpName} by ₹${diffRs >= 100 ? Math.round(diffRs).toLocaleString('en-IN') : diffRs.toFixed(2)} (${winner.effectiveRatePct}% vs ${runnerUp.effectiveRatePct}% effective return).`;
    } else {
      explanation = `Tied with ${runnerUpName} (both earn ${winner.effectiveRatePct}% on this spend).`;
    }

    winner.winningMargin = {
      diffRs,
      runnerUpName,
      explanation,
    };
  }

  return results;
}
