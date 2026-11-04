/**
 * Tools Aura can call. Each wraps existing WalletWise engine logic (../../src/engine),
 * so every number Aura says comes from the same code the app uses on screen.
 * Tools never throw: errors come back as { ok: false, error, message } for the model to explain.
 */
import { catalog } from '../../../src/data/catalog';
import {
  CATEGORY_LABELS,
  cardChanges,
  calculateRedemptionValue,
  planRedemption,
  planTripPayment,
  pointsValue,
  redemptionRoutes,
  rankCardsForPurchase,
  searchCards,
} from '../../../src/engine';
import type { Card, Category, Experience, UserProfile } from '../../../src/engine';
import {
  browseCards,
  CARD_FILTERS,
  cardMonthlyRate,
  cashWithdrawalCost,
  emiCost,
  revolvingCost,
  rewardsOnSpend,
} from '../../../src/engine';
import type { ToolDefinition } from '../llm/index.ts';
import { searchCardKnowledge } from '../rag/search.ts';

/** What the app sends about the user's wallet. Card numbers are never sent. */
export type WalletContext = {
  cards: { catalogId: string; points: number; label?: string }[];
  profile?: Partial<Pick<UserProfile, 'experience' | 'repayment' | 'monthlySpend'>>;
};

export type Cta = { label: string; route: string; params?: Record<string, string> };

export type ToolContext = {
  wallet: WalletContext;
  /** Set by show_app_screen; sent to the app with the answer. */
  setCta: (cta: Cta) => void;
};

type ToolResult = Record<string, unknown>;
type Tool = ToolDefinition & { run: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult> | ToolResult };

const CATEGORIES = Object.keys(CATEGORY_LABELS) as Category[];
const round = (n: number) => Math.round(n);
const fail = (error: string, message: string): ToolResult => ({ ok: false, error, message });

function walletCards(ctx: ToolContext) {
  return ctx.wallet.cards
    .map((h) => ({ holding: h, card: catalog.byId.get(h.catalogId) }))
    .filter((x): x is { holding: WalletContext['cards'][number]; card: Card } => !!x.card);
}

function experience(ctx: ToolContext): Experience {
  return ctx.wallet.profile?.experience ?? 'SOME';
}

/** Finds a card by catalog id or by name ("Infinia", "Diners Black"). */
export function resolveCard(idOrName: string): Card | null {
  const exact = catalog.byId.get(idOrName.trim().toLowerCase());
  if (exact) return exact;
  const cleaned = idOrName.replace(/\b(credit|card|bank|international|metal|edition)\b/gi, ' ').trim();
  return searchCards(catalog, cleaned, 1)[0] ?? null;
}

function cardSummary(card: Card) {
  return {
    cardId: card.id,
    name: card.name,
    issuer: card.issuer,
    network: card.network,
    annual_fee_inr: card.annualFee,
    fee_waiver_spend_inr: card.feeWaiverSpend,
    top_rates: [...card.rewards]
      .sort((a, b) => b.ratePct - a.ratePct)
      .slice(0, 4)
      .map((r) => ({ category: CATEGORY_LABELS[r.category], value_back_pct: r.ratePct, monthly_cap_inr: r.capRs, only_at: r.merchantsText })),
    last_updated: card.lastChanged,
  };
}

// ── Screens the app can open (whitelist) ─────────────────
const SCREENS: Record<string, { label: string; route: string }> = {
  best_card_map: { label: 'Open Best Card map', route: '/map' },
  trip_planner: { label: 'Open Trip Planner', route: '/trip-planner' },
  find_my_card: { label: 'Open Find My Card', route: '/find-card' },
  wallet: { label: 'Open my Wallet', route: '/wallet' },
  add_card: { label: 'Add a card', route: '/add-card' },
  card_details: { label: 'Open card details', route: '/card-detail' },
  scam_check: { label: 'Is this a scam?', route: '/scam-check' },
  your_rights: { label: 'Your rights', route: '/rights' },
};

