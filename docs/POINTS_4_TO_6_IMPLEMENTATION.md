# WalletWise points 4–6: implementation record

**Scope:** card discovery/recommendations/maps/trip planning (point 4), navigation/notifications/Aura/learning (point 5), and data operations/release quality/data-science (point 6), as present on `card-discovery-and-polish` after the point-6 commit (`d81fe9f`). This is an engineering change record, not a production release sign-off.

---

## 4. Card Discovery, Recommendations, Maps, and Trip Planning

### 4.1 Find My Card renamed and explained

The recommendation flow has been renamed to "Find My Next Card" to describe the action more precisely. The screen now shows a before/after spend-profile comparison: for each spend category the UI displays the current monthly allocation alongside what the recommended card would change, expressed as a rupee delta. This makes the recommendation auditable rather than opaque.

**UI:** `src/app/find-card.tsx` — renamed flow header; spend profile delta table alongside the recommended card result.

### 4.2 Browse Cards multi-select filters

The card browser previously allowed only single-value filtering. It now supports multi-select chips for Banks, Networks, and Features simultaneously. Active filter count is shown in a badge on the filter bar, a `✕` clear button removes individual chips, and a "Reset all filters" button clears the entire selection. When no cards match the current filters an empty state is shown with a one-tap reset prompt, so the user is never left on a blank screen without a recovery path.

**UI:** `src/app/browse-cards.tsx` — multi-select chip row, active-count badge, empty state with reset.

**Commits:** `ae9b46f`, `f0dc37c`

### 4.3 Best Card recommendations consistent and explainable

Two changes make the Best Card result more trustworthy:

1. **Winning margin.** A `winningMargin` computation shows why card #1 beats the runner-up in absolute rupees and as a percentage. The UI surfaces this next to the winning card rather than just presenting a ranked list.

2. **Ineligibility reasons.** A `getCardIneligibilityReason` function returns a clear, human-readable explanation when a card is excluded from the ranking (e.g., card does not earn on the selected category, card is already held, issuer-imposed cap reached). The UI shows this reason inline next to any excluded card rather than silently omitting it.

Both are computed in the shared engine and consumed by the recommendation screen; Aura tools use the same functions.

**Engine:** `winningMargin` and `getCardIneligibilityReason` exported from `src/engine/index.ts`.

**Commit:** `d07b4b3`

### 4.4 Best Card map experience fixed

On mobile, Mapbox's default control cluster (compass, zoom, attribution watermark, information button) was overlapping interactive map content on small screens. Controls are now scaled to `scale(0.72)` to prevent the watermark and info button from obscuring the map. The radius options available in the nearby-search overlay have been expanded: 1, 2, 5, and 10 km are selectable, and category-specific icon scaling adjusts dynamically with radius so the map remains readable at any zoom level.

**UI:** `src/app/(tabs)/map.tsx` — Mapbox control scale, expanded radius picker, dynamic category scaling.

**Commit:** `fbbe0cc`

### 4.5 Trip Planner transparent about fares and transport

Three additions make trip-planning outputs honest and actionable:

1. **City-to-airport resolution.** `resolveAirportCode()` maps common Indian and international city names (Pune → PNQ, Mumbai → BOM, Delhi → DEL, Bengaluru → BLR, Goa → GOI, Dubai → DXB, Singapore → SIN, London → LHR, Bangkok → BKK, and others) to IATA codes. This feeds into the Skyscanner search URL so a user typing a city name gets a correct search rather than a broken link.

2. **Rail and bus handoffs.** `irctcSearchUrl()` and `redbusSearchUrl(from, to)` generate direct deep-link URLs to IRCTC and redBus for the entered origin/destination. The UI shows "IRCTC Trains" and "redBus Intercity" buttons. These are labelled as external handoffs; the app does not fetch live fares, it opens the booking platform.

3. **Award tax deduction.** `planTripPayment()` now accepts an `awardTaxesRs` parameter. This cash amount (taxes and surcharges required even on award tickets) is deducted from the gross award net value, so the displayed net is what the user actually avoids paying in cash rather than a pre-tax figure. `PointsUse` gained `awardTaxesRs: number` and `netValueRs: number` fields.

**Engine:** `src/engine/trip.ts` — `resolveAirportCode`, `irctcSearchUrl`, `redbusSearchUrl`, `awardTaxesRs` parameter.

**UI:** `src/app/trip-planner.tsx` — IRCTC and redBus buttons; external-handoff label.

**Tests:** 3 new tests in `src/engine/__tests__/money-tools.test.ts`.

**Commits:** `87ef9c2`

### 4.6 Wallet flight estimates replaced

The old Wallet screen showed a fixed "flight estimate" total computed by multiplying a universal assumed point value across all holdings, regardless of program. This has been replaced:

- Each held card's points/cashback balance is shown with its **programme-specific** low/high value range derived from `redemptionRoutes()` in the engine.
- Cards with real airline or hotel transfer partners list those partners.
- Cashback-only cards are labelled "cashback only" and do not show flight-redemption estimates.
- Points from different programmes are never summed or pooled.

