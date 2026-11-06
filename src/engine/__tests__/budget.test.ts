/// <reference types="node" />
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { currentMonth, monthSummary, spendsInMonth, spendTrends } from '../budget';
import type { Spend } from '../budget';
import { buildCatalog } from '../catalog';
import type { Card, RewardRow } from '../types';

const TODAY = '2026-10-19';

function row(partial: Partial<RewardRow> & Pick<RewardRow, 'category' | 'ratePct'>): RewardRow {
  return { type: 'CASHBACK', capRs: null, pointPaisa: 100, merchantsText: null, merchants: null, portal: false, ...partial };
}

function card(partial: Partial<Card> & Pick<Card, 'id' | 'rewards'>): Card {
  return {
    name: partial.id, issuer: 'TEST', issuerType: 'COMMERCIAL', network: 'VISA', tier: 'MID',
    annualFee: 0, joiningFee: 0, lifetimeFree: true, feeWaiverSpend: null, forexPct: 3.5, aprMonthlyPct: 3.75,
    minMonthlyIncome: null, minAge: null, maxAge: null, rateMinPct: null, rateMaxPct: null, lastChanged: TODAY,
    url: '', programme: null, perks: [], lounge: null, ...partial,
  };
}

// 5% on online shopping up to ₹100 back a month, 1% on everything else.
const online = card({
  id: 'online5',
  rewards: [row({ category: 'DEFAULT', ratePct: 1 }), row({ category: 'ONLINE_SHOPPING', ratePct: 5, capRs: 100 })],
});
const flat = card({ id: 'flat2', rewards: [row({ category: 'DEFAULT', ratePct: 2 })] });

const catalog = buildCatalog({
  cards: [online, flat],
  transfers: { nodes: [], edges: [] },
  changes: [],
  meta: { generatedAt: TODAY, source: 'test', license: 'test', attribution: 'test', asOf: {} },
});

const holdings = [
  { id: 'h1', catalogId: 'online5', label: 'Online 5' },
  { id: 'h2', catalogId: 'flat2', label: 'Flat 2' },
];

let n = 0;
const spend = (partial: Omit<Spend, 'id'>): Spend => ({ id: `s${n++}`, ...partial });

describe('spendsInMonth', () => {
  it('keeps one month, oldest first', () => {
    const list = [
      spend({ amount: 1, category: 'DINING', cardId: 'h1', date: '2026-10-09' }),
      spend({ amount: 2, category: 'DINING', cardId: 'h1', date: '2026-09-30' }),
      spend({ amount: 3, category: 'DINING', cardId: 'h1', date: '2026-10-02' }),
    ];
    assert.deepEqual(spendsInMonth(list, '2026-10').map((s) => s.amount), [3, 1]);
  });

  it('formats the current month', () => {
    assert.equal(currentMonth(new Date(2026, 0, 5)), '2026-01');
  });
});

