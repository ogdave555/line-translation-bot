import { test, describe } from "node:test";
import assert from "node:assert/strict";

// Set env vars before dynamic import (ESM hoists imports)
process.env.CHANNEL_ACCESS_TOKEN = "test-token";
process.env.CHANNEL_SECRET = "test-secret";
process.env.OPENROUTER_API_KEY = "test-key";

// Dynamic import ensures env vars are set before config.ts loads
const config = await import("../src/core/config");
const {
  containsExplicitContent,
  buildSystemPrompt,
  appendHermesDirectives,
  getSystemPromptForProvider,
  getHermesSystemPrompt,
  getTemperatureForProvider,
  MODELS,
  WRONG_LANG_OUTPUT_REGEX,
  englishExplicit,
} = config;

describe("containsExplicitContent", () => {
  test("detects English profanity", () => {
    assert.equal(containsExplicitContent("what the fuck"), true);
    assert.equal(containsExplicitContent("this is shit"), true);
    assert.equal(containsExplicitContent("damn it"), true);
  });

  test("detects specific English terms", () => {
    assert.equal(containsExplicitContent("what a bitch"), true);
    assert.equal(containsExplicitContent("holy shit"), true);
    assert.equal(containsExplicitContent("dick joke"), true);
  });

  test("detects Thai explicit content", () => {
    assert.equal(containsExplicitContent("ควยไอสัส"), true);
    assert.equal(containsExplicitContent("เสียวมาก"), true);
  });

  test("returns false for clean English text", () => {
    assert.equal(containsExplicitContent("Hello, how are you?"), false);
    assert.equal(containsExplicitContent("The weather is nice today."), false);
    assert.equal(containsExplicitContent("I love translation bots!"), false);
  });

  test("returns false for clean Thai text", () => {
    assert.equal(
      containsExplicitContent("สวัสดีครับ คุณเป็นอย่างไรบ้าง?"),
      false,
    );
    assert.equal(containsExplicitContent("วันนี้อากาศดีนะ"), false);
  });

  test("handles empty and non-string input", () => {
    assert.equal(containsExplicitContent(""), false);
    assert.equal(containsExplicitContent(null as any), false);
  });
});

