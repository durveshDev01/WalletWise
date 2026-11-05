/**
 * Fee-free finder and "Is my fee worth it?".
 * Filters are a config array so new ones (FD-backed, no income proof) are one line each.
 */
import { GST } from './purchase';
import { walletValue } from './portfolio';
import type { Card, Catalog, UserProfile } from './types';

export type CardFilter = {
  key: string;
  label: string;
  /** One short line shown under the chip row when the filter is on. */
  hint: string;
  test: (card: Card) => boolean;
};

const hasNoFee = (c: Card) => c.lifetimeFree || c.annualFee === 0;

/** Catalog filters. To add one, append a line. Inclusion facts were checked on the issuer's page. */
export const CARD_FILTERS: CardFilter[] = [
  { key: 'LIFETIME_FREE', label: 'Lifetime free', hint: 'No joining or annual fee.', test: hasNoFee },
  {
    key: 'FEE_UPTO_500',
    label: 'Fee up to ₹500',
    hint: 'Annual fee of ₹500 or less (plus GST).',
    test: (c) => hasNoFee(c) || (c.annualFee != null && c.annualFee <= 500),
  },
  { key: 'RUPAY', label: 'RuPay (works on UPI)', hint: 'Only RuPay credit cards can be linked to UPI apps.', test: (c) => c.network === 'RUPAY' },
  {
    key: 'UPI_REWARDS',
    label: 'Rewards on UPI',
    hint: 'The bank’s page says UPI payments earn rewards on this card.',
    test: (c) => c.network === 'RUPAY' && c.inclusion?.upi?.earnsRewards === true,
  },
  { key: 'ENTRY', label: 'Entry level', hint: 'Easier to get, usually lower income needed.', test: (c) => c.tier === 'ENTRY' },
  {
    key: 'FD_BACKED',
    label: 'FD-backed',
    hint: 'Given against a fixed deposit. Good for a first card or no credit history.',
    test: (c) => c.inclusion?.secured === true,
  },
  {
    key: 'NO_INCOME_PROOF',
    label: 'No income proof',
    hint: 'The bank’s page says no salary slip or ITR is needed.',
    test: (c) => c.inclusion?.noIncomeProof === true,
  },
];

export const BROWSE_BANKS: { key: string; label: string }[] = [
  { key: 'HDFC', label: 'HDFC' },
  { key: 'SBI', label: 'SBI' },
  { key: 'ICICI', label: 'ICICI' },
  { key: 'AXIS', label: 'Axis' },
  { key: 'AMEX', label: 'Amex' },
  { key: 'KOTAK', label: 'Kotak' },
  { key: 'IDFC', label: 'IDFC FIRST' },
  { key: 'AU', label: 'AU Small Fin' },
  { key: 'RBL', label: 'RBL' },
  { key: 'YES', label: 'YES Bank' },
  { key: 'INDUSIND', label: 'IndusInd' },
  { key: 'HSBC', label: 'HSBC' },
  { key: 'BOB', label: 'Bank of Baroda' },
  { key: 'PNB', label: 'PNB' },
  { key: 'FEDERAL', label: 'Federal' },
  { key: 'SC', label: 'Standard Chartered' },
];

export const BROWSE_NETWORKS: { key: string; label: string }[] = [
  { key: 'VISA', label: 'Visa' },
  { key: 'MASTERCARD', label: 'Mastercard' },
  { key: 'RUPAY', label: 'RuPay' },
  { key: 'AMEX', label: 'Amex' },
  { key: 'DINERS', label: 'Diners Club' },
];

export type BrowseRow = {
  card: Card;
  /** Yearly value (rewards + perks - fee) at the user's spend, or null when no spend profile is used. */
  yearlyValue: number | null;
  /** Annual fee including GST (0 for lifetime-free cards). */
  feeWithGst: number;
};

const feeWithGst = (c: Card) => (hasNoFee(c) ? 0 : (c.annualFee ?? 0) * (1 + GST));

export type BrowseOptions = {
  query?: string;
  filterKeys?: string[];
  banks?: string[];
  networks?: string[];
  profile?: UserProfile | null;
  limit?: number;
};

/**
 * Searches and filters the catalog. Supports multi-select bank, network and feature filtering.
 * With a profile, rows are sorted by the yearly value of holding that one card at the user's spend;
 * without one, by fee (lowest first).
 */
