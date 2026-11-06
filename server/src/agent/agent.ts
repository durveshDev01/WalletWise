import { readFileSync } from 'node:fs';

import { config } from '../config.ts';
import { LLMBusyError, LLMConfigError } from '../llm/index.ts';
import type { ChatMessage, LLMClient, ToolCall } from '../llm/index.ts';
import { runTool, TOOL_DEFINITIONS } from './tools.ts';
import type { Cta, WalletContext } from './tools.ts';

const SYSTEM_PROMPT = readFileSync(new URL('./aura.system.md', import.meta.url), 'utf8');

export type AuraLanguage = 'en' | 'hi';

const HINDI_RULE = `

## Reply language
- The user chose Hindi. Reply in simple, everyday Hindi in Devanagari script, even if they write in English or Hinglish.
- Keep every ₹ amount as digits with Indian grouping (₹1,50,000). Keep card names, bank names, reward programme names and app screen names in English (for example HDFC Infinia, Axis Bank, Best Card).
- Tool calls stay in English: always write the \`search_card_knowledge\` query in English.`;

const SIMPLE_RULE = `

## Simple answers
- The user turned on simple answers. Reply in at most 3 short sentences: the one most important number from a tool and one clear action.
- No bullet lists, no transfer partners or transfer ratios, no jargon. If a term is needed, explain it in a few plain words.`;

/** The system prompt for one answer, with the user's language and simple-answer rules added. */
export function buildSystemPrompt(today: string, options: { language?: AuraLanguage; simple?: boolean } = {}): string {
  return SYSTEM_PROMPT.replace('{{TODAY}}', today) + (options.language === 'hi' ? HINDI_RULE : '') + (options.simple ? SIMPLE_RULE : '');
}

export type ConversationMessage = { role: 'user' | 'assistant'; content: string };

/** What the agent streams to the route handler (and on to the app). */
export type AgentEvent =
  | { type: 'status'; message: string }
  | { type: 'text'; delta: string }
  | { type: 'cta'; cta: Cta }
  | { type: 'done'; text: string; cta: Cta | null }
  | { type: 'error'; code: 'busy' | 'config' | 'failed'; message: string };

// Short status lines shown under the typing indicator while a tool runs.
const TOOL_STATUS: Record<string, string> = {
  get_user_wallet: 'Checking your wallet…',
  get_best_card: 'Comparing your cards…',
  get_points_value: 'Valuing your points…',
  check_redemption: 'Checking the net redemption value…',
  get_card_updates: 'Checking card updates…',
  plan_trip: 'Planning your trip…',
  search_card_knowledge: 'Looking up card details…',
};

export const BUSY_MESSAGE = 'Aura is busy, please try again in a moment.';

/**
 * Runs one Aura answer: model → tools → model, at most `config.maxToolIterations`
 * model calls. Text is streamed as it arrives. Never throws; failures become an
 * `error` event with a friendly message.
 */
export async function* runAgent(
  llm: LLMClient,
  conversation: ConversationMessage[],
  wallet: WalletContext,
  options: { signal?: AbortSignal; today?: string; language?: AuraLanguage; simple?: boolean } = {},
): AsyncGenerator<AgentEvent> {
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const trimmedConversation = conversation.slice(-config.maxTurns);
  const messages: ChatMessage[] = [{ role: 'system', content: buildSystemPrompt(today, options) }, ...trimmedConversation];

  let cta: Cta | null = null;
  const ctx = { wallet, setCta: (c: Cta) => (cta = c) };
  let answer = '';

  try {
    for (let iteration = 0; iteration < config.maxToolIterations; iteration++) {
      // On the last allowed call the model must answer with what it has.
      const lastCall = iteration === config.maxToolIterations - 1;
      let text = '';
      let calls: ToolCall[] = [];

      for await (const event of llm.chat(messages, TOOL_DEFINITIONS, { toolChoice: lastCall ? 'none' : 'auto', signal: options.signal })) {
        if (event.type === 'text') {
          text += event.delta;
          yield { type: 'text', delta: event.delta };
        } else if (event.type === 'tool_calls') {
          calls = event.calls;
        }
      }
      answer += text;

      if (calls.length === 0) break;

      messages.push({ role: 'assistant', content: text, toolCalls: calls });
      for (const call of calls) {
        if (TOOL_STATUS[call.name]) yield { type: 'status', message: TOOL_STATUS[call.name] };
        const result = await runTool(call.name, call.arguments, ctx);
        // One line per tool call in the server terminal, to see what Aura looked up.
        const parsed = JSON.parse(result) as { ok?: boolean; status?: string; error?: string };
        console.log(`[aura] ${call.name} ${call.arguments.slice(0, 120)} -> ${parsed.ok === false ? `error: ${parsed.error}` : parsed.status ?? 'ok'}`);
        messages.push({ role: 'tool', toolCallId: call.id, name: call.name, content: result });
      }
    }
  } catch (error) {
    if (options.signal?.aborted) return;
    if (error instanceof LLMConfigError) {
      console.error('[aura] configuration error:', error.message);
      yield { type: 'error', code: 'config', message: 'Aura is not set up on the server yet. Please try again later.' };
    } else if (error instanceof LLMBusyError) {
      yield { type: 'error', code: 'busy', message: BUSY_MESSAGE };
    } else {
      console.error('[aura] agent failed:', error);
      yield { type: 'error', code: 'failed', message: 'Something went wrong. Please try again.' };
    }
    return;
  }

  // Some models write a tool call as text ({{show_app_screen({...})}}) instead of calling it.
  // Run a written show_app_screen so the button still appears, and strip every such call from the answer.
  const written = findWrittenToolCalls(answer);
  for (const call of written.calls) {
    if (call.name === 'show_app_screen' && !cta) await runTool(call.name, call.arguments, ctx);
  }
  answer = written.text;

  if (cta) yield { type: 'cta', cta };
  yield { type: 'done', text: answer.trim(), cta };
}

const WRITTEN_CALL = /\{\{\s*([a-z_]+)\s*\(\s*(\{[\s\S]*?\})?\s*\)\s*\}\}|<function=([a-z_]+)>\s*(\{[\s\S]*?\})?\s*<\/function>/g;

/** Tool calls the model wrote into its answer as text, and the answer without them. */
export function findWrittenToolCalls(text: string): { text: string; calls: { name: string; arguments: string }[] } {
  const calls: { name: string; arguments: string }[] = [];
  const cleaned = text.replace(WRITTEN_CALL, (_m, name1?: string, args1?: string, name2?: string, args2?: string) => {
    calls.push({ name: (name1 ?? name2) as string, arguments: args1 ?? args2 ?? '{}' });
    return '';
  });
  return { text: calls.length ? cleaned.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n') : text, calls };
}
