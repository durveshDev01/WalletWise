# WalletWise points 1–3: implementation record

**Scope:** the release-blocker foundation (point 1), accurate calculations (point 2), and wallet/spending/bills/goals/missed rewards (point 3), as present on local `main` after the point 3 merge. This is an engineering change record, not a claim that the app has completed a production security audit.

## 1. Release readiness, persistence, backup, and privacy

### 1.1 Release blockers and deployment readiness

The release-blocker work corrected the earlier launch/build problems: Expo project configuration and identity, the app’s logo/splash/intro behavior, and platform build parity (including map-provider configuration and quota safeguards). This was needed because a feature-rich development build is not deployable if the app cannot start consistently or its production configuration is incomplete.

**UI:** launch experience and app identity now use the configured assets and no longer depend on the slow intro video to release the splash screen. Map behavior follows the configured provider rather than depending on an unconfigured Google key.

**Backend/database:** this release work does not itself add a database schema. It prepares app configuration and the deployment path.

### 1.2 Aura connection and backend boundary

Aura is the conversational assistant in the app; the Aura backend is a separate Node.js service, not Aura itself and not an MCP server. The app sends chat requests to this service. The server owns orchestration/tool execution and calls the Groq-hosted language model via `groq-sdk`; its tools can consult WalletWise calculation code and card-knowledge retrieval. The deployment notes describe the Vercel server build/route setup. Secrets belong in server environment configuration, not the Expo client bundle.

The Aura chat endpoint now validates/limits request-body handling more carefully and consumes the wallet context needed to answer. The app does not send card PANs, CVVs, PINs, or the user’s name as Aura context. Aura’s model answer is not itself proof: deterministic calculator/tool output and its evidence should be preferred for financial facts.

**UI:** Aura remains the chat companion; it can answer wallet questions and route users to app screens. Offline Aura continues to handle supported local questions.

**Backend:** Node.js/TypeScript service, Groq SDK for model requests, deterministic engine tools, and RAG/search infrastructure. Hugging Face Transformers, ChromaDB, and Gemini embeddings belong to the knowledge retrieval path described in `server/`; they are not the card reward calculator. Vercel hosts/deploys the server endpoints as configured in the deployment docs.

### 1.3 Local persistence plus Supabase backup

The chosen fit is hybrid: encrypted on-device SQLite for mobile persistence and Supabase Postgres as a per-user cloud backup/sync store. Zustand remains the app-facing state API; it is not the database. Its persisted state is routed through `src/services/localDatabase.ts` on native platforms, so UI consumers can keep using the store while records are stored locally. The local database applies a schema/migration setup and indexes pending sync records. On web, the adapter falls back to browser storage because the native SQLite implementation is unavailable there.

The local SQLCipher path creates/loads a random database key and stores it using Expo SecureStore. On native platforms the app checks for SQLCipher availability and fails clearly if encrypted SQLite is not available rather than silently treating a plaintext SQLite file as encrypted. The encrypted database protects data at rest on supported native builds; the web fallback does not have equivalent SQLCipher protection.

Supabase migration `supabase/migrations/202611030001_user_data.sql` creates `public.user_data`, associates each row with `auth.users`, enables and forces RLS, revokes anonymous access, and grants authenticated users only the needed operations. Policies constrain rows to `auth.uid()`. A follow-up migration expands the allowed record type for the serialized app-state backup. The cloud layer stores user backup records, not the public card catalogue.

**What gets backed up:** the current serialized WalletWise user state (wallet holdings/balances, preferences/profile, goals, logged spends and related saved state), not the catalogue itself. `cloudSync` and `backupCrypto` encrypt/decrypt backup payloads client-side with a passphrase before upload/after download. The passphrase is not sent to Supabase; losing it means the encrypted backup cannot be decrypted. The database’s JSON payload is therefore ciphertext for this backup flow, while identity, record metadata, and timestamps remain necessary for row ownership/sync.

