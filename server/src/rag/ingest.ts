/**
 * Builds the card knowledge index.
 *
 *   cd server
 *   npm run chroma     # in one terminal: local Chroma on port 8000
 *   npm run ingest     # in another: embeds and stores all documents
 *
 * Re-run after `npm run build:data` in the app, or after editing any file in server/knowledge.
 *
 * For Vercel (Gemini embeddings, no Chroma), from the project folder:
 *   EMBEDDINGS_PROVIDER=gemini VECTOR_STORE=file npm run aura:ingest
 * then commit server/index/knowledge-index.gemini.json.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { catalog } from '../../../src/data/catalog';
import { packChunks } from './chunk.ts';
import { collectChunks } from './documents.ts';
import { config } from '../config.ts';
import { embed } from './embeddings.ts';
import { writeLocalIndex } from './localIndex.ts';
import { resetCollection, upsertChunks } from './store.ts';

const EMBED_BATCH = 32;
/**
 * Gemini's free tier allows 1,000 embedding requests a day per model, and each chunk is
 * one request. Packing neighbouring chunks of a card to ~1,200 characters gives under 600
 * pieces, leaving room for the day's questions.
 */
const GEMINI_PACK_CHARS = 1200;

/**
 * Vectors already computed, by model and text, so a run stopped by an API quota resumes
 * where it left off instead of starting again.
 */
const CACHE_FILE = fileURLToPath(new URL('../../.cache/embeddings-cache.json', import.meta.url));
const cacheKey = (text: string) => createHash('sha1').update(`${config.embeddingsModel}|${config.embeddingsDimensions}|${text}`).digest('hex');

function loadCache(): Record<string, number[]> {
  try {
    return existsSync(CACHE_FILE) ? (JSON.parse(readFileSync(CACHE_FILE, 'utf8')) as Record<string, number[]>) : {};
  } catch {
    return {};
  }
}

function saveCache(cache: Record<string, number[]>) {
  mkdirSync(dirname(CACHE_FILE), { recursive: true });
  writeFileSync(CACHE_FILE, JSON.stringify(cache));
}

/** API embedders hit per-minute quotas on large runs: wait a minute and try again. */
async function embedPatiently(texts: string[]): Promise<number[][]> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await embed(texts, 'document');
    } catch (error) {
      if (!String(error).includes('(429)') || attempt >= 30) throw error;
      process.stdout.write(`\nQuota reached; waiting a minute (attempt ${attempt})…\n`);
      await new Promise((r) => setTimeout(r, 60000));
    }
  }
}

async function main() {
  const started = Date.now();
  const chunks = config.embeddingsProvider === 'gemini' ? packChunks(collectChunks(), GEMINI_PACK_CHARS) : collectChunks();
  console.log(`Prepared ${chunks.length} chunks from ${catalog.cards.length} cards plus seed and general docs.`);

  console.log(
    config.embeddingsProvider === 'local' ? 'Loading the embedding model (first run downloads it)…' : `Embedding with ${config.embeddingsProvider} (${config.embeddingsModel})…`,
  );
  // The local model has no quota, so only API embedders use the resume cache.
  const useCache = config.embeddingsProvider !== 'local';
  const cache = useCache ? loadCache() : {};
  const vectors: number[][] = [];
  for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
    const texts = chunks.slice(i, i + EMBED_BATCH).map((c) => c.text);
    const cached = texts.map((t) => cache[cacheKey(t)]);
    if (cached.every(Boolean)) {
      vectors.push(...cached);
    } else {
      const fresh = await embedPatiently(texts);
      vectors.push(...fresh);
      if (useCache) {
        texts.forEach((t, j) => (cache[cacheKey(t)] = fresh[j]));
        saveCache(cache);
      }
    }
    process.stdout.write(`\rEmbedded ${Math.min(i + EMBED_BATCH, chunks.length)}/${chunks.length}`);
  }
  process.stdout.write('\n');

  const records = chunks.map((c, i) => ({
    id: c.id,
    text: c.text,
    embedding: vectors[i],
    metadata: { cardId: c.meta.cardId, cardName: c.meta.cardName, bank: c.meta.bank, section: c.section, last_updated: c.meta.last_updated, source: c.meta.source },
  }));

  // The index file always gets written, so search works even without Chroma.
  writeLocalIndex(records, config.embeddingsModel);
  console.log(`Wrote the index file ${relative(process.cwd(), config.knowledgeIndexFile)}.`);
  if (config.vectorStore === 'file') return;

  try {
    await resetCollection();
    await upsertChunks(records);
    console.log(`Stored ${chunks.length} chunks in Chroma in ${Math.round((Date.now() - started) / 1000)} s.`);
  } catch (error) {
    const message = error instanceof Error ? error.message.split('.')[0] : String(error);
    if (/ECONNREFUSED|fetch failed|connect/i.test(message)) {
      console.warn(`Chroma is not reachable (${message}). Aura will use the backup index file. Start Chroma with: npm run aura:chroma, then run ingest again.`);
    } else {
      console.error(`Chroma did not accept the chunks (${message}). Fix the problem and run ingest again; until then Chroma search may be empty.`);
      process.exitCode = 1;
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  if (/ECONNREFUSED|fetch failed|connect/i.test(String(error))) console.error('Is Chroma running? Start it with: npm run chroma');
  process.exit(1);
});
