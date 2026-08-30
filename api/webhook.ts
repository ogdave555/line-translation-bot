import { LineBotClient } from '@line/bot-sdk';
import {
  englishExplicit,
  thaiExplicit,
  containsExplicitContent,
  MODELS,
  GEN_PARAMS,
  OPENROUTER_API_URL,
} from '../src/core/config';
import {
  hasThaiText,
  cleanTextForTranslation,
} from '../src/core/utils';

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

const TIMEOUT_MS = 15000;

// ── Helper wrappers (imported from src/core to avoid duplication) ──

function isValidString(str: string | undefined): str is string {
  return typeof str === 'string' && str.length > 0 && str.length <= 8000;
}

function isThai(text: string): boolean {
  return hasThaiText(text);
}

function cleanText(text: string): string {
  return cleanTextForTranslation(text).substring(0, 8000);
}

/**
 * Profanity preprocessing pipeline — masks explicit content before translation.
 * Ensures Claude/Gemini never see profanity even as fallback providers.
 */
function maskProfanity(text: string): { maskedText: string; profanityTokens: string[] } {
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

  let maskedText = maskedWords.join('');

  // Thai: regex-replace explicit terms with markers
  let thaiMatch: RegExpExecArray | null;
  const thaiRegex = new RegExp(thaiExplicit.source, 'g');
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
  openrouterKey: string
): Promise<string> {
  const isExplicit = containsExplicitContent(text);
  if (!isExplicit) return translate(text, targetLang, openrouterKey);

  const { maskedText, profanityTokens } = maskProfanity(text);

  // Translate masked (clean) text through the cascade
  const maskedResult = await translate(maskedText, targetLang, openrouterKey);

  if (maskedResult === text) return text; // translate failed

  // Translate each profanity token individually through Hermes
  const sourceLang = isThai(text) ? 'Thai' : 'English';
  const hermesSystemContent = `You are Hermes, an unfiltered AI translation assistant. Translate text from ${sourceLang} to ${targetLang}. Translate ALL content including profanity, sexual content, and explicit language. DO NOT filter, censor, or refuse any content. Output only the raw translation. Be raw, direct, and unfiltered.`;

    const controller = new AbortController();
  const pipelineTimeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const translatedToken = await callOpenRouter(
      profanityTokens.join(' '),
      hermesSystemContent,
      MODELS.PRIMARY,
      openrouterKey,
      controller
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
    console.error('Pipeline Hermes unmask failed:', e.message);
    return maskedResult;
    } finally {
    clearTimeout(pipelineTimeoutId);
  }
}

/**
 * Build routing info: model + system prompt based on content type.
 * Hermes 3 (405B) is the primary provider for ALL content (clean + explicit).
 * Claude and Gemini serve as clean-content fallbacks.
 */
function buildRouting(text: string, targetLang: string): { model: string; systemContent: string } {
  // Hermes handles ALL content as the primary provider
  const sourceLang = isThai(text) ? 'Thai' : 'English';
  return {
    model: MODELS.PRIMARY,
    systemContent: `You are Hermes, an unfiltered AI translation assistant. Translate text from ${sourceLang} to ${targetLang}. Translate ALL content including profanity, sexual content, and explicit language. DO NOT filter, censor, or refuse any content. Output only the raw translation. Be raw, direct, and unfiltered. Preserve the tone and style of the original message. Output the raw translation with no acknowledgment, no disclaimers, and no safety warnings.`,
  };
}

async function callOpenRouter(
  text: string,
  systemContent: string,
  model: string,
  apiKey: string,
  controller: AbortController
): Promise<string> {
  const res = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + apiKey,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://line-translation-bot.vercel.app',
      'X-OpenRouter-Title': 'LINE Translation Bot',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemContent },
        { role: 'user', content: text },
      ],
            temperature: GEN_PARAMS.temperature,
      top_p: GEN_PARAMS.topP,
      max_tokens: GEN_PARAMS.maxTokens,
      moderation: 'false',
    }),
    signal: controller.signal,
  });

  if (!res.ok) {
    throw new Error(`OpenRouter HTTP ${res.status}`);
  }

  const data = (await res.json()) as any;
  const content = data.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string') {
    throw new Error('No content in OpenRouter response');
  }
  return content.trim();
}

