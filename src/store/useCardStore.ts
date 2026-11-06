import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { catalog } from '../data/catalog';
import {
  CATEGORY_LABELS,
  computePointsExpiryDate,
  dateInDays,
  daysUntilExpiry,
  devaluationRisk,
  pointsValue,
  redemptionRoutes,
  walletValue,
} from '../engine';
import type { Card, UserProfile } from '../engine';
import type { Spend } from '../engine/budget';
import { shortCardName } from '../components/CardFace';
import { encryptedZustandStorage } from '../services/localDatabase';

export type CardData = {
  id: string;
  /** Card key in the CardAdvisor catalog (src/data/generated/cards.json). */
  catalogId: string;
  bankName: string;
  cardName: string;
  lastFour: string;
  points: number;
  /** Target expiration date (YYYY-MM-DD) if configured. */
  expiryDate?: string;
  /** Dynamically computed remaining days until expiryDate. */
  expiryDays?: number;
  lowValue: number;
  highValue: number;
  valueRoute: string;
  valueConfidence: 'HIGH' | 'MEDIUM' | 'LOW';
  valueSource: string;
  valueVerifiedAt: string | null;
  annualFee: string;
  renewalFee: string;
  currencyName: string;
  forexMarkup: string;
  rewardHeadline: string;
  translatorExample: string;
  benefits: string[];
  milestones: string[];
  rewardCategories: string[];
  loungeAccess: string;
  pointsExpiry?: Card['pointsExpiry'];
  intelligence: {
    bestFor: string;
    bestCategory: string;
    recommended: 'Yes' | 'No';
    potentialAnnualValue: number;
  };
};

/** What the user holds. Card facts come from the catalog, not from here. */
export type Holding = {
  id: string;
  catalogId: string;
  /** Short names used by the card artwork (components/CardArt.tsx). */
  bankName: string;
  cardName: string;
  lastFour: string;
  points: number;
  /** Target expiration date in YYYY-MM-DD. */
  expiryDate?: string;
  /** Optional legacy/manual days input. */
  expiryDays?: number;
  /** Day of the month the statement is made (1 to 31). Optional, set by the user. */
  statementDay?: number;
  /** Day of the month the bill is due (1 to 31). Used for bill-day reminders. */
  dueDay?: number;
};

/** A savings goal paid for with points: a trip, a gadget, Diwali gifts, a bill credit. */
export type Goal = {
  id: string;
  name: string;
  /** What the goal costs in rupees. */
  targetRs: number;
  /** Holding ids whose points count. Empty means every card in the wallet. */
  holdingIds: string[];
  createdAt: string;
};

/** Typical monthly spend used for "potential annual value" until the user enters their own. */
export const DEFAULT_PROFILE: UserProfile = {
  monthlySpend: { ONLINE_SHOPPING: 8000, DINING: 4000, GROCERY: 5000, UTILITY_BILLS: 3000, FUEL: 2000, TRAVEL: 3000, DEFAULT: 6000 },
  repayment: 'ALWAYS_FULL',
  experience: 'SOME',
};

const PERK_LABELS: Record<string, string> = {
  MILESTONE_BONUS: 'Milestone bonus on annual spend',
  FUEL_WAIVER: '1% fuel surcharge waiver',
  LOUNGE_ACCESS: 'Airport lounge access',
  MOVIE_TICKET: 'Movie ticket offers',
  INSURANCE: 'Complimentary insurance cover',
  CONCIERGE: 'Concierge service',
  GOLF: 'Golf benefits',
  HOTEL_MEMBERSHIP: 'Hotel membership benefits',
  COBRANDED_OTT: 'OTT subscription benefits',
};

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

function feeText(fee: number | null, lifetimeFree: boolean) {
  if (lifetimeFree || fee === 0) return 'Lifetime free';
  if (fee == null) return 'Not published';
  return `${inr(fee)} + GST`;
}

