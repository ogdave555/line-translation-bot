/**
 * Shared Translation Cascade
 *
 * This module contains the core provider cascade logic that is shared
 * between the Vercel webhook (api/webhook.ts) and the LINE Bot SDK
 * (src/bot/). Both import from here so there is one place to fix
 * when the cascade logic changes.
 *
 * Routing:
 * 1. Claude Sonnet 4.6 via the Anthropic native Messages API
 *    (CLAUDE_API_KEY, model `claude-sonnet-5`) — primary for ALL content.
 * 2. Fallback → Llama 3.3 70B via OpenRouter (OPENROUTER_API_KEY).
 *
 * Output guards:
 * - WRONG_LANG_OUTPUT_REGEX rejects Cyrillic / CJK leakage.
 * - validateOutputScript rejects hallucinated words in the wrong script.
 * Both guards are applied to both providers so neither can leak bad output.
 */

import {
  getSystemPromptForProvider,
  getConfig,
  GEN_PARAMS,
  getTemperatureForProvider,
  MODELS,
  WRONG_LANG_OUTPUT_REGEX,
  validateOutputScript,
  containsExplicitContent,
  englishExplicit,
  thaiExplicit,
} from "./config.js";
import { TranslationResponse, TranslationRequest } from "./types.js";
import { callAnthropic, ANTHROPIC_MAX_TOKENS } from "./anthropic.js";
import { addToMemory, getRecentMessages } from "../translation/memory.js";

// OpenRouter API endpoint
export const OPENROUTER_API_URL =
  "https://openrouter.ai/api/v1/chat/completions";

// Type definitions for API responses
interface OpenRouterApiResponse {
  error?: { message: string };
  choices?: Array<{ message?: { content?: string } }>;
}

// ── Language helpers ──────────────────────────────────────────────

/**
 * Detect language of text by checking for Thai characters.
 */
export function detectLanguage(text: string): "en" | "th" {
  return /[\u0E00-\u0E7F]/.test(text) ? "th" : "en";
}

/**
 * Get the target language code for translation.
 * If the text has Thai, translate to English; otherwise to Thai.
 */
export function getTargetLangCode(text: string): "en" | "th" {
  return hasThaiText(text) ? "en" : "th";
}

/**
 * Get the source language code for translation.
 * If the text has Thai, translate from Thai; otherwise from English.
 */
export function getSourceLangCode(text: string): "en" | "th" {
  return hasThaiText(text) ? "th" : "en";
}

function hasThaiText(text: string): boolean {
  return /[\u0E00-\u0E7F]/.test(text);
}

// ── Output guard ──────────────────────────────────────────────────

/**
 * Apply the shared output guards (wrong-script leakage + hallucinated
 * foreign-script words) to a provider's raw output. Throws to trigger the
 * cascade's fallback if either check fails.
 */
export function validateProviderOutput(
  provider: string,
  raw: string,
  source: string,
  targetLanguage: "en" | "th",
): void {
  if (WRONG_LANG_OUTPUT_REGEX.test(raw)) {
    throw new Error(
      `${provider} output contained wrong-script characters (Cyrillic/CJK)`,
    );
  }

  // Catch hallucinated words in the wrong script that the Cyrillic/CJK
  // guard misses (e.g. "yokewise" embedded in Thai). Legitimate preserved
  // tokens (names, codes, URLs) are allowed through because they appear
  // in the source.
  const scriptError = validateOutputScript(raw, source, targetLanguage);
  if (scriptError) {
    throw new Error(`${provider} output failed script validation: ${scriptError}`);
  }
}

// ── OpenRouter call ───────────────────────────────────────────────

/**
 * Call OpenRouter API for translation (fallback provider).
 * The temperature is per-provider (see TEMPERATURE in config.ts) and falls
 * back to GEN_PARAMS.temperature when a provider is not listed.
 */
export async function callOpenRouter(
  text: string,
  systemPrompt: string,
  apiKey: string,
  model: string,
  provider: string,
  siteUrl?: string,
  siteTitle?: string,
  signal?: AbortSignal,
): Promise<string> {
  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(siteUrl && { "HTTP-Referer": siteUrl }),
      ...(siteTitle && { "X-OpenRouter-Title": siteTitle }),
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text },
      ],
      temperature: getTemperatureForProvider(provider),
      max_tokens: GEN_PARAMS.maxTokens,
      top_p: GEN_PARAMS.topP,
      moderation: "false",
    }),
    signal,
  });

  if (!response.ok) {
    throw new Error(
      `OpenRouter API error: ${response.status} - ${await response.text()}`,
    );
  }

  const data = (await response.json()) as OpenRouterApiResponse;
  if (data.error) throw new Error(`OpenRouter error: ${data.error.message}`);
  return data.choices?.[0]?.message?.content?.trim() || "";
}

