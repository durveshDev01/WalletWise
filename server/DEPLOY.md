# Deploying Aura and building the Android APK

This puts the Aura server on **Vercel's free Hobby plan** (no credit card) and builds an
**Android APK** with EAS that talks to it from anywhere.

> Vercel Hobby is for **personal, non-commercial use** only. If WalletWise starts making
> money, move to Vercel Pro or another host.

## How it runs on Vercel

```
APK ──POST /aura/chat──▶ Vercel function "aura" (Node 22, streams NDJSON, max 120 s)
                           ├──▶ Groq (LLM)
                           ├──▶ Gemini API (gemini-embedding-001, embeds the question)
                           └──▶ knowledge-index.json (bundled, about 580 card text pieces)
```

- `vercel.json` (project root) tells Vercel to install only `server/` and run
  `npm --prefix server run build:vercel`.
- `server/scripts/build-vercel.mjs` bundles `server/src/vercel.ts` (the same router, agent and
  engine code as `npm start`) with esbuild into `.vercel/output/` (Vercel's Build Output API).
  The function is under 1 MB plus the index; Chroma and the local embedding model are left out.
- On Vercel the bundle defaults to `EMBEDDINGS_PROVIDER=gemini` and `VECTOR_STORE=file`, using
  the committed index `server/index/knowledge-index.gemini.json`.
- Locally nothing changes: `npm start` still uses the local model and Chroma.

## Accounts and keys you need

| What | Where | Card needed? | Used for |
|---|---|---|---|
| Groq API key | console.groq.com → API Keys | No | The LLM (you already have it in `.env`) |
| Gemini API key | aistudio.google.com/apikey → Create API key | No (free tier) | Card search embeddings |
| Vercel account (Hobby) | vercel.com/signup → Continue with GitHub | No | Hosting the server |
| Expo account | expo.dev/signup | No (free plan) | Building the APK on EAS |
| Mapbox token | account.mapbox.com | You already have one | Map tiles and place search |
| Google Maps Android key (optional) | console.cloud.google.com | **Yes**, Google requires a billing account | The map picture on Android |

Without the Google Maps key the APK still works. The Map tab shows nearby places as a list
with a short note, instead of crashing.

## 1. Build the Gemini knowledge index (once, and after data changes)

Vercel cannot run the local embedding model, so the index is built with Gemini on your
computer and committed. Rebuild it after `npm run build:data` or after editing `server/knowledge/`.

1. Add your Gemini key to the project's `.env` (never commit it):
   ```
   GEMINI_API_KEY=your_gemini_key
   ```
2. From the project folder, in PowerShell:
   ```powershell
   $env:EMBEDDINGS_PROVIDER="gemini"; $env:VECTOR_STORE="file"; npm run aura:ingest
   ```
   (macOS/Linux: `EMBEDDINGS_PROVIDER=gemini VECTOR_STORE=file npm run aura:ingest`.)
   It takes about a minute. The Gemini free tier allows **1,000 embedding requests a day
   per model**, and each piece of text is one request. So for Gemini, ingest packs neighbouring
   chunks of a card into about 580 pieces, which leaves room for the day's questions (each
   question to Aura uses one request). If it says the daily quota is used up, try again the
   next day (it resets at midnight Pacific time).
3. Commit `server/index/knowledge-index.gemini.json` and push.

## 2. Deploy the server on Vercel

### Option A: Vercel website (redeploys on every push)

1. Push this branch to GitHub.
2. Go to **vercel.com/new** and sign in with GitHub.
3. Under **Import Git Repository**, find **WalletWise** and click **Import**. If it is not
   listed, click **Adjust GitHub App Permissions** and give Vercel access to the repo.
4. On **Configure Project**:
   - **Project Name**: e.g. `walletwise-aura`.
   - **Framework Preset**: `Other`. `vercel.json` already sets the install and build commands,
     so leave **Build and Output Settings** alone.
   - **Root Directory**: leave it as `./`.
   - Open **Environment Variables** and add:

     | Name | Value |
     |---|---|
     | `GROQ_API_KEY` | your Groq key |
     | `GROQ_MODEL` | `openai/gpt-oss-120b` (or the model in your `.env`) |
     | `GEMINI_API_KEY` | your Gemini key |
     | `EMBEDDINGS_PROVIDER` | `gemini` |
     | `VECTOR_STORE` | `file` |

     The last two are already the defaults on Vercel. Setting them makes the choice visible.
