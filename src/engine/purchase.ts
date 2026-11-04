/**
 * Module A: which card to use for one purchase (the swipe advisor).
 * Spec: research/algorithm-spec.md §3.
 */
import { CATEGORY_LABELS, EXCLUSION_PRONE, merchantMatches } from './categories';
import { devaluationRisk, todayIso } from './devaluation';
import { bestRupeesPerPoint } from './redemption';
import { verifiedUpiEarning } from './upi';
import type {
  CapUsage,
  Card,
  Catalog,
  Confidence,
  Experience,
  Purchase,
  PurchaseResult,
  RewardRow,
  RewardUnit,
} from './types';

/** GST on forex markup and card fees. */
export const GST = 0.18;
/** Assumed markup when a card does not publish one. */
const DEFAULT_FOREX_PCT = 3.5;
/** Up to this amount, RuPay credit card UPI payments carry no interchange, so rewards are often nil. */
export const UPI_SMALL_TICKET = 2000;

export type EarnSegment = {
  row: RewardRow;
  rowIndex: number;
  /** Safe effective rate in %, after exclusion rules. */
  ratePct: number;
  /** Rate if points are redeemed on the best realistic route. */
  bestRatePct: number;
  /** Spend this segment can still absorb this month (Infinity if uncapped). */
  capacitySpend: number;
  excluded: boolean;
};

const capKey = (cardId: string, rowIndex: number) => `${cardId}:${rowIndex}`;

const unitFor = (row: RewardRow | null): RewardUnit =>
  !row || row.type === 'CASHBACK' ? 'CASHBACK' : row.type === 'AIRLINE_MILES' ? 'MILES' : 'POINTS';

const specificity = (row: RewardRow) => (row.merchants ? 2 : row.category === 'DEFAULT' ? 0 : 1);

function rowApplies(row: RewardRow, p: Purchase): boolean {
  if (row.merchants && row.merchants.length > 0) {
    if (row.portal) {
      if (!p.allowPortal) return false;
      return row.category === p.category || (row.category === 'ONLINE_SHOPPING' && !!p.merchant);
    }
    return !!p.merchant && merchantMatches(p.merchant, row.merchants);
  }
  if (row.category === 'DEFAULT') return true;
  if (row.category === 'ONLINE_SHOPPING') return !!p.online;
  if (row.category === 'INTERNATIONAL') return !!p.international;
  return row.category === p.category;
}

function remainingCapRs(card: Card, rowIndex: number, row: RewardRow, usage: CapUsage): number {
  if (row.capRs == null) return Infinity;
  return Math.max(0, row.capRs - (usage[capKey(card.id, rowIndex)] ?? 0));
}

/**
 * Earning segments for a purchase on one card, in the order spend fills them:
 * the best applicable row first, then the base (DEFAULT) row for any spend above the cap.
 * Banks apply one accelerated rate per transaction, so rows are not stacked.
 */
export function earnSegments(
  catalog: Catalog,
  card: Card,
  p: Purchase,
  usage: CapUsage = {},
  experience: Experience = 'SOME',
): EarnSegment[] {
  const bestRpp = bestRupeesPerPoint(catalog, card, experience);
  const toSegment = (row: RewardRow, rowIndex: number, excluded: boolean): EarnSegment => {
    const remaining = remainingCapRs(card, rowIndex, row, usage);
    const factor = row.type === 'CASHBACK' || row.pointPaisa <= 0 ? 1 : Math.max(1, bestRpp / (row.pointPaisa / 100));
    return {
      row,
      rowIndex,
      ratePct: excluded ? 0 : row.ratePct,
      bestRatePct: row.ratePct * factor,
      capacitySpend: remaining === Infinity ? Infinity : row.ratePct > 0 ? (remaining * 100) / row.ratePct : 0,
      excluded,
    };
  };

  const applicable = card.rewards
    .map((row, i) => ({ row, i }))
    .filter(({ row }) => rowApplies(row, p))
    // Highest rate first; on a tie the more specific row wins, because its cap applies.
    .sort((a, b) => b.row.ratePct - a.row.ratePct || specificity(b.row) - specificity(a.row));

  const baseIndex = card.rewards.findIndex((r) => r.category === 'DEFAULT' && !r.merchants);
  const primary = applicable[0];
  if (!primary) return [];

  // No explicit row for a category that cards often exclude: do not assume the base rate.
  const onlyBase = primary.i === baseIndex;
  const primaryExcluded = onlyBase && EXCLUSION_PRONE.has(p.category);
  const segments = [toSegment(primary.row, primary.i, primaryExcluded)];
  if (!onlyBase && baseIndex >= 0) {
    segments.push(toSegment(card.rewards[baseIndex], baseIndex, EXCLUSION_PRONE.has(p.category)));
  }
  return segments;
}