function loungeText(card: Card) {
  const l = card.lounge;
  if (!l) return 'No lounge access listed';
  const part = (v: number | 'UNLIMITED' | null, label: string) =>
    v === 'UNLIMITED' ? `Unlimited ${label}` : v ? `${v} ${label} visits a year` : null;
  const parts = [part(l.domestic, 'domestic'), part(l.international, 'international')].filter(Boolean);
  if (parts.length === 0) return 'No lounge access listed';
  const gate = l.spendGateRs ? ` (needs ${inr(l.spendGateRs)} spend${l.spendGateWindow ? ` per ${l.spendGateWindow}` : ''})` : '';
  return parts.join(', ') + gate;
}

function bestCategory(card: Card) {
  const top = [...card.rewards].filter((r) => r.category !== 'DEFAULT').sort((a, b) => b.ratePct - a.ratePct)[0];
  return top ? { label: CATEGORY_LABELS[top.category], detail: top.merchantsText ?? CATEGORY_LABELS[top.category] } : null;
}

/** Builds the view model the screens use from a holding plus live catalog data. */
export function toCardData(h: Holding): CardData {
  const card = catalog.byId.get(h.catalogId);
  if (!card) throw new Error(`Unknown card ${h.catalogId}`);
  const value = pointsValue(catalog, card, h.points);
  const isCashback = card.rewards.every((r) => r.type === 'CASHBACK');
  const top = bestCategory(card);
  const bestRoute = redemptionRoutes(catalog, card).find((r) => r.kind === 'TRANSFER' && r.confidence !== 'LOW');
  const annual = walletValue(catalog, [card], DEFAULT_PROFILE);
  const { risk } = devaluationRisk(catalog, card.id);

  let expiryDate = h.expiryDate;
  if (!expiryDate && h.id === '2' && isSampleHolding(h)) {
    expiryDate = dateInDays(18);
  }
  if (!expiryDate && card.pointsExpiry && !card.pointsExpiry.neverExpires) {
    expiryDate = computePointsExpiryDate(card.pointsExpiry) ?? undefined;
  }
  const expiryDays = expiryDate ? daysUntilExpiry(expiryDate) ?? undefined : h.expiryDays;

  return {
    id: h.id,
    catalogId: card.id,
    bankName: h.bankName,
    cardName: h.cardName,
    lastFour: h.lastFour,
    points: h.points,
    expiryDate,
    expiryDays,
    lowValue: value.low,
    highValue: value.high,
    valueRoute: value.bestRoute.label,
    valueConfidence: value.bestRoute.confidence,
    valueSource: value.bestRoute.valuationSource,
    valueVerifiedAt: value.bestRoute.valuationVerifiedAt,
    annualFee: feeText(card.annualFee, card.lifetimeFree),
    renewalFee:
      card.feeWaiverSpend != null
        ? `${feeText(card.annualFee, card.lifetimeFree)} (waived on ${inr(card.feeWaiverSpend)} yearly spend)`
        : feeText(card.annualFee, card.lifetimeFree),
    currencyName: isCashback ? 'Cashback' : card.programme?.name ?? 'Reward Points',
    forexMarkup: card.forexPct != null ? `${card.forexPct}% + GST` : 'Not published',
    rewardHeadline:
      card.rateMinPct != null && card.rateMaxPct != null && card.rateMaxPct > card.rateMinPct
        ? `${card.rateMinPct}% to ${card.rateMaxPct}% estimated at default redemption value`
        : `${card.rateMinPct ?? card.rewards[0]?.ratePct ?? 0}% estimated at default redemption value`,
    // A transfer is mentioned only when it beats the default route.
    translatorExample:
      bestRoute && h.points * bestRoute.rupeesPerPoint > value.low
        ? `${inr(value.low)} on the default route, or about ${inr(h.points * bestRoute.rupeesPerPoint)} via ${bestRoute.label}`
        : `${inr(value.low)} on the default route`,
    benefits: card.perks.filter((p) => p !== 'MILESTONE_BONUS').map((p) => PERK_LABELS[p] ?? p),
    milestones: card.perks.includes('MILESTONE_BONUS') ? ['Milestone bonuses on yearly spend (check current issuer terms)'] : [],
    rewardCategories: [...new Set(card.rewards.filter((r) => r.category !== 'DEFAULT').map((r) => CATEGORY_LABELS[r.category]))],
    loungeAccess: loungeText(card),
    pointsExpiry: card.pointsExpiry,
    intelligence: {
      bestFor: top?.label ?? 'Everyday spends',
      bestCategory: top?.detail ?? 'Everyday spends',
      recommended: annual.net > 0 && risk < 0.15 ? 'Yes' : 'No',
      potentialAnnualValue: Math.max(0, annual.net),
    },
  };
}

