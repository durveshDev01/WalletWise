/**
 * Offline Aura: answers a few common questions on the phone when the Aura server
 * cannot be reached. Pure TypeScript (no React Native), so it is unit tested.
 * Every rupee figure comes from the engine; the text only frames it.
 *
 * Handles: best card for a spend (rankCardsForPurchase), what my points are worth
 * (pointsValue), and my card updates (walletAlerts / cardChanges). English and Hindi.
 */
import { cardChanges, pointsValue, rankCardsForPurchase, todayIso, walletAlerts } from '../engine';
import type { Card, Catalog, Category, Experience, PurchaseResult } from '../engine';

export type OfflineLanguage = 'en' | 'hi';

export type OfflineIntent =
  | {
      kind: 'best_card';
      amount: number;
      /** True when the question had no amount and DEFAULT_AMOUNT was used. */
      amountAssumed: boolean;
      category: Category;
      merchant?: string;
      online: boolean;
      upi: boolean;
    }
  | { kind: 'points_value' }
  | { kind: 'card_updates' }
  | { kind: 'my_cards' };

export type OfflineContext = {
  catalog: Catalog;
  holdings: { catalogId: string; points: number }[];
  language?: OfflineLanguage;
  simple?: boolean;
  experience?: Experience;
  today?: string;
};

export type OfflineAnswer = { intent: OfflineIntent['kind']; text: string };

/** Spend used when a "which card" question names no amount. Shown to the user as an assumption. */
export const DEFAULT_AMOUNT = 1000;
/** Days ahead that count as an upcoming card change. */
export const UPDATES_WINDOW_DAYS = 90;

// ── Intent matching ─────────────────────────────────

type CategoryRule = { pattern: RegExp; category: Category; merchant?: string; online?: boolean };

// Specific merchants first, then general words. Hindi and Hinglish words included.
const CATEGORY_RULES: CategoryRule[] = [
  { pattern: /swiggy|स्विगी/i, category: 'DINING', merchant: 'Swiggy', online: true },
  { pattern: /zomato|ज़ोमैटो|जोमैटो/i, category: 'DINING', merchant: 'Zomato', online: true },
  { pattern: /amazon|अमेज़न|अमेजन/i, category: 'ONLINE_SHOPPING', merchant: 'Amazon', online: true },
  { pattern: /flipkart|फ्लिपकार्ट/i, category: 'ONLINE_SHOPPING', merchant: 'Flipkart', online: true },
  { pattern: /myntra|मिंत्रा/i, category: 'ONLINE_SHOPPING', merchant: 'Myntra', online: true },
  { pattern: /blinkit|zepto|bigbasket|instamart/i, category: 'GROCERY', online: true },
  { pattern: /dmart|d-mart|डीमार्ट/i, category: 'GROCERY', merchant: 'DMart' },
  { pattern: /\b(bpcl|hpcl|iocl)\b|indian oil/i, category: 'FUEL' },
  { pattern: /makemytrip|goibibo|irctc|cleartrip/i, category: 'TRAVEL', online: true },
  { pattern: /netflix|hotstar|prime video|spotify|\bott\b|subscription|सब्सक्रिप्शन/i, category: 'OTT_SUBSCRIPTIONS', online: true },
  { pattern: /abroad|international|forex|foreign|विदेश/i, category: 'INTERNATIONAL' },
  { pattern: /petrol|diesel|fuel|पेट्रोल|डीज़ल|डीजल|ईंधन/i, category: 'FUEL' },
  { pattern: /grocer|kirana|ration|किराना|किराने|राशन|सब्ज़ी|सब्जी/i, category: 'GROCERY' },
  { pattern: /restaurant|dining|food|dinner|lunch|khana|खाना|खाने|रेस्टोरेंट|रेस्तरां/i, category: 'DINING' },
  { pattern: /flight|hotel|travel|train|trip|फ्लाइट|होटल|यात्रा|ट्रेन/i, category: 'TRAVEL' },
  { pattern: /electricity|recharge|broadband|utility|\bbills?\b|बिजली|रिचार्ज|बिल/i, category: 'UTILITY_BILLS' },
  { pattern: /\brent\b|किराया|किराये|किराए/i, category: 'RENT' },
  { pattern: /insurance|बीमा/i, category: 'INSURANCE' },
  { pattern: /online|ऑनलाइन|shopping|शॉपिंग/i, category: 'ONLINE_SHOPPING', online: true },
];

