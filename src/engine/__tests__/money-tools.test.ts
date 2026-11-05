/// <reference types="node" />
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { catalog as realCatalog } from '../../data/catalog';
import {
  browseCards,
  buildCatalog,
  CARD_FILTERS,
  cardMonthlyRate,
  cashWithdrawalCost,
  checkRedemption,
  emiCost,
  feeCheck,
  goalProgress,
  missedRewards,
  revolvingCost,
  rewardsOnSpend,
  safeRupeesPerPoint,
  bestRupeesPerPoint,
} from '../index';
import type { Card, Catalog, RewardRow, UserProfile } from '../index';

const TODAY = '2026-10-19';

function row(partial: Partial<RewardRow> & Pick<RewardRow, 'category' | 'ratePct'>): RewardRow {
  return { type: 'CASHBACK', capRs: null, pointPaisa: 100, merchantsText: null, merchants: null, portal: false, ...partial };
}

function card(partial: Partial<Card> & Pick<Card, 'id' | 'rewards'>): Card {
  return {
    name: partial.id,
    issuer: 'TEST',
    issuerType: 'COMMERCIAL',
    network: 'VISA',
    tier: 'MID',
    annualFee: 0,
    joiningFee: 0,
    lifetimeFree: true,
    feeWaiverSpend: null,
    forexPct: 3.5,
    aprMonthlyPct: 3.75,
    minMonthlyIncome: null,
    minAge: null,
    maxAge: null,
    rateMinPct: null,
    rateMaxPct: null,
    lastChanged: TODAY,
    url: '',
    programme: null,
    perks: [],
    lounge: null,
    ...partial,
  };
}

function fixtureCatalog(cards: Card[]): Catalog {
  return buildCatalog({
    cards,
    transfers: { nodes: [], edges: [] },
    changes: [],
    meta: { generatedAt: TODAY, source: 'test', license: 'test', attribution: 'test', asOf: {} },
  });
}

const base1 = card({ id: 'base1', rewards: [row({ category: 'DEFAULT', ratePct: 1 })] });
const online5 = card({
  id: 'online5',
  rewards: [row({ category: 'DEFAULT', ratePct: 1 }), row({ category: 'ONLINE_SHOPPING', ratePct: 5 })],
});
const feeCard = card({
  id: 'fee1000',
  lifetimeFree: false,
  annualFee: 1000,
  feeWaiverSpend: 100000,
  rewards: [row({ category: 'DEFAULT', ratePct: 0.5 })],
});
const freeSameBank = card({ id: 'free-same-bank', rewards: [row({ category: 'DEFAULT', ratePct: 1 })] });

const profile = (monthly: number): UserProfile => ({ monthlySpend: { DEFAULT: monthly }, repayment: 'ALWAYS_FULL', experience: 'SOME' });