**UI:** Settings provides sign-in, backup, restore, and passphrase flows. Signing in alone does not imply that a backup has been uploaded; the user must run backup. Restore downloads/decrypts and applies the selected backup to local app state.

### 1.4 Privacy and recovery rules

Wallet and spend data remain on-device by default. Cloud upload happens only through the explicit encrypted backup/sync flow after sign-in. Full card numbers, CVV, and PIN are neither requested nor stored. If app data/device storage is removed, local-only data can be lost; an encrypted cloud backup can restore it only when the user can sign in and supplies the correct passphrase. The app does not promise recovery in the absence of either local data or a usable backup.

**Important scope note:** local user data persistence currently centers on a serialized Zustand app-state record rather than a fully normalized relational table for each domain entity. Supabase likewise stores backup records/payload, rather than separate normalized tables for card holdings, transactions, goals, etc. That is the implemented design; it should not be described as a complete multi-device conflict-resolution system unless the sync protocol is extended and tested for concurrent edits, deletion propagation, and device replacement.

## 2. Accurate calculations and explainable values

### 2.1 Shared calculation path and comparable ranking

The central calculation code in `src/engine/` is used by Best Card/recommendations, wallet values, goals, trip planning, and Aura tools. For purchases, comparison is based on net rupees after the applicable reward value and known costs (including foreign-exchange markup where relevant). A rupee return is not multiplied by an unrelated risk factor to create an opaque score. Confidence and warnings are reported separately; net rupees are the primary comparison unit.

### 2.2 Earning value versus redemption value

Purchase scoring calculates eligible reward units from applicable earning rows, caps, exclusions, channels, and user experience, then values the reward at the appropriate route assumption. Redemption checking uses the cash price avoided less separately entered taxes, fees, and surcharges; it reports gross value, total cost, net value, net rupees per point, and optional return relative to eligible spend. Unknown costs must be entered rather than silently treated as zero in the redemption UI.

There is no universal rupee value for every point. Cash/statement-credit values and airline/hotel transfer values are distinct routes and are labelled estimates where appropriate.

### 2.3 Programme boundaries

Unrelated reward currencies are not added together to claim they can fund one redemption. Airline/hotel options are shown only for actual eligible transfer routes. Cashback-only cards are excluded from flight redemption options. Trip planning states that award availability, required points, and taxes/fees are not live data, and does not claim the user’s balance covers a fare.

Goals likewise use the strongest single-card value rather than pooling unrelated points. The wallet can show INR equivalents across separate programs, with a clear non-pooling explanation.

### 2.4 Traceability, assumptions, and confidence

Calculation outputs carry source, verification date, assumptions, confidence, caps, and warnings where the underlying card/route data supports them. Missing/stale dates can lower confidence or produce visible caveats. Issuer/partner transfer rules are distinguished from WalletWise’s estimated point valuations. A source link verifies a rule only to the extent that it actually supports that rule; it does not prove an estimated redemption valuation.

### 2.5 Replacing mock totals and rates

Fixed wallet point totals are no longer added as if different currencies were interchangeable. The Wallet no longer claims a fixed number of flights from a hard-coded ₹5,000 fare. Best-card ranking now compares net rupee estimates instead of mixing unlike units. Estimates remain estimates, especially where no live award pricing or verified point-value evidence exists.

### UI/backend/data footprint

Home, Wallet, card details, goals, trip planner, map/recommendation views, redemption calculator, offline Aura, and Aura server tools expose the relevant calculation results and caveats. Aura’s `check_redemption` tool takes a user-provided quote and itemizes its net value. The deterministic engine runs in the app and is also used by the server tools where appropriate; no server-side account database is required to calculate an individual card reward.

## 3. Wallet, cards, spending, bills, goals, and missed rewards

### 3.1 Sample cards

Adding a real card no longer silently clears the sample wallet. The Wallet labels samples as an included comparison set and offers an explicit **Remove sample cards** action. Add Card also tells users that samples remain and offers removal. Find My Card and Browse Cards distinguish sample holdings from a user’s real holdings when marking owned cards.

