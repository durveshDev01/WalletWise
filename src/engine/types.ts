/**
 * Types for the WalletWise recommendation engine.
 * The engine is pure TypeScript with no React Native imports, so it can be unit-tested in Node.
 * Spec: research/algorithm-spec.md
 */

export type Category =
  | 'DEFAULT'
  | 'ONLINE_SHOPPING'
  | 'UTILITY_BILLS'
  | 'TRAVEL'
  | 'DINING'
  | 'GROCERY'
  | 'INSURANCE'
  | 'INTERNATIONAL'
  | 'GOVERNMENT'
  | 'EDUCATION'
  | 'FUEL'
  | 'RENT'
  | 'OTT_SUBSCRIPTIONS'
  | 'WALLET'
  | 'EMI';

export type RewardType = 'REWARD_POINTS' | 'CASHBACK' | 'AIRLINE_MILES' | 'HOTEL_POINTS';
export type RewardUnit = 'POINTS' | 'MILES' | 'CASHBACK';
export type Tier = 'ENTRY' | 'MID' | 'PREMIUM' | 'SUPER_PREMIUM';
export type Network = 'VISA' | 'MASTERCARD' | 'RUPAY' | 'AMEX' | 'DINERS';
export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';

export type RewardRow = {
  category: Category;
  type: RewardType;
  /** Effective cash return as a % of spend (points per rupee x typical point value). */
  ratePct: number;
  /** Monthly cap on the reward earned from this row, in rupees. */
  capRs: number | null;
  pointPaisa: number;
  merchantsText: string | null;
  merchants: string[] | null;
  /** True when the rate needs a bank portal or voucher store. */
  portal: boolean;
};

export type LoungeSummary = {
  domestic: number | 'UNLIMITED' | null;
  international: number | 'UNLIMITED' | null;
  spendGateRs: number | null;
  spendGateWindow: string | null;
  programmes: string[];
  upcomingChangeFrom: string | null;
  upcomingChangeText: string | null;
};

export type Card = {
  id: string;
  name: string;
  issuer: string;
  issuerType: 'COMMERCIAL' | 'SFB';
  network: Network;
  tier: Tier;
  annualFee: number | null;
  joiningFee: number | null;
  lifetimeFree: boolean;
  feeWaiverSpend: number | null;
  forexPct: number | null;
  aprMonthlyPct: number | null;
  minMonthlyIncome: number | null;
  minAge: number | null;
  maxAge: number | null;
  rateMinPct: number | null;
  rateMaxPct: number | null;
  lastChanged: string;
  url: string;
  programme: { id: string | null; name: string; type: string; typicalPaisa: number } | null;
  rewards: RewardRow[];
  perks: string[];
  lounge: LoungeSummary | null;
  /** Hand-checked first-card and UPI facts (datasets/overrides/inclusion.json). Absent means not checked. */
  inclusion?: Inclusion;
  /** Issuer page for a card added by hand (datasets/overrides/extra-cards.json). */
  source?: string;
  /** Date a hand-added card was checked on the issuer's page. */
  verifiedAt?: string;
  /** Points/cashback expiry policy derived from public bank T&Cs. */
  pointsExpiry?: {
    /** True when points never expire (e.g. Amex MR, HDFC Infinia). */
    neverExpires: boolean;
    /** Months from accrual date before points expire. null = never / unknown. */
    validityMonths: number | null;
    /** True when bank aligns expiry to the last calendar day of the Nth month (e.g. SBI). */
    alignToMonthEnd: boolean;
    /** True when ANY new earning transaction resets the expiry clock (e.g. IDFC FIRST). */
    resetsOnActivity: boolean;
    /** Human-readable source / caveat for this policy. */
    note: string;
  };
};

/** What the issuer says about paying with this card on UPI. */
export type UpiRewards = {
  earnsRewards: boolean;
  /** Reward rate on UPI as a % of spend, if the issuer states one. */
  ratePct: number | null;
  /** Monthly cap on the UPI reward, in rupees, if the issuer states one. */
  capRs?: number | null;
  /** The UPI rate is only for scanning a shop's QR code (scan and pay). */
  scanAndPayOnly?: boolean;
  /** Rate for online UPI payments when the scan-and-pay rate does not apply. */
  onlineRatePct?: number | null;
  notes: string | null;
};