export function browseCards(
  catalog: Catalog,
  options: BrowseOptions = {},
): BrowseRow[] {
  const words = (options.query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const active = CARD_FILTERS.filter((f) => options.filterKeys?.includes(f.key));
  const activeBanks = (options.banks ?? []).map((b) => b.toUpperCase());
  const activeNetworks = (options.networks ?? []).map((n) => n.toUpperCase());

  const matches = catalog.cards.filter((c) => {
    if (!active.every((f) => f.test(c))) return false;
    if (activeBanks.length > 0 && !activeBanks.includes(c.issuer.toUpperCase())) return false;
    if (activeNetworks.length > 0 && !activeNetworks.includes(c.network.toUpperCase())) return false;
    if (words.length === 0) return true;
    const haystack = `${c.name} ${c.issuer} ${c.id} ${c.network}`.toLowerCase();
    return words.every((w) => haystack.includes(w));
  });

  const profile = options.profile;
  const rows: BrowseRow[] = matches.map((card) => ({
    card,
    yearlyValue: profile ? walletValue(catalog, [card], profile).net : null,
    feeWithGst: Math.round(feeWithGst(card)),
  }));

  rows.sort((a, b) => {
    if (a.yearlyValue != null && b.yearlyValue != null && a.yearlyValue !== b.yearlyValue) return b.yearlyValue - a.yearlyValue;
    const fa = a.card.annualFee == null && !hasNoFee(a.card) ? Infinity : a.feeWithGst;
    const fb = b.card.annualFee == null && !hasNoFee(b.card) ? Infinity : b.feeWithGst;
    return fa - fb || a.card.name.localeCompare(b.card.name);
  });
  return options.limit ? rows.slice(0, options.limit) : rows;
}

export type FeeVerdict = 'FREE' | 'WAIVED' | 'WORTH_IT' | 'NOT_WORTH';

export type FeeCheck = {
  cardId: string;
  /** Rewards a year at the user's spend (this card's share of the wallet's spend). */
  annualReward: number;
  perks: number;
  annualSpend: number;
  /** The card's annual fee including GST, even if waived. */
  feeWithGst: number;
  /** Fee actually charged this year (0 when free or waived). */
  feeCharged: number;
  waived: boolean;
  waiverSpend: number | null;
  /** Yearly spend still needed for the fee waiver, or null if the card has no waiver. */
  spendToWaiver: number | null;
  /** Rewards + perks - fee charged. */
  net: number;
  verdict: FeeVerdict;
  headline: string;
  advice: string[];
  /** Lifetime-free cards from the same bank, to ask for instead. */
  freeAlternatives: Card[];
};

/**
 * "Is my fee worth it?" for one card in the wallet, using walletValue's per-card split
 * so spend goes to whichever card in the wallet earns most on it.
 */
export function feeCheck(catalog: Catalog, walletCards: Card[], cardId: string, profile: UserProfile): FeeCheck | null {
  const card = walletCards.find((c) => c.id === cardId);
  if (!card) return null;
  const year = walletValue(catalog, walletCards, profile).perCard.find((p) => p.cardId === cardId);
  if (!year) return null;

  const fullFee = Math.round(feeWithGst(card));
  const free = hasNoFee(card);
  const annualReward = Math.round(year.annualReward);
  const perks = Math.round(year.perks);
  const feeCharged = Math.round(year.fee);
  const spendToWaiver = card.feeWaiverSpend != null ? Math.max(0, Math.round(card.feeWaiverSpend - year.annualSpend)) : null;
  const net = annualReward + perks - feeCharged;
  const freeAlternatives = catalog.cards.filter((c) => c.issuer === card.issuer && c.id !== card.id && hasNoFee(c)).slice(0, 3);
  const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

  let verdict: FeeVerdict;
  let headline: string;
  const advice: string[] = [];
  if (free) {
    verdict = 'FREE';
    headline = 'No annual fee. Nothing to pay to keep this card.';
  } else if (year.feeWaived) {
    verdict = 'WAIVED';
    headline = `Your spend covers the ${inr(card.feeWaiverSpend ?? 0)} waiver, so the ${inr(fullFee)} fee should be waived.`;
    advice.push('Check your statement after the card anniversary to make sure the fee was reversed.');
  } else if (annualReward + perks >= feeCharged) {
    verdict = 'WORTH_IT';
    headline = `It earns about ${inr(annualReward + perks)} a year against a ${inr(feeCharged)} fee, so it pays for itself.`;
    if (spendToWaiver != null && spendToWaiver > 0) {
      advice.push(`${inr(spendToWaiver)} more card spend this year would waive the fee. Only count spend you would make anyway.`);
    }
  } else {
    verdict = 'NOT_WORTH';
    const allUpi = (profile.upiShare ?? 0) >= 1 && card.network !== 'RUPAY';
    headline = allUpi
      ? `You pay by UPI, and only RuPay cards work on UPI, so this card earns nothing on your saved spending. Its fee is ${inr(feeCharged)} a year.`
      : year.annualSpend === 0 && walletCards.length > 1
        ? `Your other cards earn more on all of your spending, so this card adds nothing, and its fee is ${inr(feeCharged)} a year.`
        : `It earns about ${inr(annualReward + perks)} a year but the fee is ${inr(feeCharged)}. You lose about ${inr(feeCharged - annualReward - perks)}.`;
    if (spendToWaiver != null && spendToWaiver > 0) {
      advice.push(`The fee is waived at ${inr(card.feeWaiverSpend ?? 0)} a year; you are ${inr(spendToWaiver)} short. Do not spend extra just to reach it.`);
    }
    advice.push('Call the bank and ask them to waive this year\'s fee. Banks often agree for customers who pay on time.');
    advice.push(
      freeAlternatives.length > 0
        ? `Ask to move to a lifetime-free card from the same bank, such as ${freeAlternatives.map((c) => c.name).join(' or ')}. Your credit history stays with the bank.`
        : 'Ask whether the bank has a lifetime-free version you can move to.',
    );
    advice.push('If neither works, you can close the card. Pay the full bill and use your points first.');
  }

  if (!free && card.perks.includes('MILESTONE_BONUS')) {
    advice.push('Milestone bonuses and welcome vouchers are not counted here. Add them in your head only if you really use them.');
  }

  return {
    cardId,
    annualReward,
    perks,
    annualSpend: Math.round(year.annualSpend),
    feeWithGst: fullFee,
    feeCharged,
    waived: year.feeWaived && !free,
    waiverSpend: card.feeWaiverSpend,
    spendToWaiver,
    net,
    verdict,
    headline,
    advice,
    freeAlternatives,
  };
}