// ── Provider cascade ──────────────────────────────────────────────

/**
 * Run a single provider's translation request and apply the shared output
 * guards. If the model returns Cyrillic / CJK characters (a sign it leaked
 * into the wrong script) or a hallucinated word in the wrong script, the
 * result is rejected and we fall through to the next provider instead of
 * returning bad output.
 *
 * Routing:
 * - `claude`  → Anthropic native Messages API (apiKey is the Anthropic key)
 * - `llama`   → OpenRouter chat-completions (apiKey is the OpenRouter key)
 */
export async function runProvider(
  provider: "claude" | "llama",
  text: string,
  sourceLanguage: "en" | "th",
  targetLanguage: "en" | "th",
  apiKey: string,
  siteUrl?: string,
  siteTitle?: string,
  signal?: AbortSignal,
): Promise<string> {
  const prompt = getSystemPromptForProvider(
    provider,
    sourceLanguage,
    targetLanguage,
  );

  const raw =
    provider === "claude"
      ? await callAnthropic(text, prompt, apiKey, {
          maxTokens: ANTHROPIC_MAX_TOKENS,
          signal,
        })
      : await callOpenRouter(
          text,
          prompt,
          apiKey,
          MODELS.LLAMA,
          provider,
          siteUrl,
          siteTitle,
          signal,
        );

  // callAnthropic() already rejects Cyrillic/CJK leakage internally, but it
  // doesn't run the hallucination guard — so we run the full guard here for
  // both providers rather than only for Llama.
  validateProviderOutput(provider, raw, text, targetLanguage);

  return raw;
}

// ── Profanity masking ─────────────────────────────────────────────

/**
 * Extract explicit content tokens from text and return masked text + token list.
 * English tokens are space-delimited; Thai tokens are matched via regex.
 */
export function maskProfanity(text: string): {
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
    // Reset regex index after replacement
    thaiRegex.lastIndex = 0;
  }

  return { maskedText, profanityTokens: tokens };
}

// ── Build routing ─────────────────────────────────────────────────

/**
 * Build the system prompt for a given text.
 * Returns the prompt content for the cascade to use.
 */
export function buildRouting(text: string): { systemContent: string } {
  const sourceLangCode = getSourceLangCode(text);
  const targetLangCode = getTargetLangCode(text);
  const base = getSystemPromptForProvider("claude", sourceLangCode, targetLangCode);
  return { systemContent: base };
}

// ── Main translate ────────────────────────────────────────────────

/**
 * Main translation function with provider cascade and fallback support.
 *
 * Routing logic:
 * 1. Claude Sonnet 4.6 via CLAUDE_API_KEY — primary provider for ALL content
 * 2. Fallback → Llama 3.3 70B via OPENROUTER_API_KEY
 *
 * When a provider returns output that fails the output guards, the cascade
 * continues to the next provider instead of returning bad text.
 */
export async function translate(
  request: TranslationRequest,
): Promise<TranslationResponse> {
  const config = getConfig();
  const { text, sourceLanguage, targetLanguage } = request;

  // Primary: Claude Sonnet 4.6 via CLAUDE_API_KEY
  try {
    const translatedText = await runProvider(
      "claude",
      text,
      sourceLanguage,
      targetLanguage,
      config.claudeApiKey,
      config.openrouterSiteUrl,
      config.openrouterSiteTitle,
    );
    return {
      success: true,
      translatedText,
      usedFallback: false,
      provider: "claude",
      usedExplicit: false,
    };
  } catch (error: any) {
    console.error("Primary translation (Claude) failed:", error.message);
    // Fall through to Llama fallback
  }

  // Fallback: Llama 3.3 70B via OPENROUTER_API_KEY
  try {
    const translatedText = await runProvider(
      "llama",
      text,
      sourceLanguage,
      targetLanguage,
      config.openrouterApiKey,
      config.openrouterSiteUrl,
      config.openrouterSiteTitle,
    );
    return {
      success: true,
      translatedText,
      usedFallback: true,
      provider: "llama",
      usedExplicit: false,
    };
  } catch (llamaError: any) {
    return {
      success: false,
      translatedText: "",
      usedFallback: false,
      provider: "llama",
      usedExplicit: false,
      error: llamaError.message,
    };
  }
}

