import { LineBotClient } from "@line/bot-sdk";
import {
  englishExplicit,
  thaiExplicit,
  containsExplicitContent,
  MODELS,
  GEN_PARAMS,
  getTemperatureForProvider,
  OPENROUTER_API_URL,
  WRONG_LANG_OUTPUT_REGEX,
  validateOutputScript,
  buildSystemPrompt,
  getSystemPromptForProvider,
} from "../src/core/config.js";
import { hasThaiText, cleanTextForTranslation } from "../src/core/utils.js";
import { callAnthropic, ANTHROPIC_MAX_TOKENS } from "../src/core/anthropic.js";

interface LineEvent {
  replyToken?: string;
  type: string;
  timestamp: number;
  message?: { type?: string; id?: string; text?: string };
  source?: { type?: string; groupId?: string; userId?: string };
}

interface WebhookRequestBody {
  events: LineEvent[];
  challenge?: string;
}

// Per-call timeout. Vercel's maxDuration is 30s (see vercel.json), so we
// leave a 5s safety margin. Anthropic Claude's documented P95 latency on
// en→th is ~14s — 15s was too tight and forced spurious fallbacks to Llama
// in production. 25s comfortably covers Claude without exhausting Vercel's
// budget, so legitimate slow calls complete instead of being killed mid-flight.
const TIMEOUT_MS = 25000;
const CHUNK_THRESHOLD = 600; // Split messages above this length into independent chunks
const MAX_REPLY_CHARS = 4500; // LINE text message limit (safe buffer under 5000)

// ── Language code helpers (mirrors src/translation/translator.ts) ───────────
// Internal codes: 'en' | 'th'
// Prompt-boundary codes (BCP-47): 'en-GB' | 'th-TH'

function getTargetLangCode(text: string): "en" | "th" {
  return hasThaiText(text) ? "en" : "th";
}

function getSourceLangCode(text: string): "en" | "th" {
  return hasThaiText(text) ? "th" : "en";
}

function isTargetEnglish(text: string): boolean {
  return hasThaiText(text);
}

// ── Helper wrappers (imported from src/core to avoid duplication) ──

function isValidString(str: string | undefined): str is string {
  return typeof str === "string" && str.length > 0 && str.length <= 8000;
}

function isThai(text: string): boolean {
  return hasThaiText(text);
}

function cleanText(text: string): string {
  return cleanTextForTranslation(text).substring(0, 8000);
}

/**
 * Split long text into independent chunks for parallel translation.
 * English text is split at sentence boundaries; Thai/mixed text at newlines.
 */
