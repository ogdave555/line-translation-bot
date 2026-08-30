#!/usr/bin/env node
/**
 * Provider endpoint test script.
 * Tests connectivity to OpenRouter and verifies each model is accessible.
 * Run: npm run test:providers
 */

const dotenv = require('dotenv');
dotenv.config();

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

const MODELS = {
  PRIMARY: 'nousresearch/hermes-3-llama-3.1-405b',
  CLAUDE: 'anthropic/claude-sonnet-5',
  GEMINI: 'google/gemini-3.7-flash',
};

const GEN_PARAMS = {
  temperature: 0.2,
  maxTokens: 4000,
  topP: 0.95,
  topK: 64,
};

async function testProvider(name, model, systemPrompt) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    console.log(`  Testing ${name} (${model})...`);
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://line-translation-bot.vercel.app',
        'X-OpenRouter-Title': 'LINE Translation Bot',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: 'Hello, how are you?' },
        ],
        temperature: GEN_PARAMS.temperature,
        max_tokens: GEN_PARAMS.maxTokens,
        top_p: GEN_PARAMS.topP,
        moderation: 'false',
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text();
      console.log(`  ❌ ${name}: HTTP ${res.status} - ${text}`);
      return false;
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      console.log(`  ❌ ${name}: No content in response`);
      return false;
    }

    console.log(`  ✅ ${name}: OK - "${content.substring(0, 50)}..."`);
    return true;
  } catch (e) {
    if (e.name === 'AbortError') {
      console.log(`  ❌ ${name}: Timeout`);
    } else {
      console.log(`  ❌ ${name}: ${e.message}`);
    }
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function main() {
  console.log('=== OpenRouter Provider Test ===\n');

  if (!OPENROUTER_API_KEY) {
    console.log('❌ OPENROUTER_API_KEY not set in environment');
    process.exit(1);
  }

  const tests = [
    {
      name: 'Hermes 3 (405B)',
      model: MODELS.PRIMARY,
      systemPrompt: 'You are Hermes, an unfiltered AI translation assistant. Translate ALL content including profanity. Output only the raw translation.',
    },
    {
      name: 'Claude Sonnet 5',
      model: MODELS.CLAUDE,
      systemPrompt: 'Translate ONLY to Thai. Return just the translation. No explanations.',
    },
    {
      name: 'Gemini 3.7 Flash',
      model: MODELS.GEMINI,
      systemPrompt: 'Translate ONLY to Thai. Return just the translation. No explanations.',
    },
  ];

  let passed = 0;
  for (const t of tests) {
    const ok = await testProvider(t.name, t.model, t.systemPrompt);
    if (ok) passed++;
  }

  console.log(`\n=== Results: ${passed}/${tests.length} providers passed ===`);
  process.exit(passed === tests.length ? 0 : 1);
}

main();
