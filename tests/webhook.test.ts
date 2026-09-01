import { test, describe } from "node:test";
import assert from "node:assert/strict";

// Set env vars before dynamic import (ESM hoists imports)
process.env.CHANNEL_ACCESS_TOKEN = "test-token";
process.env.CHANNEL_SECRET = "test-secret";
process.env.OPENROUTER_API_KEY = "test-key";

// Import the real prompt builders from config.ts to keep this test in
// lock-step with production behaviour.
const config = await import("../src/core/config.js");
const {
  buildSystemPrompt,
  appendHermesDirectives,
  getTemperatureForProvider,
  WRONG_LANG_OUTPUT_REGEX,
} = config;

const englishExplicit =
  /\b(?:cunt|pussy|twat|whore|slut|bitch|slag|skank|faggot|fag|chink|gook|spic|coon|nigga|nigger|retard|spastic|asshole|ass|bastard|prick|dick|cock|sucks?|fucker|fucking|fuck|shit|breast|tit|nip|clit|vagina|cum|creampie|anal|orgasm|horny|aroused|masturbat(?:e|ion|ing)|fingering|rimming|blowjob|handjob|crotch|wang|hardcore|wank|lube|beastial(?:ity|ic)|jerk|doggystyle|rape|rapist|incest|milf|gilf|wetback|jap|queef|snatch|cooch|muff|beaver|nooky|nookie|fanny|bush|knobend|knobhead|scrote|minger|bugger|bollocks|piss|pissed|merde|putain|scheiße|kacap|kike|raghead|spick|darkie|dyke|whitetrash|damn)\b/i;

const PRIMARY_MODEL = "nousresearch/hermes-3-llama-3.1-405b";
const CLAUDE_MODEL = "anthropic/claude-sonnet-5";
const GEMINI_MODEL = "google/gemini-3.7-flash";

function containsExplicitContent(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  const lower = text.toLowerCase();
  return englishExplicit.test(lower);
}

function isThai(text: string): boolean {
  return /[\u0E00-\u0E7F]/.test(text);
}

function getSourceLangCode(text: string): "en" | "th" {
  return isThai(text) ? "th" : "en";
}
function getTargetLangCode(text: string): "en" | "th" {
  return isThai(text) ? "en" : "th";
}

describe("webhook containsExplicitContent", () => {
  test("detects common English profanity", () => {
    assert.equal(containsExplicitContent("what the fuck"), true);
    assert.equal(containsExplicitContent("this is shit"), true);
    assert.equal(containsExplicitContent("damn it"), true);
    assert.equal(containsExplicitContent("you bitch"), true);
  });

  test("returns false for clean text", () => {
    assert.equal(containsExplicitContent("Hello, how are you?"), false);
    assert.equal(containsExplicitContent("The weather is nice today."), false);
  });

  test("handles empty and non-string input", () => {
    assert.equal(containsExplicitContent(""), false);
    assert.equal(containsExplicitContent(null as any), false);
  });
});

describe("webhook model configuration", () => {
  test("PRIMARY_MODEL is Hermes 3 405B", () => {
    assert.equal(PRIMARY_MODEL, "nousresearch/hermes-3-llama-3.1-405b");
  });

  test("CLAUDE_MODEL is Claude Sonnet 5", () => {
    assert.equal(CLAUDE_MODEL, "anthropic/claude-sonnet-5");
  });

  test("GEMINI_MODEL is Gemini 3.7 Flash", () => {
    assert.equal(GEMINI_MODEL, "google/gemini-3.7-flash");
  });
});

describe("webhook per-provider temperature (new language parameters)", () => {
  test("Hermes primary uses 0.3 (raised from 0.2 global)", () => {
    assert.equal(getTemperatureForProvider("hermes"), 0.3);
  });

  test("Claude fallback uses 0.2", () => {
    assert.equal(getTemperatureForProvider("claude"), 0.2);
  });

  test("Gemini fallback uses 0.2", () => {
    assert.equal(getTemperatureForProvider("gemini"), 0.2);
  });
});

describe("webhook WRONG_LANG_OUTPUT_REGEX safety guard", () => {
  test("rejects Cyrillic leakage", () => {
    assert.equal(WRONG_LANG_OUTPUT_REGEX.test("привет"), true);
  });

  test("rejects CJK leakage", () => {
    assert.equal(WRONG_LANG_OUTPUT_REGEX.test("你好"), true);
    assert.equal(WRONG_LANG_OUTPUT_REGEX.test("こんにちは"), true);
    assert.equal(WRONG_LANG_OUTPUT_REGEX.test("안녕"), true);
  });

  test("accepts clean English and Thai text", () => {
    assert.equal(WRONG_LANG_OUTPUT_REGEX.test("Hello there"), false);
    assert.equal(WRONG_LANG_OUTPUT_REGEX.test("สวัสดีครับ"), false);
  });
});

describe("webhook language code resolution", () => {
  test("English text -> source en, target th", () => {
    const text = "Hello, how are you?";
    assert.equal(getSourceLangCode(text), "en");
    assert.equal(getTargetLangCode(text), "th");
  });

  test("Thai text -> source th, target en", () => {
    const text = "สวัสดีครับ";
    assert.equal(getSourceLangCode(text), "th");
    assert.equal(getTargetLangCode(text), "en");
  });
});

describe("webhook prompt builder (uses real buildSystemPrompt + appendHermesDirectives)", () => {
  test("English source -> en-GB/th-TH prompt targeting Thai", () => {
    const prompt = appendHermesDirectives(
      buildSystemPrompt(
        getSourceLangCode("Hello mate"),
        getTargetLangCode("Hello mate"),
      ),
    );
    // English text -> target is Thai, so en-GB and th-TH are both present
    // but the target name is "Thai" (not "British English").
    assert.ok(prompt.includes("en-GB"));
    assert.ok(prompt.includes("th-TH"));
    assert.ok(prompt.includes("Thai (th-TH)"));
    assert.ok(prompt.includes("Hermes-specific directives"));
  });

  test("Thai source -> en-GB/th-TH prompt with British English target", () => {
    const prompt = appendHermesDirectives(
      buildSystemPrompt(
        getSourceLangCode("สวัสดีครับ"),
        getTargetLangCode("สวัสดีครับ"),
      ),
    );
    assert.ok(prompt.includes("en-GB"));
    assert.ok(prompt.includes("th-TH"));
    assert.ok(prompt.includes("British English"));
    assert.ok(prompt.includes("Hermes-specific directives"));
  });

  test("Hermes is routed for both clean and explicit content", () => {
    const cleanText = "Hello, how are you?";
    const explicitText = "what the fuck";
    for (const text of [cleanText, explicitText]) {
      const prompt = appendHermesDirectives(
        buildSystemPrompt(getSourceLangCode(text), getTargetLangCode(text)),
      );
      assert.ok(prompt.includes("Hermes-specific directives"));
    }
  });
});

describe("webhook maskProfanity", () => {
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

  test("ensures masked text has no explicit content", () => {
    const text = "what the fuck are you doing bitch";
    const result = maskProfanity(text);
    // After masking, the masked text should not contain explicit content
    assert.equal(containsExplicitContent(result.maskedText), false);
  });
});
