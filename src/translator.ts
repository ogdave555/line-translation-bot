/**
 * Translation Engine
 * Handles translation using OpenRouter (primary), Gemini (backup),
 * and Hermes 3 (explicit content only) APIs
 */

import { getSystemPrompt, getGeminiSystemPrompt, getHermesSystemPrompt, getConfig, GEMINI_API_URL, GEN_PARAMS, containsExplicitContent, MODELS } from './config';
import { TranslationResponse, TranslationRequest } from './types';
import { getRecentMessages, addToMemory } from './memory';

// OpenRouter API endpoint
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Type definitions for API responses
interface GeminiApiResponse {
  error?: { message: string; code?: number };
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

interface OpenRouterApiResponse {
  error?: { message: string };
  choices?: Array<{ message?: { content?: string } }>;
}

/**
 * Call Gemini API for translation (backup provider).
 * Uses Gemini 2.5 Pro with safety settings disabled to preserve profanity.
 */
async function callGemini(text: string, systemPrompt: string, apiKey: string): Promise<string> {
  const response = await fetch(GEMINI_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text }] }],
      safety_settings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
      ],
      generationConfig: {
        temperature: GEN_PARAMS.temperature,
        maxOutputTokens: GEN_PARAMS.maxTokens,
        topP: GEN_PARAMS.topP,
        topK: GEN_PARAMS.topK
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status} - ${await response.text()}`);
  }

  const data = (await response.json()) as GeminiApiResponse;
  if (data.error) {
    throw new Error(data.error.message?.includes('safety') ? 'SAFETY_BLOCKED' : `Gemini error: ${data.error.message}`);
  }

  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
}

/**
 * Call OpenRouter API for translation (primary + explicit content provider).
 * Model is configurable: Claude Sonnet 5 (main) or Hermes 3 (explicit content).
 */
async function callOpenRouter(
  text: string,
  systemPrompt: string,
  apiKey: string,
  model: string,
  siteUrl?: string,
  siteTitle?: string
): Promise<string> {
  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(siteUrl && { 'HTTP-Referer': siteUrl }),
      ...(siteTitle && { 'X-OpenRouter-Title': siteTitle })
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: text }],
      temperature: GEN_PARAMS.temperature,
      max_tokens: GEN_PARAMS.maxTokens,
      top_p: GEN_PARAMS.topP
    })
  });

  if (!response.ok) {
    throw new Error(`OpenRouter API error: ${response.status} - ${await response.text()}`);
  }

  const data = (await response.json()) as OpenRouterApiResponse;
  if (data.error) throw new Error(`OpenRouter error: ${data.error.message}`);
  return data.choices?.[0]?.message?.content?.trim() || '';
}

/** Detect language of text */
function detectLanguage(text: string): 'en' | 'th' {
  return /[\u0E00-\u0E7F]/.test(text) ? 'th' : 'en';
}

/**
 * Main translation function with explicit content routing and fallback support.
 *
 * Routing logic:
 * 1. Explicit content (English/Thai) → Hermes 3 via OpenRouter (exclusive)
 * 2. Normal content → Claude Sonnet 5 via OpenRouter (primary)
 * 3. Fallback → Gemini 2.5 Pro via Gemini API (backup)
 */
export async function translate(request: TranslationRequest): Promise<TranslationResponse> {
  const config = getConfig();
  const { text, sourceLanguage, targetLanguage, context } = request;

  // Check for explicit content — route to Hermes 3 exclusively
  if (containsExplicitContent(text)) {
    const hermesPrompt = getHermesSystemPrompt(sourceLanguage, targetLanguage);
    try {
      const translatedText = await callOpenRouter(
        text, hermesPrompt, config.openrouterApiKey,
        MODELS.EXPLICIT, config.openrouterSiteUrl, config.openrouterSiteTitle
      );
      return { success: true, translatedText, usedFallback: false, provider: 'hermes', usedExplicit: true };
    } catch (error: any) {
      console.error('Hermes translation failed:', error.message);
      return { success: false, translatedText: '', usedFallback: false, provider: 'hermes', usedExplicit: true, error: error.message };
    }
  }

  // Primary: Claude Sonnet 5 via OpenRouter
  const systemPrompt = getSystemPrompt(sourceLanguage === 'en' ? 'english' : 'thai', targetLanguage, context);

  try {
    const translatedText = await callOpenRouter(
      text, systemPrompt, config.openrouterApiKey,
      MODELS.MAIN, config.openrouterSiteUrl, config.openrouterSiteTitle
    );
    return { success: true, translatedText, usedFallback: false, provider: 'openrouter', usedExplicit: false };
  } catch (error: any) {
    console.error('Primary translation (Claude) failed:', error.message);

    // Backup: Gemini 2.5 Pro via Gemini API
    const backupPrompt = getGeminiSystemPrompt(targetLanguage);
    try {
      const translatedText = await callGemini(text, backupPrompt, config.geminiApiKey);
      return { success: true, translatedText, usedFallback: true, provider: 'gemini', usedExplicit: false };
    } catch (geminiError: any) {
      return { success: false, translatedText: '', usedFallback: false, provider: 'gemini', usedExplicit: false, error: geminiError.message };
    }
  }
}

/**
 * Translate with conversation memory
 */
export async function translateWithMemory(
  groupId: string, userId: string, text: string
): Promise<{ success: boolean; translatedText?: string; error?: string; usedFallback?: boolean; provider?: 'openrouter' | 'gemini' | 'hermes'; usedExplicit?: boolean }> {
  addToMemory(groupId, userId, text);
  const context = getRecentMessages(groupId, 10);
  const sourceLanguage = detectLanguage(text);
  const targetLanguage = sourceLanguage === 'en' ? 'th' : 'en';

  const result = await translate({ text, sourceLanguage, targetLanguage, context });

  return result.success
    ? { success: true, translatedText: result.translatedText, usedFallback: result.usedFallback, provider: result.provider, usedExplicit: result.usedExplicit }
    : { success: false, error: result.error };
}