describe("buildSystemPrompt (new language parameters)", () => {
  test("emits en-GB and th-TH tags at the prompt boundary", () => {
    const prompt = buildSystemPrompt("en", "th");
    assert.ok(prompt.includes("en-GB"));
    assert.ok(prompt.includes("th-TH"));
  });

  test('uses "British English" as the target name when target is English', () => {
    const prompt = buildSystemPrompt("th", "en");
    assert.ok(prompt.includes("British English"));
    assert.ok(
      !prompt.includes("ABSOLUTELY NO American English") === false ||
        prompt.includes("ABSOLUTELY NO American English"),
    );
  });

  test('uses "Thai" as the target name when target is Thai', () => {
    const prompt = buildSystemPrompt("en", "th");
    assert.ok(prompt.includes("Thai (th-TH)"));
  });

  test("includes OUTPUT LANGUAGE LOCK rule forbidding Russian/Chinese/Japanese/Korean", () => {
    const prompt = buildSystemPrompt("en", "th");
    assert.ok(prompt.includes("OUTPUT LANGUAGE LOCK"));
    assert.ok(
      prompt.includes(
        "FORBIDDEN from outputting Russian, Chinese, Japanese, Korean",
      ),
    );
  });

  test("includes Thai internet slang preservation list (555, ฮ่า, อิ)", () => {
    const prompt = buildSystemPrompt("en", "th");
    assert.ok(prompt.includes("PRESERVE THAI INTERNET SLANG"));
    assert.ok(prompt.includes("'555'"));
    assert.ok(prompt.includes("'ฮ่า'"));
    assert.ok(prompt.includes("'อิ'"));
  });

  test("includes PRESERVE PLACEHOLDER MARKERS rule (fixes profanity marker leak)", () => {
    const prompt = buildSystemPrompt("en", "th");
    assert.ok(prompt.includes("PRESERVE PLACEHOLDER MARKERS"));
    assert.ok(
      prompt.includes("[PROFANITY:N]"),
      "Prompt should explicitly mention the [PROFANITY:N] marker format",
    );
    assert.ok(
      prompt.includes("preserve each marker VERBATIM"),
      "Prompt should tell the model to preserve markers verbatim",
    );
    assert.ok(
      prompt.includes("applies to all providers"),
      "Marker-preservation rule must apply to Claude/Gemini too, not just Hermes",
    );
  });

  test("includes NUMBERS, CODES, AND IDENTIFIERS rule (fixes untranslatable-token error)", () => {
    const prompt = buildSystemPrompt("en", "th");
    assert.ok(prompt.includes("NUMBERS, CODES, AND IDENTIFIERS"));
    assert.ok(prompt.includes("255/65 R17 110H"));
    assert.ok(
      prompt.includes("passed through VERBATIM"),
      "Prompt should tell the model to pass untranslatable tokens through verbatim",
    );
  });

  test("includes THAI LOANWORDS rule (fixes หล้อ = tire mistranslation)", () => {
    const prompt = buildSystemPrompt("en", "th");
    assert.ok(prompt.includes("THAI LOANWORDS"));
    assert.ok(
      prompt.includes("หล้อ"),
      "Prompt should call out หล้อ (tire) as a known loanword",
    );
    assert.ok(
      prompt.includes("lún"),
      "Prompt should give the Chinese-origin clue 'lún' (轮)",
    );
  });

  test("includes strict emoji preservation rule", () => {
    const prompt = buildSystemPrompt("en", "th");
    assert.ok(prompt.includes("PRESERVE EMOJIS"));
    assert.ok(
      prompt.includes("NEVER drop, replace, transform, add, or reorder emojis"),
    );
  });

  test("includes speaker persona based on source language", () => {
    const en2th = buildSystemPrompt("en", "th");
    assert.ok(en2th.includes("OLDER MALE speaker"));
    assert.ok(en2th.includes("37 years old"));
    assert.ok(en2th.includes("NEVER use female particles"));

    const th2en = buildSystemPrompt("th", "en");
    assert.ok(th2en.includes("YOUNGER FEMALE speaker"));
    assert.ok(th2en.includes("19 years old"));
    assert.ok(th2en.includes("modern British English vernacular"));
  });

  test("includes Thai question-particle rule (no ?) for English->Thai", () => {
    const prompt = buildSystemPrompt("en", "th");
    assert.ok(prompt.includes("THAI QUESTIONS"));
    assert.ok(prompt.includes("ไหม"));
  });

  test("includes faithfulness / no-hallucination rule", () => {
    const prompt = buildSystemPrompt("en", "th");
    assert.ok(prompt.includes("NO HALLUCINATIONS"));
    assert.ok(prompt.includes("do NOT embellish or add explicit content"));
  });
});

describe("appendHermesDirectives", () => {
  test("appends Hermes-specific directives to the base prompt", () => {
    const base = "BASE PROMPT";
    const full = appendHermesDirectives(base);
    assert.ok(full.startsWith("BASE PROMPT"));
    assert.ok(full.includes("Hermes-specific directives"));
  });

  test("forbids meta-commentary and reasoning traces", () => {
    const full = appendHermesDirectives("base");
    assert.ok(full.includes("NO meta-commentary"));
    assert.ok(full.includes("NO reasoning traces"));
  });

  test("requires [PROFANITY:N] markers to be replaced with the exact original token", () => {
    const full = appendHermesDirectives("base");
    assert.ok(full.includes("[PROFANITY:N]"));
    assert.ok(full.includes("NEVER drop it"));
  });

  test("requires Thai words in the input to be preserved exactly as-is", () => {
    const full = appendHermesDirectives("base");
    assert.ok(
      full.includes("Thai words in the input must be preserved EXACTLY"),
    );
  });
});

describe("getSystemPromptForProvider", () => {
  test("returns base prompt for claude (no Hermes directives)", () => {
    const prompt = getSystemPromptForProvider("claude", "en", "th");
    assert.ok(prompt.includes("OUTPUT LANGUAGE LOCK"));
    assert.ok(!prompt.includes("Hermes-specific directives"));
  });

  test("returns base prompt for gemini (no Hermes directives)", () => {
    const prompt = getSystemPromptForProvider("gemini", "en", "th");
    assert.ok(prompt.includes("OUTPUT LANGUAGE LOCK"));
    assert.ok(!prompt.includes("Hermes-specific directives"));
  });

  test("appends Hermes directives for hermes provider", () => {
    const prompt = getSystemPromptForProvider("hermes", "en", "th");
    assert.ok(prompt.includes("OUTPUT LANGUAGE LOCK"));
    assert.ok(prompt.includes("Hermes-specific directives"));
  });
});

