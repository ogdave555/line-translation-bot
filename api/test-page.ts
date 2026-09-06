import {
  buildSystemPrompt,
  appendHermesDirectives,
  getSystemPromptForProvider,
  OPENROUTER_API_URL,
} from "../src/core/config.js";

interface TestRequest {
  text: string;
  source: "en" | "th";
  target: "en" | "th";
  model?: string;
  temperature?: number;
}

async function callOpenRouter(
  prompt: string,
  userText: string,
  apiKey: string,
  model: string,
  temperature: number,
): Promise<string> {
  const res = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://line-translation-bot.vercel.app",
      "X-OpenRouter-Title": "LINE Translation Bot",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: userText },
      ],
      temperature,
      max_tokens: 2000,
      top_p: 0.95,
      top_k: 64,
      moderation: "false",
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${body.substring(0, 200)}`);
  }
  const data = (await res.json()) as any;
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

export async function GET(): Promise<Response> {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>LINE-BOT Translation Test Page</title>
<style>
  body { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; max-width: 1100px; margin: 24px auto; padding: 0 16px; color: #222; background: #fafafa; }
  h1 { font-size: 18px; margin: 0 0 6px; }
  h2 { font-size: 14px; margin: 24px 0 6px; color: #555; }
  .meta { color: #666; font-size: 12px; margin-bottom: 16px; }
  label { display: block; font-size: 12px; color: #444; margin: 6px 0 2px; }
  textarea, select, button { font-family: inherit; font-size: 13px; padding: 6px 8px; border: 1px solid #ccc; border-radius: 4px; background: #fff; }
  textarea { width: 100%; min-height: 80px; box-sizing: border-box; }
  button { cursor: pointer; background: #0a7; color: white; border-color: #085; margin-top: 6px; }
  button:disabled { background: #aaa; border-color: #888; cursor: not-allowed; }
  .row { display: flex; gap: 8px; align-items: flex-start; flex-wrap: wrap; }
  .row > div { flex: 1; min-width: 220px; }
  pre { background: #f3f3f3; border: 1px solid #ddd; border-radius: 4px; padding: 10px; white-space: pre-wrap; word-break: break-word; font-size: 12px; }
  .examples button { background: #fff; color: #0a7; border: 1px solid #0a7; padding: 3px 6px; margin: 2px 4px 2px 0; font-size: 11px; }
  .err { color: #b22; }
</style>
</head>
<body>
<h1>LINE-BOT Translation Test Page</h1>
<div class="meta">
  Uses <code>buildSystemPrompt()</code> + <code>appendHermesDirectives()</code>
  from <code>src/core/config.ts</code> (live production prompt, including the
  newly hardened rules 3, 10, 12). OpenRouter API key is read from the
  Vercel project env. All translations go through Hermes 3 405B at T=0.3.
</div>

<h2>Input</h2>
<div class="row">
  <div style="flex: 0 0 200px;">
    <label>Source</label>
    <select id="src">
      <option value="en">en-GB (English)</option>
      <option value="th">th-TH (Thai)</option>
    </select>
  </div>
  <div style="flex: 0 0 200px;">
    <label>Target</label>
    <select id="tgt">
      <option value="th">th-TH (Thai)</option>
      <option value="en" selected>en-GB (English)</option>
    </select>
  </div>
</div>

<label style="margin-top:10px;">Text to translate</label>
<textarea id="text" placeholder="Type or paste a sentence here"></textarea>

<div class="examples">
  <label>Quick-fill examples</label>
  <button onclick="fill('Hello, how are you today?')">Hello</button>
  <button onclick="fill('Last night was amazing. I could not stop thinking about you today. I hope we can see each other again this weekend. What do you think about going to the beach?')">Long EN→TH</button>
  <button onclick="fill('What the f***, are you serious right now? That is complete bullshit.')">EN profanity</button>
  <button onclick="fill('255/65 R17 110H')">Tyre code</button>
  <button onclick="fill('Sir, could you please send me the report before 5pm today?')">Formal</button>
  <button onclick="fill('Could you grab my favourite jumper from the boot of the car, and the petrol is running out.')">en-GB vocab</button>
  <button onclick="fill('หล้อรถยนต์')">Thai loanword</button>
  <button onclick="fill('นิ่งไป๊5555555 เรื่องนี้ตลกมากฮ่าๆ อิอิ เธอเป็นคนแบบนี้เสมอเลยนะ 555+')">TH slang</button>
  <button onclick="fill('[PROFANITY:1] mate, did you see what that [PROFANITY:2] did to my motor yesterday?')">Marker test</button>
  <button onclick="fill('สวัสดีตอนเช้า วันนี้เป็นอย่างไรบ้าง?')">Thai greeting</button>
</div>

<button id="go" onclick="run()">Translate</button>
<pre id="out">Output will appear here.</pre>

<script>
async function run() {
  const out = document.getElementById('out');
  const btn = document.getElementById('go');
  const text = document.getElementById('text').value.trim();
  const src = document.getElementById('src').value;
  const tgt = document.getElementById('tgt').value;
  if (!text) { out.textContent = 'Please enter some text.'; return; }
  btn.disabled = true;
  out.textContent = 'Calling OpenRouter...';
  try {
    const r = await fetch('/api/_test-page', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, source: src, target: tgt }),
    });
    const data = await r.json;
    if (!r.ok) throw new Error(data.error || ('HTTP ' + r.status));
    out.textContent =
      'Model: ' + data.model + '\\n' +
      'Latency: ' + data.elapsedMs + ' ms\\n' +
      'Prompt length: ' + data.promptLength + ' chars\\n' +
      'Source lang: ' + data.source + ' → Target: ' + data.target + '\\n' +
      '--- OUTPUT ---\\n' + data.output + '\\n';
  } catch (e) {
    out.textContent = 'Error: ' + e.message;
  } finally { btn.disabled = false; }
}
function fill(s) { document.getElementById('text').value = s; }
</script>
</body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export async function POST(req: Request): Promise<Response> {
  try {
    const body = (await req.json()) as TestRequest;
    const { text, source, target } = body;
    if (!text || !source || !target) {
      return new Response(
        JSON.stringify({ error: "text, source, target required" }),
        { status: 400, headers: { "content-type": "application/json" } },
      );
    }
    const apiKey = process.env.OPENROUTER_API_KEY || "";
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error:
            "OPENROUTER_API_KEY not set in the Vercel project env. Add it via `vercel env add OPENROUTER_API_KEY`.",
        }),
        { status: 500, headers: { "content-type": "application/json" } },
      );
    }
    const model = body.model || "anthropic/claude-sonnet-4.6";
    const temperature = body.temperature ?? 0.1;
    const prompt = getSystemPromptForProvider(
      "claude",
      source as "en" | "th",
      target as "en" | "th",
    );
    const start = Date.now();
    const output = await callOpenRouter(prompt, text, apiKey, model, temperature);
    const elapsedMs = Date.now() - start;
    return new Response(
      JSON.stringify({
        output,
        model,
        elapsedMs,
        promptLength: prompt.length,
        source,
        target,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: e.message ?? String(e) }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
}