// Demo wallet. Point balances are sample values until the user enters their own.
const DEMO_HOLDINGS: Holding[] = [
  { id: '1', catalogId: 'hdfc-infinia', bankName: 'HDFC BANK', cardName: 'Infinia', lastFour: '4920', points: 24000 },
  { id: '2', catalogId: 'sbi-bpcl-octane', bankName: 'SBI CARD', cardName: 'BPCL Octane', lastFour: '8821', points: 4200, expiryDate: dateInDays(18) },
  { id: '3', catalogId: 'amex-platinum-travel', bankName: 'AMERICAN EXPRESS', cardName: 'Platinum Travel', lastFour: '1234', points: 15000 },
  { id: '4', catalogId: 'hdfc-regalia-gold', bankName: 'HDFC BANK', cardName: 'Regalia Gold', lastFour: '5678', points: 32000 },
  { id: '5', catalogId: 'hdfc-marriott-bonvoy', bankName: 'HDFC BANK', cardName: 'Marriott Bonvoy', lastFour: '9012', points: 18000 },
];
const DEMO_HOLDING_IDS = new Set(DEMO_HOLDINGS.map((holding) => holding.id));
const DEMO_CATALOG_IDS = new Set(DEMO_HOLDINGS.map((h) => h.catalogId));
const DEMO_SAMPLE_LAST_FOURS = new Set(['4920', '8821', '1234', '5678', '9012']);

export const isSampleHolding = (h: Pick<Holding, 'id'> & Partial<Pick<Holding, 'catalogId' | 'lastFour'>>) =>
  DEMO_HOLDING_IDS.has(h.id) ||
  h.id.length <= 2 ||
  h.id.startsWith('demo-') ||
  (h.catalogId != null && DEMO_CATALOG_IDS.has(h.catalogId) && h.lastFour != null && DEMO_SAMPLE_LAST_FOURS.has(h.lastFour));