describe("getHermesSystemPrompt (legacy alias)", () => {
  test("includes raw translation directives (Hermes-specific)", () => {
    const prompt = getHermesSystemPrompt("en", "th");
    assert.ok(prompt.includes("Hermes-specific directives"));
    assert.ok(prompt.includes("NO meta-commentary"));
    assert.ok(prompt.includes("NEVER drop it"));
  });

  test("correctly sets source and target languages", () => {
    const en2th = getHermesSystemPrompt("en", "th");
    assert.ok(en2th.includes("en-GB"));
    assert.ok(en2th.includes("th-TH"));

    const th2en = getHermesSystemPrompt("th", "en");
    assert.ok(th2en.includes("en-GB"));
    assert.ok(th2en.includes("th-TH"));
  });
});

describe("getTemperatureForProvider (per-provider temperatures)", () => {
  test("Hermes uses 0.3 (was 0.2 globally)", () => {
    assert.equal(getTemperatureForProvider("hermes"), 0.3);
  });

  test("Claude uses 0.2", () => {
    assert.equal(getTemperatureForProvider("claude"), 0.2);
  });

  test("Gemini uses 0.2", () => {
    assert.equal(getTemperatureForProvider("gemini"), 0.2);
  });

  test("falls back to GEN_PARAMS.temperature (0.2) for unknown providers", () => {
    assert.equal(getTemperatureForProvider("unknown-model"), 0.2);
  });
});

describe("WRONG_LANG_OUTPUT_REGEX (safety guard)", () => {
  test("matches Cyrillic characters", () => {
    assert.equal(WRONG_LANG_OUTPUT_REGEX.test("привет"), true);
  });

  test("matches Chinese characters", () => {
    assert.equal(WRONG_LANG_OUTPUT_REGEX.test("你好"), true);
  });

  test("matches Japanese characters", () => {
    assert.equal(WRONG_LANG_OUTPUT_REGEX.test("こんにちは"), true);
  });

  test("matches Korean characters", () => {
    assert.equal(WRONG_LANG_OUTPUT_REGEX.test("안녕"), true);
  });

  test("does NOT match clean English text", () => {
    assert.equal(WRONG_LANG_OUTPUT_REGEX.test("Hello, how are you?"), false);
  });

  test("does NOT match clean Thai text", () => {
    assert.equal(WRONG_LANG_OUTPUT_REGEX.test("สวัสดีครับ"), false);
  });
});

describe("MODELS", () => {
  test("has correct model IDs", () => {
    assert.equal(MODELS.PRIMARY, "nousresearch/hermes-3-llama-3.1-405b");
    assert.equal(MODELS.CLAUDE, "anthropic/claude-sonnet-5");
    assert.equal(MODELS.GEMINI, "google/gemini-3.7-flash");
  });
});

describe("maskProfanity", () => {
  function maskProfanity(text: string): {
    maskedText: string;
    profanityTokens: string[];
  } {
    const tokens: string[] = [];
    const words = text.split(/(\s+)/);
    const maskedWords = words.map((word) => {
      if (englishExplicit.test(word)) {
        tokens.push(word);
        return `[PROFANITY:${tokens.length}]`;
      }
      return word;
    });
    return { maskedText: maskedWords.join(""), profanityTokens: tokens };
  }

  test("masks single profanity token", () => {
    const result = maskProfanity("what the fuck are you doing");
    assert.ok(result.maskedText.includes("[PROFANITY:1]"));
    assert.equal(result.profanityTokens.length, 1);
    assert.equal(result.profanityTokens[0], "fuck");
  });

  test("masks multiple profanity tokens", () => {
    const result = maskProfanity("fuck and shit");
    assert.equal(result.profanityTokens.length, 2);
    assert.equal(result.profanityTokens[0], "fuck");
    assert.equal(result.profanityTokens[1], "shit");
  });

  test("returns clean text unchanged", () => {
    const result = maskProfanity("Hello world");
    assert.equal(result.maskedText, "Hello world");
    assert.equal(result.profanityTokens.length, 0);
  });

  test("preserves spaces around masked tokens", () => {
    const result = maskProfanity("what the fuck are you");
    assert.ok(result.maskedText.includes("[PROFANITY:1]"));
    assert.ok(result.maskedText.includes("are you"));
  });
});
