# WalletWise — Comprehensive Architecture Analysis & Defect Register
> Full reverse-engineering sweep · Current HEAD: `1bc8389` · Verified against live code

---

## Part 0 — Current Architecture Overview

### Project Stack
| Layer | Technology |
|---|---|
| Framework | Expo SDK 57 / React Native (Expo Router v4) |
| Navigation | Expo Router — `src/app/` file-based routes |
| State | Zustand v4 + `persist` middleware → **AsyncStorage** |
| AI | Groq LLM via custom backend proxy (`server/`) |
| Maps | Mapbox Search Box API v1 + Geocoding v6 |
| Build | EAS Build (CNG — no local `ios/` or `android/` dirs) |

### Directory Map
```
src/
├── app/                  # All screens (Expo Router)
│   ├── (tabs)/           # 5 bottom-tab screens
│   │   ├── index.tsx     # Home
│   │   ├── map.tsx       # Best Card Map (Mapbox)
│   │   ├── aura.tsx      # AI Chat
│   │   ├── learn.tsx     # Learn Hub
│   │   └── wallet.tsx    # Wallet
│   ├── add-card.tsx
│   ├── bill-check.tsx
│   ├── browse-cards.tsx
│   ├── create-card.tsx   # DEAD SCREEN — unreachable, broken redirect
│   ├── find-card.tsx
│   ├── goal.tsx
│   ├── missed-rewards.tsx
│   ├── settings.tsx
│   ├── spends.tsx
│   └── trip-planner.tsx
├── engine/               # Pure calculation logic (19 modules)
├── store/
│   └── useCardStore.ts   # Single Zustand store — ALL state in one blob
├── services/             # External API wrappers
│   ├── auraApi.ts        # Aura backend client (server proxy)
│   ├── mapbox.ts         # Mapbox category search wrapper
│   ├── offlineAura.ts    # Offline fallback answer engine
│   └── auraStrings.ts    # UI strings EN/HI (Aura + Settings only)
└── data/                 # Bundled card catalog (280 cards JSON)
```

### Data Flow
```
User Action
    │
    ▼
Zustand Store (useCardStore.ts)  ←── AsyncStorage (persist)
    │   holdings · spends · goals    [all user data: one JSON blob]
    │   profile · settings
    ▼
Engine (src/engine/)  ◄── catalog (bundled read-only JSON)
    │   walletValue / scorePurchase / missedRewards / goals / debt
    ▼
Screen components re-render on store change
```

### What the Engine Does Well
The `src/engine/` layer is the project's strongest asset:
- `safeRupeesPerPoint()` and `bestRupeesPerPoint()` correctly separate earning vs. redeeming
- `walletValue()` properly models category allocations, monthly caps, and fee waivers
- `redemptionRoutes()` is cached with `WeakMap` and respects transfer ratios and confidence levels
- `scorePurchase()` → `rankCardsForPurchase()` correctly ranks by `netValue` not just rate

---

## Part 1 — Defect-by-Defect Verification (Original 17 Bugs)

### #1 Demo Wallet Purge on First Card Add
**Status: CONFIRMED STILL EXISTS**

```typescript
// src/store/useCardStore.ts  Line 252
const base = s.isDemo ? [] : s.holdings;
```
Calling `addCard()` while `isDemo === true` wipes all 5 demo holdings. The Add Card hint (line 116) says "Your first card replaces the sample cards" — intentional by design, but still a UX flaw since users cannot compare real vs. sample.

---

### #2 Bell Notification Redirects to Aura Chat
**Status: CONFIRMED STILL EXISTS**

```typescript
// src/app/(tabs)/index.tsx  Line 77
onAlerts={() => router.push({ pathname: '/aura', params: { q: 'Any changes to my cards?' } })}
```
`walletAlerts()` is called and lights the badge dot (lines 48-51), but actual alerts are never surfaced in a list. Tapping the bell fires a hardcoded Aura query.

Header greeting uses `new Date().getHours()` (HomeHeader.tsx L14) for time-based greeting but always shows "Welcome to WalletWise" as static subtitle — no user name.

---

### #3 Settings Isolation & Fake Controls
**Status: CONFIRMED STILL EXISTS**

Settings gear exists only in `HomeHeader.tsx`. Best Card, Aura, Learn, and Wallet tabs have zero settings access.

Language toggle (`setAuraLanguage`) only affects `AURA_STRINGS` and `SETTINGS_STRINGS` — no other screen reads these. Every other screen stays in English.

"Spending Profile" in settings routes to `/find-card` (settings.tsx L104) — not a dedicated profile editor.

---

### #4 Android Keyboard Occlusion in Aura
**Status: CONFIRMED STILL EXISTS**

```typescript
// src/app/(tabs)/aura.tsx  Line 193
<KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
```
Android gets `behavior={undefined}` — soft keyboard covers the text input.

---

### #5 Learn Hub: Single Quiz Question Forever
**Status: CONFIRMED STILL EXISTS**

