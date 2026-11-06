/**
 * Request routing shared by the local server (./index.ts) and the Vercel function
 * (./vercel.ts): GET /health and POST /aura/chat, with CORS.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';

import { config } from './config.ts';
import { handleAuraChat } from './routes/auraChat.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept',
};

export async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  for (const [k, v] of Object.entries(CORS)) res.setHeader(k, v);
  const path = (req.url ?? '/').split('?')[0];

  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }
  if (req.method === 'GET' && (path === '/health' || path === '/')) {
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(
      JSON.stringify({
        ok: true,
        llm: config.llmProvider,
        model: config.groqModel || null,
        groqKeySet: !!config.groqApiKey,
        embeddings: config.embeddingsProvider,
        embeddingsKeySet: config.embeddingsProvider === 'gemini' ? !!config.geminiApiKey : undefined,
        vectorStore: config.vectorStore,
      }),
    );
    return;
  }
  if (req.method === 'POST' && path === '/aura/chat') {
    await handleAuraChat(req, res);
    return;
  }
  res.writeHead(404, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'Not found' }));
}
