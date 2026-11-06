/**
 * Server settings, all from environment variables (see ../.env.example).
 * The Groq key is read here only; it never reaches the phone app.
 */
import { fileURLToPath } from 'node:url';

const num = (value: string | undefined, fallback: number) => {
  const n = Number(value?.trim());
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const str = (value: string | undefined, fallback = '') => (value ?? fallback).trim();

const embeddingsProvider = str(process.env.EMBEDDINGS_PROVIDER, 'local').toLowerCase();
const gemini = embeddingsProvider === 'gemini';
// Measured with gemini-embedding-001: off-topic questions score about 0.50, card questions 0.6 and up.
const GEMINI_MIN_SCORE = 0.58;

export const config = {
  port: num(process.env.AURA_PORT, 8787),
  host: str(process.env.AURA_HOST, '0.0.0.0'),

  /** Which LLM implementation to use. Only "groq" exists today. */
  llmProvider: str(process.env.LLM_PROVIDER, 'groq').toLowerCase(),
  groqApiKey: str(process.env.GROQ_API_KEY),
  groqModel: str(process.env.GROQ_MODEL),
  temperature: 0.1,
  /** Retries after a rate limit (429), timeout or 5xx, with exponential backoff. */
  llmMaxRetries: 2,
  llmTimeoutMs: num(process.env.LLM_TIMEOUT_MS, 30000),
  /** Model calls allowed per answer before Aura must reply with what it has. */
  maxToolIterations: 4,

  /**
   * Which embedding implementation to use: "local" (all-MiniLM-L6-v2 on this computer,
   * the default) or "gemini" (Gemini API, used on Vercel where the local model is too big).
   */
  embeddingsProvider,
  embeddingsModel: str(process.env.EMBEDDINGS_MODEL, gemini ? 'gemini-embedding-001' : 'Xenova/all-MiniLM-L6-v2'),
  /** Vector length requested from Gemini (768 is one of Google's recommended sizes). */
  embeddingsDimensions: num(process.env.EMBEDDINGS_DIMENSIONS, 768),
  geminiApiKey: str(process.env.GEMINI_API_KEY),

  /**
   * "chroma" (default): Chroma, with the index file as a backup when Chroma is down.
   * "file": only the index file written by ingest (used on Vercel, no database needed).
   */
  vectorStore: str(process.env.VECTOR_STORE, 'chroma').toLowerCase(),
  /**
   * Index file written by ingest. Each embeddings provider has its own file, because
   * vectors from different models cannot be compared. The Gemini one is committed to git
   * so Vercel can serve it; the local one is rebuilt on each computer.
   */
  knowledgeIndexFile:
    process.env.KNOWLEDGE_INDEX_FILE ??
    fileURLToPath(new URL(gemini ? '../index/knowledge-index.gemini.json' : '../.cache/knowledge-index.json', import.meta.url)),

  chromaHost: process.env.CHROMA_HOST ?? 'localhost',
  chromaPort: num(process.env.CHROMA_PORT, 8000),
  chromaCollection: process.env.CHROMA_COLLECTION ?? (gemini ? 'walletwise_cards_gemini' : 'walletwise_cards'),
  /** Cosine similarity below this means "no confident match" (scores depend on the model). */
  ragMinScore: num(process.env.RAG_MIN_SCORE, gemini ? GEMINI_MIN_SCORE : 0.35),
  ragTopK: 5,

  /** Chat requests allowed per user per minute. */
  rateLimitPerMinute: num(process.env.AURA_RATE_LIMIT_PER_MIN, 20),
  /** Conversation turns sent to the model (one turn = a user and an assistant message). */
  maxTurns: 6,
  maxMessageChars: 2000,
} as const;