function splitIntoChunks(text: string): string[] {
  if (text.length <= CHUNK_THRESHOLD) return [text];

  // Thai doesn't use period-based sentence boundaries — split by newlines
  // English: also split by sentence-ending punctuation
  const useSentenceSplit = !hasThaiText(text);
  const separator = useSentenceSplit ? /\n+|\r+|[.!?]+\s+/ : /\n+|\r+/;

  const parts = text.split(separator).filter((p) => p.trim().length > 0);
  if (parts.length <= 1) return [text]; // Cannot split meaningfully

  const chunks: string[] = [];
  let current = "";

  for (const part of parts) {
    const addition = current ? (useSentenceSplit ? ". " : " ") + part : part;
    if (
      current.length + addition.length > CHUNK_THRESHOLD &&
      current.trim().length > 0
    ) {
      chunks.push(current.trim());
      current = part;
    } else {
      current += addition;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  return chunks.length > 0 ? chunks : [text];
}

/**
 * Return a user-facing error message in the appropriate language.
 */
function getErrorMessage(targetLang: string): string {
  return targetLang === "English"
    ? "⚠️ Translation failed — try a shorter message."
    : "⚠️ การแปลล้มเหลว — กรุณาลองส่งข้อความสั้นลง";
}

/**
 * Profanity preprocessing pipeline — masks explicit content before translation.
 * Ensures Claude/Gemini never see profanity even as fallback providers.
 */
function maskProfanity(text: string): {
  maskedText: string;
  profanityTokens: string[];
} {
  const tokens: string[] = [];

  // English: token-by-token masking
  const words = text.split(/(\s+)/);
  const maskedWords = words.map((word) => {
    if (englishExplicit.test(word)) {
      tokens.push(word);
      return `[PROFANITY:${tokens.length}]`;
    }
    return word;
  });

  let maskedText = maskedWords.join("");

  // Thai: regex-replace explicit terms with markers
  let thaiMatch: RegExpExecArray | null;
  const thaiRegex = new RegExp(thaiExplicit.source, "g");
  while ((thaiMatch = thaiRegex.exec(maskedText)) !== null) {
    const token = thaiMatch[0];
    tokens.push(token);
    maskedText = maskedText.replace(token, `[PROFANITY:${tokens.length}]`);
    thaiRegex.lastIndex = 0;
  }

  return { maskedText, profanityTokens: tokens };
}

/**
 * Translate using profanity pipeline: mask → translate → unmask via Claude.
 *
 * Numbers, codes, and other untranslatable tokens (e.g. "1300", "255/65 R17
 * 110H") are returned VERBATIM by the model — we treat that as a successful
 * translation, not a failure, because the model legitimately has nothing to
 * translate.
 */
async function translateWithPipeline(
  text: string,
  targetLang: string,
  claudeKey: string,
  openrouterKey: string,
): Promise<string> {
  const isExplicit = containsExplicitContent(text);
  if (!isExplicit) {
    const result = await translate(text, targetLang, claudeKey, openrouterKey);
    if (!result.ok) return getErrorMessage(targetLang);
    return result.text;
  }

  const { maskedText, profanityTokens } = maskProfanity(text);

  // Translate masked (clean) text through the cascade
  const maskedResult = await translate(maskedText, targetLang, claudeKey, openrouterKey);

  if (!maskedResult.ok) return getErrorMessage(targetLang); // cascade failed

  // If the cascade succeeded but didn't preserve our markers (e.g. the
  // fallback provider translated them), return the masked translation
  // verbatim rather than showing the user a raw error.
  let finalText = maskedResult.text;
  for (let i = 0; i < profanityTokens.length; i++) {
    const marker = `[PROFANITY:${i + 1}]`;
    if (!finalText.includes(marker)) {
      return finalText;
    }
  }

  // Translate each profanity token individually through the native Anthropic API
  // (Claude is the primary model and handles ALL content, including explicit).
  const sourceLangCode = getSourceLangCode(text);
  const targetLangCode = getTargetLangCode(text);
  const claudeSystemContent = buildSystemPrompt(sourceLangCode, targetLangCode);

  const controller = new AbortController();
  const pipelineTimeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const translatedToken = await callAnthropic(
      profanityTokens.join(" "),
      claudeSystemContent,
      claudeKey,
      {
        temperature: getTemperatureForProvider("claude"),
        maxTokens: ANTHROPIC_MAX_TOKENS,
        signal: controller.signal,
      },
    );

    const translatedTokens = translatedToken.split(/\s+/);
    profanityTokens.forEach((_, i) => {
      const marker = `[PROFANITY:${i + 1}]`;
      const translated = translatedTokens[i] || profanityTokens[i];
      finalText = finalText.replace(marker, translated);
    });
    return finalText;
  } catch (e: any) {
    console.error("Pipeline Anthropic unmask failed:", e.message);
    return finalText;
  } finally {
    clearTimeout(pipelineTimeoutId);
  }
}

/**
 * Translate text by splitting long messages into independent chunks.
 * Chunks are translated in parallel for speed, each with its own timeout.
 * If any chunk fails, the user gets a clear error message instead of stale/echoed text.
 */
async function translateChunked(
  text: string,
  targetLang: string,
  claudeKey: string,
  openrouterKey: string,
): Promise<string> {
  const chunks = splitIntoChunks(text);
  if (chunks.length === 1) {
    // Short message — single call, no chunking overhead
    return translateWithPipeline(text, targetLang, claudeKey, openrouterKey);
  }

  // Translate all chunks in parallel
  const results = await Promise.all(
    chunks.map((chunk) =>
      translateWithPipeline(chunk, targetLang, claudeKey, openrouterKey),
    ),
  );

  // Check for failures (error messages start with ⚠️)
  const failed = results.find((r) => r.startsWith("⚠️"));
  if (failed) {
    return failed; // Return the first error message
  }

  // Rejoin chunks preserving original sentence/paragraph flow
  const joined = results.join("\n");
  return joined.length > MAX_REPLY_CHARS
    ? joined.substring(0, MAX_REPLY_CHARS) + "..."
    : joined;
}

/**
 * Build the system prompt + model for a given chunk.
 * - Claude Sonnet 4.6 is the primary provider for ALL content.
 * - Llama 3.3 70B serves as fallback.
 * - Per-provider temperature is resolved via getTemperatureForProvider().
 */
/**
 * Build the system prompt for a given chunk.
 * - Claude Sonnet 4.6 is the primary provider for ALL content.
 * - Llama 3.3 70B serves as fallback.
 * - Per-provider temperature is resolved via getTemperatureForProvider().
 *
 * NOTE: We no longer need to return a model id here. Claude uses the
 * native Anthropic API (model baked into callAnthropic()), and Llama uses
 * MODELS.LLAMA inside the OpenRouter call.
 */
function buildRouting(
  text: string,
): {
  systemContent: string;
} {
  const sourceLangCode = getSourceLangCode(text);
  const targetLangCode = getTargetLangCode(text);
  const base = buildSystemPrompt(sourceLangCode, targetLangCode);
  return { systemContent: base };
}

async function callOpenRouter(
  text: string,
  systemContent: string,
  model: string,
  provider: "claude" | "llama",
  apiKey: string,
  controller: AbortController,
): Promise<string> {
  const res = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + apiKey,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://line-translation-bot.vercel.app",
      "X-OpenRouter-Title": "LINE Translation Bot",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemContent },
        { role: "user", content: text },
      ],
      temperature: getTemperatureForProvider(provider),
      top_p: GEN_PARAMS.topP,
      max_tokens: GEN_PARAMS.maxTokens,
      moderation: "false",
    }),
    signal: controller.signal,
  });

  if (!res.ok) {
    throw new Error(`OpenRouter HTTP ${res.status}`);
  }

  const data = (await res.json()) as any;
  const content = data.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("No content in OpenRouter response");
  }
  const trimmed = content.trim();
  // Safety guard: reject Cyrillic / CJK leakage (wrong script for en-GB / th-TH)
  if (WRONG_LANG_OUTPUT_REGEX.test(trimmed)) {
    throw new Error(
      "OpenRouter output contained wrong-script characters (Cyrillic/CJK)",
    );
  }
  // Catch hallucinated words in the wrong script that the Cyrillic/CJK
  // guard misses (e.g. "yokewise" embedded in Thai). Legitimate preserved
  // tokens (names, codes, URLs, [PROFANITY:N] markers) are allowed
  // through because they appear in the source.
  const scriptError = validateOutputScript(trimmed, text, getTargetLangCode(text));
  if (scriptError) {
    throw new Error(`OpenRouter output failed script validation: ${scriptError}`);
  }
  return trimmed;
}


