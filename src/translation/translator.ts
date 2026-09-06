/**
 * Translation Engine
 * Handles translation using a two-tier provider cascade:
 *   1. Claude Sonnet 4.6 — primary provider for ALL content (via CLAUDE_API_KEY)
 *   2. Llama 3.3 70B — fallback provider (via OPENROUTER_API_KEY)
 *
 * The core cascade logic (runProvider, callOpenRouter, validateProviderOutput,
 * maskProfanity, translate, translateWithMemory, translateWithProfanityPipeline)
 * is shared from src/core/translate.ts — one place to fix things.
 *
 * This module re-exports the shared functions and adds the
 * translateWithProfanityPipelineAndMemory variant that combines
 * profanity masking with conversation memory.
 */

import { TranslationResponse, TranslationRequest } from "../core/types.js";
import { detectLanguage } from "../core/translate.js";
import { addToMemory, getRecentMessages } from "./memory.js";
import {
  translate,
  translateWithMemory,
  translateWithProfanityPipeline,
} from "../core/translate.js";

/**
 * Translate text using the profanity preprocessing pipeline with
 * conversation memory.
 *
 * 1. Adds the message to conversation memory
 * 2. Detects source/target language
 * 3. Masks explicit content
 * 4. Translates through the cascade
 * 5. Substitutes profanity tokens back
 */
export async function translateWithProfanityPipelineAndMemory(
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

// Re-export the shared cascade functions
export { translate, translateWithMemory, translateWithProfanityPipeline };