function confidenceFor(segment: EarnSegment | undefined, p: Purchase, card: Card, today: string): Confidence {
  if (!segment || segment.excluded) return 'LOW';
  if (p.international && card.forexPct == null) return 'LOW';
  let confidence: Confidence = p.channel === 'UPI' || (segment.row.category === 'DEFAULT' && !segment.row.merchants) ? 'MEDIUM' : 'HIGH';
  const verifiedAt = card.verifiedAt ?? card.lastChanged;
  if (!verifiedAt) return confidence === 'HIGH' ? 'MEDIUM' : 'LOW';
  const ageDays = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${verifiedAt}T00:00:00Z`)) / 86_400_000;
  if (!Number.isFinite(ageDays) || ageDays > 365) return 'LOW';
  if (ageDays > 180 && confidence === 'HIGH') confidence = 'MEDIUM';
  return confidence;
}

const rupees = (n: number) => `₹${n >= 100 ? Math.round(n).toLocaleString('en-IN') : n.toFixed(2).replace(/\.00$/, '')}`;

function describeRow(row: RewardRow): string {
  if (row.merchants && row.merchantsText) return `on ${row.merchantsText}`;
  if (row.category === 'DEFAULT') return 'base rate';
  return `on ${CATEGORY_LABELS[row.category].toLowerCase()}`;
}

/** Scores one card for one purchase. Returns null if the card cannot be used (for example a Visa card on UPI). */
export function scorePurchase(
  catalog: Catalog,
  card: Card,
  p: Purchase,
  options: { usage?: CapUsage; experience?: Experience; today?: string } = {},
): PurchaseResult | null {
  const { usage = {}, experience = 'SOME', today = todayIso() } = options;
  const warnings: string[] = [];

  if (p.channel === 'UPI' && card.network !== 'RUPAY') return null;

  const segments = earnSegments(catalog, card, p, usage, experience);
  let remaining = p.amount;
  let safeValue = 0;
  let bestValue = 0;
  let pointsEarned = 0;
  let capUse: CapUsage = {};
  for (const s of segments) {
    if (remaining <= 0) break;
    const spend = Math.min(remaining, s.capacitySpend);
    const rupeesBack = (spend * s.ratePct) / 100;
    safeValue += rupeesBack;
    bestValue += (spend * s.bestRatePct) / 100;
    // Points (or miles) the bank credits: rupee value divided by the row's point value.
    pointsEarned += s.row.type === 'CASHBACK' || s.row.pointPaisa <= 0 ? rupeesBack : rupeesBack / (s.row.pointPaisa / 100);
    if (s.row.capRs != null) capUse[capKey(card.id, s.rowIndex)] = (spend * s.row.ratePct) / 100;
    remaining -= spend;
  }

  const primary = segments[0];
  if (primary && primary.capacitySpend < p.amount) {
    warnings.push(
      primary.capacitySpend === 0
        ? `Monthly cap on ${describeRow(primary.row)} already reached.`
        : `Only ${rupees(primary.capacitySpend)} of this spend earns the top rate before the monthly cap.`,
    );
  }
  if (primary?.excluded) {
    warnings.push(
      `Many cards give no reward on ${CATEGORY_LABELS[p.category].toLowerCase()}. This card lists no specific rate, so the reward is not counted.`,
    );
  }
  if (primary?.row.portal) {
    warnings.push(`This rate needs ${primary.row.merchantsText}. Buy through the bank's portal first.`);
  }

  // A card whose UPI terms were checked on the bank's page earns the bank's stated UPI rate instead.
  const upiEarning = p.channel === 'UPI' ? verifiedUpiEarning(card, p.category, !!p.online) : null;
  if (upiEarning) {
    const capLeft = upiEarning.capRs != null ? Math.max(0, upiEarning.capRs - (usage[upiEarning.capKey] ?? 0)) : Infinity;
    const uncapped = (p.amount * upiEarning.ratePct) / 100;
    safeValue = Math.min(uncapped, capLeft);
    bestValue = safeValue;
    pointsEarned = safeValue;
    capUse = upiEarning.capRs != null && safeValue > 0 ? { [upiEarning.capKey]: safeValue } : {};
    if (uncapped > capLeft) {
      warnings.push(capLeft === 0 ? 'Monthly cap on UPI rewards already reached.' : `Only ${rupees(capLeft)} of UPI reward is left before the monthly cap.`);
    }
  }

  // RuPay credit on UPI: small payments carry no interchange, so issuers may pay nothing (NPCI rewards-parity rule exception).
  // Not applied when the bank states its own UPI rate.
  if (p.channel === 'UPI' && p.amount <= UPI_SMALL_TICKET && !upiEarning) {
    bestValue = safeValue;
    safeValue = 0;
    pointsEarned = 0;
    capUse = {};
    warnings.push(`UPI payments up to ₹${UPI_SMALL_TICKET.toLocaleString('en-IN')} often earn no reward on RuPay credit cards. Check your card's terms.`);
  }

  let forexCost = 0;
  if (p.international) {
    const pct = card.forexPct ?? DEFAULT_FOREX_PCT;
    forexCost = (p.amount * pct * (1 + GST)) / 100;
    if (card.forexPct == null) warnings.push(`Forex markup not published; assumed ${DEFAULT_FOREX_PCT}% plus GST.`);
  }

  const netValue = safeValue - forexCost;
  const isPoints = !upiEarning && primary ? primary.row.type !== 'CASHBACK' : false;
  const { upcomingCuts } = devaluationRisk(catalog, card.id, today);
  const sourceVerifiedAt = card.verifiedAt ?? card.lastChanged ?? null;
  if (sourceVerifiedAt) {
    const ageDays = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${sourceVerifiedAt}T00:00:00Z`)) / 86_400_000;
    if (!Number.isFinite(ageDays) || ageDays > 365) warnings.push(`Reward data is stale (last checked ${sourceVerifiedAt}); verify the issuer terms before relying on this estimate.`);
    else if (ageDays > 180) warnings.push(`Reward data was last checked ${sourceVerifiedAt}; confirm current issuer terms.`);
  } else {
    warnings.push('No verification date is recorded for this reward data.');
  }
  // Keep the ranking unit explicit: comparable net rupees after costs. Confidence,
  // speculative best-route value, and devaluation risk are shown separately.
  const score = netValue;
  if (upcomingCuts.length > 0) {
    warnings.push(`Upcoming change on ${upcomingCuts[0].date}: ${upcomingCuts[0].title}.`);
  }

  const effectiveRatePct = p.amount > 0 ? (safeValue / p.amount) * 100 : 0;
  let reason: string;
  if (upiEarning) {
    reason =
      upiEarning.ratePct > 0
        ? `${formatPct(effectiveRatePct)} back (${upiEarning.label}): ${rupees(safeValue)} on ${rupees(p.amount)}.`
        : 'The bank pays no reward on UPI payments with this card.';
  } else if (!primary) {
    reason = 'This card has no reward data.';
  } else if (safeValue === 0 && bestValue > 0) {
    reason = `No reward counted on ${rupees(p.amount)}. It may earn up to ${rupees(bestValue)} if this spend is not excluded.`;
  } else {
    reason =
      `${formatPct(effectiveRatePct)} back ${describeRow(primary.row)}: ${rupees(safeValue)} on ${rupees(p.amount)}` +
      (bestValue > safeValue * 1.05 ? ` (up to ${rupees(bestValue)} if points are transferred)` : '') +
      (forexCost > 0 ? `, minus ${rupees(forexCost)} forex markup` : '') +
      '.';
  }

  return {
    card,
    safeValue: round2(safeValue),
    bestValue: round2(Math.max(bestValue, safeValue)),
    forexCost: round2(forexCost),
    netValue: round2(netValue),
    score,
    effectiveRatePct: round2(effectiveRatePct),
    estimatedReturnPct: p.amount > 0 ? round2((netValue / p.amount) * 100) : 0,
    pointsEarned: Math.round(pointsEarned),
    rewardUnit: upiEarning ? 'CASHBACK' : unitFor(primary?.row ?? null),
    row: primary?.row ?? null,
    rowIndex: primary?.rowIndex ?? -1,
    usesPortal: !!primary?.row.portal,
    confidence: confidenceFor(primary, p, card, today),
    source: card.source ?? card.url ?? null,
    verifiedAt: sourceVerifiedAt,
    assumptions: [
      ...(isPoints ? ['Reward value uses the card currency’s default value; transfer values are estimates and are not cash.'] : []),
      ...(p.international && card.forexPct == null ? [`Forex markup assumed at ${DEFAULT_FOREX_PCT}% plus GST.`] : []),
      ...(primary?.row.capRs != null ? [`Monthly reward cap: ₹${primary.row.capRs.toLocaleString('en-IN')} for this rule.`] : []),
    ],
    reason,
    warnings,
    capUse,
  };
}

/** Ranks cards by comparable net rupees for this purchase; ties break by an explicitly labelled estimated upside, then lower fee. */
export function rankCardsForPurchase(
  catalog: Catalog,
  cards: Card[],
  p: Purchase,
  options: { usage?: CapUsage; experience?: Experience; today?: string } = {},
): PurchaseResult[] {
  return cards
    .map((c) => scorePurchase(catalog, c, p, options))
    .filter((r): r is PurchaseResult => r !== null)
    .sort((a, b) => b.score - a.score || b.bestValue - a.bestValue || (a.card.annualFee ?? 0) - (b.card.annualFee ?? 0));
}

/** Records the reward from a purchase against monthly caps, for repeated calls in one month. */
export function recordPurchase(usage: CapUsage, result: PurchaseResult): CapUsage {
  const next = { ...usage };
  for (const [key, amount] of Object.entries(result.capUse)) next[key] = (next[key] ?? 0) + amount;
  return next;
}

const formatPct = (n: number) => `${Math.round(n * 100) / 100}%`;
const round2 = (n: number) => Math.round(n * 100) / 100;