/**
 * Result of a single translation call. Wrapping the output in an object
 * lets callers distinguish "model returned the same text because the input
 * was untranslatable" (e.g. "1300", "255/65 R17 110H") from "all providers
 * failed and we echoed the input as a fallback" — without this distinction
 * the user-facing error message is triggered for legitimate pass-throughs.
 */
interface TranslateResult {
  text: string;
  ok: boolean;
}

/**
 * Main translate function with routing:
 * 1. Claude Sonnet 4.6 via the Anthropic native Messages API
 *    (CLAUDE_API_KEY, model `claude-sonnet-4-6`) — primary for ALL content.
 * 2. Fallback → Llama 3.3 70B via OpenRouter (OPENROUTER_API_KEY).
 *
 * If any provider returns output containing Cyrillic / CJK characters,
 * WRONG_LANG_OUTPUT_REGEX rejects the response and the cascade continues.
 * Returns `{ text, ok: true }` on success (text may equal the input for
 * untranslatable tokens) and `{ text, ok: false }` when every provider
 * failed.
 */
async function translate(
  text: string,
  targetLang: string,
  claudeKey: string,
  openrouterKey: string,
): Promise<TranslateResult> {
  if (!isValidString(text)) {
    return { text, ok: false };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const { systemContent } = buildRouting(text);

    // Primary: Claude Sonnet 4.6 via the Anthropic native Messages API.
    // This replaces the previous (broken) OpenRouter-for-Claude path,
    // which silently fell through to Llama in production because
    // OpenRouter rejects Anthropic-format API keys with HTTP 401.
    try {
      const out = await callAnthropic(text, systemContent, claudeKey, {
        temperature: getTemperatureForProvider("claude"),
        maxTokens: ANTHROPIC_MAX_TOKENS,
        signal: controller.signal,
      });
      return { text: out, ok: true };
    } catch (anthropicError: any) {
      console.error("Anthropic (primary) failed:", anthropicError.message);
    }

    // Fallback: Llama 3.3 70B via OpenRouter. Uses the shorter,
    // Llama-tuned prompt from model-guides/llama-quick-reference.md (rather
    // than the full 12-rule Claude prompt), plus the production safety
    // appendix (OUTPUT LANGUAGE LOCK + placeholder marker preservation).
    const sourceLangCode = getSourceLangCode(text);
    const targetLangCode = getTargetLangCode(text);
    const llamaPrompt = getSystemPromptForProvider(
      "llama",
      sourceLangCode,
      targetLangCode,
    );

    try {
      const out = await callOpenRouter(
        text,
        llamaPrompt,
        MODELS.LLAMA,
        "llama",
        openrouterKey,
        controller,
      );
      return { text: out, ok: true };
    } catch (llamaError: any) {
      console.error("Llama fallback failed:", llamaError.message);
    }

    console.error("All translation providers failed");
    return { text, ok: false };
  } catch (e: any) {
    console.error("Translation error:", e.message);
    return { text, ok: false };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    const channelSecret = process.env.CHANNEL_SECRET || "";
    const channelAccessToken = process.env.CHANNEL_ACCESS_TOKEN || "";
    const claudeKey = process.env.CLAUDE_API_KEY || "";
    const openrouterKey = process.env.OPENROUTER_API_KEY || "";

    if (!channelSecret || !channelAccessToken || !claudeKey || !openrouterKey) {
      return new Response(JSON.stringify({ error: "Config error" }), {
        status: 500,
      });
    }

    const bodyString = await req.text();
    if (!bodyString || bodyString.length === 0 || bodyString.length > 1000000) {
      return new Response("Invalid body", { status: 400 });
    }

    let body: WebhookRequestBody;
    try {
      body = JSON.parse(bodyString);
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    if (body.challenge) {
      return new Response(JSON.stringify({ challenge: body.challenge }), {
        status: 200,
      });
    }

    const events = body.events || [];
    if (!Array.isArray(events) || events.length === 0) {
      return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
    }

    const client = LineBotClient.fromChannelAccessToken({ channelAccessToken });

    for (const event of events) {
      if (event.type !== "message") continue;
      if (!event.message?.text) continue;
      if (!event.source?.groupId || !event.source?.userId) continue;
      if (!event.replyToken) continue;
      const text = cleanText(event.message.text);
      if (!isValidString(text)) continue;

      // Guard against excessively long messages that would exceed LINE's reply limit
      if (text.length > MAX_REPLY_CHARS) {
        await client.replyMessage({
          replyToken: event.replyToken,
          messages: [
            {
              type: "text",
              text: getErrorMessage(isThai(text) ? "English" : "Thai"),
            },
          ],
        });
        continue;
      }

      const targetLang = isTargetEnglish(text) ? "English" : "Thai";
      const translated = await translateChunked(
        text,
        targetLang,
        claudeKey,
        openrouterKey,
      );

      await client.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: "text", text: translated }],
      });
    }

    return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
  } catch (e: any) {
    return new Response(JSON.stringify({ status: "error" }), { status: 200 });
  }
}

export async function GET(): Promise<Response> {
  return new Response(
    JSON.stringify({ status: "alive", service: "line-translation-bot" }),
    { status: 200 },
  );
}
