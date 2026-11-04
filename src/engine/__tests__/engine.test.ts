/// <reference types="node" />
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  buildCatalog,
  checkEligibility,
  devaluationRisk,
  planRedemption,
  planTripPayment,
  pointsValue,
  rankCardsForPurchase,
  skyscannerUrl,
  recommendCards,
  recordPurchase,
  redemptionRoutes,
  scorePurchase,
  topCardsForCategory,
  walletAlerts,
  walletValue,
} from '../index';
import type { Card, Catalog, RawData, RewardRow, UserProfile } from '../index';

const TODAY = '2026-10-19';

// ── Fixtures ──────────────────────────────────────────
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

const onlineCard = card({
  id: 'online5',
  rewards: [row({ category: 'DEFAULT', ratePct: 1 }), row({ category: 'ONLINE_SHOPPING', ratePct: 5, capRs: 1000 })],
});
const amazonCard = card({
  id: 'amazon5',
  rewards: [
    row({ category: 'DEFAULT', ratePct: 1 }),
    row({ category: 'ONLINE_SHOPPING', ratePct: 5, merchants: ['amazon'], merchantsText: 'Amazon' }),
  ],
});
const rupayCard = card({ id: 'rupay', network: 'RUPAY', rewards: [row({ category: 'DEFAULT', ratePct: 1.5 })] });
const portalCard = card({
  id: 'portal',
  rewards: [
    row({ category: 'DEFAULT', ratePct: 2 }),
    row({ category: 'TRAVEL', ratePct: 10, merchants: ['smartbuy'], merchantsText: 'Bank SmartBuy', portal: true }),
  ],
});

// ── Module A: purchase scoring ────────────────────────
describe('scorePurchase', () => {
  const cat = fixtureCatalog([onlineCard, amazonCard, rupayCard, portalCard]);

  it('applies the monthly reward cap and spills the rest to the base rate', () => {
    const r = scorePurchase(cat, onlineCard, { amount: 30000, category: 'ONLINE_SHOPPING', online: true }, { today: TODAY })!;
    // ₹20,000 at 5% hits the ₹1,000 cap; ₹10,000 at 1% = ₹100.
    assert.equal(r.safeValue, 1100);
    assert.ok(r.warnings.some((w) => w.includes('monthly cap')));
  });

  it('respects caps already used this month', () => {
    const first = scorePurchase(cat, onlineCard, { amount: 10000, category: 'ONLINE_SHOPPING', online: true }, { today: TODAY })!;
    assert.equal(first.safeValue, 500);
    const usage = recordPurchase({}, first);
    const second = scorePurchase(cat, onlineCard, { amount: 20000, category: 'ONLINE_SHOPPING', online: true }, { usage, today: TODAY })!;
    // ₹500 cap left = ₹10,000 at 5%, then ₹10,000 at 1%.
    assert.equal(second.safeValue, 600);
  });

  it('uses merchant rows only for matching merchants', () => {
    const atAmazon = scorePurchase(cat, amazonCard, { amount: 1000, category: 'ONLINE_SHOPPING', online: true, merchant: 'Amazon.in' }, { today: TODAY })!;
    const elsewhere = scorePurchase(cat, amazonCard, { amount: 1000, category: 'ONLINE_SHOPPING', online: true, merchant: 'Myntra' }, { today: TODAY })!;
    assert.equal(atAmazon.safeValue, 50);
    assert.equal(elsewhere.safeValue, 10);
  });

  it('does not count base rewards in categories cards often exclude', () => {
    const r = scorePurchase(cat, onlineCard, { amount: 2000, category: 'FUEL' }, { today: TODAY })!;
    assert.equal(r.safeValue, 0);
    assert.equal(r.confidence, 'LOW');
  });

  it('only allows RuPay cards on UPI, and treats small UPI payments as unrewarded', () => {
    assert.equal(scorePurchase(cat, onlineCard, { amount: 500, category: 'DEFAULT', channel: 'UPI' }, { today: TODAY }), null);
    const small = scorePurchase(cat, rupayCard, { amount: 500, category: 'DEFAULT', channel: 'UPI' }, { today: TODAY })!;
    assert.equal(small.safeValue, 0);
    const large = scorePurchase(cat, rupayCard, { amount: 4000, category: 'DEFAULT', channel: 'UPI' }, { today: TODAY })!;
    assert.equal(large.safeValue, 60);
  });

  it('subtracts forex markup with GST on international spends', () => {
    const r = scorePurchase(cat, rupayCard, { amount: 10000, category: 'DEFAULT', international: true }, { today: TODAY })!;
    // 1.5% = 150 back; 3.5% x 1.18 = 413 cost.
    assert.equal(r.safeValue, 150);
    assert.equal(r.forexCost, 413);
    assert.equal(r.netValue, -263);
  });

  it('uses portal rates only when the user opts in', () => {
    const plain = scorePurchase(cat, portalCard, { amount: 10000, category: 'TRAVEL' }, { today: TODAY })!;
    const viaPortal = scorePurchase(cat, portalCard, { amount: 10000, category: 'TRAVEL', allowPortal: true }, { today: TODAY })!;
    assert.equal(plain.safeValue, 200);
    assert.equal(viaPortal.safeValue, 1000);
    assert.ok(viaPortal.usesPortal);
  });

  it('ranks the best card first', () => {
    const ranked = rankCardsForPurchase(cat, [rupayCard, amazonCard, onlineCard], { amount: 1000, category: 'ONLINE_SHOPPING', online: true, merchant: 'Amazon' }, { today: TODAY });
    assert.ok(['amazon5', 'online5'].includes(ranked[0].card.id));
    assert.equal(ranked.at(-1)!.card.id, 'rupay');
  });
});