const UPDATES_WORDS = /\bchanges?\b|\bupdates?\b|devalu|बदलाव|अपडेट|परिवर्तन|badlav/i;
const POINTS_WORDS = /\bpoints?\b|\bworth\b|\bredeem|\bmiles\b|पॉइंट|पॉइंट्स|प्वाइंट|अंक|रिडीम|माइल्स/i;
const MY_CARDS_WORDS = /\b(?:my cards?|what cards?|which cards? (?:do i have|are in my wallet)|show (?:my )?cards?|wallet cards?)\b|मेरे कार्ड|मेरे वॉलेट|कार्ड्स दिखा/i;
const CARD_QUESTION_WORDS =
  /which card|best card|what card|\buse\b|\bpay\b|\bearn|\bswipe|कौन सा|कौनसा|कौन-सा|kaun ?sa|konsa|सबसे अच्छा|इस्तेमाल|भुगतान|कमाई|मिलेगा|मिलेंगे/i;

const DEVANAGARI_DIGITS = /[०-९]/g;
const toAsciiDigits = (s: string) => s.replace(DEVANAGARI_DIGITS, (d) => String(d.charCodeAt(0) - 0x0966));

const MULTIPLIERS: [RegExp, number][] = [
  [/^(lakh|lac|lakhs|लाख)$/i, 100000],
  [/^(k|thousand|हज़ार|हजार)$/i, 1000],
];

/** Finds a rupee amount: "₹1,500", "Rs 2k", "1.5 lakh", "1500 रुपये", "१५००". Null if none. */
export function parseAmount(question: string): number | null {
  const q = toAsciiDigits(question);
  const re = /(₹|\brs\.?|\binr|\brupees?)?\s*(\d[\d,]*(?:\.\d+)?)\s*(lakhs?|lac|thousand|हज़ार|हजार|लाख|k(?![a-z]))?\s*(rupees?|rs\b|रुपये|रुपए|रुपया|रु)?/gi;
  let fallback: number | null = null;
  for (const m of q.matchAll(re)) {
    const raw = Number(m[2].replace(/,/g, ''));
    if (!(raw > 0)) continue;
    const mult = MULTIPLIERS.find(([p]) => m[3] && p.test(m[3]))?.[1] ?? 1;
    const value = raw * mult;
    // A currency sign or word makes it an amount for sure; a bare number counts if it looks like a spend.
    if (m[1] || m[4] || m[3]) return value;
    if (fallback == null && value >= 50) fallback = value;
  }
  return fallback;
}

function matchCategory(question: string): CategoryRule | null {
  return CATEGORY_RULES.find((r) => r.pattern.test(question)) ?? null;
}

/** Works out which offline question this is, or null if it is not one the phone can answer. */
export function matchOfflineIntent(question: string): OfflineIntent | null {
  const q = question.trim();
  if (!q) return null;
  if (UPDATES_WORDS.test(q)) return { kind: 'card_updates' };
  if (MY_CARDS_WORDS.test(q)) return { kind: 'my_cards' };

  const amount = parseAmount(q);
  const rule = matchCategory(q);
  const asksForCard = CARD_QUESTION_WORDS.test(q);
  if ((rule && (amount != null || asksForCard)) || (amount != null && asksForCard)) {
    return {
      kind: 'best_card',
      amount: amount ?? DEFAULT_AMOUNT,
      amountAssumed: amount == null,
      category: rule?.category ?? 'DEFAULT',
      merchant: rule?.merchant,
      online: rule?.online === true,
      upi: /\bupi\b|यूपीआई/i.test(q),
    };
  }
  if (POINTS_WORDS.test(q)) return { kind: 'points_value' };
  return null;
}

// ── Text helpers ────────────────────────────────────

