# WalletWise changes: points 4–6 (brief)

## Point 4 — Card discovery, recommendations, maps, and trip planning

- Find My Card renamed to "Find My Next Card" and shows before/after spend-profile deltas so the recommendation is auditable.
- Browse Cards supports multi-select bank, network, and feature filters simultaneously; active-count badge; one-tap reset; non-empty-state fallback.
- Best Card shows the winning margin (why card #1 beats the runner-up in rupees and %) and clear ineligibility reasons for excluded cards rather than silently omitting them.
- Mapbox controls scaled to 0.72 on mobile to prevent watermark/info overlay from blocking the map; radius options expanded to 1, 2, 5, 10 km.
- Trip Planner resolves city names to IATA codes, adds IRCTC and redBus external handoff buttons (labelled as such), and deducts award taxes from the net value shown.
- Wallet no longer pools unrelated reward balances or shows a single fake flight-redemption total. Each card shows its own programme-specific low/high value range and real airline/hotel transfer partners where applicable; cashback-only cards are labelled accordingly.

## Point 5 — Navigation, notifications, Aura, and learning

- Settings (⚙) icon added to every main-tab header so users can reach Settings from any tab without navigating back.
- Home bell now opens a dedicated Notifications inbox instead of Aura. Inbox sections: card devaluations (from `walletAlerts()`), upcoming payment due dates (from `daysUntilDue()`), and points expiry alerts. Local bill-reminder toggle and a privacy note included. All alerts are computed locally from held-card data.
- Aura chat persists across tab navigation within a session (messages stored in `useCardStore`). Android keyboard-occlusion bug fixed. Clear button added to header when session has messages. `setup` added to offline-fallback intent kinds.
- Learn screen upgraded from a single question to a 5-question deck with progress bar, per-question rationale reveals, and a final results screen with a score badge (Credit Card Master / Smart Cardholder / Credit Explorer) and key takeaway.

## Point 6 — Data operations, release quality, and useful data science

- Three new engine tests cover 18% GST on revolving debt, tie handling in card rankings, and cashback/points separation in goals. All 157 tests pass.
- `spendTrends()` added to `src/engine/budget.ts`: deterministic analysis of the user's logged ledger that returns average monthly spend, top category, month-over-month change, and an end-of-month projection. Uses only local data; projection is labelled as an estimate. Surfaced in the Spends screen as a "Spend Insights & Forecast" block.

## What remains outside these changes

No live award-seat pricing, bank transaction feed, issuer statement import, push-notification infrastructure, language localisation, onboarding changes, automated card-data pipeline, analytics SDK, or server-side modelling was added. Trip-planner handoffs open external booking platforms; the app does not fetch live fares. This branch has not been merged to `main`. See [the detailed implementation record](POINTS_4_TO_6_IMPLEMENTATION.md).