/** Random id for this install. Sent to the Aura server only for rate limiting. */
const newUserId = () => `u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

interface CardStore {
  userId: string;
  holdings: Holding[];
  cards: CardData[];
  profile: UserProfile;
  /** True until the user adds or edits a card; the wallet then holds only their own cards. */
  isDemo: boolean;
  /** Set once the user has answered the Find My Card questions. */
  profileSaved: boolean;
  setProfile: (profile: UserProfile) => void;
  addCard: (catalogId: string, lastFour: string, points: number, billDays?: Pick<Holding, 'statementDay' | 'dueDay' | 'expiryDate' | 'expiryDays'>) => void;
  updateHolding: (
    id: string,
    changes: Partial<Pick<Holding, 'lastFour' | 'points' | 'expiryDays' | 'expiryDate' | 'statementDay' | 'dueDay'>>,
  ) => void;
  removeHolding: (id: string) => void;
  clearDemo: () => void;
  removeSampleCards: () => void;
  /** Aura reply language. Missing means English. */
  auraLanguage?: 'en' | 'hi';
  /** Aura gives one number and one action in short sentences. */
  auraSimple?: boolean;
  /** Plain surfaces, no autoplay or heavy animation, list before map. */
  liteMode?: boolean;
  /** Set once the intro video has played (or was skipped). */
  introSeen?: boolean;
  setAuraLanguage: (language: 'en' | 'hi') => void;
  setAuraSimple: (simple: boolean) => void;
  setLiteMode: (lite: boolean) => void;
  setIntroSeen: () => void;
  /** Persisted recent Aura conversation turns. */
  auraMessages?: { id: string; role: 'user' | 'assistant'; content: string; cta?: any; state?: 'streaming' | 'done' | 'error'; offline?: boolean }[];
  setAuraMessages: (messages: { id: string; role: 'user' | 'assistant'; content: string; cta?: any; state?: 'streaming' | 'done' | 'error'; offline?: boolean }[]) => void;
  clearAuraMessages: () => void;
  /** Points goals (optional slice, added for the Goals screen). */
  goals?: Goal[];
  addGoal: (goal: Omit<Goal, 'id' | 'createdAt'>) => void;
  updateGoal: (id: string, changes: Partial<Omit<Goal, 'id' | 'createdAt'>>) => void;
  removeGoal: (id: string) => void;
  /** Bill-day reminders (local notifications) are on. Off until the user turns them on. */
  billRemindersOn?: boolean;
  setBillRemindersOn: (on: boolean) => void;
  /** Spends logged by hand on the Spends screen. */
  spends: Spend[];
  addSpend: (spend: Omit<Spend, 'id'>) => void;
  updateSpend: (id: string, changes: Partial<Omit<Spend, 'id'>>) => void;
  removeSpend: (id: string) => void;
  /** Adds cards from a "Share my wallet" code. The first real cards replace the demo wallet. */
  importCards: (cards: { catalogId: string; lastFour: string; points: number }[]) => void;
  /** Restores a full wallet state from an encrypted cloud backup and recalculates cards. */
  restoreSnapshot: (saved: Record<string, unknown>) => void;
  /** Restores the 5 comparison sample cards for testing and comparison. */
  loadSampleCards: () => void;
}

const derive = (holdings: Holding[]) => holdings.flatMap((h) => (catalog.byId.has(h.catalogId) ? [toCardData(h)] : []));

/** Holding for a catalog card, with short display names for the card art. */
export function newHolding(catalogId: string, lastFour: string, points: number): Holding {
  const card = catalog.byId.get(catalogId);
  if (!card) throw new Error(`Unknown card ${catalogId}`);
  return {
    id: `${catalogId}-${Date.now()}`,
    catalogId,
    bankName: card.issuer === 'AMEX' ? 'AMERICAN EXPRESS' : `${card.issuer} BANK`,
    cardName: shortCardName(card.name, card.issuer) || card.name,
    lastFour,
    points,
  };
}

export const useCardStore = create<CardStore>()(
  persist(
    (set) => ({
      userId: newUserId(),
      holdings: DEMO_HOLDINGS,
      cards: derive(DEMO_HOLDINGS),
      profile: DEFAULT_PROFILE,
      isDemo: true,
      profileSaved: false,
      setProfile: (profile) => set({ profile, profileSaved: true }),
      addCard: (catalogId, lastFour, points, billDays) =>
        set((s) => {
          let extra = { ...billDays };
          if (extra.expiryDays != null && extra.expiryDays > 0 && !extra.expiryDate) {
            extra.expiryDate = dateInDays(extra.expiryDays);
          } else if (!extra.expiryDate) {
            const cat = catalog.byId.get(catalogId);
            if (cat?.pointsExpiry && !cat.pointsExpiry.neverExpires) {
              const autoExp = computePointsExpiryDate(cat.pointsExpiry);
              if (autoExp) extra.expiryDate = autoExp;
            }
          }
          // Keep samples visible until the user explicitly removes them.
          const holdings = [...s.holdings, { ...newHolding(catalogId, lastFour, points), ...extra }];
          return { holdings, cards: derive(holdings), isDemo: s.isDemo };
        }),
      updateHolding: (id, changes) =>
        set((s) => {
          const holdings = s.holdings.map((h) => {
            if (h.id !== id) return h;
            const updated = { ...h, ...changes };
            if (updated.expiryDays != null && updated.expiryDays > 0 && !changes.expiryDate) {
              updated.expiryDate = dateInDays(updated.expiryDays);
            } else if (changes.points != null && !changes.expiryDate && !h.expiryDate) {
              const cat = catalog.byId.get(h.catalogId);
              if (cat?.pointsExpiry && !cat.pointsExpiry.neverExpires) {
                const autoExp = computePointsExpiryDate(cat.pointsExpiry);
                if (autoExp) updated.expiryDate = autoExp;
              }
            }
            return updated;
          });
          return { holdings, cards: derive(holdings) };
        }),
      removeHolding: (id) =>
        set((s) => {
          const holdings = s.holdings.filter((h) => h.id !== id);
          const hasSample = holdings.some((h) => DEMO_HOLDING_IDS.has(h.id));
          return { holdings, cards: derive(holdings), isDemo: hasSample && s.isDemo };
        }),
      clearDemo: () => set({ holdings: [], cards: [], isDemo: false }),
      restoreSnapshot: (saved) =>
        set((current) => {
          const snapshot = (saved ?? {}) as Partial<CardStore>;
          const holdings = (Array.isArray(snapshot.holdings) ? snapshot.holdings : current.holdings) as Holding[];
          return {
            ...current,
            ...snapshot,
            holdings,
            cards: derive(holdings),
            isDemo: snapshot.isDemo ?? holdings.some((h) => isSampleHolding(h)),
          };
        }),
      removeSampleCards: () => set((s) => {
        let holdings = s.holdings.filter((h) => !isSampleHolding(h));
        if (holdings.length === s.holdings.length && s.isDemo) {
          holdings = [];
        }
        return { holdings, cards: derive(holdings), isDemo: false };
      }),
      loadSampleCards: () => set((s) => {
        const nonSampleHoldings = s.holdings.filter((h) => !isSampleHolding(h));
        const holdings = [...DEMO_HOLDINGS, ...nonSampleHoldings];
        return { holdings, cards: derive(holdings), isDemo: true };
      }),
      setAuraLanguage: (auraLanguage) => set({ auraLanguage }),
      setAuraSimple: (auraSimple) => set({ auraSimple }),
      setLiteMode: (liteMode) => set({ liteMode }),
      setIntroSeen: () => set({ introSeen: true }),
      auraMessages: undefined,
      setAuraMessages: (auraMessages) => set({ auraMessages }),
      clearAuraMessages: () => set({ auraMessages: [] }),
      goals: [],
      addGoal: (goal) =>
        set((s) => ({ goals: [...(s.goals ?? []), { ...goal, id: `goal-${Date.now()}`, createdAt: new Date().toISOString().slice(0, 10) }] })),
      updateGoal: (id, changes) => set((s) => ({ goals: (s.goals ?? []).map((g) => (g.id === id ? { ...g, ...changes } : g)) })),
      removeGoal: (id) => set((s) => ({ goals: (s.goals ?? []).filter((g) => g.id !== id) })),
      billRemindersOn: false,
      setBillRemindersOn: (on) => set({ billRemindersOn: on }),
      spends: [],
      addSpend: (spend) =>
        set((s) => ({ spends: [...s.spends, { ...spend, id: `sp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}` }] })),
      updateSpend: (id, changes) => set((s) => ({ spends: s.spends.map((spend) => spend.id === id ? { ...spend, ...changes } : spend) })),
      removeSpend: (id) => set((s) => ({ spends: s.spends.filter((x) => x.id !== id) })),
      importCards: (incoming) =>
        set((s) => {
          const base = s.holdings;
          // Index suffix keeps ids unique when one code holds the same card twice.
          const added = incoming
            .filter((c) => catalog.byId.has(c.catalogId))
            .map((c, i) => {
              const h = newHolding(c.catalogId, c.lastFour, c.points);
              return { ...h, id: `${h.id}-${i}` };
            });
          if (added.length === 0) return {};
          const holdings = [...base, ...added];
          return { holdings, cards: derive(holdings), isDemo: s.isDemo };
        }),
    }),
    {
      name: 'walletwise-wallet',
      storage: createJSONStorage(() => encryptedZustandStorage),
      // Card facts always come from the bundled catalog, so only the user's own data is saved.
      partialize: (s) => ({
        userId: s.userId,
        holdings: s.holdings,
        profile: s.profile,
        isDemo: s.isDemo,
        profileSaved: s.profileSaved,
        goals: s.goals,
        auraLanguage: s.auraLanguage,
        auraSimple: s.auraSimple,
        liteMode: s.liteMode,
        introSeen: s.introSeen,
        billRemindersOn: s.billRemindersOn,
        spends: s.spends,
        auraMessages: s.auraMessages,
      }),
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<CardStore>;
        const holdings = saved.holdings ?? current.holdings;
        return { ...current, ...saved, holdings, cards: derive(holdings), spends: saved.spends ?? current.spends };
      },
    },
  ),
);