/** Indian digit grouping without Intl, so tests and every JS engine agree: 150000 → "1,50,000". */
export function groupIndian(n: number): string {
  const [int, frac] = Math.abs(n).toString().split('.');
  const last3 = int.slice(-3);
  const rest = int.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return (n < 0 ? '-' : '') + (rest ? `${rest},${last3}` : last3) + (frac ? `.${frac}` : '');
}

/** ₹ amount: whole rupees from ₹100, two decimals below that ("₹22.50", "₹1,500"). */
export function inr(n: number): string {
  if (n >= 100) return `₹${groupIndian(Math.round(n))}`;
  const fixed = n.toFixed(2).replace(/\.00$/, '');
  return `₹${fixed}`;
}

const CATEGORY_HI: Partial<Record<Category, string>> = {
  DEFAULT: 'रोज़मर्रा के',
  DINING: 'खाने-पीने के',
  GROCERY: 'किराने के',
  FUEL: 'पेट्रोल-डीज़ल के',
  TRAVEL: 'यात्रा के',
  ONLINE_SHOPPING: 'ऑनलाइन शॉपिंग के',
  UTILITY_BILLS: 'बिल के',
  RENT: 'किराये के',
  INSURANCE: 'बीमा के',
  OTT_SUBSCRIPTIONS: 'OTT सब्सक्रिप्शन के',
  INTERNATIONAL: 'विदेशी',
};

const CATEGORY_EN: Partial<Record<Category, string>> = {
  DEFAULT: 'everyday spends',
  DINING: 'food and dining',
  GROCERY: 'groceries',
  FUEL: 'fuel',
  TRAVEL: 'travel',
  ONLINE_SHOPPING: 'online shopping',
  UTILITY_BILLS: 'bills',
  RENT: 'rent',
  INSURANCE: 'insurance',
  OTT_SUBSCRIPTIONS: 'subscriptions',
  INTERNATIONAL: 'an international spend',
};

const HEADER = {
  en: { full: 'Offline answer, worked out on your phone (no internet):', simple: 'Offline answer (no internet).' },
  hi: { full: 'ऑफ़लाइन जवाब, आपके फ़ोन पर निकाला गया (इंटरनेट नहीं है):', simple: 'ऑफ़लाइन जवाब (इंटरनेट नहीं है)।' },
};

const header = (lang: OfflineLanguage, simple: boolean) => HEADER[lang][simple ? 'simple' : 'full'];

/** Shown when the phone cannot answer the question without the server. */
export function offlineUnavailableText(language: OfflineLanguage = 'en'): string {
  return language === 'hi'
    ? 'Aura से अभी जुड़ नहीं पा रहे। इंटरनेट के बिना ये सवाल पूछ सकते हैं: किसी खर्च के लिए कौन सा कार्ड (जैसे "Swiggy पर ₹500"), आपके पॉइंट्स की कीमत, और आपके कार्ड्स के बदलाव।'
    : 'Can\'t reach Aura right now. Without internet you can still ask: which card for a spend (like "₹500 at Swiggy"), what your points are worth, and changes to your cards.';
}

const emptyWalletText = (lang: OfflineLanguage) =>
  lang === 'hi'
    ? 'आपने अभी कोई कार्ड नहीं जोड़ा है। Wallet में कार्ड जोड़ें, फिर ये जवाब ऑफ़लाइन भी मिल सकेगा।'
    : 'You have not added any cards yet. Add a card in Wallet and this works offline too.';

const unitText = (r: PurchaseResult, lang: OfflineLanguage) => {
  if (r.rewardUnit === 'CASHBACK' || r.pointsEarned <= 0) return '';
  const n = groupIndian(r.pointsEarned);
  if (r.rewardUnit === 'MILES') return lang === 'hi' ? ` (${n} माइल्स)` : ` (${n} miles)`;
  return lang === 'hi' ? ` (${n} पॉइंट्स)` : ` (${n} points)`;
};

// ── Answers ─────────────────────────────────────────

