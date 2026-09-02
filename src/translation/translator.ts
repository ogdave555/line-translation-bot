/**
 * Translation Engine
 * Handles translation using OpenRouter with a three-tier provider cascade:
 *   1. Hermes 3 (405B) — primary provider for ALL content (clean + explicit)
 *   2. Claude Sonnet 5 — fallback for clean content only (or when bypassExplicitCheck is set)
 *   3. Gemini 2.5 Pro   — second fallback for clean content
 *
 * Language parameters:
 *   - Internal language codes: 'en' | 'th'
 *   - Prompt-boundary codes (BCP-47): 'en-GB' | 'th-TH' (set by buildSystemPrompt)
 *   - Per-provider temperature: 0.3 for Hermes, 0.2 for Claude/Gemini
 *   - WRONG_LANG_OUTPUT_REGEX: rejects Cyrillic/CJK leakage in th-TH/en-GB output,
 *     falling through to the next provider instead of returning bad text.
 */

import {
  getSystemPromptForProvider,
  getConfig,
  GEN_PARAMS,
  getTemperatureForProvider,
  containsExplicitContent,
  MODELS,
  WRONG_LANG_OUTPUT_REGEX,
  englishExplicit,
  thaiExplicit,
} from "../core/config";
import { TranslationResponse, TranslationRequest } from "../core/types";
import { getRecentMessages, addToMemory } from "./memory";

// OpenRouter API endpoint
const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

// Type definitions for API responses
interface OpenRouterApiResponse {
  error?: { message: string };
  choices?: Array<{ message?: { content?: string } }>;
}

/**
 * Call OpenRouter API for translation (primary + explicit content provider).
 * Model is configurable: Claude Sonnet 5 (fallback) or Hermes 3 (primary/explicit).
 * The temperature is per-provider (see TEMPERATURE in config.ts) and falls
 * back to GEN_PARAMS.temperature when a provider is not listed.
 */
