/**
 * Debt-trap check: what it really costs to pay only the minimum due, to convert a
 * purchase to EMI, or to withdraw cash on a credit card. Pure maths, no app imports.
 * Every assumption the user did not enter is returned in `assumptions` so the screen
 * and Aura can label it.
 */
import { DEFAULT_APR_MONTHLY_PCT } from './portfolio';
import { GST, scorePurchase } from './purchase';
import type { Card, Catalog, Category, Experience } from './types';

/** The dataset has no minimum-due %. Most Indian issuers ask for about 5% of the bill. */
export const DEFAULT_MIN_DUE_PCT = 5;
/** Smallest minimum due most issuers ask for, in rupees (assumed). */
export const DEFAULT_MIN_DUE_FLOOR = 200;
/** Typical cash withdrawal fee: 2.5% of the amount, at least ₹500 (assumed; check your card's charges). */
export const DEFAULT_CASH_FEE_PCT = 2.5;
export const DEFAULT_CASH_MIN_FEE = 500;
/** Longest simulation for the minimum-due path: 50 years. */
export const MAX_SIMULATION_MONTHS = 600;

const round = (n: number) => Math.round(n);
const round2 = (n: number) => Math.round(n * 100) / 100;

export type RateSource = 'CARD' | 'USER' | 'ASSUMED';

/**
 * Monthly interest rate for a card. Cards with no published rate (or 0%, which in the
 * dataset means "not published") use the same 3.75% default as interestExample().
 */
export function cardMonthlyRate(card: Card | null | undefined): { pct: number; source: RateSource } {
  const pct = card?.aprMonthlyPct;
  if (pct != null && pct > 0) return { pct, source: 'CARD' };
  return { pct: DEFAULT_APR_MONTHLY_PCT, source: 'ASSUMED' };
}

// ── Minimum due ──────────────────────────────────────────

export type RevolvingInput = {
  /** Statement balance today, in rupees. */
  balance: number;
  /** Monthly interest rate in %. Null uses the 3.75% default (labelled assumed). */
  aprMonthlyPct?: number | null;
  /** Minimum due as a % of the statement. Default 5% (assumed). */
  minDuePct?: number;
  /** Smallest minimum due in rupees. Default ₹200 (assumed). */
  minDueFloor?: number;
  /** New card spend each month while the balance is unpaid. */
  newMonthlySpend?: number;
  /** Calendar days in the card's statement cycle. Defaults to 30 only when unavailable. */
  cycleDays?: number;
  maxMonths?: number;
};

export type RevolvingMonth = {
  month: number;
  opening: number;
  payment: number;
  interest: number;
  gst: number;
  newSpend: number;
  closing: number;
};

export type RevolvingCost = {
  /** CLEARS: paid off. NEVER: the minimum does not even cover the interest (or new spend), so the balance never goes down. CAPPED: still owing after maxMonths. */
  status: 'CLEARS' | 'NEVER' | 'CAPPED';
  /** Months to clear the balance when paying only the minimum (null unless CLEARS). */
  months: number | null;
  totalInterest: number;
  /** 18% GST on the interest. */
  totalGst: number;
  /** Interest plus GST: the extra cost of paying only the minimum. */
  extraCost: number;
  totalPaid: number;
  /** Amount still owed at the end of the simulation (0 if cleared). */
  remaining: number;
  firstPayment: number;
  firstMonthInterest: number;
  monthlyPct: number;
  cycleDays: number;
  rateSource: RateSource;
  minDuePct: number;
  schedule: RevolvingMonth[];
  assumptions: string[];
};

/**
 * Simulates paying only the minimum due each month.
 * Simplified: interest is charged on the balance left after each payment, and new
 * purchases pay interest for about half a month because the interest-free period is
 * lost while a balance is carried. Real bills are usually a little higher, because
 * banks charge interest from each purchase date.
 */