function bestCardAnswer(intent: Extract<OfflineIntent, { kind: 'best_card' }>, cards: Card[], ctx: OfflineContext): string {
  const lang = ctx.language ?? 'en';
  const simple = ctx.simple === true;
  const ranked = rankCardsForPurchase(
    ctx.catalog,
    cards,
    {
      amount: intent.amount,
      category: intent.category,
      merchant: intent.merchant,
      online: intent.online || intent.category === 'ONLINE_SHOPPING',
      international: intent.category === 'INTERNATIONAL',
      channel: intent.upi ? 'UPI' : 'CARD',
    },
    { experience: ctx.experience, today: ctx.today },
  );
  const amount = inr(intent.amount);
  const assumed =
    lang === 'hi' ? `रकम मानी गई: ${amount} (आपने रकम नहीं बताई)।` : `Amount assumed: ${amount} (you did not say how much).`;

  if (ranked.length === 0) {
    const none =
      lang === 'hi'
        ? 'आपका कोई कार्ड इस भुगतान के लिए नहीं चलता (UPI पर सिर्फ़ RuPay क्रेडिट कार्ड चलते हैं)।'
        : 'None of your cards can be used for this payment (UPI works only with RuPay credit cards).';
    return `${header(lang, simple)}\n${none}`;
  }

  const top = ranked[0];
  if (top.safeValue <= 0) {
    const zero =
      lang === 'hi'
        ? `आपके किसी कार्ड पर ${amount} के इस खर्च पर पक्का रिवॉर्ड नहीं दिखता। कोई भी कार्ड चलेगा, बस बिल पूरा चुकाएँ।`
        : `None of your cards lists a sure reward on this ${amount} spend. Any card works; just pay the bill in full.`;
    return [header(lang, simple), zero, ...(intent.amountAssumed && !simple ? [assumed] : [])].join(simple ? ' ' : '\n');
  }

  const units = unitText(top, lang);
  if (simple) {
    const line =
      lang === 'hi'
        ? `${top.card.name} इस्तेमाल करें। ${amount} पर लगभग ${inr(top.safeValue)} वापस मिलेंगे।`
        : `Use ${top.card.name}. You get about ${inr(top.safeValue)} back on ${amount}.`;
    return `${header(lang, simple)} ${line}`;
  }

  const cardNames =
    cards.length <= 3 ? cards.map((c) => c.name).join(', ') : `${cards.slice(0, 2).map((c) => c.name).join(', ')} +${cards.length - 2} more`;
  const lines: string[] = [header(lang, simple)];
  lines.push(
    lang === 'hi'
      ? `आपके वॉलेट के ${cards.length} कार्ड्स (${cardNames}) में से: ${amount} के ${CATEGORY_HI[intent.category] ?? ''} खर्च के लिए ${top.card.name} इस्तेमाल करें। लगभग ${inr(top.safeValue)} वापस मिलेंगे${units}।`
      : `From your ${cards.length} wallet cards (${cardNames}): Use ${top.card.name} for ${amount} on ${CATEGORY_EN[intent.category] ?? 'this spend'}. You get about ${inr(top.safeValue)} back${units}.`,
  );
  const next = ranked[1];
  if (next) {
    lines.push(
      lang === 'hi' ? `- दूसरा विकल्प: ${next.card.name}, लगभग ${inr(next.safeValue)}।` : `- Next best: ${next.card.name}, about ${inr(next.safeValue)}.`,
    );
  }
  if (top.warnings.length > 0) {
    // Engine warnings are English; Hindi gets a short pointer instead of mixed-language text.
    lines.push(lang === 'hi' ? '- ध्यान दें: इस खर्च पर कुछ शर्तें या सीमा लागू है। Best Card टैब में विवरण देखें।' : `- Note: ${top.warnings[0]}`);
  }
  if (intent.amountAssumed) lines.push(`- ${assumed}`);
  return lines.join('\n');
}