// ── Debt-trap check ──────────────────────────────────────
describe('revolvingCost', () => {
  it('works out the first month by hand: 5% minimum, interest and GST on the rest', () => {
    const r = revolvingCost({ balance: 10000, aprMonthlyPct: 3.75 });
    const m1 = r.schedule[0];
    assert.equal(m1.payment, 500);
    assert.equal(m1.interest, 351.37); // 9,500 x (3.75% x 12) x 30/365
    assert.equal(m1.gst, 63.25); // 18% GST
    assert.equal(m1.closing, 9914.62);
    assert.equal(r.status, 'CLEARS');
    assert.ok(r.months! > 60, `minimum-only should take years, got ${r.months} months`);
  });

  it('uses saved statement-cycle days in interest arithmetic', () => {
    const short = revolvingCost({ balance: 10000, aprMonthlyPct: 3.75, cycleDays: 28 });
    const long = revolvingCost({ balance: 10000, aprMonthlyPct: 3.75, cycleDays: 31 });
    assert.equal(short.cycleDays, 28);
    assert.ok(long.firstMonthInterest > short.firstMonthInterest);
    assert.match(long.assumptions.join(' '), /31 calendar days/);
  });

  it('total paid equals the balance plus interest and GST when it clears', () => {
    const r = revolvingCost({ balance: 25000, aprMonthlyPct: 3.5, minDuePct: 5 });
    assert.equal(r.status, 'CLEARS');
    assert.ok(Math.abs(r.totalPaid - (25000 + r.extraCost)) <= 2);
    assert.equal(r.extraCost, r.totalInterest + r.totalGst);
    assert.ok(Math.abs(r.totalGst - r.totalInterest * 0.18) <= 1);
  });

  it('reports "never clears" when the minimum does not cover the interest', () => {
    const r = revolvingCost({ balance: 10000, aprMonthlyPct: 3.75, minDuePct: 2 });
    assert.equal(r.status, 'NEVER');
    assert.equal(r.months, null);
    assert.ok(r.remaining > 10000);
  });

  it('reports "never clears" when new spending outpaces the minimum', () => {
    const r = revolvingCost({ balance: 10000, aprMonthlyPct: 3.75, newMonthlySpend: 5000 });
    assert.equal(r.status, 'NEVER');
  });

  it('caps the simulation and labels assumed values', () => {
    const r = revolvingCost({ balance: 50000, aprMonthlyPct: null, maxMonths: 12 });
    assert.equal(r.status, 'CAPPED');
    assert.equal(r.schedule.length, 12);
    assert.equal(r.monthlyPct, 3.75);
    assert.equal(r.rateSource, 'ASSUMED');
    assert.ok(r.assumptions.some((a) => a.includes('assumed at 3.75%')));
    assert.ok(r.assumptions.some((a) => a.includes('Minimum due assumed at 5%')));
  });

  it('handles a zero balance', () => {
    const r = revolvingCost({ balance: 0, aprMonthlyPct: 3 });
    assert.deepEqual([r.status, r.months, r.extraCost], ['CLEARS', 0, 0]);
  });

  it('cardMonthlyRate falls back to 3.75% for missing or 0% rates', () => {
    assert.deepEqual(cardMonthlyRate(card({ id: 'x', rewards: [], aprMonthlyPct: 3.5 })), { pct: 3.5, source: 'CARD' });
    assert.deepEqual(cardMonthlyRate(card({ id: 'x', rewards: [], aprMonthlyPct: null })), { pct: 3.75, source: 'ASSUMED' });
    assert.deepEqual(cardMonthlyRate(card({ id: 'x', rewards: [], aprMonthlyPct: 0 })), { pct: 3.75, source: 'ASSUMED' });
  });
});

describe('emiCost', () => {
  it('computes a standard EMI with GST on interest', () => {
    const r = emiCost({ price: 12000, annualRatePct: 15, months: 6 });
    assert.equal(r.emi, 2088);
    assert.ok(Math.abs(r.totalInterest - 530) <= 1, `interest ${r.totalInterest}`);
    assert.equal(r.gstOnInterest, Math.round(r.totalInterest * 0.18));
    assert.equal(r.noCostLabelWrong, true);
  });

  it('a true zero-interest EMI still costs the fee plus GST, and may be called no-cost', () => {
    const r = emiCost({ price: 12000, monthlyRatePct: 0, months: 6, processingFee: 199 });
    assert.deepEqual([r.emi, r.totalInterest, r.gstOnFee, r.trueExtraCost, r.noCostLabelWrong], [2000, 0, 36, 235, false]);
  });

  it('flags "no-cost" as wrong when the interest is hidden in a lost discount', () => {
    const r = emiCost({ price: 12000, monthlyRatePct: 0, months: 6, discountLost: 1000 });
    assert.equal(r.noCostLabelWrong, true);
    assert.equal(r.trueExtraCost, 1000);
  });
});

describe('cashWithdrawalCost', () => {
  it('charges the minimum fee and interest from day one', () => {
    const r = cashWithdrawalCost({ amount: 10000, days: 30 });
    assert.equal(r.fee, 500); // 2.5% is ₹250, below the ₹500 minimum
    assert.equal(r.gstOnFee, 90);
    assert.equal(r.interest, 370); // 45% a year for 30 days
    assert.equal(r.totalCost, 1026);
    assert.equal(r.rateSource, 'ASSUMED');
    assert.ok(r.assumptions.some((a) => a.includes('no interest-free period')));
  });

  it('uses the percentage fee on large amounts and the card rate when given', () => {
    const r = cashWithdrawalCost({ amount: 40000, days: 0, aprMonthlyPct: 3.5 });
    assert.deepEqual([r.fee, r.interest, r.rateSource], [1000, 0, 'CARD']);
  });
});

