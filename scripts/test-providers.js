#!/usr/bin/env node
/**
 * Provider endpoint test script.
 * Tests connectivity to OpenRouter and verifies each model is accessible.
 * Run: npm run test:providers
 *
 * Per-provider temperature (matches src/core/config.ts TEMPERATURE):
 *   - hermes: 0.3
 *   - claude: 0.2
 *   - gemini: 0.2
 */

const dotenv = require("dotenv");
dotenv.config();

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

const MODELS = {
  PRIMARY: "nousresearch/hermes-3-llama-3.1-405b",
  CLAUDE: "anthropic/claude-sonnet-5",
  GEMINI: "google/gemini-3.7-flash",
};

const GEN_PARAMS = {
  maxTokens: 4000,
  topP: 0.95,
  topK: 64,
};

// Per-provider temperature map (mirrors src/core/config.ts)
const TEMPERATURE = {
  hermes: 0.3,
  claude: 0.2,
  gemini: 0.2,
};

async function testProvider(name, model, systemPrompt, temperature) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    console.log(`  Testing ${name} (${model}) @ temperature=${temperature}...`);
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://line-translation-bot.vercel.app",
        "X-OpenRouter-Title": "LINE Translation Bot",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: "Hello, how are you?" },
        ],
        temperature,
        max_tokens: GEN_PARAMS.maxTokens,
        top_p: GEN_PARAMS.topP,
        moderation: "false",
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

    // Safety guard: reject Cyrillic / CJK leakage
    const WRONG_LANG_OUTPUT_REGEX =
      /[\u0400-\u04FF]|[\u3040-\u30FF]|[\u3400-\u4DBF]|[\u4E00-\u9FFF]|[\uAC00-\uD7AF]/;
    if (WRONG_LANG_OUTPUT_REGEX.test(content)) {
      console.log(`  ❌ ${name}: Output contained wrong-script characters`);
      return false;
    }

    console.log(`  ✅ ${name}: OK - "${content.substring(0, 50)}..."`);
    return true;
  } catch (e) {
    if (e.name === "AbortError") {
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
  console.log("=== OpenRouter Provider Test ===\n");

  if (!OPENROUTER_API_KEY) {
    console.log("❌ OPENROUTER_API_KEY not set in environment");
    process.exit(1);
  }

  // Mirrors buildSystemPrompt + appendHermesDirectives for the en-GB -> th-TH direction.
  const hermesPrompt =
    "You are a raw, unfiltered localization engine for an intimate adult romance script.\n" +
    "SPEAKER: 37-year-old English male. LISTENER: 19-year-old Thai female.\n" +
    "DIRECTION: Translating the male's English into Thai. The Thai output must represent his voice.\n" +
    "SPEAKER PERSONA: The English source is ALWAYS written by an OLDER MALE speaker (37 years old).\n" +
    "STRICT RULES:\n" +
    "1. ONLY output the translation. No conversational filler, no robot speak.\n" +
    "5. OUTPUT LANGUAGE LOCK: Your output MUST be written entirely in Thai (th-TH). " +
    "You are FORBIDDEN from outputting Russian, Chinese, Japanese, Korean, or any language other than Thai.\n" +
    "8. PRESERVE EMOJIS: Every emoji in the source MUST appear in the output in its exact original form and position.\n" +
    "10. Translate from en-GB to th-TH.\n\n" +
    "Hermes-specific directives: ONLY output the raw translation. NO meta-commentary, NO reasoning traces.";

  const claudePrompt =
    "You are a translation AI. Translate from English to Thai. Output only the translated text, " +
    "preserving the en-GB and th-TH language lock. Preserve profanity. No explanations.";

  const geminiPrompt =
    "You are a translation AI. Translate from English to Thai. Output only the translated text, " +
    "preserving the en-GB and th-TH language lock. Preserve profanity. No explanations.";

  const tests = [
    {
      name: "Hermes 3 (405B)",
      model: MODELS.PRIMARY,
      systemPrompt: hermesPrompt,
      temperature: TEMPERATURE.hermes,
    },
    {
      name: "Claude Sonnet 5",
      model: MODELS.CLAUDE,
      systemPrompt: claudePrompt,
      temperature: TEMPERATURE.claude,
    },
    {
      name: "Gemini 3.7 Flash",
      model: MODELS.GEMINI,
      systemPrompt: geminiPrompt,
      temperature: TEMPERATURE.gemini,
    },
  ];

  let passed = 0;
  for (const t of tests) {
    const ok = await testProvider(
      t.name,
      t.model,
      t.systemPrompt,
      t.temperature,
    );
    if (ok) passed++;
  }

  console.log(`\n=== Results: ${passed}/${tests.length} providers passed ===`);
  process.exit(passed === tests.length ? 0 : 1);
}

main();