/** Facts for people getting a first card, each checked on the issuer's own page. */
export type Inclusion = {
  /** Issued against a fixed deposit (FD-backed). */
  secured: boolean;
  /** Smallest FD the issuer accepts, in rupees. */
  minFdRs: number | null;
  /** True when the issuer says no income proof is needed; null when it does not say. */
  noIncomeProof: boolean | null;
  /** null when UPI earning was not checked. */
  upi: UpiRewards | null;
  /** The bank only gives this card to people who already hold one of its cards or accounts. */
  existingCustomersOnly?: boolean;
  source: string;
  verifiedAt: string;
};

export type ProgrammeNode = { id: string; kind: 'BANK' | 'AIRLINE' | 'HOTEL'; name: string; verifiedAt: string | null };

export type TransferEdge = {
  from: string;
  to: string;
  ratioLabel: string;
  /** Destination units per source unit, as published for the route. */
  ratioGiven: number;
  ratioWorst: number;
  ratioBest: number;
  /** The ratio differs by card on this route. */
  perCard: boolean;
  minTier: string | null;
  minTransfer: string | null;
  cap: string | null;
  transferTime: string | null;
  speed: string | null;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNVERIFIED';
  provenance: string | null;
  issuerControlled: boolean;
  source: string | null;
  verifiedAt: string | null;
};

export type ChangeEvent = {
  cardId: string;
  date: string;
  announced: string | null;
  type: string;
  direction: 'devaluation' | 'revaluation' | 'neutral';
  magnitude: 'minor' | 'major';
  title: string;
  before: string | null;
  after: string | null;
  confidence: string | null;
  source: string | null;
};

export type DataMeta = {
  generatedAt: string;
  source: string;
  license: string;
  attribution: string;
  asOf: Record<string, string>;
};

export type Catalog = {
  cards: Card[];
  byId: Map<string, Card>;
  nodes: Map<string, ProgrammeNode>;
  edgesFrom: Map<string, TransferEdge[]>;
  changesByCard: Map<string, ChangeEvent[]>;
  meta: DataMeta;
};

/** Context of a single purchase. */
export type Purchase = {
  amount: number;
  category: Category;
  merchant?: string;
  /** Paid online (website or app). Unscoped ONLINE_SHOPPING rows need this. */
  online?: boolean;
  /** Paid in a foreign currency. */
  international?: boolean;
  channel?: 'CARD' | 'UPI';
  /** The user will buy through the bank's portal or voucher store if that pays more. */
  allowPortal?: boolean;
};

/** Rewards already earned this month per card and row, used for caps. Key: `${cardId}:${rowIndex}`. */
export type CapUsage = Record<string, number>;

export type PurchaseResult = {
  card: Card;
  /** Rupees back at the dataset's typical redemption value. */
  safeValue: number;
  /** Rupees back if points go to the best realistic transfer partner. */
  bestValue: number;
  /** Foreign-currency markup including GST, if international. */
  forexCost: number;
  /** safeValue minus forexCost. */
  netValue: number;
  /** Ranking score in net rupees after explicit transaction costs. */
  score: number;
  effectiveRatePct: number;
  /** Estimated earning return from this spend at the selected/default point value. */
  estimatedReturnPct: number;
  /** Points or miles credited (rupees for cashback cards). */
  pointsEarned: number;
  rewardUnit: RewardUnit;
  row: RewardRow | null;
  rowIndex: number;
  usesPortal: boolean;
  confidence: Confidence;
  source: string | null;
  verifiedAt: string | null;
  assumptions: string[];
  reason: string;
  warnings: string[];
  /** Reward counted against each capped row (same keys as CapUsage). */
  capUse: CapUsage;
};

export type RepaymentHabit = 'ALWAYS_FULL' | 'SOMETIMES_MINIMUM' | 'UNSURE';
export type Experience = 'NEW' | 'SOME' | 'ENTHUSIAST';

export type UserProfile = {
  /** Monthly spend in rupees by category. ONLINE_SHOPPING is assumed online, everything else offline. */
  monthlySpend: Partial<Record<Category, number>>;
  monthlyIncome?: number;
  age?: number;
  repayment: RepaymentHabit;
  experience: Experience;
  /** Airport lounge visits the user would make in a year. */
  loungeVisitsPerYear?: number;
  /** Prefer cashback-style simplicity (beginner default). */
  preferCashback?: boolean;
  /** False when the user has never had a loan or credit card (no CIBIL history). Unknown if absent. */
  hasCreditHistory?: boolean;
  /** False when the user cannot show a salary slip or ITR (students, homemakers, many gig workers). */
  incomeProof?: boolean;
  /** Share of monthly spend (0 to 1) the user pays by UPI rather than by card. Default 0. */
  upiShare?: number;
};
