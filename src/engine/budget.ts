/**
 * Budget with rewards: sums the spends a user logs by hand, against the monthly spend from their profile,
 * and works out each card's rewards and monthly cap use with the purchase engine.
 * Pure TypeScript (no React Native), unit-tested in Node.
 */
import { CATEGORY_LABELS } from './categories';
import { recordPurchase, scorePurchase } from './purchase';
import type { CapUsage, Catalog, Category, Experience, RewardUnit } from './types';

/** One spend logged by the user. Entered by hand only: the app never reads SMS or email. */
export type Spend = {
  id: string;
  amount: number;
  category: Category;
  /** Wallet holding id (not the catalog id), so two copies of one card stay apart. */
  cardId: string;
  /** Local date, YYYY-MM-DD. */
  date: string;
  online?: boolean;
  paymentMode?: 'CARD' | 'UPI' | 'DEBIT' | 'CASH';
};

/** The wallet card a spend was paid with. */
export type BudgetHolding = { id: string; catalogId: string; label: string };

export type CategoryLine = { category: Category; label: string; spent: number; budget: number };

export type CardRewards = {
  holdingId: string;
  label: string;
  spent: number;
  /** Rupees back at the dataset's typical redemption value (scorePurchase safeValue). */
  rewardsRs: number;
  /** Points, miles or cashback credited. */
  pointsEarned: number;
  rewardUnit: RewardUnit;
};

export type CapLine = {
  holdingId: string;
  cardLabel: string;
  rowIndex: number;
  /** What the capped row pays on, for example "Online shopping". */
  label: string;
  /** Reward earned against the cap this month, in rupees. */
  usedRs: number;
  capRs: number;
};

export type MonthSummary = {
  month: string;
  total: number;
  budgetTotal: number;
  categories: CategoryLine[];
  cards: CardRewards[];
  caps: CapLine[];
  /** Spends on cards no longer in the wallet: counted in totals but not in rewards. */
  unknownCardSpend: number;
};

/** YYYY-MM of a local date. */
export const monthOf = (date: string) => date.slice(0, 7);

/** This month as YYYY-MM in local time. */
export function currentMonth(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** Spends from one month, oldest first (the order caps fill up). */
export function spendsInMonth(spends: Spend[], month: string): Spend[] {
  return spends
    .filter((s) => monthOf(s.date) === month)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Monthly summary: total by category against the profile's monthly spend, rewards per card,
 * and how much of each capped reward row has been used.
 */
export function monthSummary(
  catalog: Catalog,
  spends: Spend[],
  holdings: BudgetHolding[],
  monthlySpend: Partial<Record<Category, number>>,
  month: string,
  experience: Experience = 'SOME',
): MonthSummary {
  const list = spendsInMonth(spends, month);
  const byHolding = new Map(holdings.map((h) => [h.id, h]));

  // Categories: every one with a budget, plus any the user spent on.
  const spent = new Map<Category, number>();
  for (const s of list) spent.set(s.category, (spent.get(s.category) ?? 0) + s.amount);
  const categorySet = new Set<Category>([
    ...(Object.entries(monthlySpend) as [Category, number][]).filter(([, v]) => (v ?? 0) > 0).map(([k]) => k),
    ...spent.keys(),
  ]);
  const categories = [...categorySet]
    .map((category) => ({ category, label: CATEGORY_LABELS[category], spent: spent.get(category) ?? 0, budget: monthlySpend[category] ?? 0 }))
    .sort((a, b) => b.spent - a.spent || b.budget - a.budget);

  // Rewards and caps: score each spend in date order, carrying cap usage forward per card.
  const usage: Record<string, CapUsage> = {};
  const cards = new Map<string, CardRewards>();
  let unknownCardSpend = 0;
  for (const s of list) {
    const holding = byHolding.get(s.cardId);
    const card = holding ? catalog.byId.get(holding.catalogId) : undefined;
    if (!holding || !card) {
      unknownCardSpend += s.amount;
      continue;
    }
    const line = cards.get(holding.id) ?? {
      holdingId: holding.id,
      label: holding.label,
      spent: 0,
      rewardsRs: 0,
      pointsEarned: 0,
      rewardUnit: 'POINTS' as RewardUnit,
    };
    line.spent += s.amount;
    const result = scorePurchase(
      catalog,
      card,
      { amount: s.amount, category: s.category, online: s.online || s.category === 'ONLINE_SHOPPING' },
      { usage: usage[holding.id] ?? {}, experience },
    );
    if (result) {
      line.rewardsRs = round2(line.rewardsRs + result.safeValue);
      line.pointsEarned += result.pointsEarned;
      line.rewardUnit = result.rewardUnit;
      usage[holding.id] = recordPurchase(usage[holding.id] ?? {}, result);
    }
    cards.set(holding.id, line);
  }

  const caps: CapLine[] = [];
  for (const [holdingId, cardUsage] of Object.entries(usage)) {
    const holding = byHolding.get(holdingId)!;
    const card = catalog.byId.get(holding.catalogId)!;
    for (const [key, usedRs] of Object.entries(cardUsage)) {
      const rowIndex = Number(key.slice(key.lastIndexOf(':') + 1));
      const row = card.rewards[rowIndex];
      if (!row || row.capRs == null) continue;
      caps.push({
        holdingId,
        cardLabel: holding.label,
        rowIndex,
        label: row.merchantsText ?? CATEGORY_LABELS[row.category],
        usedRs: round2(Math.min(usedRs, row.capRs)),
        capRs: row.capRs,
      });
    }
  }

  return {
    month,
    total: list.reduce((acc, s) => acc + s.amount, 0),
    budgetTotal: Object.values(monthlySpend).reduce<number>((acc, v) => acc + (v ?? 0), 0),
    categories,
    cards: [...cards.values()].sort((a, b) => b.rewardsRs - a.rewardsRs),
    caps: caps.sort((a, b) => b.usedRs / b.capRs - a.usedRs / a.capRs),
    unknownCardSpend,
  };
}