5. Click **Deploy** and wait for "Congratulations".
6. To deploy from a branch other than `main`: **Settings → Environments → Production → Branch
   Tracking**, or merge the branch into `main`.

### Option B: Vercel CLI (from the project folder)

```bash
npx vercel@latest login
npx vercel@latest link
npx vercel@latest env add GROQ_API_KEY production
npx vercel@latest env add GROQ_MODEL production
npx vercel@latest env add GEMINI_API_KEY production
npx vercel@latest deploy --prod
```

### Check it

Open `https://<your-project>.vercel.app/health`. It should show:

```json
{"ok":true,"llm":"groq","model":"openai/gpt-oss-120b","groqKeySet":true,"embeddings":"gemini","embeddingsKeySet":true,"vectorStore":"file"}
```

Then try a real question (PowerShell: use `curl.exe`):

```bash
curl -N -X POST https://<your-project>.vercel.app/aura/chat -H "Content-Type: application/json" -d "{\"userId\":\"test\",\"messages\":[{\"role\":\"user\",\"content\":\"Tell me about HDFC Infinia\"}]}"
```

You should see lines like `{"type":"status",...}`, then `{"type":"text",...}`, then `{"type":"done",...}`.
Function logs are under **Project → Logs** on vercel.com.

Use the **production** address (`<project>.vercel.app`). Preview deployments for other branches
are protected by Vercel Authentication by default, so the app cannot call them.

## 3. Build the Android APK with EAS

1. Log in and link the project (once):
   ```bash
   npx eas-cli@latest login
   npx eas-cli@latest init
   ```
   The app config is dynamic (`app.config.ts`), so `init` may ask you to add the project id by
   hand. If it does, put it in `app.json` under `expo.extra.eas.projectId`, as it shows.
2. Set the build's environment variables for the `preview` environment (the APK profile in
   `eas.json` uses it). `EXPO_PUBLIC_` values end up inside the app, so they cannot be
   "secret"; use `sensitive`:
   ```bash
   npx eas-cli@latest env:set --name EXPO_PUBLIC_AURA_API_URL --value https://<your-project>.vercel.app --environment preview --visibility plaintext
   npx eas-cli@latest env:set --name EXPO_PUBLIC_MAPBOX_TOKEN --value <your-mapbox-token> --environment preview --visibility sensitive
   ```
   The Best Card map is Mapbox GL JS in a WebView, so no Google Maps key is needed.
   Use a public Mapbox token (starts with `pk.`) with only the default public scopes.
3. Build:
   ```bash
   npx eas-cli@latest build -p android --profile preview
   ```
   Builds run in Expo's cloud (the free plan has a monthly build quota, with a queue).
   When it finishes, open the link it prints on your phone and install the `.apk`
   (allow "install unknown apps" for your browser when asked).

`.env` is not uploaded to EAS (it is in `.gitignore`), which is why the values go into EAS
environment variables.

## Updating

- Server code or data changed: push (Option A) or `npx vercel@latest deploy --prod` (Option B).
  If card data or `server/knowledge/` changed, rebuild the Gemini index first (step 1).
- App changed: run the EAS build again.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Build fails with "Missing server/index/knowledge-index.gemini.json" | Do step 1, commit the file |
| `/health` shows `groqKeySet: false` or `embeddingsKeySet: false` | Add the variable in **Settings → Environment Variables**, then **Deployments → ⋯ → Redeploy** |
| Aura says it cannot look up card details | Check the Gemini key and the function logs. "built with … but EMBEDDINGS_MODEL is …" means the index came from another model: rebuild it (step 1) |
| App says "Can't reach Aura" | `EXPO_PUBLIC_AURA_API_URL` was missing at build time. Check `eas env:list preview` and rebuild |
| General questions too often get "no verified info" | Lower `RAG_MIN_SCORE` (Gemini default 0.58) in Vercel's environment variables |
| Card search stops working late in the day | The 1,000 requests a day free quota is used up. It resets at midnight Pacific time |
