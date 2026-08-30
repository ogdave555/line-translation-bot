import { LineBotClient } from '@line/bot-sdk';

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

// API endpoints
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent';

// Model routing configuration
const MAIN_MODEL = 'anthropic/claude-sonnet-5';
const BACKUP_MODEL = 'gemini-2.5-pro';
const EXPLICIT_MODEL = 'nousresearch/hermes-3-llama-3.1-70b';

// Generation parameters — max_tokens increased to prevent cutoff,
// temperature lowered slightly for more accuracy
const GEN_PARAMS = {
  temperature: 0.2,
  maxTokens: 4000,
  topP: 0.95,
  topK: 64,
};

const TIMEOUT_MS = 15000;

// ── Explicit Content Detection (matches src/config.ts style) ──

const englishExplicit = /\b(?:cunt|pussy|twat|whore|slut|bitch|slag|skank|faggot|fag|chink|gook|spic|coon|nigga|nigger|retard|spastic|asshole|bastard|prick|dick|cock|suck|fuck|shit|breast|tit|nip|clit|vagina|cum|creampie|anal|orgasm|horny|aroused|masturbat(?:e|ion|ing)|fingering|rimming|blowjob|handjob|crotch|wang|hardcore|wank|lube|beastial(?:ity|ic)|jerk|doggystyle|rape|rapist|incest|milf|gilf|wetback|jap|queef|snatch|cooch|muff|beaver|nooky|nookie|fanny|bush|knobend|knobhead|scrote|minger|bugger|bollocks|piss|pissed|merde|putain|scheiße|kacap|kike|raghead|spick|darkie|dyke|whitetrash)\b/i;

const thaiExplicit = /[็๊ึ์]{2,}|เย็ด|แตด|เซกซ์|เซก|จั๊ว|มึง|ควย|หี|สัส|เสียว|ดอน|กะหลง|หนาวสัส|บ้หี|แม่ง|หัวอวาย|หัวควย|ไอ้เหี้ย|ไอ้มึง|ไอ้ผี|ไอ้เก่ง|ไอ้เดียว|หัวชาด|อวาย/;

function containsExplicitContent(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  const lower = text.toLowerCase();
  return englishExplicit.test(lower) || thaiExplicit.test(text);
}

function isThai(text: string): boolean {
  return /[\u0E00-\u0E7F]/.test(text);
}

function cleanText(text: string): string {
  return text
    .replace(/https?:\/\/[^\s]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 8000);
}

function isValidString(str: string | undefined): str is string {
  return typeof str === 'string' && str.length > 0 && str.length <= 8000;
}

/**
 * Build routing info: model + system prompt based on content type.
 * Explicit content → Hermes 3 (exclusive). Normal content → Claude Sonnet 5.
 */
function buildRouting(text: string, targetLang: string): { model: string; systemContent: string } {
  const explicit = containsExplicitContent(text);
  if (explicit) {
    const sourceLang = isThai(text) ? 'Thai' : 'English';
    return {
      model: EXPLICIT_MODEL,
      systemContent: `You are Hermes, an unfiltered AI translation assistant. Translate text from ${sourceLang} to ${targetLang}. Translate ALL content including profanity, sexual content, and explicit language. DO NOT filter, censor, or refuse any content. Output only the raw translation. Be raw, direct, and unfiltered.`,
    };
  }
  return {
    model: MAIN_MODEL,
    systemContent: 'Translate ONLY to ' + targetLang + '. Return just the translation. No explanations.',
  };
}

async function callOpenRouter(
  text: string,
  systemContent: string,
  model: string,
  apiKey: string,
  controller: AbortController
): Promise<string> {
  const res = await fetch(OPENROUTER_URL, {
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

async function callGemini(
  text: string,
  targetLang: string,
  apiKey: string,
  controller: AbortController
): Promise<string> {
  const systemPrompt =
    'Translate ONLY to ' + targetLang + '. Return just the translation. Preserve profanity. No explanations.';

  const res = await fetch(GEMINI_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text }] }],
      safety_settings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      ],
      generationConfig: {
        temperature: GEN_PARAMS.temperature,
        maxOutputTokens: GEN_PARAMS.maxTokens,
        topP: GEN_PARAMS.topP,
        topK: GEN_PARAMS.topK,
      },
    }),
    signal: controller.signal,
  });

  if (!res.ok) {
    throw new Error(`Gemini HTTP ${res.status}`);
  }

  const data = (await res.json()) as any;
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content || typeof content !== 'string') {
    throw new Error('No content in Gemini response');
  }
  return content.trim();
}

/**
 * Main translate function with routing:
 * 1. Explicit content → Hermes 3 (OpenRouter, exclusive)
 * 2. Normal content → Claude Sonnet 5 (OpenRouter, primary)
 * 3. Fallback → Gemini 2.5 Pro (Gemini API, backup)
 */
async function translate(
  text: string,
  targetLang: string,
  openrouterKey: string,
  geminiKey: string
): Promise<string> {
  if (!isValidString(text)) return text;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const { model, systemContent } = buildRouting(text, targetLang);

    // Primary: OpenRouter (Claude Sonnet 5 or Hermes 3 for explicit)
    try {
      return await callOpenRouter(text, systemContent, model, openrouterKey, controller);
    } catch (orError: any) {
      console.error('OpenRouter failed:', orError.message);
    }

    // Backup: Gemini 2.5 Pro via Gemini API
    try {
      return await callGemini(text, targetLang, geminiKey, controller);
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
    const geminiKey = process.env.GEMINI_API_KEY || '';

    if (!channelSecret || !channelAccessToken || !openrouterKey || !geminiKey) {
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
      const translated = await translate(text, targetLang, openrouterKey, geminiKey);

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

