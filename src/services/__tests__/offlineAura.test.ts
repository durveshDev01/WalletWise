/// <reference types="node" />
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { catalog } from '../../data/catalog';
import { pointsValue, rankCardsForPurchase, walletAlerts } from '../../engine';
import { answerOffline, DEFAULT_AMOUNT, groupIndian, inr, matchOfflineIntent, offlineUnavailableText, parseAmount, UPDATES_WINDOW_DAYS } from '../offlineAura';

const TODAY = '2026-10-20';
const HOLDINGS = [
  { catalogId: 'hdfc-infinia', points: 24000 },
  { catalogId: 'sbi-bpcl-octane', points: 4200 },
  { catalogId: 'hdfc-swiggy', points: 0 },
];
const ctx = (extra: Partial<Parameters<typeof answerOffline>[1]> = {}) => ({ catalog, holdings: HOLDINGS, today: TODAY, ...extra });
const cards = () => HOLDINGS.map((h) => catalog.byId.get(h.catalogId)!);

describe('offline Aura: amounts', () => {
  it('reads rupee amounts in common forms', () => {
    assert.equal(parseAmount('Which card for ₹1,500 at Swiggy?'), 1500);
    assert.equal(parseAmount('Rs 2k on Amazon'), 2000);
    assert.equal(parseAmount('1.5 lakh flight'), 150000);
    assert.equal(parseAmount('1500rs petrol'), 1500);
    assert.equal(parseAmount('Swiggy पर 500 रुपये'), 500);
    assert.equal(parseAmount('१५०० का पेट्रोल'), 1500);
    assert.equal(parseAmount('2 हज़ार का राशन'), 2000);
    assert.equal(parseAmount('my 4 cards'), null);
  });

  it('groups digits the Indian way', () => {
    assert.equal(groupIndian(150000), '1,50,000');
    assert.equal(groupIndian(1500), '1,500');
    assert.equal(groupIndian(999), '999');
    assert.equal(inr(22.5), '₹22.50');
    assert.equal(inr(1234567), '₹12,34,567');
  });
});

describe('offline Aura: intents', () => {
  it('matches the Aura suggestion chips', () => {
    assert.deepEqual(matchOfflineIntent('Which card for ₹1,500 at Swiggy?'), {
      kind: 'best_card', amount: 1500, amountAssumed: false, category: 'DINING', merchant: 'Swiggy', online: true, upi: false,
    });
    assert.equal(matchOfflineIntent('Any changes to my cards?')?.kind, 'card_updates');
    assert.equal(matchOfflineIntent('How should I use my points?')?.kind, 'points_value');
    assert.equal(matchOfflineIntent('What cards do I have?')!.kind, 'my_cards');
    assert.equal(matchOfflineIntent('Show my cards')!.kind, 'my_cards');
    assert.equal(matchOfflineIntent('Tell me about Diners Black International'), null);
  });

  it('matches Hindi and Hinglish questions', () => {
    const fuel = matchOfflineIntent('₹2,000 के पेट्रोल के लिए कौन सा कार्ड?');
    assert.equal(fuel?.kind, 'best_card');
    assert.equal(fuel?.kind === 'best_card' && fuel.category, 'FUEL');
    assert.equal(matchOfflineIntent('kaun sa card grocery ke liye')?.kind, 'best_card');
    assert.equal(matchOfflineIntent('मेरे पॉइंट्स की कीमत क्या है?')?.kind, 'points_value');
    assert.equal(matchOfflineIntent('मेरे कार्ड में कोई बदलाव?')?.kind, 'card_updates');
    assert.equal(matchOfflineIntent('मेरे कार्ड्स दिखा')?.kind, 'my_cards');
  });

  it('assumes an amount only when none is given, and says so', () => {
    const i = matchOfflineIntent('Which card for dining?');
    assert.ok(i?.kind === 'best_card' && i.amountAssumed && i.amount === DEFAULT_AMOUNT);
    const text = answerOffline('Which card for dining?', ctx())!.text;
    assert.match(text, /Amount assumed: ₹1,000/);
  });

  it('flags UPI payments', () => {
    const i = matchOfflineIntent('₹300 at kirana on UPI, which card?');
    assert.ok(i?.kind === 'best_card' && i.upi);
  });
});

