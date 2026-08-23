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

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const TIMEOUT_MS = 10000;

function isThai(text: string): boolean {
  return /[\u0E00-\u0E7F]/.test(text);
}

function cleanText(text: string): string {
  return text.replace(/https?:\/\/[^\s]+/g, '')
    .replace(/[^a-zA-Z0-9\u0E00-\u0E7F\s.,!?'"():;]/g, '')
    .trim()
    .substring(0, 500);
}

function isValidString(str: string | undefined): str is string {
  return typeof str === 'string' && str.length > 0 && str.length <= 500;
}

function extractTranslation(response: string): string {
  const trimmed = response.trim();
  const lines = trimmed.split('\n').map(l => l.trim()).filter(l => l.length > 0 && l.length <= 150);
  return lines[0] || trimmed.substring(0, 100);
}

async function translate(text: string, targetLang: string, apiKey: string): Promise<string> {
  if (!isValidString(text)) return text;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://line-translation-bot.vercel.app',
        'X-OpenRouter-Title': 'LINE Translation Bot'
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'Translate ONLY to ' + targetLang + '. Return just the translation. No explanations.' },
          { role: 'user', content: text }
        ],
        temperature: 0.2,
        top_p: 0.9,
        max_tokens: 50
      }),
      signal: controller.signal
    });

    if (!res.ok) {
      return text;
    }

    const data = (await res.json()) as any;
    const content = data.choices?.[0]?.message?.content;

    if (!content || typeof content !== 'string') {
      return text;
    }

    return extractTranslation(content);
  } catch (e) {
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
      const translated = await translate(text, targetLang, openrouterKey);

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