**UI:** `src/app/(tabs)/wallet.tsx` — `PointsValueCard` component overhauled; `redemptionRoutes()` called per card.

**Commit:** `3d99763`

---

## 5. Navigation, Notifications, Aura, and Learning

### 5.1 Feature naming (partial)

Display names were reviewed for clarity. Full renaming across all screens (e.g., consistent tab labels, onboarding copy) is noted as a scope boundary below.

### 5.3 Settings from all main tabs

A Settings (⚙) icon button is now present in every main-tab header. Wallet, Map, and Learn screens had the button added; Home already had it via `HomeHeader`. This means users can reach Settings without navigating back to any specific tab.

**UI:** `src/app/(tabs)/wallet.tsx`, `src/app/(tabs)/map.tsx`, `src/app/(tabs)/learn.tsx` — settings icon added to headers.

**Commit:** `3f358fa`

### 5.4 Notification bell inbox

A dedicated notifications screen replaces the previous behaviour where the Home bell opened Aura chat. The bell now routes to `/notifications`.

The inbox is divided into sections:

- **Card devaluations** — sourced from `walletAlerts()`: cards where a known earning-rate change reduces value. Shows `change.title` and direction.
- **Upcoming payment due dates** — sourced from `upcomingDueDates()` / `daysUntilDue()`: lists held cards by days until next statement due date.
- **Points expiry alerts** — surfaces any expiry information associated with held balances.
- **Bill reminder toggle** — a local `billRemindersOn` switch; does not send push notifications in this implementation.
- **Privacy note** — explains that alerts are computed locally from held-card data, not fetched from issuers.

New engine exports: `daysUntilDue`, `upcomingDueDates`, `ordinalDay` added to `src/engine/index.ts`.

**UI:** `src/app/notifications.tsx` (new file); `src/app/(tabs)/index.tsx` — bell routes to `/notifications`.

**Store:** `useCardStore` — no new fields needed; `walletAlerts()` and `upcomingDueDates()` derive from existing holdings.

**Commit:** `3f358fa`

### 5.5 Aura mobile and session experience

Three improvements to Aura:

1. **Android keyboard.** On Android the chat input was obscured by the software keyboard. Fixed with `behavior='height'` and an appropriate `keyboardVerticalOffset` on the `KeyboardAvoidingView`.

2. **Persistent chat history.** Chat messages previously cleared on tab unmount (navigating away and back reset the conversation). `auraMessages` and its setters are now held in `useCardStore` so the conversation survives tab navigation within a session. A "Clear" button in the Aura header appears when there are messages and resets to a fresh session.

3. **Offline fallback.** The offline fallback answer set now includes `setup` as a recognised intent kind alongside existing local-answer categories.

**UI:** `src/app/(tabs)/aura.tsx` — `KeyboardAvoidingView` fix, Clear button, session persistence wired to store.

**Store:** `useCardStore` — `auraMessages`, `setAuraMessages`, `clearAuraMessages` added.

**Commit:** `3f358fa`

### 5.6 Learn quiz deck

The Learn screen previously showed a single-question quiz. It now presents a 5-question deck:

- A progress bar tracks position (e.g., question 2 of 5).
- After answering, a per-question rationale is revealed before moving forward.
- Navigation: "Next Question →" after each answer; "View Results →" on the last question.
- Final results screen shows a badge (Credit Card Master / Smart Cardholder / Credit Explorer based on score), total score, and a key takeaway message.
- Settings gear is added to the Learn header.

**UI:** `src/app/(tabs)/learn.tsx` — quiz deck, progress bar, rationale reveals, results screen, settings icon.

**Commit:** `3f358fa`

### Scope boundaries for point 5

- **5.2 Language / localisation** — no new language support was added. String updates are present but full i18n (locale switching, RTL, translation files) is out of scope for this branch.
- **5.7 Onboarding flow** — onboarding screens were not changed in this branch.

---

## 6. Data Operations, Release Quality, and Useful Data Science

### 6.1 Core money verification suite

Three new test cases were added to `src/engine/__tests__/money-tools.test.ts` to cover edge cases that the existing suite did not explicitly exercise:

| Test | What it checks |
|---|---|
| GST on revolving debt | 18% GST applied to interest; `totalGst` and `extraCost` present in `RevolvingCost` output |
| Tie handling | When two cards produce identical net returns the engine reports both as joint best rather than arbitrarily picking one |
| Cashback / points separation in goals | A rupee-priced goal does not sum unrelated reward-point balances from different programmes |

All 157 tests pass after these additions.

**Tests:** `src/engine/__tests__/money-tools.test.ts`.

**Commit:** `d81fe9f`

### 6.5 Deterministic spend trend forecasting

`spendTrends(spends, currentMonthStr)` in `src/engine/budget.ts` analyses the user's own logged spend ledger and returns:

| Field | Description |
|---|---|
| `averageMonthlySpend` | Mean monthly total across sampled months |
| `monthsSampled` | Number of complete months used (excludes the current partial month) |
| `topCategory` | The category with highest total spend in the sample |
| `momChangePct` | Month-over-month change percentage between the two most recent complete months |
| `projectedMonthTotal` | Current month's running total extrapolated to end-of-month using average daily rate |
| `assumptions[]` | Plain-language list of what the function assumes (e.g., "current month projection uses average daily rate") |

The function is deterministic: its output depends only on the user's saved ledger entries, not on any external feed or random seed. It returns `null` when there is insufficient history (fewer than two complete months). Two tests in `src/engine/__tests__/budget.test.ts` verify the happy path and the insufficient-history guard.

The result is surfaced in `src/app/spends.tsx` as a "Spend Insights & Forecast" block beneath the existing category totals. The projection is labelled as an estimate.

**Engine:** `src/engine/budget.ts` — `spendTrends`, `SpendTrend` type exported from `src/engine/index.ts`.

**UI:** `src/app/spends.tsx` — Spend Insights & Forecast block.

**Tests:** `src/engine/__tests__/budget.test.ts` (2 new tests).

**Commit:** `d81fe9f`

### Scope boundaries for point 6

- **6.2 Card-data pipeline** — no automated ingestion of card-offer or rate changes; catalogue data remains manually curated reference data.
- **6.3 Release checklist / store submission** — EAS build configuration was not changed on this branch; build profiles and submission are managed separately.
- **6.4 Analytics / crash reporting** — no analytics SDK was added; this is consistent with the privacy-first stance established in point 1.
- **6.6 Server-side data science** — the forecasting work is entirely client-side and uses only local ledger data. No server-side modelling or aggregation was introduced.

---

## Cross-cutting summary

| Point | Area | UI files changed | Engine / store changes | New tests |
|---|---|---|---|---|
| 4.1 | Find My Card flow renamed | `find-card.tsx` | — | — |
| 4.2 | Browse Cards multi-select filters | `browse-cards.tsx` | — | — |
| 4.3 | Explainable winning margins | `find-card.tsx`, recommendation screens | `winningMargin`, `getCardIneligibilityReason` in engine | — |
| 4.4 | Map control scaling | `(tabs)/map.tsx` | — | — |
| 4.5 | Trip Planner city resolution + handoffs + tax | `trip-planner.tsx` | `resolveAirportCode`, `irctcSearchUrl`, `redbusSearchUrl`, `awardTaxesRs` in `trip.ts` | 3 |
| 4.6 | Wallet programme-specific redemption | `(tabs)/wallet.tsx` | `redemptionRoutes()` per card | — |
| 5.3 | Settings in all tab headers | `wallet.tsx`, `map.tsx`, `learn.tsx` | — | — |
| 5.4 | Notification inbox | `notifications.tsx` (new), `(tabs)/index.tsx` | `daysUntilDue`, `upcomingDueDates`, `ordinalDay` exported from engine | — |
| 5.5 | Aura keyboard + persistence + Clear | `(tabs)/aura.tsx` | `auraMessages`, `setAuraMessages`, `clearAuraMessages` in store | — |
| 5.6 | Learn 5-question quiz deck | `(tabs)/learn.tsx` | — | — |
| 6.1 | Money edge-case verification | — | — | 3 |
| 6.5 | Spend trend forecasting | `spends.tsx` | `spendTrends`, `SpendTrend` in `budget.ts` | 2 |

---

## Commits on `card-discovery-and-polish`

| SHA | Description |
|---|---|
| `d81fe9f` | add core money edge-case verification suite and deterministic spend trend forecasting |
| `3f358fa` | add notification inbox, learn quiz deck, universal settings access, and aura chat persistence |
| `3d99763` | separate wallet redemption values by programme and show partner routes |
| `87ef9c2` | add city resolution, operator handoffs, and award tax deductions to trip planner |
| `fbbe0cc` | scale mapbox controls for mobile and expand nearby search radius options |
| `d07b4b3` | add explainable winning margins and card ineligibility reasons to recommendations |
| `ae9b46f` | add multi-select bank network filters and empty state reset to card browser |
| `f0dc37c` | clarify card recommendation flow and show spend profile deltas |

---

## Verification and known boundaries

Checks run after each commit and confirmed at `d81fe9f`:

- `npx expo lint` — 0 warnings, 0 errors
- `npx tsc --noEmit` — 0 errors
- `npm test` — 157/157 passing

**Known boundaries:** No live award-seat pricing, bank transaction feed, issuer statement integration, or push-notification infrastructure was added in points 4–6. Trip-planner handoffs open external booking platforms; the app does not fetch live fares. Spend-trend forecasting uses only the user's local ledger entries; projections are labelled as estimates. Notification alerts are computed locally from held-card data, not fetched from issuers. This branch has not been merged to `main`; testing on a development build is required before merge.