export function revolvingCost(input: RevolvingInput): RevolvingCost {
  const balance = Math.max(0, input.balance);
  const userRate = input.aprMonthlyPct != null && input.aprMonthlyPct > 0;
  const monthlyPct = userRate ? (input.aprMonthlyPct as number) : DEFAULT_APR_MONTHLY_PCT;
  const rateSource: RateSource = userRate ? 'CARD' : 'ASSUMED';
  const minDuePct = input.minDuePct != null && input.minDuePct > 0 ? input.minDuePct : DEFAULT_MIN_DUE_PCT;
  const floor = input.minDueFloor ?? DEFAULT_MIN_DUE_FLOOR;
  const newSpend = Math.max(0, input.newMonthlySpend ?? 0);
  const maxMonths = input.maxMonths ?? MAX_SIMULATION_MONTHS;
  const cycleDays = Number.isInteger(input.cycleDays) && input.cycleDays! >= 1 && input.cycleDays! <= 31 ? input.cycleDays! : 30;
  const r = (monthlyPct * 12 / 100) * cycleDays / 365;

  const assumptions: string[] = [];
  if (!userRate) assumptions.push(`Interest assumed at ${DEFAULT_APR_MONTHLY_PCT}% a month (this card does not publish a rate).`);
  assumptions.push(`Statement-cycle interest uses ${cycleDays} calendar days: balance after payment × (monthly rate × 12) × ${cycleDays}/365. ${input.cycleDays == null ? 'A 30-day cycle is assumed because no cycle length was provided.' : 'Cycle length is based on saved statement dates.'}`);
  if (input.minDuePct == null) assumptions.push(`Minimum due assumed at ${DEFAULT_MIN_DUE_PCT}% of the bill, at least ₹${floor.toLocaleString('en-IN')}. Check your statement and change it if yours is different.`);
  assumptions.push('18% GST is added to interest.');
  assumptions.push('Simplified: banks charge interest from each purchase date, so real interest is usually a little higher.');
  if (newSpend > 0) assumptions.push('New purchases get no interest-free period while a balance is carried.');

  const schedule: RevolvingMonth[] = [];
  let b = balance;
  let totalInterest = 0;
  let totalGst = 0;
  let totalPaid = 0;
  let status: RevolvingCost['status'] = 'CAPPED';
  let months: number | null = null;

  if (b <= 0) {
    status = 'CLEARS';
    months = 0;
  }

  for (let m = 1; b > 0.5 && m <= maxMonths; m++) {
    const opening = b;
    const payment = Math.min(opening, Math.max((opening * minDuePct) / 100, floor));
    const left = opening - payment;
    const interest = left * r + newSpend * r * 0.5;
    const gst = interest * GST;
    const closing = left + interest + gst + newSpend;
    totalInterest += interest;
    totalGst += gst;
    totalPaid += payment;
    schedule.push({
      month: m,
      opening: round2(opening),
      payment: round2(payment),
      interest: round2(interest),
      gst: round2(gst),
      newSpend,
      closing: round2(closing),
    });
    b = closing;
    if (b <= 0.5) {
      status = 'CLEARS';
      months = m;
      b = 0;
      break;
    }
    // The minimum no longer brings the balance down: it will never clear.
    if (closing >= opening - 0.01) {
      status = 'NEVER';
      break;
    }
  }

  return {
    status,
    months,
    totalInterest: round(totalInterest),
    totalGst: round(totalGst),
    extraCost: round(totalInterest) + round(totalGst),
    totalPaid: round(totalPaid),
    remaining: round(b),
    firstPayment: round(schedule[0]?.payment ?? 0),
    firstMonthInterest: round((schedule[0]?.interest ?? 0) + (schedule[0]?.gst ?? 0)),
    monthlyPct,
    cycleDays,
    rateSource,
    minDuePct,
    schedule,
    assumptions,
  };
}

// ── EMI ──────────────────────────────────────────────────

export type EmiInput = {
  /** Price being converted to EMI, in rupees. */
  price: number;
  /** Yearly interest rate in % (as banks quote EMI plans). */
  annualRatePct?: number;
  /** Or a monthly rate in %. Used when annualRatePct is not given. */
  monthlyRatePct?: number;
  months: number;
  /** One-time processing fee in rupees (before GST). */
  processingFee?: number;
  /** Discount you lose by choosing EMI instead of paying in full (for example an instant cashback only for full payment). */
  discountLost?: number;
};

export type EmiCost = {
  emi: number;
  months: number;
  totalInterest: number;
  gstOnInterest: number;
  processingFee: number;
  gstOnFee: number;
  discountLost: number;
  /** Everything you pay beyond the price: interest, GST, fee and any lost discount. */
  trueExtraCost: number;
  totalPaid: number;
  /** True when the plan charges interest (or hides it as a lost discount), so it cannot honestly be called "no-cost" (RBI 2025 Directions para 12(3)). */
  noCostLabelWrong: boolean;
  monthlyRatePct: number;
  assumptions: string[];
};