```typescript
// src/app/(tabs)/learn.tsx  Line 229
const [quizItem] = useState(() => QUIZ_BANK[Math.floor(Math.random() * QUIZ_BANK.length)]);
```
One question picked at component mount. After answering: no Next button, no progress indicator, no score. `QUIZ_BANK` has 4 questions; only 1 is ever displayed.

`MythVsFact` (line 315) uses the same frozen `useState(() => ...)` pattern — one myth card forever.

---

### #6 Missed Rewards: Hard 2-Card Block & Equal-Reward Bias
**Status: CONFIRMED STILL EXISTS**

```typescript
// src/app/missed-rewards.tsx  Line 43
if (walletCards.length < 2) {
  return <MoneyScreen sub="...needs at least two cards.">
```

Equal-reward bias in `engine/missed.ts` line 62:
```typescript
const bestCard = best && missed > 0 ? best.card : usedCard;
```
When `missed === 0` the screen says "This was already your best card" even when another card earned identically — the tie is never disclosed.

---

### #7 Trip Planner: IATA Only, Option-1 False Failure, Cross-Bank Pooling
**Status: CONFIRMED STILL EXISTS**

- `trip-planner.tsx` L93: `maxLength={3}` — city names break the Skyscanner URL
- `engine/trip.ts` L47: `category: 'TRAVEL'` — pure cashback cards return `payCash = null`, showing "None of your cards earns on travel" even when they do earn cashback
- `trip.ts` lines 67-84: points from different banks combined with no fungibility check

---

### #8 Goals: No Edit, Orphaned Cards, Cross-Bank Pooling
**Status: CONFIRMED STILL EXISTS**

`goal.tsx` calls only `addGoal` and `removeGoal` — the store's `updateGoal` is never used from UI.

Orphaned card text (goal.tsx L55):
```typescript
|| 'Cards no longer in your wallet'
```
Deleted cards leave dangling `holdingIds`; no auto-cleanup on `removeHolding`.

`engine/goals.ts` L49: `safeRs` is summed across all cards regardless of issuer.

---

### #9 Wallet Tab: Hint Pill Reappears, Bad Flight Count, Cashback Counted
**Status: CONFIRMED STILL EXISTS**

**Hint Pill:** `wallet.tsx` L246-256 — `hintPulse` is a local `useSharedValue`. Component remounts on every tab visit → animation restarts → pill always appears.

**Flight Count:** `wallet.tsx` L76:
```typescript
const flights = Math.floor(totalMin / TYPICAL_DOMESTIC_FARE);
```
`totalMin` = sum of ALL cards' `lowValue` including cashback cards — then divided by 5,000 to claim flight count.

---

### #10 Spends Tracker: 48h Lockout, Credit Card Only, No Edit, No Visuals
**Status: CONFIRMED STILL EXISTS**

- Binary "Yesterday" chip only — no date picker
- Payment picker shows only credit cards — no UPI, debit, or cash
- No edit — delete and re-add only
- Display: raw text list — no pie chart or spend graph
- Capped at 20 entries shown per month (L71: `.slice(0, 20)`)

---

### #11 create-card.tsx: Dead Screen
**Status: CONFIRMED STILL EXISTS**

```typescript
// src/app/create-card.tsx  Lines 39-41
const timeout = setTimeout(() => {
  router.replace('/card-detail');   // no id param — will crash
}, 2200);
```
Not linked from anywhere in the nav tree. Registered as a route but unreachable and broken.

---

### #12 Mapbox 25-Merchant Cap
**Status: CONFIRMED STILL EXISTS**

```typescript
// src/services/mapbox.ts  Line 31
const CATEGORY_LIMIT = 25;
```
Dining queries 3 subcategories → 75 max. Radius selector changes the bounding box but the API cap stays at 25 per subcategory — expanding radius returns no extra results in dense areas.

---

### #13 Aura: Ephemeral Chat Sessions
**Status: CONFIRMED STILL EXISTS**

`aura.tsx` L81: `useState<Message[]>([...])` — plain React state, cleared on every tab unmount.

---

### #14 Aura: Production APK Crash
**Status: CONFIRMED STILL EXISTS**

