import Groq, {
  APIConnectionError,
  APIConnectionTimeoutError,
  AuthenticationError,
  InternalServerError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
} from 'groq-sdk';

import { config } from '../config.ts';
import { LLMBusyError, LLMConfigError, withBackoff } from './LLMClient.ts';
import type { ChatMessage, ChatOptions, LLMClient, LLMStreamEvent, ToolCall, ToolDefinition } from './LLMClient.ts';

/** Groq chat completions (OpenAI-compatible) with tool calling and streaming. */
export class GroqClient implements LLMClient {
  private readonly client: Groq;
  private readonly model: string;

  constructor() {
    if (!config.groqApiKey) throw new LLMConfigError('GROQ_API_KEY is not set on the server');
    if (!config.groqModel) throw new LLMConfigError('GROQ_MODEL is not set on the server');
    // Retries are done by withBackoff so every provider behaves the same.
    this.client = new Groq({ apiKey: config.groqApiKey, maxRetries: 0, timeout: config.llmTimeoutMs });
    this.model = config.groqModel;
  }

  async *chat(messages: ChatMessage[], tools: ToolDefinition[], options: ChatOptions = {}): AsyncIterable<LLMStreamEvent> {
    let stream;
    try {
      stream = await withBackoff(
        () =>
          this.client.chat.completions.create(
            {
              model: this.model,
              messages: messages.map(toGroqMessage),
              temperature: config.temperature,
              stream: true,
              ...(tools.length > 0
                ? {
                    tools: tools.map((t) => ({ type: 'function' as const, function: { name: t.name, description: t.description, parameters: t.parameters } })),
                    tool_choice: options.toolChoice ?? 'auto',
                  }
                : {}),
            },
            { signal: options.signal },
          ),
        isRetryable,
        config.llmMaxRetries,
        options.signal,
      );
    } catch (error) {
      if (error instanceof NotFoundError && this.model !== 'openai/gpt-oss-120b') {
        // Fallback to active model if configured model name is deprecated or missing
        try {
          stream = await this.client.chat.completions.create(
            {
              model: 'openai/gpt-oss-120b',
              messages: messages.map(toGroqMessage),
              temperature: config.temperature,
              stream: true,
              ...(tools.length > 0
                ? {
                    tools: tools.map((t) => ({ type: 'function' as const, function: { name: t.name, description: t.description, parameters: t.parameters } })),
                    tool_choice: options.toolChoice ?? 'auto',
                  }
                : {}),
            },
            { signal: options.signal },
          );
        } catch (innerErr) {
          throw mapError(innerErr);
        }
      } else {
        throw mapError(error);
      }
    }

    // Tool calls arrive in pieces (by index) and are only complete at the end of the stream.
    const partial = new Map<number, ToolCall>();
    try {
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (!delta) continue;
        if (delta.content) yield { type: 'text', delta: delta.content };
        for (const tc of delta.tool_calls ?? []) {
          const current = partial.get(tc.index) ?? { id: '', name: '', arguments: '' };
          if (tc.id) current.id = tc.id;
          if (tc.function?.name) current.name += tc.function.name;
          if (tc.function?.arguments) current.arguments += tc.function.arguments;
          partial.set(tc.index, current);
        }
      }
    } catch (error) {
      throw mapError(error);
    }

    if (partial.size > 0) {
      yield { type: 'tool_calls', calls: [...partial.entries()].sort(([a], [b]) => a - b).map(([, c]) => c) };
    }
    yield { type: 'done' };
  }
}

function toGroqMessage(m: ChatMessage): Groq.Chat.ChatCompletionMessageParam {
  switch (m.role) {
    case 'system':
    case 'user':
      return { role: m.role, content: m.content };
    case 'assistant':
      return m.toolCalls?.length
        ? {
            role: 'assistant',
            content: m.content || null,
            tool_calls: m.toolCalls.map((c) => ({ id: c.id, type: 'function' as const, function: { name: c.name, arguments: c.arguments } })),
          }
        : { role: 'assistant', content: m.content };
    case 'tool':
      return { role: 'tool', tool_call_id: m.toolCallId, content: m.content };
  }
}

const isRetryable = (e: unknown) => e instanceof RateLimitError || e instanceof APIConnectionTimeoutError || e instanceof InternalServerError;

function mapError(e: unknown): Error {
  if (e instanceof AuthenticationError || e instanceof PermissionDeniedError) return new LLMConfigError('Groq rejected the API key');
  if (e instanceof NotFoundError) return new LLMConfigError(`Groq model "${config.groqModel}" was not found`);
  if (e instanceof RateLimitError || e instanceof APIConnectionError || e instanceof InternalServerError) return new LLMBusyError();
  return e instanceof Error ? e : new Error(String(e));
}