describe('rewardsOnSpend', () => {
  it('returns the safe rupee reward for the spend', () => {
    const cat = fixtureCatalog([online5]);
    assert.equal(rewardsOnSpend(cat, online5, 10000, { category: 'ONLINE_SHOPPING', online: true }), 500);
    assert.equal(rewardsOnSpend(cat, online5, 0), 0);
  });
});

// ── Fee-free finder and fee check ────────────────────────
describe('browseCards', () => {
  it('filters the real catalog with the config array', () => {
    const ltf = browseCards(realCatalog, { filterKeys: ['LIFETIME_FREE'] });
    assert.ok(ltf.length >= 50);
    assert.ok(ltf.every((r) => r.card.lifetimeFree || r.card.annualFee === 0));
    const rupayCheap = browseCards(realCatalog, { filterKeys: ['RUPAY', 'FEE_UPTO_500'] });
    assert.ok(rupayCheap.length > 0);
    assert.ok(rupayCheap.every((r) => r.card.network === 'RUPAY' && r.feeWithGst <= 590));
    assert.ok(CARD_FILTERS.every((f) => f.key && f.label && typeof f.test === 'function'));
  });

  it('sorts by fee without a profile and by yearly value with one', () => {
    const byFee = browseCards(realCatalog, { limit: 30 });
    for (let i = 1; i < byFee.length; i++) assert.ok(byFee[i].feeWithGst >= byFee[i - 1].feeWithGst);
    const byValue = browseCards(realCatalog, { filterKeys: ['ENTRY'], profile: profile(20000) });
    for (let i = 1; i < byValue.length; i++) assert.ok(byValue[i].yearlyValue! <= byValue[i - 1].yearlyValue!);
  });

  it('searches by name', () => {
    const r = browseCards(realCatalog, { query: 'sbi cashback' });
    assert.ok(r.some((x) => x.card.id === 'sbi-cashback'));
  });

  it('filters by multiple banks and networks with empty state safety', () => {
    const hdfcAndSbi = browseCards(realCatalog, { banks: ['HDFC', 'SBI'] });
    assert.ok(hdfcAndSbi.length > 0);
    assert.ok(hdfcAndSbi.every((r) => ['HDFC', 'SBI'].includes(r.card.issuer.toUpperCase())));
    const rupayOnly = browseCards(realCatalog, { networks: ['RUPAY'] });
    assert.ok(rupayOnly.length > 0);
    assert.ok(rupayOnly.every((r) => r.card.network === 'RUPAY'));
    const combo = browseCards(realCatalog, { banks: ['HDFC'], networks: ['RUPAY'] });
    assert.ok(combo.length > 0);
    assert.ok(combo.every((r) => r.card.issuer === 'HDFC' && r.card.network === 'RUPAY'));
  });
});

describe('feeCheck', () => {
  const cat = fixtureCatalog([feeCard, freeSameBank, base1]);

  it('sees a fee waived by spend', () => {
    const r = feeCheck(cat, [feeCard], 'fee1000', profile(10000))!;
    // ₹1,20,000 a year at 0.5% = ₹600; the ₹1,180 fee (with GST) is waived at ₹1,00,000.
    assert.equal(r.annualReward, 600);
    assert.equal(r.feeWithGst, 1180);
    assert.equal(r.feeCharged, 0);
    assert.equal(r.verdict, 'WAIVED');
  });

  it('says a fee is not worth it and suggests a waiver, a free card from the same bank, or closing', () => {
    const r = feeCheck(cat, [feeCard], 'fee1000', profile(5000))!;
    assert.equal(r.verdict, 'NOT_WORTH');
    assert.equal(r.spendToWaiver, 40000);
    assert.ok(r.advice.some((a) => a.includes('waive')));
    assert.ok(r.advice.some((a) => a.includes('free-same-bank')));
    assert.ok(r.advice.some((a) => a.includes('you can close')));
  });

  it('explains a card that gets none of the spend in a bigger wallet', () => {
    const r = feeCheck(cat, [base1, feeCard], 'fee1000', profile(5000))!;
    assert.equal(r.annualReward, 0);
    assert.ok(r.headline.includes('Your other cards earn more'));
  });

  it('knows lifetime-free cards and cards not in the wallet', () => {
    assert.equal(feeCheck(cat, [base1], 'base1', profile(5000))!.verdict, 'FREE');
    assert.equal(feeCheck(cat, [base1], 'fee1000', profile(5000)), null);
  });
});