// ── Module B: wallet value and recommendations ────────
describe('walletValue', () => {
  // Worked example from research/algorithm-spec.md §11.
  const cardA = card({
    id: 'A',
    annualFee: 500,
    lifetimeFree: false,
    feeWaiverSpend: 120000,
    rewards: [row({ category: 'DEFAULT', ratePct: 1 }), row({ category: 'ONLINE_SHOPPING', ratePct: 5, capRs: 625 })],
  });
  const cardB = card({
    id: 'B',
    rewards: [row({ category: 'DEFAULT', ratePct: 1 }), row({ category: 'DINING', ratePct: 4, capRs: 200 }), row({ category: 'GROCERY', ratePct: 4, capRs: 200 })],
  });
  const cat = fixtureCatalog([cardA, cardB]);
  const profile: UserProfile = {
    monthlySpend: { ONLINE_SHOPPING: 6000, DINING: 4000, GROCERY: 3000, DEFAULT: 7000 },
    repayment: 'ALWAYS_FULL',
    experience: 'NEW',
  };

  it('values a single card with fee waiver', () => {
    const v = walletValue(cat, [cardA], profile);
    // Online 6,000 x 5% = 300; other 14,000 x 1% = 140; 440 x 12 = 5,280. Fee waived (₹2.4L spend).
    assert.equal(v.annualReward, 5280);
    assert.equal(v.annualFees, 0);
  });

  it('splits spend across two cards by best rate', () => {
    const v = walletValue(cat, [cardA, cardB], profile);
    // A: online 300. B: dining 4,000 x 4% = 160, grocery 3,000 x 4% = 120. Other 7,000 x 1% = 70.
    assert.equal(v.annualReward, (300 + 160 + 120 + 70) * 12);
  });

  it('charges the fee with GST when spend is below the waiver', () => {
    const low: UserProfile = { ...profile, monthlySpend: { ONLINE_SHOPPING: 2000 } };
    const v = walletValue(cat, [cardA], low);
    assert.equal(v.annualFees, 590);
  });
});

