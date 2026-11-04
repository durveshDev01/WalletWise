/**
 * Missed-rewards check: for a few recent spends, how much more another card in the
 * wallet would have earned. Uses the same ranking as the swipe advisor.
 */
import { rankCardsForPurchase, scorePurchase } from './purchase';
import type { Card, Catalog, Category, Experience } from './types';

export type PastSpend = {
  amount: number;
  category: Category;
  online?: boolean;
  /** Shop or brand if known (BPCL, Swiggy, Amazon); many card rates only apply there. */
  merchant?: string;
  /** Catalog id of the card that was used. */
  usedCardId: string;
};

export type MissedSpend = {
  spend: PastSpend;
  usedCard: Card | null;
  /** Rupees the used card earned (safe value, after any forex cost). */
  earned: number;
  bestCard: Card | null;
  tiedBestCards: Card[];
  bestEarned: number;
  /** bestEarned - earned, never below 0. */
  missed: number;
  reason: string;
};

export type MissedRewards = {
  rows: MissedSpend[];
  totalEarned: number;
  totalBest: number;
  totalMissed: number;
};

const round = (n: number) => Math.round(n);

export function missedRewards(
  catalog: Catalog,
  walletCards: Card[],
  spends: PastSpend[],
  options: { experience?: Experience; today?: string } = {},
): MissedRewards {
  const rows: MissedSpend[] = spends
    .filter((s) => s.amount > 0)
    .map((spend) => {
      const purchase = {
        amount: spend.amount,
        category: spend.category,
        merchant: spend.merchant?.trim() || undefined,
        online: spend.online ?? spend.category === 'ONLINE_SHOPPING',
      };
      const usedCard = catalog.byId.get(spend.usedCardId) ?? null;
      const used = usedCard ? scorePurchase(catalog, usedCard, purchase, options) : null;
      const ranked = rankCardsForPurchase(catalog, walletCards, purchase, options);
      // Rank by what was actually earned, so a risk-adjusted score never hides a bigger reward.
      const best = [...ranked].sort((a, b) => b.netValue - a.netValue)[0] ?? null;
      const tiedBestCards = best ? ranked.filter((candidate) => Math.abs(candidate.netValue - best.netValue) < 0.01).map((candidate) => candidate.card) : [];
      const earned = round(used?.netValue ?? 0);
      const bestEarned = round(Math.max(best?.netValue ?? 0, earned));
      const missed = Math.max(0, bestEarned - earned);
      const bestCard = best && missed > 0 ? best.card : usedCard;
      return {
        spend,
        usedCard,
        earned,
        bestCard,
        tiedBestCards,
        bestEarned,
        missed,
        reason: missed > 0 && best ? best.reason : used?.reason ?? 'No reward data for this card.',
      };
    });

  const totalEarned = rows.reduce((a, r) => a + r.earned, 0);
  const totalBest = rows.reduce((a, r) => a + r.bestEarned, 0);
  return { rows, totalEarned, totalBest, totalMissed: totalBest - totalEarned };
}