/** Cost of converting a purchase to EMI, including everything that makes "no-cost EMI" cost something. */
export function emiCost(input: EmiInput): EmiCost {
  const price = Math.max(0, input.price);
  const n = Math.max(1, Math.round(input.months));
  const monthlyRatePct = input.annualRatePct != null ? input.annualRatePct / 12 : Math.max(0, input.monthlyRatePct ?? 0);
  const r = monthlyRatePct / 100;
  const emi = r > 0 ? (price * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1) : price / n;
  const totalInterest = Math.max(0, emi * n - price);
  const gstOnInterest = totalInterest * GST;
  const processingFee = Math.max(0, input.processingFee ?? 0);
  const gstOnFee = processingFee * GST;
  const discountLost = Math.max(0, input.discountLost ?? 0);
  const trueExtraCost = totalInterest + gstOnInterest + processingFee + gstOnFee + discountLost;

  const assumptions = ['18% GST is added to EMI interest and to the processing fee.'];
  if (discountLost > 0) assumptions.push('A discount you give up to take the EMI is counted as a cost.');

  return {
    emi: round(emi),
    months: n,
    totalInterest: round(totalInterest),
    gstOnInterest: round(gstOnInterest),
    processingFee: round(processingFee),
    gstOnFee: round(gstOnFee),
    discountLost: round(discountLost),
    trueExtraCost: round(trueExtraCost),
    totalPaid: round(price + trueExtraCost - discountLost),
    noCostLabelWrong: totalInterest > 0.5 || discountLost > 0,
    monthlyRatePct: round2(monthlyRatePct),
    assumptions,
  };
}

// ── Cash withdrawal ──────────────────────────────────────

export type CashWithdrawalInput = {
  amount: number;
  /** Fee as % of the amount. Default 2.5% (assumed). */
  feePct?: number;
  /** Smallest fee in rupees. Default ₹500 (assumed). */
  minFee?: number;
  /** Monthly interest in %. Null uses the 3.75% default (labelled assumed). */
  aprMonthlyPct?: number | null;
  /** Days until the cash is repaid. */
  days: number;
};

export type CashWithdrawalCost = {
  fee: number;
  gstOnFee: number;
  interest: number;
  gstOnInterest: number;
  totalCost: number;
  /** Total cost as a % of the cash taken. */
  costPct: number;
  monthlyPct: number;
  rateSource: RateSource;
  assumptions: string[];
};

/** Cost of taking cash on a credit card: a fee plus interest from the same day (no interest-free period). */
export function cashWithdrawalCost(input: CashWithdrawalInput): CashWithdrawalCost {
  const amount = Math.max(0, input.amount);
  const days = Math.max(0, input.days);
  const feePct = input.feePct ?? DEFAULT_CASH_FEE_PCT;
  const minFee = input.minFee ?? DEFAULT_CASH_MIN_FEE;
  const userRate = input.aprMonthlyPct != null && input.aprMonthlyPct > 0;
  const monthlyPct = userRate ? (input.aprMonthlyPct as number) : DEFAULT_APR_MONTHLY_PCT;

  const fee = amount > 0 ? Math.max((amount * feePct) / 100, minFee) : 0;
  const gstOnFee = fee * GST;
  // Daily rate = yearly rate / 365, as Indian issuers compute it.
  const interest = (amount * (monthlyPct * 12)) / 100 / 365 * days;
  const gstOnInterest = interest * GST;
  const totalCost = fee + gstOnFee + interest + gstOnInterest;

  const assumptions: string[] = [];
  if (input.feePct == null || input.minFee == null) {
    assumptions.push(`Fee assumed at ${DEFAULT_CASH_FEE_PCT}% of the amount, at least ₹${DEFAULT_CASH_MIN_FEE}. Check your card's schedule of charges.`);
  }
  if (!userRate) assumptions.push(`Interest assumed at ${DEFAULT_APR_MONTHLY_PCT}% a month (this card does not publish a rate).`);
  assumptions.push('Interest starts on the day you take the cash: there is no interest-free period.');
  assumptions.push('18% GST is added to the fee and the interest.');

  return {
    fee: round(fee),
    gstOnFee: round(gstOnFee),
    interest: round(interest),
    gstOnInterest: round(gstOnInterest),
    totalCost: round(totalCost),
    costPct: amount > 0 ? round2((totalCost / amount) * 100) : 0,
    monthlyPct,
    rateSource: userRate ? 'CARD' : 'ASSUMED',
    assumptions,
  };
}

/**
 * Rewards a spend would earn on this card at the safe (default route) value, so the
 * screen can put "you earned ₹X" next to "it cost ₹Y in interest".
 */
export function rewardsOnSpend(
  catalog: Catalog,
  card: Card,
  amount: number,
  options: { category?: Category; online?: boolean; experience?: Experience } = {},
): number {
  if (!(amount > 0)) return 0;
  const result = scorePurchase(
    catalog,
    card,
    { amount, category: options.category ?? 'DEFAULT', online: options.online },
    { experience: options.experience ?? 'NEW' },
  );
  return round(result?.safeValue ?? 0);
}