async function callOpenRouter(
  text: string,
  systemPrompt: string,
  apiKey: string,
  model: string,
  provider: string,
  siteUrl?: string,
  siteTitle?: string,
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

/** Detect language of text */
function detectLanguage(text: string): "en" | "th" {
  return /[\u0E00-\u0E7F]/.test(text) ? "th" : "en";
}

/**
 * Run a single provider's translation request and apply the WRONG_LANG_OUTPUT_REGEX
 * safety guard. If the model returns Cyrillic / CJK characters (a sign it
 * leaked into the wrong script), the result is rejected and we fall through
 * to the next provider instead of returning bad output.
 */
async function runProvider(
  provider: "hermes" | "claude" | "gemini",
  text: string,
  sourceLanguage: "en" | "th",
  targetLanguage: "en" | "th",
  apiKey: string,
  siteUrl?: string,
  siteTitle?: string,
): Promise<string> {
  const model =
    provider === "hermes"
      ? MODELS.PRIMARY
      : provider === "claude"
        ? MODELS.CLAUDE
        : MODELS.GEMINI;

  const prompt = getSystemPromptForProvider(
    provider,
    sourceLanguage,
    targetLanguage,
  );
  const raw = await callOpenRouter(
    text,
    prompt,
    apiKey,
    model,
    provider,
    siteUrl,
    siteTitle,
  );

  if (!raw) throw new Error(`${provider} returned empty response`);
  if (WRONG_LANG_OUTPUT_REGEX.test(raw)) {
    throw new Error(
      `${provider} output contained wrong-script characters (Cyrillic/CJK)`,
    );
  }
  return raw;
}

/**
 * Main translation function with provider cascade and fallback support.
 *
 * Routing logic:
 * 1. Hermes 3 (405B) via OpenRouter — primary provider for ALL content (clean + explicit)
 * 2. Fallback → Claude Sonnet 5 (OpenRouter, clean content only unless bypassExplicitCheck)
 * 3. Second fallback → Gemini 2.5 Pro (OpenRouter, clean content only unless bypassExplicitCheck)
 *
 * When a provider returns output containing Cyrillic / CJK (i.e. wrong script),
 * the WRONG_LANG_OUTPUT_REGEX guard rejects it and the cascade continues to
 * the next provider.
 */
export async function translate(
  request: TranslationRequest,
): Promise<TranslationResponse> {
  const config = getConfig();
  const {
    text,
    sourceLanguage,
    targetLanguage,
    context,
    testProvider,
    bypassExplicitCheck,
  } = request;
  const isExplicit = containsExplicitContent(text);

  // If testProvider specified, route directly to that provider
  if (testProvider) {
    try {
      const translatedText = await runProvider(
        testProvider,
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
        usedFallback: false,
        provider: testProvider,
        usedExplicit: isExplicit,
      };
    } catch (error: any) {
      return {
        success: false,
        translatedText: "",
        usedFallback: false,
        provider: testProvider,
        usedExplicit: isExplicit,
        error: error.message,
      };
    }
  }

  // Primary: Hermes 3 405B for ALL content (clean + explicit)
  try {
    const translatedText = await runProvider(
      "hermes",
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
      usedFallback: false,
      provider: "hermes",
      usedExplicit: isExplicit,
    };
  } catch (error: any) {
    console.error("Primary translation (Hermes) failed:", error.message);
    // Fall through to fallback providers
  }

  // Claude and Gemini only handle clean content (unless bypassExplicitCheck is set)
  if (isExplicit && !bypassExplicitCheck) {
    return {
      success: false,
      translatedText: "",
      usedFallback: false,
      provider: "hermes",
      usedExplicit: true,
      error:
        "Hermes failed and explicit content cannot be routed to Claude/Gemini",
    };
  }

  // Fallback: Claude Sonnet 5 via OpenRouter
  try {
    const translatedText = await runProvider(
      "claude",
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
      provider: "claude",
      usedExplicit: false,
    };
  } catch (error: any) {
    console.error("Claude fallback failed:", error.message);
  }

  // Second fallback: Gemini 3.7 Flash via OpenRouter
  try {
    const translatedText = await runProvider(
      "gemini",
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
      provider: "gemini",
      usedExplicit: false,
    };
  } catch (geminiError: any) {
    return {
      success: false,
      translatedText: "",
      usedFallback: false,
      provider: "gemini",
      usedExplicit: false,
      error: geminiError.message,
    };
  }
}

/**
 * Profanity preprocessing pipeline.
 *
 * When the primary provider (Hermes) is unavailable and the fallback
 * cascade must route explicit content through Claude/Gemini, this pipeline
 * ensures profanity is never seen by those providers:
 *
 * 1. Split text into tokens
 * 2. Mask explicit tokens with [PROFANITY:original_token] markers
 * 3. Translate the masked (clean) text through the cascade
 * 4. Extract each masked token and translate it individually through Hermes
 * 5. Reassemble the final translation with translated profanity substituted back
 */

/**
 * Extract explicit content tokens from text and return masked text + token list.
 * English tokens are space-delimited; Thai tokens are matched via regex.
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
    // Reset regex index after replacement
    thaiRegex.lastIndex = 0;
  }

  return { maskedText, profanityTokens: tokens };
}

/**
 * Translate text using the profanity preprocessing pipeline.
 *
 * The pipeline masks explicit content before translation so that
 * Claude/Gemini never see profanity. Masked tokens are then translated
 * individually through Hermes and substituted back.
 */
export async function translateWithProfanityPipeline(
  request: Omit<TranslationRequest, "testProvider">,
): Promise<TranslationResponse> {
  const { text, sourceLanguage, targetLanguage, context } = request;
  const isExplicit = containsExplicitContent(text);

  // If no explicit content, skip the pipeline and use normal translate()
  if (!isExplicit) {
    return translate({ ...request });
  }

  // Mask explicit content
  const { maskedText, profanityTokens } = maskProfanity(text);

  // Translate masked (clean) text through the cascade
  const maskedResult = await translate({
    text: maskedText,
    sourceLanguage,
    targetLanguage,
    context,
  });

  if (!maskedResult.success) {
    return maskedResult;
  }

  // Re-check the masked translation for wrong-script leakage before
  // we substitute profanity back in (the [PROFANITY:N] markers
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
  // the original Thai text in the output. Return the masked translation as-is
  // rather than producing a corrupted result.
  for (let i = 0; i < profanityTokens.length; i++) {
    const marker = `[PROFANITY:${i + 1}]`;
    if (!maskedResult.translatedText.includes(marker)) {
      return {
        success: true,
        translatedText: maskedResult.translatedText,
        usedFallback: maskedResult.usedFallback,
        provider: maskedResult.provider,
        usedExplicit: true,
      };
    }
  }

  // Translate each profanity token individually through Hermes
  const config = getConfig();
  const hermesPrompt = getSystemPromptForProvider(
    "hermes",
    sourceLanguage,
    targetLanguage,
  );
  const translatedToken = await callOpenRouter(
    profanityTokens.join(" "),
    hermesPrompt,
    config.openrouterApiKey,
    MODELS.PRIMARY,
    "hermes",
    config.openrouterSiteUrl,
    config.openrouterSiteTitle,
  );

  // Split the Hermes result into individual token translations
  const translatedTokens = translatedToken.split(/\s+/);

  // Reassemble: replace each [PROFANITY:N] marker with its translated token
  let finalText = maskedResult.translatedText;
  profanityTokens.forEach((_, i) => {
    const marker = `[PROFANITY:${i + 1}]`;
    const translated = translatedTokens[i] || profanityTokens[i];
    finalText = finalText.replace(marker, translated);
  });

  return {
    success: true,
    translatedText: finalText,
    usedFallback: maskedResult.usedFallback,
    provider: "hermes",
    usedExplicit: true,
  };
}

/**
 * Translate with conversation memory + profanity pipeline.
 */
export async function translateWithProfanityPipelineAndMemory(
  groupId: string,
  userId: string,
  text: string,
  options?: { bypassExplicitCheck?: boolean },
): Promise<{
  success: boolean;
  translatedText?: string;
  error?: string;
  usedFallback?: boolean;
  provider?: "claude" | "gemini" | "hermes";
  usedExplicit?: boolean;
}> {
  addToMemory(groupId, userId, text);
  const context = getRecentMessages(groupId, 10);
  const sourceLanguage = detectLanguage(text);
  const targetLanguage = sourceLanguage === "en" ? "th" : "en";

  const result = await translateWithProfanityPipeline({
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
        usedExplicit: result.usedExplicit,
      }
    : { success: false, error: result.error };
}

/**
 * Translate with conversation memory
 */
export async function translateWithMemory(
  groupId: string,
  userId: string,
  text: string,
  options?: {
    testProvider?: "claude" | "gemini" | "hermes";
    bypassExplicitCheck?: boolean;
  },
): Promise<{
  success: boolean;
  translatedText?: string;
  error?: string;
  usedFallback?: boolean;
  provider?: "claude" | "gemini" | "hermes";
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
    testProvider: options?.testProvider,
    bypassExplicitCheck: options?.bypassExplicitCheck,
  });

  return result.success
    ? {
        success: true,
        translatedText: result.translatedText,
        usedFallback: result.usedFallback,
        provider: result.provider,
        usedExplicit: result.usedExplicit,
      }
    : { success: false, error: result.error };
}