`auraApi.ts` L42-44:
```typescript
const hostUri = Constants.expoConfig?.hostUri;   // null in production APK
const host = hostUri?.split(':')[0];
return host ? `http://${host}:${SERVER_PORT}` : null;
```
Without `EXPO_PUBLIC_AURA_API_URL` set, every Aura message throws `AuraError('setup', ...)` immediately.

---

### #15 Browse Cards: No Bank / Network Filters
**Status: CONFIRMED STILL EXISTS**

`browse-cards.tsx` L64 uses `CARD_FILTERS` from `engine/browse.ts` — functional filters only (fee-free, UPI, etc.). No multi-select for Bank (HDFC/SBI/ICICI/Axis) or Network (Visa/Mastercard/RuPay).

---

### #16 Bill Check: Disconnected from Saved Card Dates
**Status: CONFIRMED STILL EXISTS**

`bill-check.tsx` L50 reads `holdings[0]?.catalogId` for the card picker but never reads `statementDay` or `dueDay` from the Holding. Bill dates the user entered in Add Card are completely ignored by Bill Check.

---

### #17 GROQ API Key on Client
**Status: PARTIALLY FIXED — Key is on the server proxy**

The original flaw (direct `EXPO_PUBLIC_GROQ_API_KEY` on client) was fixed — `auraApi.ts` now sends requests to the server proxy. However, the production crash (#14 above) means Aura still fails in APKs unless the server URL is configured.

---

## Part 2 — 13 New Bugs Discovered in This Sweep

### A — create-card.tsx Registered Route Wastes Bundle
The `/create-card` route is registered by Expo Router but not linked anywhere. It is dead weight in the bundle.

### B — Aura Chat History Silently Truncated to Last 12 Turns
```typescript
// aura.tsx  Line 117
messages: [...history, { role: 'user', content: question }].slice(-12),
```
The user sees full chat history on screen, but the AI receives only the last 12 turns. Long sessions cause context amnesia.

### C — Myth vs Fact: Same One Card Per Session
`learn.tsx` L315: `MythVsFact` uses `useState(() => MYTH_BANK[...])` — one random myth selected at mount, no progression button. Identical frozen pattern to the quiz.

### D — Goals Monthly Estimate Always Uses Beginner Rates
```typescript
// engine/goals.ts  Line 57
monthlyRewardRs = Math.round(walletValue(catalog, cards, { ...profile, experience: 'NEW' }).annualReward / 12);
```
Months-to-goal is always computed at `'NEW'` experience level — enthusiasts see an inflated estimate.

### E — Wallet Flight Count Includes Cashback-Only Cards
`PointsValueCard` (wallet.tsx L76) sums `lowValue` across every card including pure cashback cards, then divides by ₹5,000 to claim a flight count. Cashback balances cannot book flights.

### F — Spends List Capped at 20 Entries With No Pagination
```typescript
// spends.tsx  Line 71
const recent = useMemo(() => spendsInMonth(spends, month).reverse().slice(0, 20), [spends, month]);
```
Transactions 21+ in a month are silently hidden with no load-more control.

### G — Points Balance Input: No Sanity Cap
`add-card.tsx` L82: numeric input with no `maxLength` or upper-bound check. Entering `999999999` causes wildly inflated portfolio values without any warning.

### H — Find My Card Silently Overwrites Profile
`setProfile()` in find-card.tsx replaces the stored profile with no confirmation dialog or before/after diff shown to the user.

### I — Spends Screen: No Keyboard Dismiss on Chip Tap
No `keyboardShouldPersistTaps="handled"` at the top-level ScrollView, and no tap-to-dismiss overlay. On Android, tapping a category chip after entering an amount does not dismiss the keyboard.

### J — learn.tsx: Inline Style Objects in Render Loops
`learn.tsx` contains numerous `style={{ ... }}` inline objects inside mapped render callbacks (e.g. lines 154-180). These create new references on every render, preventing memoisation and causing extra layout passes.

### K — No React Error Boundary in the App
`src/app/_layout.tsx` wraps the app in navigation, but there is no `<ErrorBoundary>` at any level. An uncaught engine crash (e.g., unknown `catalogId`) kills the entire app with a white screen and no recovery path.

### L — Wallet Share Code Exposes Card Portfolio in Plain Text
`src/engine/walletCode.ts` encodes card IDs and point balances into a shareable code (base64 or similar). There is no encryption or signing — anyone with the code/QR can read the user's full card portfolio and balances.

### M — Language Setting Covers Only 2 Screens
`auraLanguage` feeds `AURA_STRINGS` (aura.tsx) and `SETTINGS_STRINGS` (settings.tsx). No other screen in the codebase imports these strings. The "Hindi mode" effectively changes the language of 2 out of 15+ screens.

---

## Part 3 — Architecture Verdict

### Keep As-Is
- `src/engine/` — clean, pure, tested, separation from UI is correct
- 280-card catalog system — `buildCatalog()`, `searchCards()` are solid
- Server-side Groq proxy — correct approach, good offline fallback
- Redemption engine — earning/redeeming separation is architecturally correct

### Must Change

| Priority | Area | Root Problem |
|---|---|---|
| **P0** | `auraApi.ts` | Production APK crash — no fallback URL |
| **P0** | `aura.tsx` | Android keyboard behavior `undefined` |
| **P0** | `create-card.tsx` | Dead screen with broken redirect |
| **P1** | `learn.tsx` | Frozen quiz + myth (single-card pattern) |
| **P1** | `useCardStore.ts` | All state in one blob — no domain separation |
| **P1** | Demo purge | First real card nukes sample cards |
| **P2** | `wallet.tsx` | Hint pill every visit, wrong flight math |
| **P2** | `spends.tsx` | 48h date cap, no payment modes, no edit |
| **P2** | Bell icon | Redirects to AI chat instead of alert log |
| **P3** | Settings | Only on Home tab; language covers 2 screens |
| **P3** | Goal screen | No edit UI despite `updateGoal()` existing |
| **P3** | Browse cards | No bank/network filter chips |

---

## Part 4 — Proposed Fix Architecture

### Layer 1 — State Refactor
```
Current: useCardStore.ts  (1 file, all state, one AsyncStorage key)

