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
  buildSystemPrompt,
  appendHermesDirectives,
} from "../src/core/config.js";
import { hasThaiText, cleanTextForTranslation } from "../src/core/utils.js";

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

const TIMEOUT_MS = 15000; // Per-chunk timeout (under Vercel's 30s maxDuration)
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
 * Translate using profanity pipeline: mask → translate → unmask via Hermes.
 */
async function translateWithPipeline(
  text: string,
  targetLang: string,
  openrouterKey: string,
): Promise<string> {
  const isExplicit = containsExplicitContent(text);
  if (!isExplicit) {
    const result = await translate(text, targetLang, openrouterKey);
    if (result === text) return getErrorMessage(targetLang);
    return result;
  }

  const { maskedText, profanityTokens } = maskProfanity(text);

  // Translate masked (clean) text through the cascade
  const maskedResult = await translate(maskedText, targetLang, openrouterKey);

  if (maskedResult === maskedText) return getErrorMessage(targetLang); // translate failed

  // Translate each profanity token individually through Hermes
  const sourceLangCode = getSourceLangCode(text);
  const targetLangCode = getTargetLangCode(text);
  const hermesSystemContent = appendHermesDirectives(
    buildSystemPrompt(sourceLangCode, targetLangCode),
  );

  const controller = new AbortController();
  const pipelineTimeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const translatedToken = await callOpenRouter(
      profanityTokens.join(" "),
      hermesSystemContent,
      MODELS.PRIMARY,
      "hermes",
      openrouterKey,
      controller,
    );

    const translatedTokens = translatedToken.split(/\s+/);
    let finalText = maskedResult;
    profanityTokens.forEach((_, i) => {
      const marker = `[PROFANITY:${i + 1}]`;
      const translated = translatedTokens[i] || profanityTokens[i];
      finalText = finalText.replace(marker, translated);
    });
    return finalText;
  } catch (e: any) {
    console.error("Pipeline Hermes unmask failed:", e.message);
    return maskedResult;
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
  openrouterKey: string,
): Promise<string> {
  const chunks = splitIntoChunks(text);
  if (chunks.length === 1) {
    // Short message — single call, no chunking overhead
    return translateWithPipeline(text, targetLang, openrouterKey);
  }

  // Translate all chunks in parallel
  const results = await Promise.all(
    chunks.map((chunk) =>
      translateWithPipeline(chunk, targetLang, openrouterKey),
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
 * - Hermes 3 (405B) is the primary provider for ALL content (clean + explicit).
 * - Claude and Gemini serve as clean-content fallbacks.
 * - Per-provider temperature is resolved via getTemperatureForProvider().
 */
function buildRouting(
  text: string,
  targetLang: string,
): {
  model: string;
  systemContent: string;
  provider: "hermes" | "claude" | "gemini";
} {
  const sourceLangCode = getSourceLangCode(text);
  const targetLangCode = getTargetLangCode(text);
  const base = buildSystemPrompt(sourceLangCode, targetLangCode);
  return {
    model: MODELS.PRIMARY,
    systemContent: appendHermesDirectives(base),
    provider: "hermes",
  };
}

async function callOpenRouter(
  text: string,
  systemContent: string,
  model: string,
  provider: "hermes" | "claude" | "gemini",
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
  return trimmed;
}

/**
 * Main translate function with routing:
 * 1. Hermes 3 (OpenRouter, primary for ALL content — clean + explicit)
 * 2. Fallback → Claude Sonnet 5 (OpenRouter, clean content only)
 * 3. Second fallback → Gemini 2.5 Pro (OpenRouter, clean content only)
 *
 * If any provider returns output containing Cyrillic / CJK characters,
 * WRONG_LANG_OUTPUT_REGEX rejects the response and the cascade continues.
 */
async function translate(
  text: string,
  targetLang: string,
  openrouterKey: string,
): Promise<string> {
  if (!isValidString(text)) return text;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const { model, systemContent, provider } = buildRouting(text, targetLang);

    // Primary: Hermes 3 for ALL content (clean + explicit)
    try {
      return await callOpenRouter(
        text,
        systemContent,
        model,
        provider,
        openrouterKey,
        controller,
      );
    } catch (orError: any) {
      console.error("Hermes (primary) failed:", orError.message);
    }

    // Claude and Gemini only handle clean content
    const isExplicit = containsExplicitContent(text);
    if (isExplicit) {
      console.error(
        "Hermes failed for explicit content, no clean-content fallback available",
      );
      return text;
    }

    const sourceLangCode = getSourceLangCode(text);
    const targetLangCode = getTargetLangCode(text);
    const basePrompt = buildSystemPrompt(sourceLangCode, targetLangCode);

    // Fallback: Claude Sonnet 5 via OpenRouter
    try {
      return await callOpenRouter(
        text,
        basePrompt,
        MODELS.CLAUDE,
        "claude",
        openrouterKey,
        controller,
      );
    } catch (claudeError: any) {
      console.error("Claude fallback failed:", claudeError.message);
    }

    // Second fallback: Gemini 2.5 Pro via OpenRouter
    try {
      return await callOpenRouter(
        text,
        basePrompt,
        MODELS.GEMINI,
        "gemini",
        openrouterKey,
        controller,
      );
    } catch (geminiError: any) {
      console.error("Gemini failed:", geminiError.message);
    }

    console.error("All translation providers failed");
    return text;
  } catch (e: any) {
    console.error("Translation error:", e.message);
    return text;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    const channelSecret = process.env.CHANNEL_SECRET || "";
    const channelAccessToken = process.env.CHANNEL_ACCESS_TOKEN || "";
    const openrouterKey = process.env.OPENROUTER_API_KEY || "";

    if (!channelSecret || !channelAccessToken || !openrouterKey) {
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
