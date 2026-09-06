/**
 * Anthropic Native Messages API client.
 *
 * Claude is the primary translation model for this project. Unlike the
 * OpenRouter path (which is used for Llama fallback), Claude is reached via
 * Anthropic's own HTTPS endpoint with an `x-api-key` header and the
 * Anthropic-native request shape:
 *
 *   POST https://api.anthropic.com/v1/messages
 *   Headers:
 *     x-api-key:         <CLAUDE_API_KEY>
 *     anthropic-version:  2023-06-01
 *     content-type:      application/json
 *   Body:
 *     {
 *       model:       "claude-sonnet-5",
 *       system:      "<system prompt as a top-level string>",
 *       messages:    [{ role: "user", content: [{ type: "text", text: "..." }] }],
 *       max_tokens:  5000,
 *       temperature: 0.1
 *     }
 *
 * Why a separate module? Routing Claude through OpenRouter worked locally
 * (tests passed) but in production the OpenRouter endpoint rejected the
 * Anthropic-format `CLAUDE_API_KEY` with HTTP 401. Every 401 silently fell
 * through to the Llama fallback, producing low-quality translations
 * (forbidden "mate" colloquialism, persona flips, lost softeners, invented
 * currency). This module restores Claude to its intended provider.
 */

import { WRONG_LANG_OUTPUT_REGEX } from "./config.js";

/**
 * Anthropic Messages API endpoint.
 */
export const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

/**
 * Anthropic API version. Pinned to a stable date — bump deliberately when
 * we want to opt into a new schema.
 */
export const ANTHROPIC_VERSION = "2023-06-01";

/**
 * Native Anthropic model ID for Claude Sonnet 4.6.
 * NOTE: this is NOT the OpenRouter ID (`anthropic/claude-sonnet-4.6`).
 */
export const ANTHROPIC_CLAUDE_MODEL = "claude-sonnet-5";

/**
 * Maximum tokens we will request in a single Claude call.
 * Mirrors GEN_PARAMS.maxTokens so we can swap providers without changing
 * downstream limits.
 */
export const ANTHROPIC_MAX_TOKENS = 5000;

/**
 * Anthropic Messages API response (the bits we touch).
 * We don't pull in the SDK to keep the bundle small.
 */
interface AnthropicMessagesResponse {
  id?: string;
  type?: string;
  role?: string;
  model?: string;
  stop_reason?: string | null;
  content?: Array<{
    type: string;
    text?: string;
  }>;
  error?: {
    type?: string;
    message?: string;
  };
}

/**
 * Call the Anthropic Messages API directly.
 *
 * Throws on:
 *   - non-2xx HTTP (auth failure, rate limit, server error, …)
 *   - empty / missing content
 *   - wrong-script output (Cyrillic / CJK leakage — applies the same
 *     safety guard used by the OpenRouter path)
 *
 * Returns the trimmed text of the first `text` content block on success.
 *
 * @param text          user message to translate
 * @param systemPrompt  system prompt (top-level `system` field)
 * @param apiKey        Anthropic API key (env var CLAUDE_API_KEY)
 * @param options       { temperature, maxTokens, signal } for the AbortController
 */
export async function callAnthropic(
  text: string,
  systemPrompt: string,
  apiKey: string,
  options: {
    temperature?: number;
    maxTokens?: number;
    signal?: AbortSignal;
  } = {},
): Promise<string> {
  const {
    temperature = 0.1,
    maxTokens = ANTHROPIC_MAX_TOKENS,
    signal,
  } = options;

  if (!apiKey || typeof apiKey !== "string") {
    throw new Error("callAnthropic: apiKey is required");
  }

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: ANTHROPIC_CLAUDE_MODEL,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: [{ type: "text", text }],
        },
      ],
      max_tokens: maxTokens,
      temperature,
    }),
    ...(signal ? { signal } : {}),
  });

  if (!response.ok) {
    // Surface the body so logs show e.g. "401 invalid x-api-key" instead of
    // a bare status code — this is the bug that caused the silent fallback.
    const body = await response.text().catch(() => "");
    throw new Error(
      `Anthropic API error: ${response.status} ${response.statusText}${body ? ` — ${body}` : ""}`,
    );
  }

  const data = (await response.json()) as AnthropicMessagesResponse;

  if (data.error) {
    throw new Error(
      `Anthropic API error: ${data.error.type ?? "unknown"} — ${data.error.message ?? "no message"}`,
    );
  }

  const firstTextBlock = data.content?.find(
    (block) => block.type === "text" && typeof block.text === "string",
  );

  const raw = firstTextBlock?.text?.trim() ?? "";

  if (!raw) {
    throw new Error("Anthropic API returned empty content");
  }

  // Safety guard: reject Cyrillic / CJK leakage (same guard the OpenRouter
  // path applies). If Claude ever returns Russian/Chinese/Japanese/Korean
  // when the target is en-GB / th-TH, throw so the cascade can fall through.
  if (WRONG_LANG_OUTPUT_REGEX.test(raw)) {
    throw new Error(
      "Anthropic output contained wrong-script characters (Cyrillic/CJK)",
    );
  }

  return raw;
}