describe('offline Aura: answers', () => {
  it('names the engine\'s best card with its rupee value', () => {
    const top = rankCardsForPurchase(catalog, cards(), { amount: 1500, category: 'DINING', merchant: 'Swiggy', online: true, channel: 'CARD' }, { today: TODAY })[0];
    const a = answerOffline('Which card for ₹1,500 at Swiggy?', ctx())!;
    assert.equal(a.intent, 'best_card');
    assert.match(a.text, /^Offline answer/);
    assert.ok(a.text.includes(top.card.name), a.text);
    assert.ok(a.text.includes(inr(top.safeValue)), a.text);
  });

  it('answers in Hindi with English card names and digit ₹ figures', () => {
    const top = rankCardsForPurchase(catalog, cards(), { amount: 1500, category: 'DINING', merchant: 'Swiggy', online: true, channel: 'CARD' }, { today: TODAY })[0];
    const a = answerOffline('Swiggy पर ₹1,500 के लिए कौन सा कार्ड?', ctx({ language: 'hi' }))!;
    assert.match(a.text, /^ऑफ़लाइन जवाब/);
    assert.ok(a.text.includes(top.card.name));
    assert.ok(a.text.includes('₹1,500'));
    assert.ok(a.text.includes(inr(top.safeValue)));
  });

  it('keeps simple answers to one line with one number and no transfer detail', () => {
    const a = answerOffline('How much are my points worth?', ctx({ simple: true }))!;
    assert.equal(a.text.split('\n').length, 1);
    assert.doesNotMatch(a.text, /^- /m);
    const low = HOLDINGS.reduce((s, h) => s + (h.points > 0 ? pointsValue(catalog, catalog.byId.get(h.catalogId)!, h.points).low : 0), 0);
    assert.ok(a.text.includes(inr(low)), a.text);
  });

  it('summarizes INR equivalents without adding unrelated point balances', () => {
    const a = answerOffline('What are my points worth?', ctx())!;
    const values = HOLDINGS.filter((h) => h.points > 0).map((h) => pointsValue(catalog, catalog.byId.get(h.catalogId)!, h.points));
    assert.ok(a.text.includes(inr(values.reduce((s, v) => s + v.low, 0))), a.text);
    assert.ok(a.text.includes('not interchangeable or pooled'), a.text);
    assert.doesNotMatch(a.text, /28,200 points/);
    assert.ok(a.text.includes('24,000 points'), a.text);
    assert.ok(a.text.includes('4,200 points'), a.text);
  });

  it('lists upcoming card changes from walletAlerts', () => {
    const alerts = walletAlerts(catalog, cards().map((c) => c.id), TODAY, UPDATES_WINDOW_DAYS);
    const a = answerOffline('Any changes to my cards?', ctx())!;
    assert.equal(a.intent, 'card_updates');
    if (alerts.length > 0) assert.ok(a.text.includes(alerts[0].change.title), a.text);
    else assert.match(a.text, /No announced changes/);
  });

  it('includes wallet card context in best card recommendations', () => {
    const a = answerOffline('Which card for dining?', ctx())!;
    assert.equal(a.intent, 'best_card');
    assert.match(a.text, /From your 3 wallet cards/);
    assert.ok(a.text.includes('Infinia'));
  });

  it('lists cards and reward points in wallet for my_cards query', () => {
    const a = answerOffline('What cards do I have?', ctx())!;
    assert.equal(a.intent, 'my_cards');
    assert.match(a.text, /You have 3 cards saved in your wallet/);
    assert.ok(a.text.includes('Infinia'));
    assert.ok(a.text.includes('BPCL SBI Card Octane'));
    assert.ok(a.text.includes('24,000 points'));
  });

  it('says when the wallet is empty', () => {
    assert.match(answerOffline('What are my points worth?', ctx({ holdings: [] }))!.text, /not added any cards/);
  });

  it('returns null for questions that need the server, with a helpful message', () => {
    assert.equal(answerOffline('Compare Axis Atlas and Magnus', ctx()), null);
    assert.match(offlineUnavailableText('en'), /without internet/i);
    assert.match(offlineUnavailableText('hi'), /इंटरनेट/);
  });
});