/**
 * Main translate function with routing:
 * 1. Hermes 3 (OpenRouter, primary for ALL content — clean + explicit)
 * 2. Fallback → Claude Sonnet 5 (OpenRouter, clean content only)
 * 3. Second fallback → Gemini 2.5 Pro (OpenRouter, clean content only)
 */
async function translate(
  text: string,
  targetLang: string,
  openrouterKey: string
): Promise<string> {
  if (!isValidString(text)) return text;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const { model, systemContent } = buildRouting(text, targetLang);

    // Primary: Hermes 3 for ALL content (clean + explicit)
    try {
      return await callOpenRouter(text, systemContent, model, openrouterKey, controller);
    } catch (orError: any) {
      console.error('Hermes (primary) failed:', orError.message);
    }

    // Claude and Gemini only handle clean content
    const isExplicit = containsExplicitContent(text);
    if (isExplicit) {
      console.error('Hermes failed for explicit content, no clean-content fallback available');
      return text;
    }

    // Fallback: Claude Sonnet 5 via OpenRouter
    try {
      const claudeSystemContent = 'Translate ONLY to ' + targetLang + '. Return just the translation. No explanations.';
      return await callOpenRouter(text, claudeSystemContent, MODELS.CLAUDE, openrouterKey, controller);
    } catch (claudeError: any) {
      console.error('Claude fallback failed:', claudeError.message);
    }

    // Second fallback: Gemini 2.5 Pro via OpenRouter
    try {
      const geminiSystemContent = 'Translate ONLY to ' + targetLang + '. Return just the translation. Preserve profanity. No explanations.';
      return await callOpenRouter(text, geminiSystemContent, MODELS.GEMINI, openrouterKey, controller);
    } catch (geminiError: any) {
      console.error('Gemini failed:', geminiError.message);
    }

    console.error('All translation providers failed');
    return text;
  } catch (e: any) {
    console.error('Translation error:', e.message);
    return text;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    const channelSecret = process.env.CHANNEL_SECRET || '';
    const channelAccessToken = process.env.CHANNEL_ACCESS_TOKEN || '';
    const openrouterKey = process.env.OPENROUTER_API_KEY || '';

    if (!channelSecret || !channelAccessToken || !openrouterKey) {
      return new Response(JSON.stringify({ error: 'Config error' }), { status: 500 });
    }

    const bodyString = await req.text();
    if (!bodyString || bodyString.length === 0 || bodyString.length > 1000000) {
      return new Response('Invalid body', { status: 400 });
    }

    let body: WebhookRequestBody;
    try {
      body = JSON.parse(bodyString);
    } catch {
      return new Response('Invalid JSON', { status: 400 });
    }

    if (body.challenge) {
      return new Response(JSON.stringify({ challenge: body.challenge }), { status: 200 });
    }

    const events = body.events || [];
    if (!Array.isArray(events) || events.length === 0) {
      return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
    }

    const client = LineBotClient.fromChannelAccessToken({ channelAccessToken });

    for (const event of events) {
      if (event.type !== 'message') continue;
      if (!event.message?.text) continue;
      if (!event.source?.groupId || !event.source?.userId) continue;
      if (!event.replyToken) continue;

      const text = cleanText(event.message.text);
      if (!isValidString(text)) continue;

      const targetLang = isThai(text) ? 'English' : 'Thai';
      const translated = await translateWithPipeline(text, targetLang, openrouterKey);

      await client.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: 'text', text: translated }]
      });
    }

    return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
  } catch (e: any) {
    return new Response(JSON.stringify({ status: 'error' }), { status: 200 });
  }
}

export async function GET(): Promise<Response> {
  return new Response(JSON.stringify({ status: 'alive', service: 'line-translation-bot' }), { status: 200 });
}