export const TOOLS: Tool[] = [
  {
    name: 'get_user_wallet',
    description: "List cards the user holds with each separate programme balance, route-specific INR estimate, provenance and reward rules. Never add raw balances from different programmes.",
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    run: (_args, ctx) => {
      const cards = walletCards(ctx);
      if (cards.length === 0) return fail('empty_wallet', 'The user has not added any cards yet.');
      return {
        ok: true,
        cards: cards.map(({ holding, card }) => {
          const value = pointsValue(catalog, card, holding.points);
          return {
            ...cardSummary(card),
            balance: holding.points,
            balance_currency: card.programme?.name ?? (card.rewards.every((r) => r.type === 'CASHBACK') ? 'Cashback' : 'Card reward points'),
            points_value_inr_estimate: { low: value.low, high: value.high },
            default_route: { label: value.safeRoute.label, confidence: value.safeRoute.confidence, source: value.safeRoute.ruleSource, verified_at: value.safeRoute.ruleVerifiedAt },
            best_route: { label: value.bestRoute.label, confidence: value.bestRoute.confidence, valuation_source: value.bestRoute.valuationSource, valuation_verified_at: value.bestRoute.valuationVerifiedAt },
          };
        }),
      };
    },
  },
  {
    name: 'get_best_card',
    description:
      'Rank the cards the user holds for one purchase and return rupees back and points earned for each. Use for "which card for X", "how much will I earn at Y". Never calculate rewards yourself.',
    parameters: {
      type: 'object',
      properties: {
        category: { type: 'string', enum: CATEGORIES, description: 'Spend category. DEFAULT means everyday/other spends.' },
        amount: { type: 'number', description: 'Purchase amount in INR' },
        merchant: { type: 'string', description: 'Merchant or brand if known, e.g. Swiggy, Amazon, BPCL, DMart' },
        online: { type: 'boolean', description: 'Paid online or in an app' },
        upi: { type: 'boolean', description: 'Paid through UPI (only RuPay credit cards can)' },
        international: { type: 'boolean', description: 'Paid in a foreign currency' },
      },
      required: ['category', 'amount'],
      additionalProperties: false,
    },
    run: (args, ctx) => {
      const amount = Number(args.amount);
      if (!(amount > 0)) return fail('invalid_amount', 'Amount must be a positive number of rupees.');
      const category = CATEGORIES.includes(args.category as Category) ? (args.category as Category) : 'DEFAULT';
      const cards = walletCards(ctx);
      if (cards.length === 0) return fail('empty_wallet', 'The user has not added any cards yet.');
      const ranked = rankCardsForPurchase(
        catalog,
        cards.map((c) => c.card),
        {
          amount,
          category,
          merchant: typeof args.merchant === 'string' ? args.merchant : undefined,
          online: args.online === true || category === 'ONLINE_SHOPPING',
          channel: args.upi === true ? 'UPI' : 'CARD',
          international: args.international === true || category === 'INTERNATIONAL',
        },
        { experience: experience(ctx) },
      );
      if (ranked.length === 0) return fail('no_usable_card', 'None of the user\'s cards can be used for this payment (UPI needs a RuPay credit card).');
      return {
        ok: true,
        amount_inr: amount,
        category: CATEGORY_LABELS[category],
        ranking: ranked.slice(0, 3).map((r, i) => ({
          rank: i + 1,
          cardId: r.card.id,
          card: r.card.name,
          estimated_reward_value_inr: r.safeValue,
          estimated_best_route_value_inr: r.bestValue,
          net_value_inr: r.netValue,
          estimated_return_pct: r.estimatedReturnPct,
          points_earned: r.pointsEarned,
          reward_unit: r.rewardUnit,
          forex_cost_inr: r.forexCost,
          reason: r.reason,
          warnings: r.warnings,
          confidence: r.confidence,
          rule_source: r.source,
          verified_at: r.verifiedAt,
          assumptions: r.assumptions,
        })),
      };
    },
  },
  {
    name: 'get_points_value',
    description: "Value each wallet balance separately and explain the route, confidence, source and valuation date. Never pool different currencies. Optionally for one card.",
    parameters: {
      type: 'object',
      properties: { cardId: { type: 'string', description: 'Card id or name from the user wallet. Omit for all cards.' } },
      additionalProperties: false,
    },
    run: (args, ctx) => {
      let cards = walletCards(ctx);
      if (cards.length === 0) return fail('empty_wallet', 'The user has not added any cards yet.');
      if (typeof args.cardId === 'string' && args.cardId) {
        const card = resolveCard(args.cardId);
        cards = cards.filter((c) => c.card.id === card?.id);
        if (cards.length === 0) return fail('card_not_in_wallet', `The user does not hold "${args.cardId}".`);
      }
      return {
        ok: true,
        cards: cards.map(({ holding, card }) => {
          const plan = planRedemption(catalog, card, holding.points, { experience: experience(ctx) });
          const value = pointsValue(catalog, card, holding.points);
          return {
            cardId: card.id,
            card: card.name,
            balance: holding.points,
            balance_currency: card.programme?.name ?? (card.rewards.every((r) => r.type === 'CASHBACK') ? 'Cashback' : 'Card reward points'),
            value_inr_estimate: { low: value.low, high: value.high },
            recommended_route: plan.recommended.label,
            recommended_value_inr_estimate: plan.valueRs,
            confidence: plan.recommended.confidence,
            rule_source: plan.recommended.ruleSource,
            rule_verified_at: plan.recommended.ruleVerifiedAt,
            valuation_source: plan.recommended.valuationSource,
            valuation_verified_at: plan.recommended.valuationVerifiedAt,
            reason: plan.reason,
            alternatives: plan.alternatives.map((r) => ({ route: r.label, rupees_per_point: Math.round(r.rupeesPerPoint * 100) / 100, confidence: r.confidence })),
          };
        }),
      };
    },
  },
  {
    name: 'check_redemption',
    description: 'Calculate a specific redemption quote using net value = cash price avoided minus taxes, fees and surcharges. Computes net rupees per source point and estimated return on eligible earning spend when supplied. Never assumes the points currencies from other cards can be used.',
    parameters: {
      type: 'object',
      properties: {
        cardId: { type: 'string', description: 'Card id or name from the user wallet' },
        pointsRequired: { type: 'number', description: 'Points or miles deducted from this card balance for the quote' },
        cashPriceAvoidedRs: { type: 'number', description: 'Comparable cash price the redemption avoids, in INR' },
        taxesRs: { type: 'number', description: 'Taxes due in INR, use 0 only if the quote confirms none' },
        feesRs: { type: 'number', description: 'Fees due in INR, use 0 only if the quote confirms none' },
        surchargesRs: { type: 'number', description: 'Surcharges due in INR, use 0 only if the quote confirms none' },
        eligibleSpendRs: { type: 'number', description: 'Optional eligible card spend that earned these points, in INR' },
        source: { type: 'string', description: 'Optional source name or URL for the quote supplied by the user' },
        verifiedAt: { type: 'string', description: 'Optional date shown on or checked against the source, YYYY-MM-DD' },
      },
      required: ['cardId', 'pointsRequired', 'cashPriceAvoidedRs', 'taxesRs', 'feesRs', 'surchargesRs'],
      additionalProperties: false,
    },
    run: (args, ctx) => {
      const card = resolveCard(String(args.cardId ?? ''));
      if (!card || !walletCards(ctx).some((holding) => holding.card.id === card.id)) return fail('card_not_in_wallet', 'Choose a card already in the user wallet.');
      const result = calculateRedemptionValue({
        pointsRequired: Number(args.pointsRequired),
        cashPriceAvoidedRs: Number(args.cashPriceAvoidedRs),
        taxesRs: Number(args.taxesRs),
        feesRs: Number(args.feesRs),
        surchargesRs: Number(args.surchargesRs),
        source: typeof args.source === 'string' ? args.source : undefined,
        verifiedAt: typeof args.verifiedAt === 'string' ? args.verifiedAt : undefined,
      }, args.eligibleSpendRs == null ? undefined : Number(args.eligibleSpendRs));
      if (!result) return fail('invalid_quote', 'Provide positive points required, a non-negative comparable cash price and non-negative costs.');
      const routes = redemptionRoutes(catalog, card);
      const defaults = routes.find((route) => route.kind === 'CASH');
      const best = routes.find((route) => route.confidence !== 'LOW') ?? defaults;
      return {
        ok: true,
        card: card.name,
        quote: result,
        comparison: {
          default_route_rupees_per_point: defaults?.rupeesPerPoint ?? null,
          best_confidence_route: best ? { label: best.label, rupees_per_point: best.rupeesPerPoint, confidence: best.confidence, valuation_source: best.valuationSource, valuation_verified_at: best.valuationVerifiedAt } : null,
        },
        note: 'Quote arithmetic uses user-supplied prices and costs. WalletWise does not independently verify the quote source, date, award availability or final programme value.',
      };
    },
  },
  {
    name: 'get_card_updates',
    description: 'Recent and upcoming changes (devaluations, fee changes, improvements) for the user\'s cards, or for one named card (any Indian card).',
    parameters: {
      type: 'object',
      properties: { cardId: { type: 'string', description: 'Card id or name. Omit for all cards in the wallet.' } },
      additionalProperties: false,
    },
    run: (args, ctx) => {
      if (typeof args.cardId === 'string' && args.cardId) return updatesFor([args.cardId]);
      const ids = ctx.wallet.cards.map((c) => c.catalogId);
      if (ids.length === 0) return fail('empty_wallet', 'The user has not added any cards yet.');
      return updatesFor(ids);
    },
  },
  {
    name: 'plan_trip',
    description:
      'Compare the card return on a cash trip fare and list eligible airline transfer route estimates separately. This tool has no live award price, seat inventory, taxes or fees and must never claim estimated points cover a fare. "spend" is the cash fare in INR.',
    parameters: {
      type: 'object',
      properties: {
        destination: { type: 'string', description: 'Where the user is going, e.g. Goa' },
        spend: { type: 'number', description: 'Total fare or trip cost in INR' },
      },
      required: ['destination', 'spend'],
      additionalProperties: false,
    },
    run: (args, ctx) => {
      const spend = Number(args.spend);
      if (!(spend > 0)) return fail('invalid_amount', 'Trip cost must be a positive number of rupees.');
      const cards = walletCards(ctx);
      if (cards.length === 0) return fail('empty_wallet', 'The user has not added any cards yet.');
      const plan = planTripPayment(
        catalog,
        cards.map((c) => ({ card: c.card, points: c.holding.points })),
        spend,
        { experience: experience(ctx), kind: 'FLIGHT' },
      );
      ctx.setCta({ label: 'Open Trip Planner', route: '/trip-planner', params: { fare: String(round(spend)) } });
      return {
        ok: true,
        destination: String(args.destination ?? ''),
        trip_cost_inr: spend,
        pay_cash_with: plan.payCash ? { card: plan.payCash.card.name, estimated_net_return_inr: plan.payCash.netValue, points_earned: plan.payCash.pointsEarned, confidence: plan.payCash.confidence, source: plan.payCash.source, verified_at: plan.payCash.verifiedAt, assumptions: plan.payCash.assumptions, reason: plan.payCash.reason } : null,
        separate_airline_route_estimates: plan.pointsOptions.map((p) => ({ card: p.cardName, route: p.route, balance_points: p.pointsUsed, estimated_value_inr: p.valueRs, estimated_rupees_per_source_point: p.rupeesPerPoint, confidence: p.confidence, rule_source: p.ruleSource, rule_verified_at: p.ruleVerifiedAt, valuation_source: p.source, valuation_verified_at: p.verifiedAt })),
        notes: plan.notes,
      };
    },
  },
  {
    name: 'search_card_knowledge',
    description:
      'Search verified card documents (fees, reward rates, caps, lounge access, redemption, exclusions, recent changes) for any Indian credit card or general credit-card basics. Use for "tell me about <card>" and any factual question. Returns chunks with card name and last_updated, or status "no_confident_match".',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The question in plain English words, including the card names. Always English, even if the user writes in Hindi or another language.' },
        cardIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional card ids or names to search. For a comparison pass every card, e.g. ["Axis Atlas", "Axis Magnus"].',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
    run: async (args) => {
      const query = String(args.query ?? '').trim();
      if (!query) return fail('invalid_query', 'Query is empty.');
      // Accept a list, or one string that names several cards ("Atlas, Magnus", "Atlas vs Magnus").
      const raw = [
        ...(Array.isArray(args.cardIds) ? args.cardIds : []),
        ...(typeof args.cardId === 'string' ? [args.cardId] : []),
      ]
        .flatMap((v) => String(v).split(/,|;|\/|&|\band\b|\bvs\.?(?=\s|$)|\bversus\b/i))
        .map((v) => v.trim())
        .filter(Boolean);
      const ids = [...new Set(raw.map((v) => resolveCard(v)?.id).filter((id): id is string => !!id))];
      // Names the model passed that match nothing: let the search read the card names from the question instead.
      return searchCardKnowledge(query, ids.length ? ids : undefined);
    },
  },
  {
    name: 'show_app_screen',
    description: 'Show a button under your answer that opens a WalletWise screen when one fits (for example the Best Card map after a purchase question). Call at most once per answer.',
    parameters: {
      type: 'object',
      properties: {
        screen: { type: 'string', enum: Object.keys(SCREENS) },
        cardId: { type: 'string', description: 'Required for card_details: a card id from the user wallet' },
      },
      required: ['screen'],
      additionalProperties: false,
    },
    run: (args, ctx) => {
      const screen = SCREENS[String(args.screen)];
      if (!screen) return fail('unknown_screen', 'That screen does not exist.');
      if (args.screen === 'card_details') {
        const card = typeof args.cardId === 'string' ? resolveCard(args.cardId) : null;
        const held = card && ctx.wallet.cards.find((c) => c.catalogId === card.id);
        if (!held) return fail('card_not_in_wallet', 'Card details can only open for a card in the wallet.');
        ctx.setCta({ label: `Open ${card.name}`, route: screen.route, params: { catalogId: card.id } });
      } else {
        ctx.setCta(screen);
      }
      return { ok: true, shown: screen.label };
    },
  },
  {
    name: 'get_interest_cost',
    description:
      'Cost of paying only the minimum due, converting a purchase to EMI, or withdrawing cash on a credit card: months to clear, interest, 18% GST, fees, and the rewards the same spend earns. Use for any "minimum due", "EMI", "no-cost EMI" or "cash from credit card" question. Never estimate interest yourself.',
    parameters: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['minimum_due', 'emi', 'cash_withdrawal'] },
        amount: { type: 'number', description: 'Bill balance (minimum_due), purchase price (emi) or cash amount (cash_withdrawal), in INR' },
        cardId: { type: 'string', description: 'Card id or name, for its interest rate. Omit to use the first card in the wallet.' },
        min_due_pct: { type: 'number', description: 'minimum_due only: minimum due as % of the bill, if the user knows it (default 5%, assumed)' },
        new_monthly_spend: { type: 'number', description: 'minimum_due only: new spending on the card each month, INR' },
        annual_rate_pct: { type: 'number', description: 'emi only: yearly interest rate of the EMI offer in %, 0 for a true zero-interest plan' },
        months: { type: 'number', description: 'emi only: number of months' },
        processing_fee: { type: 'number', description: 'emi only: processing fee in INR before GST' },
        discount_lost: { type: 'number', description: 'emi only: discount given up by choosing EMI, INR' },
        days: { type: 'number', description: 'cash_withdrawal only: days until the cash is repaid (default 30)' },
      },
      required: ['kind', 'amount'],
      additionalProperties: false,
    },
    run: (args, ctx) => {
      const amount = Number(args.amount);
      if (!(amount > 0)) return fail('invalid_amount', 'Amount must be a positive number of rupees.');
      const asked = typeof args.cardId === 'string' && args.cardId ? args.cardId : null;
      const named = asked ? resolveCard(asked) : null;
      if (asked && !named) return fail('card_not_found', `No card matches "${asked}".`);
      const card = named ?? walletCards(ctx)[0]?.card ?? null;
      const rate = cardMonthlyRate(card);
      const cardRate = rate.source === 'ASSUMED' ? null : rate.pct;
      const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
      const rewards = card ? rewardsOnSpend(catalog, card, amount, { experience: experience(ctx) }) : null;
      const cardParam: Record<string, string> = card ? { card: card.id } : {};
      const base = {
        ok: true,
        card: card?.name ?? null,
        interest_rate_monthly_pct: rate.pct,
        interest_rate_source: rate.source === 'ASSUMED' ? 'assumed (card does not publish one)' : 'card data',
      };
      if (args.kind === 'minimum_due') {
        const r = revolvingCost({ balance: amount, aprMonthlyPct: cardRate, minDuePct: num(args.min_due_pct), newMonthlySpend: num(args.new_monthly_spend) });
        ctx.setCta({ label: 'Open Bill check', route: '/bill-check', params: cardParam });
        return {
          ...base,
          kind: 'minimum_due',
          balance_inr: amount,
          min_due_pct: r.minDuePct,
          outcome: r.status === 'CLEARS' ? 'clears' : r.status === 'NEVER' ? 'never_clears' : 'still_owing_after_50_years',
          months_to_clear: r.months,
          first_minimum_payment_inr: r.firstPayment,
          total_interest_inr: r.totalInterest,
          gst_on_interest_inr: r.totalGst,
          extra_cost_inr: r.extraCost,
          still_owed_after_12_months_inr: r.schedule[11] ? round(r.schedule[11].closing) : 0,
          rewards_this_spend_earned_inr: rewards,
          assumptions: r.assumptions,
        };
      }
      if (args.kind === 'emi') {
        const months = num(args.months);
        if (!months || months < 1) return fail('invalid_months', 'EMI needs the number of months.');
        const r = emiCost({
          price: amount,
          annualRatePct: num(args.annual_rate_pct) ?? 0,
          months,
          processingFee: num(args.processing_fee),
          discountLost: num(args.discount_lost),
        });
        ctx.setCta({ label: 'Open Bill check', route: '/bill-check', params: { tab: 'EMI', ...cardParam } });
        return {
          ...base,
          kind: 'emi',
          price_inr: amount,
          emi_inr: r.emi,
          months: r.months,
          total_interest_inr: r.totalInterest,
          gst_on_interest_inr: r.gstOnInterest,
          processing_fee_inr: r.processingFee,
          gst_on_fee_inr: r.gstOnFee,
          discount_lost_inr: r.discountLost,
          true_extra_cost_inr: r.trueExtraCost,
          no_cost_label_would_be_wrong: r.noCostLabelWrong,
          rule: 'RBI 2025 Directions para 12(3): an EMI that charges interest cannot be called zero-interest or no-cost.',
          rewards_this_spend_earned_inr: rewards,
          assumptions: r.assumptions,
        };
      }
      if (args.kind === 'cash_withdrawal') {
        const days = num(args.days) ?? 30;
        const r = cashWithdrawalCost({ amount, days, aprMonthlyPct: cardRate });
        ctx.setCta({ label: 'Open Bill check', route: '/bill-check', params: { tab: 'CASH', ...cardParam } });
        return {
          ...base,
          kind: 'cash_withdrawal',
          cash_inr: amount,
          days,
          fee_inr: r.fee,
          gst_on_fee_inr: r.gstOnFee,
          interest_inr: r.interest,
          gst_on_interest_inr: r.gstOnInterest,
          total_cost_inr: r.totalCost,
          cost_pct_of_cash: r.costPct,
          assumptions: r.assumptions,
        };
      }
      return fail('invalid_kind', 'kind must be minimum_due, emi or cash_withdrawal.');
    },
  },
  {
    name: 'find_cards',
    description:
      "Search all Indian cards in the catalog with filters (lifetime free, fee up to ₹500, RuPay for UPI, entry level), sorted by yearly value at the user's spend (rewards + perks - fee) when spend is known, else by fee. Use for \"lifetime free cards\", \"cards that work on UPI\", \"cheap card for groceries\".",
    parameters: {
      type: 'object',
      properties: {
        filters: { type: 'array', items: { type: 'string', enum: CARD_FILTERS.map((f) => f.key) }, description: 'Filters that must all match' },
        query: { type: 'string', description: 'Optional bank or card name words, e.g. "SBI"' },
        monthly_spend: {
          type: 'object',
          description: "Optional monthly spend in INR by category, e.g. {\"GROCERY\": 8000, \"DEFAULT\": 5000}. Omit to use the user's saved spend.",
          additionalProperties: { type: 'number' },
        },
        limit: { type: 'number', description: 'How many cards to return (default 5, max 10)' },
      },
      additionalProperties: false,
    },
    run: (args, ctx) => {
      const filterKeys = Array.isArray(args.filters) ? args.filters.map(String) : [];
      const unknown = filterKeys.filter((k) => !CARD_FILTERS.some((f) => f.key === k));
      if (unknown.length > 0) return fail('unknown_filter', `Unknown filter ${unknown.join(', ')}. Use ${CARD_FILTERS.map((f) => f.key).join(', ')}.`);
      const given = args.monthly_spend && typeof args.monthly_spend === 'object' ? (args.monthly_spend as Record<string, unknown>) : null;
      const spend: Partial<Record<Category, number>> = {};
      for (const [k, v] of Object.entries(given ?? ctx.wallet.profile?.monthlySpend ?? {})) {
        if (CATEGORIES.includes(k as Category) && Number(v) > 0) spend[k as Category] = Number(v);
      }
      const profile: UserProfile | null =
        Object.keys(spend).length > 0 ? { monthlySpend: spend, repayment: ctx.wallet.profile?.repayment ?? 'ALWAYS_FULL', experience: experience(ctx) } : null;
      const limit = Math.min(10, Math.max(1, Number(args.limit) || 5));
      const all = browseCards(catalog, { query: typeof args.query === 'string' ? args.query : undefined, filterKeys, profile });
      if (all.length === 0) return fail('no_match', 'No card matches these filters.');
      ctx.setCta({ label: 'Browse all cards', route: '/browse-cards' });
      return {
        ok: true,
        matching_cards: all.length,
        sorted_by: profile ? 'yearly value at the given spend (rewards + perks - annual fee incl. GST)' : 'annual fee, lowest first',
        filters: CARD_FILTERS.filter((f) => filterKeys.includes(f.key)).map((f) => f.label),
        cards: all.slice(0, limit).map((r) => ({
          ...cardSummary(r.card),
          lifetime_free: r.card.lifetimeFree || r.card.annualFee === 0,
          annual_fee_incl_gst_inr: r.feeWithGst,
          yearly_value_inr: r.yearlyValue,
          works_on_upi: r.card.network === 'RUPAY',
        })),
        ...(ctx.wallet.profile?.repayment === 'SOMETIMES_MINIMUM'
          ? { note: 'The user sometimes pays only the minimum: suggest no-fee cards and paying the full bill first.' }
          : {}),
      };
    },
  },
];