function pointsAnswer(cards: { card: Card; points: number }[], ctx: OfflineContext): string {
  const lang = ctx.language ?? 'en';
  const simple = ctx.simple === true;
  const withPoints = cards
    .filter((c) => c.points > 0)
    .map((c) => ({ ...c, value: pointsValue(ctx.catalog, c.card, c.points) }))
    .sort((a, b) => b.value.low - a.value.low);

  if (withPoints.length === 0) {
    const none =
      lang === 'hi'
        ? 'आपके कार्ड्स पर कोई पॉइंट्स बैलेंस सेव नहीं है। Wallet में अपने पॉइंट्स डालें।'
        : 'No points balance is saved on your cards. Add your points in Wallet.';
    return `${header(lang, simple)}\n${none}`;
  }

  const low = withPoints.reduce((a, c) => a + c.value.low, 0);
  const high = withPoints.reduce((a, c) => a + c.value.high, 0);
  const top = withPoints[0];

  if (simple) {
    const line =
      lang === 'hi'
        ? `अलग-अलग रिवॉर्ड प्रोग्राम के आपके बैलेंस की अनुमानित रुपये में कीमत लगभग ${inr(low)} है; इन्हें एक ही रिडेम्पशन में नहीं जोड़ा गया है। सबसे पहले ${top.card.name} का विकल्प देखें।`
        : `Your separate reward balances have an estimated INR equivalent of about ${inr(low)}; they are not pooled into one redemption. Check the ${top.card.name} option first.`;
    return `${header(lang, simple)} ${line}`;
  }

  const range = high > low ? `${inr(low)} ${lang === 'hi' ? 'से' : 'to'} ${inr(high)}` : inr(low);
  const lines: string[] = [header(lang, simple)];
  lines.push(
    lang === 'hi'
      ? `अलग-अलग रिवॉर्ड प्रोग्राम के बैलेंस की अनुमानित रुपये में कीमत ${range} है; इन्हें जोड़ा नहीं जा सकता।`
      : `Separate reward-program balances have an estimated INR equivalent of ${range}; the underlying points are not interchangeable or pooled.`,
  );
  for (const c of withPoints.slice(0, 5)) {
    const best = c.value.high > c.value.low ? ` ${lang === 'hi' ? 'से' : 'to'} ${inr(c.value.high)} (${c.value.bestRoute.label}; ${c.value.bestRoute.confidence.toLowerCase()} confidence)` : '';
    const provenance = c.value.bestRoute.valuationSource + (c.value.bestRoute.valuationVerifiedAt ? `; verified ${c.value.bestRoute.valuationVerifiedAt}` : '; no valuation verification date');
    lines.push(
      lang === 'hi'
        ? `- ${c.card.name}: ${groupIndian(c.points)} पॉइंट्स, ${inr(c.value.low)}${best}. स्रोत: ${provenance}`
        : `- ${c.card.name}: ${groupIndian(c.points)} points, ${inr(c.value.low)}${best}. Source: ${provenance}`,
    );
  }
  lines.push(
    lang === 'hi'
      ? 'कीमत ऐप के डेटा में दिए आम रिडेम्प्शन रेट पर है।'
      : 'Values use typical redemption rates from the app\'s card data.',
  );
  return lines.join('\n');
}