Proposed:
  store/
  ├── useWalletStore.ts    ← holdings, cards (existing core)
  ├── useSpendStore.ts     ← spends (moved out)
  ├── useGoalStore.ts      ← goals (moved out)
  ├── useSettingsStore.ts  ← language, liteMode, auraSimple, hintSeen
  └── useNotifStore.ts     ← notification log entries (new)
```

### Layer 2 — Shared Valuation Module
```typescript
// src/engine/valuation.ts  (new)
export function isCashbackOnly(card: Card): boolean
export function isFlightRedeemable(card: Card): boolean
// Used by: wallet.tsx flight count, trip planner, goals warning
```

### Layer 3 — i18n Provider
```
src/components/i18n/
  ├── LocaleProvider.tsx   ← Context wrapping _layout.tsx
  ├── strings/
  │   ├── en.ts            ← All screen strings in English
  │   └── hi.ts            ← All screen strings in Hindi
  └── useLocale.ts         ← Hook used by every screen
```

### Layer 4 — Screen-Level Fixes

| Screen | Fix |
|---|---|
| `aura.tsx` L193 | `behavior='height'` + `keyboardVerticalOffset={90}` on Android |
| `learn.tsx` L227 | Replace `const [quizItem]` with `[quizIndex, setQuizIndex]` deck state |
| `learn.tsx` L315 | Same deck pattern for `MythVsFact` |
| `wallet.tsx` L76 | Filter cashback cards before flight count |
| `wallet.tsx` L248 | Read `hintSeen` from `useSettingsStore` |
| `spends.tsx` L63 | Replace binary toggle with `DateTimePicker` |
| `spends.tsx` | Add `PaymentMode` type + chip selector |
| `goal.tsx` | Add inline edit form, wire `updateGoal()` |
| `index.tsx` L77 | Bell → `/notifications` not `/aura` |
| `browse-cards.tsx` L64 | Add bank/network multi-select chips |

---

## Part 5 — Phased Implementation Roadmap

### Phase 0 — Critical Crashers (Before Any APK Release)
1. Set `EXPO_PUBLIC_AURA_API_URL` in EAS secrets for production builds
2. Fix Android `KeyboardAvoidingView` behavior in `aura.tsx` (3-line change)
3. Remove or fix `create-card.tsx` broken redirect

### Phase 1 — High-Visibility UX Regressions
4. Learn quiz deck (4 questions with Next/Score)
5. Myth vs Fact deck (navigation between myths)
6. Wallet hint pill one-time dismiss (persist `hintSeen`)
7. Goal inline edit form (wire existing `updateGoal()`)

### Phase 2 — Data Integrity & Math Correctness
8. Wallet flight count — exclude cashback-only cards
9. Goals orphan cleanup — auto-remove stale `holdingIds` on card delete
10. Missed rewards — surface "tied" result explicitly
11. Spends date picker — replace binary toggle
12. Spends payment mode — UPI / Cash / Debit

### Phase 3 — Global UX & Localization
13. Settings gear on all 5 tab headers
14. App-wide locale provider (replace `auraLanguage` scope)
15. Bell → real notification log (`/notifications` screen)
16. Browse cards — bank and network multi-select filters

### Phase 4 — Architecture Hardening
17. Split Zustand into 5 domain stores
18. Add React Error Boundary in `_layout.tsx`
19. Persist Aura messages to store (last 20 turns)
20. Points input sanity cap in `add-card.tsx`

---

## Part 6 — File-Level Change Map

### Phase 0
| File | Line | Change |
|---|---|---|
| `eas.json` | — | Add `EXPO_PUBLIC_AURA_API_URL` to production env |
| `src/app/(tabs)/aura.tsx` | 193 | `behavior='height'`, add `keyboardVerticalOffset` |
| `src/app/create-card.tsx` | 39-41 | Remove broken redirect or delete file |

### Phase 1
| File | Line | Change |
|---|---|---|
| `src/store/useCardStore.ts` | 200+ | Add `hintSeen`, `setHintSeen` |
| `src/app/(tabs)/learn.tsx` | 226-277 | Deck state for `CardQuiz` |
| `src/app/(tabs)/learn.tsx` | 313-350 | Deck state for `MythVsFact` |
| `src/app/(tabs)/wallet.tsx` | 246-256 | Gate `hintPill` on `hintSeen` from store |
| `src/app/goal.tsx` | 56-85 | Inline edit panel using `updateGoal()` |

### Phase 2
| File | Line | Change |
|---|---|---|
| `src/app/(tabs)/wallet.tsx` | 74-97 | Filter by `!isCashbackOnly(card)` |
| `src/engine/missed.ts` | 58-62 | Expose tied results |
| `src/app/spends.tsx` | 63, 118 | `DateTimePicker` + `PaymentMode` chip |
| `src/engine/budget.ts` | `Spend` type | Add `paymentMode` field |
| `src/store/useCardStore.ts` | `removeHolding` | Cascade cleanup of goal `holdingIds` |

### Phase 3
| File | Change |
|---|---|
| `src/app/(tabs)/_layout.tsx` | Shared header with settings gear for all tabs |
| `src/services/auraStrings.ts` | Expand scope to all screens |
| `src/app/(tabs)/index.tsx` L77 | Bell → `/notifications` |
| `src/app/notifications.tsx` | New screen — alert log from `walletAlerts()` |
| `src/app/browse-cards.tsx` L64 | Add bank + network chip filters |

### Phase 4
| File | Change |
|---|---|
| `src/store/` | Create 5 domain slice files |
| `src/app/_layout.tsx` | Add `<ErrorBoundary>` wrapper |
| `src/app/(tabs)/aura.tsx` | Persist `messages` to `useAuraStore` |
| `src/app/add-card.tsx` L82 | `maxLength={8}` + validate points < 10M |

---

> **Confirmed bugs from original report still present:** 16 of 17 (the GROQ client key was moved server-side but the production crash remains as a separate issue — see #14)
>
> **Newly discovered bugs:** 13 (A through M)
>
> **Total open defects: 29**

---

## Part 7 — Current-State Addendum (2026-11-02)

This addendum was checked against the working tree on 2026-11-02. It supersedes older stack/version/count statements above where they conflict. The earlier defect register remains useful as an audit checklist, but its “confirmed” statuses and total of 29 should not be treated as a fresh verification: several findings are duplicate descriptions, some are stale, and the code has changed since that sweep.

### 7.1 Corrections to the Earlier Snapshot

| Earlier statement | Current evidence | Corrected reading |
|---|---|---|
| Expo Router v4 / Zustand v4 | `package.json`: `expo ~57.0.30`, `expo-router ~57.0.28`, `zustand ^5.0.15`, React Native `0.86.3` | SDK 57 and Zustand 5 are current project dependencies. Do not use the old major-version labels when planning changes. |
| Catalog has 280 cards | `src/data/generated/meta.json` reports 301; generated `cards.json` has 301 catalog entries after the 21 hand-added cards | The 280 figure is the source snapshot before the hand-added overrides. Update README, learn/add-card copy, and docs to describe the actual generated catalog count (or compute it dynamically). |
| Expo Router has only the listed screens | `src/app/` also contains `build-credit`, `family`, `rights`, `scam-check`, and `topic/[id]` | The original route map was incomplete. Expo Router discovers files under `src/app/`, even when a route is not listed explicitly in the root Stack. |
| `create-card` is unlinked and crashes without an id | The route is registered in `src/app/_layout.tsx`, has no in-repo caller, and still redirects to `/card-detail` without `id` | It is an unreachable in-app flow today (unless opened through a deep link); if opened, its destination lacks the required card id. The file is still part of route discovery, so treat as dead route plus broken direct-entry behavior, not a proven bundle-size defect. |
| Production Aura always crashes without a URL | `src/services/auraApi.ts` resolves a configured server URL and otherwise attempts the Expo host on port 8787; `server/DEPLOY.md` documents EAS configuration | The missing production URL is a release-configuration failure when the app is not co-hosted with the dev server, not an unconditional crash. Verify the EAS environment per build profile. |
| All trip-planner inputs are IATA-only | Current `trip-planner.tsx`/`engine/trip.ts` should be rechecked before carrying over the old 3-character and pure-cashback claims | These particular line-based findings are not confirmed by this addendum. Preserve only after reproducing against current UI and route construction. |
| Points and spends have no editing | Card detail has edit controls for balances and bill days; `spends.tsx` should be audited separately for transaction editing | Keep “no spend edit” as an open check unless reverified; the prior phrasing incorrectly generalized from one screen. |

### 7.2 Current Architecture and Data Ownership

```text
Expo Router screens (src/app/)
  ├─ bundled, generated card catalog (src/data/generated/*.json)
  ├─ pure recommendation and finance calculations (src/engine/)
  ├─ device state: one Zustand store
  │    └─ persist middleware → AsyncStorage key "walletwise-wallet"
  ├─ Mapbox Search Box / Geocoding over HTTPS
  └─ Aura API client → Node server (local or Vercel)
       ├─ Groq-compatible LLM provider
       ├─ WalletWise engine tools
       └─ card knowledge RAG (Chroma locally; bundled vector index on Vercel)
```

There is local persistence, but no application database service, user account, or cross-device sync. `src/store/useCardStore.ts` persists holdings, points, optional last four digits and bill days, profile, goals, settings, and spend records as one JSON value. Card data itself is bundled and regenerated from `datasets/`; the Aura knowledge corpus and vector index are separate server assets. The server's Chroma/vector index is for public card knowledge retrieval, not user records.

The store currently also owns derived `cards` in memory but excludes them from persistence and rebuilds them from holdings and the bundled catalog on load. This is a sensible boundary for derived values. State remains one persisted document, though, and has no explicit Zustand persistence `version`/`migrate` contract. Schema changes need deliberate backward-compatible normalization to avoid old installs breaking or silently losing fields.

### 7.3 New / Higher-Level Findings

#### P0 — Aura endpoint quota controls are not an identity boundary

`server/src/routes/auraChat.ts` rate-limits by request-body `userId`. The client generates and persists this ID locally (`useCardStore.ts`); requests are unauthenticated, and the ID can be chosen by any caller. The limiter is an in-memory map per server process, so it resets on restart and is not shared across serverless instances. `server/src/http.ts` also allows `Access-Control-Allow-Origin: *` (which is not by itself an authentication bypass, but confirms the API is intended to be publicly callable). A public endpoint can therefore be used to spend the configured model quota despite the per-user limiter.

**Action:** before public launch, add a server-enforced abuse-control strategy (provider/API gateway limits, IP/device throttling and budget alarms at minimum). If adding accounts, validate signed user identity server-side and move shared quotas to a durable shared store. Never treat a client-supplied ID as proof of identity.

#### P1 — Financially descriptive user data is stored as plain local JSON

The app does not collect a full card number, CVV, or PIN, which is a strong data-minimization choice. It does store card identity, last four digits, point balances, bill dates, profile/spend patterns, and goals in AsyncStorage. Those records can reveal financial habits and are not encrypted by the application. The “everything stays on this phone” copy is true about the current data flow, but should be paired with a clear privacy/export/delete explanation and a threat-model decision before cloud sync is introduced.

Wallet sharing is opt-in and intentionally produces readable text (`WALLETWISE1`), not encrypted data. It can include card IDs and point balances, plus last four digits only when selected. The earlier “full portfolio exposed” wording overstates the contents, but the code is still a bearer payload: anyone who receives it can inspect and import those fields. Make the sharing confirmation explicit and consider an expiring, revocable server link only if cloud accounts are added.

#### P1 — Cross-issuer reward balances can be presented as one spendable trip balance

`src/engine/trip.ts` greedily spends value from every holding until a fare is covered. It does not establish that currencies from distinct issuers can be pooled into one booking or transferred to one common programme. A combined “covered” amount can therefore imply fungibility that does not exist. Wallet totals and goals may usefully summarize estimated value across cards, but a single redemption plan must keep each issuer/programme balance separate and explain the steps/constraints required to realize it.

**Action:** distinguish “total estimated value” from “one-booking spendable value”; only aggregate points after modelling a verified transfer path, transfer ratios, minimums, caps, and whether transfers are reversible.

#### P1 — Calculation confidence is stronger than source freshness in some UI paths

The build pipeline preserves source/verification metadata and generated data reports different as-of dates (cards 2026-10-16, valuations and transfers 2026-10-01, changes 2026-10-11). This is good provenance, but consumers may see a current-looking recommendation without seeing that its point valuation or transfer ratio is older than its card record. `research/algorithm-spec.md` already calls for freshness/confidence treatment; confirm the shipped screens consistently expose the data date and uncertainty, especially for eligibility, lounge access, transfer values, and fee waivers.

**Action:** show a compact “data checked” date and source link on card facts, use explicit unknown/stale states, and avoid presenting estimates as guaranteed issuer benefits.

#### P1 — Sample wallet is the default persisted first-run state

`useCardStore.ts` initializes `holdings` with five demo cards and sets `isDemo: true`; the first `addCard`/`importCards` discards that array. The behavior is disclosed on Add Card and may be intentional. The design still creates two risks: users may mistake sample balances for their own before noticing the banner, and the transition permanently removes the sample comparison set. Treat as a product decision: offer “Try sample wallet” as a separate mode, or start with an empty real wallet and keep the demo behind a clearly labelled preview.

#### P2 — API clients and server inputs need production hardening review

The API wrappers have useful timeouts, response validation, and bounded request sizes. Follow up on abuse controls and data minimization for Aura: conversation text and a compact wallet/profile context are sent to the model service; decide what is logged, retained by the provider, and disclosed to users. Also review Mapbox token URL exposure/allowed scopes and quota monitoring. The Mapbox token is a public client token by design; it must be restricted to required scopes and monitored, not treated as a secret.

#### P2 — Release and content operations rely on manual coordination

The app catalog is a generated static snapshot and the Vercel RAG bundle is another generated snapshot. Updating `datasets/` alone does not update the app bundle until `npm run build:data`; updating card knowledge alone does not refresh `server/index/knowledge-index.gemini.json` until ingest/build steps are run. Publish a repeatable release checklist or CI validation that checks source dates, generated artifacts, catalog count, attribution, RAG index model, and app/server data alignment.

### 7.4 Database Recommendation

#### Recommendation: Supabase Postgres for cloud accounts and sync; retain an offline-first local layer

For WalletWise's product shape, use **Supabase (managed PostgreSQL plus Supabase Auth and Row Level Security)** if the goal is account sign-in, backup, and multi-device sync. The domain is relational: a user owns holdings, spend entries refer to holdings, and goals select holdings. Postgres gives constraints, transactions, migrations, SQL reporting, and a natural way to enforce per-user isolation. Expo's SDK 57 SQLite module is a good local database for structured offline records, but SQLite on the phone is not a cloud service and does not solve account sync on its own.

Do not add cloud sync before deciding on sign-in and account recovery. A reasonable staged path is:

1. **Now:** keep the existing local-only behavior while defining a versioned user-data schema and import/export/delete behavior. If queryability or local data volume becomes painful, migrate the Zustand JSON document to **expo-sqlite** as the local source of truth; keep Zustand as the UI state/cache layer. Keep small preferences in AsyncStorage if useful.
2. **Cloud milestone:** add Supabase Auth, then private tables with `user_id` ownership and RLS policies for every operation. Store only fields the app needs; never store PAN, CVV, bank login, or payment credentials. Add SQL migrations, backups/restore validation, account deletion, consent, and a defined conflict policy before shipping sync.
3. **Offline sync:** let SQLite remain the local working copy and sync changes with stable record IDs, `updated_at`, soft-delete/tombstone handling, and conflict resolution. Do not make every screen directly fetch remote rows; put persistence behind a repository/service boundary so current engine calculations remain pure and usable offline.

**Suggested initial cloud tables:**

| Table | Purpose | Core fields |
|---|---|---|
| `user_profiles` | Per-user settings and spend profile | `user_id` (PK/FK to auth user), profile fields, `updated_at` |
| `holdings` | User-owned cards and balances | `id`, `user_id`, `catalog_id`, `last_four` nullable, `points`, bill days, timestamps |
| `spend_entries` | Manually logged transaction summaries | `id`, `user_id`, `holding_id` nullable, amount, currency, category, date, merchant label if needed, timestamps |
| `goals` | Savings/redemption goals | `id`, `user_id`, name, target rupees, timestamps |
| `goal_holdings` | Optional many-to-many selection | `goal_id`, `holding_id`, `user_id` |

Keep the 301-card catalog, CardAdvisor source files, change history, and static recommendation reference data in the versioned app/server data pipeline unless a product requirement calls for dynamic updates or remote administration. Do not put this public catalog into each user's tables. Aura conversation history should be a separate, opt-in retention decision, not silently included in profile sync.

#### Alternatives

| Option | Fit for this project | Trade-off |
|---|---|---|
| **Supabase / Postgres** | Best default for user accounts, multi-device backup/sync, relational user records, and future reporting | Requires auth, carefully tested RLS, migrations, sync/conflict behavior, and privacy/retention work. A publishable key is expected in the app; never ship a service-role key. |
| **Firebase / Cloud Firestore** | Good if realtime document sync and turnkey mobile offline cache are the top priority | NoSQL document model makes cross-record constraints and relational spend/holding reports less natural. Firestore offline persistence is supported on Android/iOS and web; same-document conflicts use last-write-wins. Review React Native/Expo SDK compatibility and pricing before committing. |
| **expo-sqlite** | Best local structured store for offline use, queryable spends, migrations, and larger histories | Device-local only by itself. Add a cloud sync protocol separately if users need backup or multiple devices. SDK 57 has a versioned Expo SQLite API; install it with Expo's SDK-compatible installer if implementation is approved. |
| **TimescaleDB** | Not recommended for current user records | WalletWise has ordinary user-owned transactional data, not high-volume append-only time-series telemetry. Use Postgres first; a time-series extension only becomes relevant if future event/telemetry volume and time-window queries justify it. |

Supabase is the cloud choice; SQLite is a local/offline choice. They can complement one another. Firebase is a reasonable alternative if the team prioritizes managed realtime/offline document sync over relational queries. TimescaleDB is premature.

#### Required security conditions for Supabase

- Require authenticated user sessions for private user data; enable RLS on every exposed user table and enforce `auth.uid() = user_id` for select/insert/update/delete.
- Test both allowed and denied access for each table and role. A client-side filter is not access control.
- Keep service-role/secret keys exclusively on a trusted server. Store only the publishable key in the mobile app.
- Plan session storage, logout/account deletion, recovery, retention, export, backups, and per-user data cleanup.
- Avoid syncing last four digits unless a clear feature needs them; never request full card details or bank credentials.
- Treat sync as a migration of personal financial behavior data: obtain consent, document provider processing, and provide local-only use if appropriate.

### 7.5 Prioritized Product and Engineering Roadmap

| Priority | Work | Why |
|---|---|---|
| **P0 before broad public launch** | Replace spoofable Aura body-ID-only throttling with server-side abuse protection; configure provider spend limits/alerts; audit Aura data disclosure and retention | Prevents untrusted callers from exhausting model quota and clarifies where personal questions go. |
| **P0 before cloud sync** | Choose account model; define user-data schema, consent, retention, delete/export, migrations, RLS, backups, and conflict behavior | The app currently has no identity, so cloud rows cannot safely be assigned or isolated yet. |
| **P1 correctness** | Fix trip planner's cross-issuer fungibility assumptions; audit every claim in Part 1/2 against current code; correct stale card counts/version labels | Makes financial outcomes and defect backlog trustworthy. |
| **P1 data confidence** | Surface source/as-of dates and stale/unknown states for card details and recommendation values | Card benefits and transfer terms change; old valuation snapshots can mislead. |
| **P1 resilience** | Add persistence schema version/migration and invalid-record recovery; document export/import path | Reduces user-data loss across app updates and storage corruption. |
| **P2 polished UX** | Revisit demo-wallet onboarding, goal edit and orphan cleanup, durable Aura chat history, spend editing/filtering, global language coverage, accessible labels/contrast, and Android keyboard behavior | These are useful experience fixes, but should be confirmed against current screen behavior before being counted as confirmed defects. |
| **P2 operations** | Automate data/index generation checks and release documentation; add CI lint/typecheck/test and dependency/config health checks | Keeps app catalog, RAG index, and docs aligned over frequent card changes. |

### 7.6 Review Limits and Sources

This was a static repository review: source, configuration, generated metadata, existing architecture/research documents, and tests were read. No app was launched, no external service was queried with project credentials, and no test/lint/typecheck command was run. Findings that depend on device, release environment, account policy, or live API behavior need runtime validation before being called confirmed.

Relevant primary documentation checked for the database comparison:

- [Expo SDK 57 reference](https://docs.expo.dev/versions/v57.0.0/) and [Expo SQLite for SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/)
- [Supabase Expo React Native quickstart](https://supabase.com/docs/guides/getting-started/quickstarts/expo-react-native), [React Native Auth quickstart](https://supabase.com/docs/guides/auth/quickstarts/react-native), and [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Firestore offline persistence](https://firebase.google.com/docs/firestore/manage-data/enable-offline)

### 7.7 What to Work on First

The pasted second-opinion review is a useful checklist, but it reports missing ledger/forecast modules and lint/typecheck failures that are not present in the workspace reviewed here: a source-tree scan found no `useLedgerStore`, forecast modules, or CSV-import feature code, and this workspace has no installed `node_modules` with which to reproduce its command results. It may describe a different checkout, branch, or uncommitted state. Reproduce those failures on the exact branch the team plans to ship before treating them as current blockers.

Use this sequence; keep each phase small enough to finish and review before starting the next:

#### Step 0 — Agree on the source of truth and establish a clean baseline

Before coding, agree on one checkout/branch and confirm everyone is reviewing the same files. Install from the committed lockfile, then run the project's lint and typecheck commands and the existing unit suite. Record the exact commands and first errors. Fix build/type errors before feature work only if they reproduce in that checkout; don't pull in orphaned experimental forecast/import work as part of the fix unless the team has decided to ship it.

**Done when:** the team has a reproducible baseline and a short list of actual blocking errors for the selected branch.

#### Step 1 — Correct the money users can misunderstand

Make balances and trip estimates honest before broadening features. Stop implying unrelated issuers' reward currencies can be spent together on one fare. Separate cashback, reward points, airline miles, and hotel points in wallet totals; label cross-programme rupee sums as estimates. In Trip Planner, show which card/programme can cover which part and what transfer or cash step is required. Add engine tests for separate issuers, same-programme balances, cashback, and partial coverage.

**Done when:** every displayed rupee total says whether it is cash-equivalent value or actually usable toward that trip, with no unmodelled cross-bank pooling.

#### Step 2 — Protect the public Aura service before inviting external users

Add server-side abuse controls that do not rely only on request-body `userId`; set provider quota/budget alerts; verify production URL and error behavior; and document what wallet/profile context is sent to Aura and the model provider. Keep chat history ephemeral until retention and consent are explicit.

**Done when:** a caller cannot bypass the service quota merely by changing `userId`, spend limits are observable, and the app explains Aura's data flow.

#### Step 3 — Make recommendations trustworthy at the point of use

Show source, as-of date, confidence, assumptions, caps, exclusions, and “unknown” states alongside card facts and recommendations. Align the generated app catalog and Aura knowledge index on a repeatable update process. Update stale “280 cards” copy to the generated 301-card catalog or derive the count from the catalog.

**Done when:** users can tell whether a number is verified, estimated, stale, or unavailable without consulting the architecture document.

#### Step 4 — Close the highest-value workflow gaps

After the core numbers are correct, improve spend entry/editing and history, goal editing/orphan cleanup, quiz progression, Aura persistence only if users want it, and clear names/scope for “Bill Check” and “Missed Rewards.” Validate keyboard, permissions, offline, small-screen, accessibility, and empty states on Android and iOS. Treat global Hindi localization and a store split as larger projects, not prerequisites for correcting the core workflows.

#### Step 5 — Add cloud accounts only after product requirements are decided

Decide whether users need multi-device sync, backup, and account recovery. If yes, choose Supabase Auth/Postgres/RLS, define consent and delete/export behavior, and plan conflict handling before writing remote records. Keep offline support and local-only mode. If those needs are not validated yet, defer the cloud migration; the current AsyncStorage-backed local app can remain the MVP persistence layer while schema/versioning and data portability are improved.

Defer predictive ML/forecast features until spend records are complete, editable, deduplicated, and accompanied by explicit coverage. For rewards and card-cost calculations, deterministic and source-backed rules should remain authoritative.