function updatesFor(idsOrNames: string[]): ToolResult {
  const out = [];
  for (const idOrName of idsOrNames) {
    const card = resolveCard(idOrName);
    if (!card) {
      out.push({ requested: idOrName, error: 'card_not_found' });
      continue;
    }
    const { upcoming, recent } = cardChanges(catalog, card.id);
    const fmt = (e: (typeof upcoming)[number]) => ({ date: e.date, title: e.title, direction: e.direction, magnitude: e.magnitude, now: e.after });
    out.push({ cardId: card.id, card: card.name, upcoming: upcoming.map(fmt), recent_180_days: recent.slice(0, 6).map(fmt) });
  }
  return { ok: true, source: `CardAdvisor change data, snapshot ${catalog.meta.asOf.changes}`, cards: out };
}

export const TOOL_DEFINITIONS: ToolDefinition[] = TOOLS.map(({ name, description, parameters }) => ({ name, description, parameters }));

/** Runs one tool call and always returns a JSON string for the model. */
export async function runTool(name: string, rawArgs: string, ctx: ToolContext): Promise<string> {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return JSON.stringify(fail('unknown_tool', `No tool named ${name}.`));
  let args: Record<string, unknown>;
  try {
    args = rawArgs ? JSON.parse(rawArgs) : {};
  } catch {
    return JSON.stringify(fail('invalid_arguments', 'Arguments were not valid JSON.'));
  }
  try {
    return JSON.stringify(await tool.run(args, ctx));
  } catch (error) {
    return JSON.stringify(fail('tool_failed', error instanceof Error ? error.message : String(error)));
  }
}