function updatesAnswer(cards: Card[], ctx: OfflineContext): string {
  const lang = ctx.language ?? 'en';
  const simple = ctx.simple === true;
  const today = ctx.today ?? todayIso();
  const alerts = walletAlerts(ctx.catalog, cards.map((c) => c.id), today, UPDATES_WINDOW_DAYS);
  const name = (id: string) => ctx.catalog.byId.get(id)?.name ?? id;

  if (alerts.length === 0) {
    const recent = cards
      .flatMap((c) => cardChanges(ctx.catalog, c.id, today).recent)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
    const none =
      lang === 'hi'
        ? `अगले ${UPDATES_WINDOW_DAYS} दिनों में आपके कार्ड्स के लिए कोई बदलाव घोषित नहीं है।`
        : `No announced changes for your cards in the next ${UPDATES_WINDOW_DAYS} days.`;
    if (simple || recent.length === 0) return `${header(lang, simple)}${simple ? ' ' : '\n'}${none}`;
    const lines = [header(lang, simple), none, lang === 'hi' ? 'हाल के बदलाव:' : 'Recent changes:'];
    for (const e of recent.slice(0, 3)) lines.push(`- ${name(e.cardId)}: ${e.title} (${e.date})`);
    return lines.join('\n');
  }

  if (simple) {
    const a = alerts[0];
    const line =
      lang === 'hi'
        ? `${alerts.length} बदलाव आने वाले हैं। पहला: ${name(a.cardId)}: ${a.change.title}, ${a.daysAway} दिन में। Wallet में कार्ड खोलकर पढ़ें।`
        : `${alerts.length} ${alerts.length === 1 ? 'change is' : 'changes are'} coming. First: ${name(a.cardId)}: ${a.change.title}, in ${a.daysAway} days. Open the card in Wallet to read it.`;
    return `${header(lang, simple)} ${line}`;
  }

  const lines = [header(lang, simple), lang === 'hi' ? 'आपके कार्ड्स में आने वाले बदलाव:' : 'Coming up for your cards:'];
  for (const a of alerts.slice(0, 4)) {
    lines.push(
      lang === 'hi'
        ? `- ${name(a.cardId)}: ${a.change.title} (${a.change.date} से, ${a.daysAway} दिन में)`
        : `- ${name(a.cardId)}: ${a.change.title} from ${a.change.date} (in ${a.daysAway} days)`,
    );
  }
  if (alerts.some((a) => a.change.direction === 'devaluation')) {
    lines.push(
      lang === 'hi'
        ? 'अगर कोई बदलाव आपके लिए नुकसानदेह है, तो RBI नियमों के तहत बकाया चुकाकर आप बिना अतिरिक्त शुल्क के कार्ड बंद कर सकते हैं।'
        : 'If a change hurts you, RBI rules let you close the card without an extra closure charge once dues are paid.',
    );
  }
  return lines.join('\n');
}

function myCardsAnswer(held: { card: Card; points: number }[], ctx: OfflineContext): string {
  const lang = ctx.language ?? 'en';
  const simple = ctx.simple === true;
  const count = held.length;

  if (simple) {
    const names = held.map((h) => h.card.name).join(', ');
    const line =
      lang === 'hi'
        ? `आपके वॉलेट में ${count} कार्ड्स हैं: ${names}।`
        : `You have ${count} ${count === 1 ? 'card' : 'cards'} in your wallet: ${names}.`;
    return `${header(lang, simple)} ${line}`;
  }

  const lines = [
    header(lang, simple),
    lang === 'hi'
      ? `आपके वॉलेट में ${count} कार्ड्स सेव हैं:`
      : `You have ${count} ${count === 1 ? 'card' : 'cards'} saved in your wallet:`,
  ];

  for (const h of held) {
    const val = h.points > 0 ? pointsValue(ctx.catalog, h.card, h.points) : null;
    const pts = h.points > 0 ? ` · ${groupIndian(h.points)} points (~${inr(val?.low ?? 0)})` : '';
    lines.push(`- ${h.card.name}${pts}`);
  }

  lines.push(
    lang === 'hi'
      ? 'सभी रिवॉर्ड नियम, पॉइंट्स और बेनिफ़िट ऑफ़लाइन उपलब्ध हैं।'
      : 'All reward rules, points balances, and card benefits are stored locally and accessible offline.',
  );

  return lines.join('\n');
}

/** Answers the question on the phone, or returns null when it needs the Aura server. */
export function answerOffline(question: string, ctx: OfflineContext): OfflineAnswer | null {
  const intent = matchOfflineIntent(question);
  if (!intent) return null;
  const lang = ctx.language ?? 'en';
  const held = ctx.holdings.flatMap((h) => {
    const card = ctx.catalog.byId.get(h.catalogId);
    return card ? [{ card, points: h.points }] : [];
  });
  if (held.length === 0) return { intent: intent.kind, text: `${header(lang, ctx.simple === true)}\n${emptyWalletText(lang)}` };

  const cards = [...new Map(held.map((h) => [h.card.id, h.card])).values()];
  switch (intent.kind) {
    case 'best_card':
      return { intent: intent.kind, text: bestCardAnswer(intent, cards, ctx) };
    case 'points_value':
      return { intent: intent.kind, text: pointsAnswer(held, ctx) };
    case 'card_updates':
      return { intent: intent.kind, text: updatesAnswer(cards, ctx) };
    case 'my_cards':
      return { intent: intent.kind, text: myCardsAnswer(held, ctx) };
  }
}