describe('recommendCards', () => {
  const premium = card({ id: 'premium', annualFee: 5000, lifetimeFree: false, rewards: [row({ category: 'DEFAULT', ratePct: 3 })] });
  const free = card({ id: 'free', rewards: [row({ category: 'DEFAULT', ratePct: 1.5 })] });
  const cat = fixtureCatalog([premium, free]);

  it('says no card when the gain is too small', () => {
    const advice = recommendCards(cat, { monthlySpend: { DEFAULT: 1000 }, repayment: 'ALWAYS_FULL', experience: 'NEW' }, { today: TODAY });
    assert.equal(advice.verdict, 'NONE');
  });

  it('restricts users who do not pay in full to low-fee cards and warns them', () => {
    const advice = recommendCards(cat, { monthlySpend: { DEFAULT: 60000 }, repayment: 'SOMETIMES_MINIMUM', experience: 'NEW' }, { today: TODAY });
    assert.ok(advice.picks.every((p) => p.card.id === 'free'));
    assert.ok(advice.warnings.some((w) => w.includes('interest')));
  });

  it('picks the premium card for a high spender who pays in full', () => {
    const advice = recommendCards(cat, { monthlySpend: { DEFAULT: 60000 }, repayment: 'ALWAYS_FULL', experience: 'NEW' }, { maxNew: 1, today: TODAY });
    assert.equal(advice.verdict, 'ADD_CARDS');
    assert.equal(advice.picks[0].card.id, 'premium');
  });

  it('checks stated income minimums', () => {
    const c = card({ id: 'x', minMonthlyIncome: 50000, rewards: [] });
    assert.equal(checkEligibility(c, { monthlySpend: {}, repayment: 'ALWAYS_FULL', experience: 'NEW', monthlyIncome: 40000 }).eligible, false);
    assert.equal(checkEligibility(c, { monthlySpend: {}, repayment: 'ALWAYS_FULL', experience: 'NEW', monthlyIncome: 55000 }).confidence, 'LOW');
  });
});