// ── Goals and redemption check ───────────────────────────
describe('goalProgress', () => {
  const cat = fixtureCatalog([base1, online5]);

  it('values points at the safe route and estimates months from normal spend', () => {
    const r = goalProgress(cat, 10000, [{ cardId: 'base1', points: 5000 }], profile(10000));
    assert.equal(r.safeRs, 5000);
    assert.equal(r.progress, 0.5);
    assert.equal(r.shortfallRs, 5000);
    assert.equal(r.monthlyRewardRs, 100);
    assert.equal(r.monthsToGoal, 50);
  });

  it('is reached when points cover the target, and unknown without a profile', () => {
    assert.equal(goalProgress(cat, 1000, [{ cardId: 'base1', points: 5000 }]).monthsToGoal, 0);
    assert.equal(goalProgress(cat, 9000, [{ cardId: 'base1', points: 5000 }]).monthsToGoal, null);
  });

  it('does not combine unrelated card balances to claim a single goal is reached', () => {
    const r = goalProgress(cat, 10000, [{ cardId: 'base1', points: 5000 }, { cardId: 'online5', points: 5000 }]);
    assert.equal(r.safeRs, 5000);
    assert.equal(r.progress, 0.5);
  });
});

describe('checkRedemption', () => {
  const cat = fixtureCatalog([base1]);

  it('bands an offer against the card\'s own values, not fixed thresholds', () => {
    assert.equal(checkRedemption(cat, base1, 1000, 500).band, 'POOR');
    assert.equal(checkRedemption(cat, base1, 1000, 1000).band, 'FAIR');
    assert.equal(checkRedemption(cat, base1, 1000, 1200).band, 'GOOD');
    assert.equal(checkRedemption(cat, base1, 0, 1200).band, 'UNKNOWN');
  });

  it('subtracts redemption costs before computing net rupees per point', () => {
    const result = checkRedemption(cat, base1, 1000, 1000, 200);
    assert.equal(result.grossCashValueRs, 1000);
    assert.equal(result.costsRs, 200);
    assert.equal(result.netValueRs, 800);
    assert.equal(result.rupeesPerPoint, 0.8);
  });

  it('uses transfer values on a real points card', () => {
    const infinia = realCatalog.byId.get('hdfc-infinia')!;
    const safe = safeRupeesPerPoint(infinia);
    const best = bestRupeesPerPoint(realCatalog, infinia, 'SOME');
    assert.ok(best >= safe);
    assert.equal(checkRedemption(realCatalog, infinia, 10000, 10000 * safe * 0.5).band, 'POOR');
    assert.equal(checkRedemption(realCatalog, infinia, 10000, 10000 * Math.max(best, safe * 1.2)).band, 'GOOD');
  });
});

// ── Missed rewards ───────────────────────────────────────
describe('missedRewards', () => {
  const cat = fixtureCatalog([base1, online5]);

  it('shows how much more the best wallet card would have earned', () => {
    const r = missedRewards(
      cat,
      [base1, online5],
      [
        { amount: 10000, category: 'ONLINE_SHOPPING', usedCardId: 'base1' },
        { amount: 2000, category: 'ONLINE_SHOPPING', usedCardId: 'online5' },
        { amount: 0, category: 'DINING', usedCardId: 'base1' },
      ],
      { today: TODAY },
    );
    assert.equal(r.rows.length, 2);
    assert.deepEqual([r.rows[0].earned, r.rows[0].bestEarned, r.rows[0].missed, r.rows[0].bestCard?.id], [100, 500, 400, 'online5']);
    assert.equal(r.rows[1].missed, 0);
    assert.equal(r.totalMissed, 400);
  });

  it('uses the merchant, so shop-only rates count', () => {
    const swiggy = card({
      id: 'swiggy10',
      rewards: [row({ category: 'DEFAULT', ratePct: 1 }), row({ category: 'DINING', ratePct: 10, merchants: ['swiggy'], merchantsText: 'Swiggy' })],
    });
    const cat2 = fixtureCatalog([base1, swiggy]);
    const at = missedRewards(cat2, [base1, swiggy], [{ amount: 1000, category: 'DINING', online: true, merchant: 'Swiggy', usedCardId: 'base1' }], { today: TODAY });
    assert.deepEqual([at.rows[0].bestCard?.id, at.totalMissed], ['swiggy10', 90]);
  });
});

