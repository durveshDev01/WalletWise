import { catalog } from '../data/catalog';
import { rankCardsForPurchase, toEngineCategory } from '../engine';
import type { Purchase, PurchaseResult } from '../engine';
import type { CardData } from '../store/useCardStore';
import type { MerchantCategory } from './merchantClassifier';

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
};

/** Typical ticket size used when the user has not entered an amount. */
export const DEFAULT_SPEND = 2000;

/**
 * Ranks the user's cards for a merchant, using the WalletWise engine (src/engine).
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
  return ranked.map((r) => ({
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
}