### 3.2 Card creation and validation

The catalog remains the source of card terms/rates because calculating rewards for an unverified, unlisted card would fabricate facts. Add Card explains this limitation and directs users to request missing products. The old animated create-card mock now routes to the catalog-backed Add Card screen. Points/cashback balance must be entered explicitly (0 is allowed when unknown); statement and due days must be valid integers from 1–31. The same validation is applied when editing a held card. This avoids silently storing a zero or omitting invalid bill days.

### 3.3 Spend ledger

Spend records now identify credit-card, UPI, debit-card, and cash payment modes. Non-credit payment modes count toward spend totals but are not scored for credit-card rewards. The screen supports a calendar date selector, editing, and deletion, with category totals, monthly budget comparisons, per-card reward estimates, and cap-use information. The UI explains that reward figures are estimates and that only eligible credit-card transactions enter rewards comparisons.

Missed Rewards can optionally import eligible credit-card entries from the user’s ledger. The implementation does not claim that “over 70%” of users miss rewards; no source for that percentage was found, so it is not used as a product claim.

### 3.4 Bill Check

Bill Check reads saved statement/due days for the selected card when available and surfaces missing cycle information. The revolving-cost calculation models interest using an annualized daily-rate approximation over a calendar cycle (based on saved due-day/statement-day anchor when available; otherwise a stated 30-day assumption), applies GST on interest, and retains the minimum-payment assumption as an editable input. It displays the rate, cycle-day basis, a worked first-cycle calculation, GST, and the key simplifications.

This remains an estimate, not an issuer statement replica: exact card interest can depend on transaction posting dates, balance timing, statement cutoffs, fees, and issuer-specific rules. The screen explicitly says so.

### 3.5 Goals

Goals can be edited. When a card is removed, its stale holding reference is filtered from the current progress calculation and the UI indicates when previously selected cards are no longer in the wallet. Balances stay per-card/per-program; rupee-priced goals do not sum unrelated reward balances. Progress and months-to-go are labelled as estimates and use the engine’s default route and normal-spending model.

### 3.6 Missed Rewards

The hard five-entry ceiling was removed. The comparator reports tied best-card results rather than arbitrarily presenting one winner. It accepts optional eligible ledger history, while users can still enter transactions manually. With one card, it explains that the comparison is that card’s estimated eligible earning rather than an alternative-card win; with sample holdings it warns that the sample comparison set is included.

## Cross-cutting database and backend summary

| Area | Client/UI | Backend | Database/storage |
|---|---|---|---|
| Cards and calculations | Wallet, Add Card, Best Card, detail, goals, trip and redemption flows | Aura invokes deterministic engine tools for wallet/reward/redemption questions | Card product catalogue is bundled reference data; user holdings and balances live in local persisted state |
| Spending and goals | Spend ledger, Bill Check, Goal, Missed Rewards | No transaction feed integration; entries are user-entered and Aura can use supplied wallet context | Ledger/goals are persisted in app state locally; cloud backup stores the encrypted backup payload |
| Sign-in and backup | Settings offers sign-in/backup/restore | Supabase Auth identifies a user; cloud records protected by RLS | Supabase `public.user_data` with per-user RLS; encrypted backup payloads; native encrypted SQLite local adapter |
| Aura | Chat and offline Aura | Node service, Groq SDK, tools/RAG; deployed as configured in Vercel docs | Knowledge index/vector store is separate from private user backup storage |

## Verification and known boundaries

Point 2 checks: Expo lint, client TypeScript check, client test suite (146 at point 2 merge). Point 3 checks: Expo lint, client TypeScript check, client test suite (148 after point 3), `git diff --check`, and browser inspection of Wallet, Add Card, Spends, Missed Rewards, and Bill Check. UI calculations are estimates based on the catalog; no bank transaction feed, live award-seat pricing, or issuer statement integration was added. Local SQLite uses SQLCipher only on supported native configuration; web uses the browser storage adapter. Cloud restoration requires the correct passphrase.