describe('monthSummary', () => {
  it('totals by category against the monthly budget', () => {
    const list = [
      spend({ amount: 1000, category: 'DINING', cardId: 'h2', date: '2026-10-01' }),
      spend({ amount: 500, category: 'DINING', cardId: 'h2', date: '2026-10-03' }),
      spend({ amount: 700, category: 'GROCERY', cardId: 'h2', date: '2026-10-04' }),
      spend({ amount: 9999, category: 'GROCERY', cardId: 'h2', date: '2026-09-04' }),
    ];
    const s = monthSummary(catalog, list, holdings, { DINING: 4000, GROCERY: 5000, FUEL: 2000 }, '2026-10');
    assert.equal(s.total, 2200);
    assert.equal(s.budgetTotal, 11000);
    assert.deepEqual(
      s.categories.map((c) => [c.category, c.spent, c.budget]),
      [['DINING', 1500, 4000], ['GROCERY', 700, 5000], ['FUEL', 0, 2000]],
    );
  });

  it('includes categories with spend but no budget', () => {
    const list = [spend({ amount: 300, category: 'RENT', cardId: 'h2', date: '2026-10-01' })];
    const s = monthSummary(catalog, list, holdings, {}, '2026-10');
    assert.deepEqual(s.categories.map((c) => [c.category, c.spent, c.budget]), [['RENT', 300, 0]]);
  });

  it('adds up rewards per card with the purchase engine', () => {
    const list = [
      spend({ amount: 1000, category: 'DINING', cardId: 'h2', date: '2026-10-01' }),
      spend({ amount: 500, category: 'GROCERY', cardId: 'h2', date: '2026-10-02' }),
    ];
    const s = monthSummary(catalog, list, holdings, {}, '2026-10');
    assert.equal(s.cards.length, 1);
    assert.equal(s.cards[0].holdingId, 'h2');
    assert.equal(s.cards[0].spent, 1500);
    assert.equal(s.cards[0].rewardsRs, 30);
  });

  it('fills the monthly cap across spends and then falls back to the base rate', () => {
    const list = [
      // ₹1,500 at 5% = ₹75 of the ₹100 cap.
      spend({ amount: 1500, category: 'ONLINE_SHOPPING', cardId: 'h1', date: '2026-10-01' }),
      // ₹1,000 more: ₹500 fills the last ₹25 of cap, ₹500 earns 1% = ₹5.
      spend({ amount: 1000, category: 'ONLINE_SHOPPING', cardId: 'h1', date: '2026-10-05' }),
    ];
    const s = monthSummary(catalog, list, holdings, {}, '2026-10');
    assert.equal(s.cards[0].rewardsRs, 105);
    assert.equal(s.caps.length, 1);
    assert.deepEqual(
      { label: s.caps[0].label, used: s.caps[0].usedRs, cap: s.caps[0].capRs, row: s.caps[0].rowIndex },
      { label: 'Online shopping', used: 100, cap: 100, row: 1 },
    );
  });

  it('applies the cap in date order, whatever order spends were logged', () => {
    const later = spend({ amount: 1000, category: 'ONLINE_SHOPPING', cardId: 'h1', date: '2026-10-05' });
    const earlier = spend({ amount: 1500, category: 'ONLINE_SHOPPING', cardId: 'h1', date: '2026-10-01' });
    const s = monthSummary(catalog, [later, earlier], holdings, {}, '2026-10');
    assert.equal(s.cards[0].rewardsRs, 105);
  });

  it('starts caps fresh each month', () => {
    const list = [
      spend({ amount: 3000, category: 'ONLINE_SHOPPING', cardId: 'h1', date: '2026-09-20' }),
      spend({ amount: 1000, category: 'ONLINE_SHOPPING', cardId: 'h1', date: '2026-10-01' }),
    ];
    const s = monthSummary(catalog, list, holdings, {}, '2026-10');
    assert.equal(s.caps[0].usedRs, 50);
  });

  it('counts spends on removed cards in totals only', () => {
    const list = [
      spend({ amount: 400, category: 'DINING', cardId: 'gone', date: '2026-10-01' }),
      spend({ amount: 100, category: 'DINING', cardId: 'h2', date: '2026-10-01' }),
    ];
    const s = monthSummary(catalog, list, holdings, {}, '2026-10');
    assert.equal(s.total, 500);
    assert.equal(s.unknownCardSpend, 400);
    assert.equal(s.cards[0].spent, 100);
  });

  it('is empty for a month with no spends', () => {
    const s = monthSummary(catalog, [], holdings, { DINING: 100 }, '2026-10');
    assert.equal(s.total, 0);
    assert.deepEqual(s.cards, []);
    assert.deepEqual(s.caps, []);
  });

  it('counts non-credit payment modes in spending totals but never awards card rewards', () => {
    const list = [spend({ amount: 250, category: 'DINING', cardId: '', date: '2026-10-07', paymentMode: 'UPI' })];
    const summary = monthSummary(catalog, list, holdings, {}, '2026-10');
    assert.equal(summary.total, 250);
    assert.equal(summary.unknownCardSpend, 250);
    assert.equal(summary.cards.length, 0);
  });
});

describe('spendTrends', () => {
  it('computes average monthly spend and identifies top category', () => {
    const list = [
      spend({ amount: 10000, category: 'GROCERY', cardId: 'h1', date: '2026-09-10' }),
      spend({ amount: 5000, category: 'DINING', cardId: 'h1', date: '2026-09-15' }),
      spend({ amount: 12000, category: 'GROCERY', cardId: 'h1', date: '2026-10-05' }),
      spend({ amount: 3000, category: 'ONLINE_SHOPPING', cardId: 'h2', date: '2026-10-12' }),
    ];
    const trends = spendTrends(list, '2026-10');
    assert.ok(trends !== null);
    assert.equal(trends.monthsSampled, 2);
    assert.equal(trends.averageMonthlySpend, 15000);
    assert.equal(trends.topCategory?.category, 'GROCERY');
    assert.equal(trends.momChangePct, 0);
    assert.ok(trends.assumptions.length >= 2);
  });

  it('returns null when there are no logged spends', () => {
    assert.equal(spendTrends([], '2026-10'), null);
  });

  it('returns null when there is only one month of spend history', () => {
    const list = [
      spend({ amount: 10000, category: 'GROCERY', cardId: 'h1', date: '2026-10-10' }),
    ];
    assert.equal(spendTrends(list, '2026-10'), null);
  });
});