/**
 * Translate with conversation memory
 */
export async function translateWithMemory(
  groupId: string,
  userId: string,
  text: string,
): Promise<{
  success: boolean;
  translatedText?: string;
  error?: string;
  usedFallback?: boolean;
  provider?: "claude" | "llama";
  usedExplicit?: boolean;
}> {
  addToMemory(groupId, userId, text);
  const context = getRecentMessages(groupId, 10);
  const sourceLanguage = detectLanguage(text);
  const targetLanguage = sourceLanguage === "en" ? "th" : "en";

  const result = await translate({
    text,
    sourceLanguage,
    targetLanguage,
    context,
  });

  return result.success
    ? {
        success: true,
        translatedText: result.translatedText,
        usedFallback: result.usedFallback,
        provider: result.provider,
        usedExplicit: false,
      }
    : { success: false, error: result.error, usedExplicit: false };
}

/**
 * Translate using the profanity preprocessing pipeline.
 */
export async function translateWithProfanityPipeline(
  request: TranslationRequest,
): Promise<TranslationResponse> {
  const { text, sourceLanguage, targetLanguage } = request;
  const isExplicit = containsExplicitContent(text);

  // If no explicit content, skip the pipeline and use normal translate()
  if (!isExplicit) {
    return translate(request);
  }

  // Mask explicit content
  const { maskedText, profanityTokens } = maskProfanity(text);

  // Translate masked (clean) text through the cascade
  const maskedResult = await translate({
    text: maskedText,
    sourceLanguage,
    targetLanguage,
  });

  if (!maskedResult.success) {
    return { ...maskedResult, usedExplicit: true };
  }

  // Re-check the masked translation for wrong-script leakage before
  // we substitute profanity back in (the [PROFANITY:N] markers
  // themselves are ASCII, so the guard is meaningful here).
  if (WRONG_LANG_OUTPUT_REGEX.test(maskedResult.translatedText)) {
    return {
      success: false,
      translatedText: "",
      usedFallback: maskedResult.usedFallback,
      provider: maskedResult.provider,
      usedExplicit: true,
      error: "Masked translation contained wrong-script characters",
    };
  }

  // Defensive: if the cascade provider translated the [PROFANITY:N] markers
  // into the target language (e.g. Thai "คำสบถ:1"), substitution would leave
  // the user with a garbled message. If any markers are missing from the
  // translated text, bail out and return the masked text verbatim.
  for (let i = 0; i < profanityTokens.length; i++) {
    const marker = `[PROFANITY:${i + 1}]`;
    if (!maskedResult.translatedText.includes(marker)) {
      return {
        success: false,
        translatedText: maskedText,
        usedFallback: maskedResult.usedFallback,
        provider: maskedResult.provider,
        usedExplicit: true,
        error: "Profanity marker lost in translation",
      };
    }
  }

  // Translate each profanity token individually through the native Anthropic API
  // (Claude is the primary model and handles ALL content, including explicit).
  const claudeSystemContent = getSystemPromptForProvider("claude", sourceLanguage, targetLanguage);
  const controller = new AbortController();
  const pipelineTimeoutId = setTimeout(() => controller.abort(), 25000);
  try {
    const translatedToken = await callAnthropic(
      profanityTokens.join(" "),
      claudeSystemContent,
      getConfig().claudeApiKey,
      {
        maxTokens: ANTHROPIC_MAX_TOKENS,
        signal: controller.signal,
      },
    );

    const translatedTokens = translatedToken.split(/\s+/);
    let finalText = maskedResult.translatedText;
    profanityTokens.forEach((_, i) => {
      const marker = `[PROFANITY:${i + 1}]`;
      const translated = translatedTokens[i] || profanityTokens[i];
      finalText = finalText.replace(marker, translated);
    });
    return { success: true, translatedText: finalText, usedFallback: false, provider: "claude", usedExplicit: true };
  } catch (e: any) {
    console.error("Pipeline Anthropic unmask failed:", e.message);
    return { success: true, translatedText: maskedResult.translatedText, usedFallback: maskedResult.usedFallback, provider: maskedResult.provider, usedExplicit: true };
  } finally {
    clearTimeout(pipelineTimeoutId);
  }
}
