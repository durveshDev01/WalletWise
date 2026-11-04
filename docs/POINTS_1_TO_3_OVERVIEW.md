# WalletWise changes: points 1–3 (brief)

## Point 1 — Release readiness, privacy, and backup

- Fixed release/configuration blockers affecting launch and platform builds.
- Kept Aura as the app’s assistant and clarified the separate Node/Groq backend boundary; kept secrets server-side.
- Added native encrypted SQLite-backed persistence behind the existing Zustand store, with a browser-storage fallback on web.
- Added Supabase Auth-backed cloud backup records protected by per-user RLS. Backup contents are encrypted client-side with a passphrase; local-only data can still be lost if the device data is erased and no decryptable backup exists.
- The cloud table stores encrypted app-state backup payloads, not a set of normalized tables for every WalletWise entity.

## Point 2 — Accurate, explainable calculations

- Shared engine for card earnings, ranking, wallet estimates, goals, trip planning, redemption checks, and Aura tools.
- Ranks cards by net rupee estimates and itemizes redemption costs rather than mixing rupees with arbitrary scores.
- Keeps balances in distinct programs; only real airline/hotel transfer routes appear as travel options.
- Shows available sources, dates, confidence, caps, assumptions, and warnings; marks editorial values as estimates.
- Removed invented wallet/flight totals and clarified that live award pricing and availability are not available.

## Point 3 — Cards, ledger, bills, goals, missed rewards

- Real cards no longer erase samples. Wallet labels the sample comparison set and provides an explicit removal control.
- Card catalog limitation is explained; add/edit forms validate balances and statement/due days; the mock card-creation route redirects to catalog-backed add.
- Spend ledger supports card/UPI/debit/cash modes, calendar dates, edit/delete, and useful summaries. Non-credit transactions are excluded from rewards calculations. No unsourced “over 70%” claim is shown.
- Bill Check uses saved cycle-day information when available, otherwise a visible assumption, and shows its daily-rate arithmetic and limitations.
- Goals are editable and keep unrelated reward currencies separate. Missed Rewards supports more than five entries, reports ties, can load eligible ledger entries, and explains the one-card case.

## What remains outside these changes

No bank transaction feed, live award inventory, issuer statement import, normalized cloud schema for every entity, or automatic recovery without an encrypted backup was added. See [the detailed implementation record](POINTS_1_TO_3_IMPLEMENTATION.md).
