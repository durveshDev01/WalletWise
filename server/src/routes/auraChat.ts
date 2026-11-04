import type { IncomingMessage, ServerResponse } from 'node:http';

import { BUSY_MESSAGE, runAgent } from '../agent/agent.ts';
import type { AgentEvent, AuraLanguage, ConversationMessage } from '../agent/agent.ts';
import type { WalletContext } from '../agent/tools.ts';
import { config } from '../config.ts';
import { getLLMClient } from '../llm/index.ts';
import type { LLMClient } from '../llm/index.ts';

/**
 * POST /aura/chat
 * Body:     { messages: [{ role: 'user' | 'assistant', content }], userId, wallet?, language?: 'en' | 'hi', simple?: boolean }
 * Response: newline-delimited JSON (application/x-ndjson), one event per line:
 *           {"type":"status","message":"Comparing your cards…"}
 *           {"type":"text","delta":"Use your "}                    (repeated)
 *           {"type":"cta","cta":{"label","route","params"}}         (optional)
 *           {"type":"done","text":"<full answer>","cta":{...}|null}
 *           {"type":"error","code":"busy|config|failed","message":"…"}
 */

const MAX_BODY_BYTES = 64 * 1024;
const REQUEST_TIMEOUT_MS = 60000;

// Instance-local IP limit. The userId in a request is client supplied and is not an
// authentication credential, so it must not be trusted as an abuse-control identity.
const recent = new Map<string, number[]>();
function allow(userKey: string): boolean {
  const now = Date.now();
  // Keep the map bounded on long-lived local servers. Serverless instances reset it,
  // so production deployments should additionally enforce limits at the gateway.
  if (recent.size > 10_000) {
    for (const [key, hits] of recent) if (!hits.some((t) => now - t < 60000)) recent.delete(key);
  }
  const hits = (recent.get(userKey) ?? []).filter((t) => now - t < 60000);
  if (hits.length >= config.rateLimitPerMinute) {
    recent.set(userKey, hits);
    return false;
  }
  hits.push(now);
  recent.set(userKey, hits);
  return true;
}

function requestKey(req: IncomingMessage) {
  const forwarded = req.headers['x-forwarded-for'];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0];
  return (first?.trim() || req.socket.remoteAddress || 'unknown').slice(0, 128);
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  let size = 0;
  const parts: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new Error('too_large');
    parts.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(parts).toString('utf8'));
}

type ParsedRequest = { userId: string; conversation: ConversationMessage[]; wallet: WalletContext; language: AuraLanguage; simple: boolean };

/** Validates the body and keeps only what the agent needs. */
export function parseChatRequest(body: unknown): ParsedRequest | string {
  if (!body || typeof body !== 'object') return 'Body must be a JSON object';
  const b = body as Record<string, unknown>;
  if (typeof b.userId !== 'string' || !b.userId.trim() || b.userId.length > 100) return 'userId is required';
  if (!Array.isArray(b.messages) || b.messages.length === 0) return 'messages must be a non-empty array';

  const conversation = b.messages
    .filter((m): m is ConversationMessage => !!m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim().length > 0)
    .map((m) => ({ role: m.role, content: m.content.slice(0, config.maxMessageChars) }))
    // Last N turns (a turn is a user message and the reply).
    .slice(-config.maxTurns * 2);
  if (conversation.length === 0 || conversation[conversation.length - 1].role !== 'user') return 'The last message must be from the user';

  // Optional reply settings; English and full answers when missing.
  if (b.language !== undefined && b.language !== 'en' && b.language !== 'hi') return 'language must be "en" or "hi"';
  if (b.simple !== undefined && typeof b.simple !== 'boolean') return 'simple must be true or false';

  const w = (b.wallet ?? {}) as Record<string, unknown>;
  const cards = Array.isArray(w.cards)
    ? w.cards
        .filter((c): c is { catalogId: string; points: unknown } => !!c && typeof (c as { catalogId?: unknown }).catalogId === 'string')
        .slice(0, 30)
        .map((c) => ({ catalogId: c.catalogId, points: Math.max(0, Number(c.points) || 0) }))
    : [];
  const profile = (w.profile && typeof w.profile === 'object' ? w.profile : undefined) as WalletContext['profile'];

  return { userId: b.userId, conversation, wallet: { cards, profile }, language: b.language === 'hi' ? 'hi' : 'en', simple: b.simple === true };
}

export async function handleAuraChat(
  req: IncomingMessage,
  res: ServerResponse,
  options: { llm?: LLMClient } = {},
): Promise<void> {
  let body: unknown;
  try {
    body = await readJson(req);
  } catch (error) {
    const tooLarge = error instanceof Error && error.message === 'too_large';
    res.writeHead(tooLarge ? 413 : 400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: tooLarge ? 'Request too large' : 'Invalid JSON' }));
    return;
  }

  const parsed = parseChatRequest(body);
  if (typeof parsed === 'string') {
    res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: parsed }));
    return;
  }
  if (!allow(requestKey(req))) {
    res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '60' }).end(JSON.stringify({ error: BUSY_MESSAGE }));
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no',
  });
  const send = (event: AgentEvent) => res.write(`${JSON.stringify(event)}\n`);

  // Stop the model when the app disconnects or the answer takes too long.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  res.on('close', () => controller.abort());

  try {
    const llm = options.llm ?? getLLMClient();
    for await (const event of runAgent(llm, parsed.conversation, parsed.wallet, { signal: controller.signal, language: parsed.language, simple: parsed.simple })) {
      if (res.writableEnded) break;
      send(event);
    }
    if (controller.signal.aborted && !res.writableEnded && !res.destroyed) {
      send({ type: 'error', code: 'busy', message: BUSY_MESSAGE });
    }
  } catch (error) {
    console.error('[aura] setup error:', error instanceof Error ? error.message : error);
    send({ type: 'error', code: 'config', message: 'Aura is not set up on the server yet. Please try again later.' });
  } finally {
    clearTimeout(timer);
    if (!res.writableEnded) res.end();
  }
}