// ── Real data (CardAdvisor bundle) ────────────────────
describe('real data', () => {
  const dir = join(import.meta.dirname, '..', '..', 'data', 'generated');
  const load = (f: string) => JSON.parse(readFileSync(join(dir, f), 'utf8'));
  const raw: RawData = { cards: load('cards.json'), transfers: load('transfers.json'), changes: load('changes.json'), meta: load('meta.json') };
  const cat = buildCatalog(raw);
  const get = (id: string) => cat.byId.get(id)!;

  it('loads all cards', () => {
    assert.ok(cat.cards.length >= 250);
  });

  it('SBI BPCL Octane earns 6.25% on BPCL fuel', () => {
    const r = scorePurchase(cat, get('sbi-bpcl-octane'), { amount: 2000, category: 'FUEL', merchant: 'BPCL' }, { today: TODAY })!;
    assert.equal(r.safeValue, 125);
  });

  it('HDFC Infinia earns its base 3.3% on dining', () => {
    const r = scorePurchase(cat, get('hdfc-infinia'), { amount: 5000, category: 'DINING' }, { today: TODAY })!;
    assert.equal(r.safeValue, 165);
  });

  it('SBI Cashback caps online cashback at ₹2,000 a month', () => {
    const r = scorePurchase(cat, get('sbi-cashback'), { amount: 60000, category: 'ONLINE_SHOPPING', online: true }, { today: TODAY })!;
    // ₹40,000 at 5% = ₹2,000 cap, then ₹20,000 at 1% = ₹200.
    assert.equal(r.safeValue, 2200);
  });

  it('Swiggy card gives 10% only on Swiggy', () => {
    const swiggy = scorePurchase(cat, get('hdfc-swiggy'), { amount: 1000, category: 'DINING', merchant: 'Swiggy', online: true }, { today: TODAY })!;
    const restaurant = scorePurchase(cat, get('hdfc-swiggy'), { amount: 1000, category: 'DINING', merchant: 'Local Dhaba' }, { today: TODAY })!;
    assert.equal(swiggy.safeValue, 100);
    assert.equal(restaurant.safeValue, 10);
  });

  it('finds transfer routes and keeps the safe route available', () => {
    const routes = redemptionRoutes(cat, get('hdfc-infinia'));
    assert.ok(routes.some((r) => r.kind === 'CASH'));
    assert.ok(routes.some((r) => r.partnerId === 'ACCOR_ALL'));
    const value = pointsValue(cat, get('hdfc-infinia'), 10000);
    assert.ok(value.high >= value.low && value.low > 0);
  });

  it('recommends the default route to beginners', () => {
    const plan = planRedemption(cat, get('hdfc-infinia'), 10000, { experience: 'NEW' });
    assert.equal(plan.recommended.kind, 'CASH');
  });

  it('keeps devaluation risk between 0 and 0.3', () => {
    for (const c of cat.cards) {
      const { risk } = devaluationRisk(cat, c.id, TODAY);
      assert.ok(risk >= 0 && risk <= 0.3, c.id);
    }
  });

  it('never values more spend below less spend (monotonic)', () => {
    const categories = ['DINING', 'GROCERY', 'ONLINE_SHOPPING', 'TRAVEL', 'DEFAULT'] as const;
    for (const c of cat.cards.slice(0, 120)) {
      for (const category of categories) {
        const p = { category, online: category === 'ONLINE_SHOPPING' };
        const a = scorePurchase(cat, c, { ...p, amount: 1000 }, { today: TODAY })!;
        const b = scorePurchase(cat, c, { ...p, amount: 5000 }, { today: TODAY })!;
        assert.ok(b.safeValue >= a.safeValue, `${c.id} ${category}`);
      }
    }
  });

  it('never returns negative rewards', () => {
    for (const c of cat.cards) {
      const r = scorePurchase(cat, c, { amount: 3000, category: 'DEFAULT' }, { today: TODAY })!;
      assert.ok(r.safeValue >= 0 && r.bestValue >= r.safeValue, c.id);
    }
  });

  it('builds a sensible first-card recommendation for a salaried beginner', () => {
    const advice = recommendCards(
      cat,
      {
        monthlySpend: { ONLINE_SHOPPING: 8000, DINING: 4000, GROCERY: 5000, UTILITY_BILLS: 3000, FUEL: 2000, DEFAULT: 6000 },
        monthlyIncome: 60000,
        repayment: 'ALWAYS_FULL',
        experience: 'NEW',
      },
      { maxNew: 2, candidateLimit: 12, today: TODAY },
    );
    assert.equal(advice.verdict, 'ADD_CARDS');
    for (const p of advice.picks) {
      assert.ok(p.eligibility.eligible);
      assert.ok(p.card.minMonthlyIncome == null || p.card.minMonthlyIncome <= 60000);
    }
    assert.ok(advice.after.net > advice.current.net);
  });

  it('reports points earned in the card currency', () => {
    const r = scorePurchase(cat, get('sbi-bpcl-octane'), { amount: 2000, category: 'FUEL', merchant: 'BPCL' }, { today: TODAY })!;
    // ₹125 at 25 paise a point = 500 points.
    assert.equal(r.pointsEarned, 500);
    assert.equal(r.rewardUnit, 'POINTS');
  });

  it('keeps flight reward currencies separate and excludes cashback cards', () => {
    const plan = planTripPayment(
      cat,
      [
        { card: get('hdfc-infinia'), points: 5000 },
        { card: get('sbi-cashback'), points: 100000 },
      ],
      8000,
      { experience: 'NEW', monthlyRewardRs: 1000, today: TODAY },
    );
    assert.ok(plan.pointsOptions.length > 0);
    assert.ok(plan.pointsOptions.every((option) => option.cardId === 'hdfc-infinia'));
    assert.ok(plan.pointsOptions.every((option) => option.estimated));
    assert.ok(plan.notes.some((note) => note.includes('not live award prices')));
    assert.ok(plan.payCash);
  });

  it('builds a Skyscanner search link', () => {
    assert.equal(
      skyscannerUrl('PNQ', 'GOI', '2026-12-05'),
      'https://www.skyscanner.co.in/transport/flights/pnq/goi/261205/?adultsv2=1&cabinclass=economy',
    );
  });

  it('ranks top cards for a category', () => {
    const top = topCardsForCategory(cat, 'TRAVEL', { limit: 10 });
    assert.equal(top.length, 10);
    for (let i = 1; i < top.length; i++) assert.ok(top[i - 1].value.net >= top[i].value.net);
  });

  it('raises alerts for upcoming changes on owned cards', () => {
    const ids = cat.cards.map((c) => c.id);
    const alerts = walletAlerts(cat, ids, TODAY, 60);
    assert.ok(alerts.every((a) => a.daysAway >= 0 && a.daysAway <= 60));
  });
});
