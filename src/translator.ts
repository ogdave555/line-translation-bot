/**
 * Translation Engine
 * Handles translation using Gemini and OpenRouter APIs
 */

import { getSystemPrompt, getOpenRouterSystemPrompt, getConfig } from './config';
import { TranslationResponse, TranslationRequest } from './types';
import { getRecentMessages, addToMemory } from './memory';

// Gemini API endpoint
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent';

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
 * Call Gemini API for translation
 */
async function callGemini(text: string, systemPrompt: string, apiKey: string): Promise<string> {
  const response = await fetch(GEMINI_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      model: 'gemini-3.7-flash',
      system: systemPrompt,
      contents: [{ role: 'user', parts: [{ text }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 1000, topP: 0.9, topK: 40 }
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
 * Call OpenRouter API for translation (fallback)
 */
async function callOpenRouter(text: string, systemPrompt: string, apiKey: string, siteUrl?: string, siteTitle?: string): Promise<string> {
  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(siteUrl && { 'HTTP-Referer': siteUrl }),
      ...(siteTitle && { 'X-OpenRouter-Title': siteTitle })
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: text }],
      temperature: 0.3,
      max_tokens: 1000
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
 * Main translation function with fallback support
 */
export async function translate(request: TranslationRequest): Promise<TranslationResponse> {
  const config = getConfig();
  const { text, sourceLanguage, targetLanguage, context } = request;

  const systemPrompt = getSystemPrompt(sourceLanguage === 'en' ? 'english' : 'thai', targetLanguage, context);

  try {
    const translatedText = await callGemini(text, systemPrompt, config.geminiApiKey);
    return { success: true, translatedText, usedFallback: false, provider: 'gemini' };
  } catch (error: any) {
    console.error('Translation failed:', error.message);
    
    // Build fallback prompt
    const fallbackPrompt = getOpenRouterSystemPrompt(targetLanguage);
    
    try {
      const translatedText = await callOpenRouter(text, fallbackPrompt, config.openrouterApiKey, config.openrouterSiteUrl, config.openrouterSiteTitle);
      return { success: true, translatedText, usedFallback: true, provider: 'openrouter' };
    } catch (orError: any) {
      return { success: false, translatedText: '', usedFallback: false, provider: 'openrouter', error: orError.message };
    }
  }
}

/**
 * Translate with conversation memory
 */
export async function translateWithMemory(
  groupId: string, userId: string, text: string
): Promise<{ success: boolean; translatedText?: string; error?: string; usedFallback?: boolean; provider?: 'gemini' | 'openrouter' }> {
  addToMemory(groupId, userId, text);
  const context = getRecentMessages(groupId, 10);
  const sourceLanguage = detectLanguage(text);
  const targetLanguage = sourceLanguage === 'en' ? 'th' : 'en';

  const result = await translate({ text, sourceLanguage, targetLanguage, context });
  
  return result.success 
    ? { success: true, translatedText: result.translatedText, usedFallback: result.usedFallback, provider: result.provider }
    : { success: false, error: result.error };
}