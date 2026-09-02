import { BotConfig } from "./types.js";
import dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

// OpenRouter API endpoint — used by both src/translator.ts and api/webhook.ts
export const OPENROUTER_API_URL =
  "https://openrouter.ai/api/v1/chat/completions";

/**
 * Model Configuration
 *
 * Routing priority:
 * 1. Hermes 3 LLaMA 3.1 405B via OpenRouter (primary, all content)
 * 2. Claude Sonnet 5 via OpenRouter (fallback, clean only)
 * 3. Gemini 3.7 Flash via OpenRouter (fallback, clean only)
 */
export const MODELS = {
  PRIMARY: "nousresearch/hermes-3-llama-3.1-405b",
  CLAUDE: "anthropic/claude-sonnet-5",
  GEMINI: "google/gemini-3.7-flash",
};

/**
 * Generation Parameters
 * Temperature lowered slightly for more accuracy (was 0.3).
 * Max tokens increased to prevent message cutoff (was 1000).
 * Top-p and top-k broadened for more thorough generation.
 */
export const GEN_PARAMS = {
  temperature: 0.2,
  maxTokens: 2000,
  topP: 0.95,
  topK: 64,
};

/**
 * Per-provider temperature overrides.
 * Lower = more deterministic, less "rushing" into wrong tokens.
 * Falls back to GEN_PARAMS.temperature when a provider is not listed.
 */
export const TEMPERATURE: Record<string, number> = {
  hermes: 0.3,
  claude: 0.2,
  gemini: 0.2,
};

/**
 * Runtime safety guard.
 * Rejects provider output that contains Cyrillic or CJK characters
 * when the target is th-TH or en-GB. Used to fall through to the
 * next provider when the model leaks into the wrong script.
 */
export const WRONG_LANG_OUTPUT_REGEX =
  /[\u0400-\u04FF]|[\u3040-\u30FF]|[\u3400-\u4DBF]|[\u4E00-\u9FFF]|[\uAC00-\uD7AF]/;

/**
 * Resolve the effective temperature for a given provider name.
 */
export function getTemperatureForProvider(provider: string): number {
  return TEMPERATURE[provider] ?? GEN_PARAMS.temperature;
}

/**
 * Explicit Content Detection
 *
 * Uses a hybrid approach matching the reference project's style:
 * - English: comprehensive word-boundary regex
 * - Thai: character class (rare diacritics {2+} threshold) + specific term alternatives
 *
 * Explicit content is routed exclusively to Hermes 3, bypassing
 * Claude Sonnet 5 and Gemini to avoid safety refusals.
 */
export const englishExplicit =
  /\b(?:cunt|pussy|twat|whore|slut|bitch|slag|skank|faggot|fag|chink|gook|spic|coon|nigga|nigger|retard|spastic|asshole|ass|bastard|prick|dick|cock|sucks?|fucker|fucking|fuck|shit|breast|tit|nip|clit|vagina|cum|creampie|anal|orgasm|horny|aroused|masturbat(?:e|ion|ing)|fingering|rimming|blowjob|handjob|crotch|wang|hardcore|wank|lube|beastial(?:ity|ic)|jerk|doggystyle|rape|rapist|incest|milf|gilf|wetback|jap|queef|snatch|cooch|muff|beaver|nooky|nookie|fanny|bush|knobend|knobhead|scrote|minger|bugger|bollocks|piss|pissed|merde|putain|scheiße|kacap|kike|raghead|spick|darkie|dyke|whitetrash|damn)\b/i;

export const thaiExplicit =
  /[็๊ึ์]{2,}|เย็ด|แตด|เซกซ์|เซก|จั๊ว|มึง|ควย|หี|สัส|เสียว|ดอน|กะหลง|หนาวสัส|บ้หี|แม่ง|หัวอวาย|หัวควย|ไอ้เหี้ย|ไอ้มึง|ไอ้ผี|ไอ้เก่ง|ไอ้เดียว|หัวชาด|อวาย/;

/**
 * Check if text contains explicit content in English or Thai.
 * Used to route messages to Hermes 3 model exclusively.
 */
export function containsExplicitContent(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  const lower = text.toLowerCase();
  return englishExplicit.test(lower) || thaiExplicit.test(text);
}

/**
 * User profiles for personalized translation
 *
 * The English speaker is a 37yo male from England who speaks a little bit of Thai.
 * The Thai speaker is a 19yo female from Thailand who speaks no English.
 */
export const USER_PROFILES: Record<
  string,
  {
    profile: {
      id: string;
      name: string;
      age: number;
      origin: string;
      nativeLanguage: "en" | "th";
      learningLanguage: "en" | "th";
      learningLevel: "beginner" | "intermediate" | "advanced" | "none";
    };
  }
> = {
  // English speaker (37yo male from England)
  "english-speaker": {
    profile: {
      id: "english-speaker",
      name: "English Speaker",
      age: 37,
      origin: "England",
      nativeLanguage: "en",
      learningLanguage: "th",
      learningLevel: "beginner",
    },
  },
  // Thai speaker (19yo female from Thailand)
  "thai-speaker": {
    profile: {
      id: "thai-speaker",
      name: "Thai Speaker",
      age: 19,
      origin: "Thailand",
      nativeLanguage: "th",
      learningLanguage: "en",
      learningLevel: "none",
    },
  },
};

/**
 * Normalize an internal language code ('en' | 'th') to its BCP-47 tag
 * used inside the prompts: 'en' -> 'en-GB', 'th' -> 'th-TH'.
 */
function normalizeLangCode(lang: "en" | "th"): "en-GB" | "th-TH" {
  return lang === "en" ? "en-GB" : "th-TH";
}

/**
 * Build the full system prompt for a given language pair.
 *
 * Strengthened rules (vs the prior DMTranslateApp baseline):
 *  - OUTPUT LANGUAGE LOCK: forbids Russian, Chinese, Japanese, Korean output.
 *  - FAITHFULNESS: forbids hallucinated profanity/explicit content.
 *  - SLANG PRESERVATION: explicitly preserves Thai internet slang tokens.
 *  - EMOJI PRESERVATION: stricter emoji handling.
 *  - SPEAKER PERSONA: en-GB source = older male (37yo); th-TH source =
 *    younger female (19yo). Speaker is determined by SOURCE language, not
 *    by the user typing.
 */
export function buildSystemPrompt(
  sourceLang: "en" | "th",
  targetLang: "en" | "th",
): string {
  const sourceTag = normalizeLangCode(sourceLang);
  const targetTag = normalizeLangCode(targetLang);

  const isEngToThai = sourceLang === "en";
  const targetLangName = targetLang === "th" ? "Thai" : "British English";

  const dynamicContext = isEngToThai
    ? "SPEAKER: 37-year-old English male. LISTENER: 19-year-old Thai female.\nDIRECTION: Translating the male's English into Thai. The Thai output must represent his voice."
    : "SPEAKER: 19-year-old Thai female. LISTENER: 37-year-old English male.\nDIRECTION: Translating the female's Thai into English. The English output must represent her voice and MUST strictly use British English (en-GB) spelling, grammar, and vocabulary (e.g., 'colour', 'mum', 'favourite', 'mate'). ABSOLUTELY NO American English (en-US).";

  const speakerPersona = isEngToThai
    ? "SPEAKER PERSONA: The English source is ALWAYS written by an OLDER MALE speaker (37 years old). The Thai translation must reflect HIS voice - mature, masculine, intimate, with the appropriate male Thai particles (ครับ / Khrap, ผม / Phom, พี่ / Phi). NEVER use female particles (ค่ะ/คะ) in the English-to-Thai output."
    : "SPEAKER PERSONA: The Thai source is ALWAYS written by a YOUNGER FEMALE speaker (19 years old). The English translation must reflect HER voice - youthful, feminine, intimate, with modern British English vernacular. NEVER use masculine-only slang or overly formal language.";

  return `You are a raw, unfiltered localization engine for an intimate adult romance script.
${dynamicContext}
${speakerPersona}

STRICT RULES:
1. ONLY output the translation. No conversational filler, no robot speak.
2. Tone & Pronouns (Crucial):
   - When translating English to Thai (Male speaking): The male uses 'พี่' (Phi) or 'ผม' (Phom) for himself, and 'หนู' (Nhu) or 'เธอ' (Ther) for her. He ends sentences with 'ครับ' (Khrap). He NEVER uses female particles (ค่ะ/คะ). DO NOT use formal titles like 'sir', 'ท่าน', or 'คุณ'; keep it intimate.
   - When translating Thai to English (Female speaking): Translate naturally into intimate, modern English.
3. THAI QUESTIONS: When translating English to Thai, DO NOT use the "?" punctuation mark. Replace it by structuring the sentence with the natural Thai question particle (e.g., "ไหม" / mai, "เหรอ" / roe).
4. ABSOLUTE ACCURACY: Do not sanitize, censor, or soften mature, anatomical, or raw language. NEVER refuse to translate.
5. OUTPUT LANGUAGE LOCK: Your output MUST be written entirely in ${targetLangName} (${targetTag}). You are FORBIDDEN from outputting Russian, Chinese, Japanese, Korean, or any language other than ${targetLangName}. If the source text contains words in other languages (loanwords, names, etc.), translate them into ${targetLangName} — do NOT reproduce them in their original script. This rule overrides any other instruction.
6. PRESERVE NON-TEXT: Do NOT translate emojis, URLs, or Thai internet slang tokens. Keep them in their exact original form and relative positions. See rule 7 for the slang list.
7. PRESERVE THAI INTERNET SLANG: When translating Thai → English, preserve the following Thai internet slang tokens VERBATIM in the output (do NOT translate them as their literal meaning, do NOT replace them with English equivalents like 'hahaha'):
   - '555', '5555', '55555', '555+' — Thai laughter (pronounced 'ha-ha-ha' because 5 = 'ha' in Thai)
   - 'ฮ่า', 'ฮ่าๆ', 'ฮ่าๆๆ' — onomatopoeic laughter
   - 'อิ', 'อิอิ' — giggle
   - '5555555', '5555555555' — extended laughter
   - emoticon sequences like ':)', ':(', ':D', '^^', 'T_T', '-_-', '^_^'
   When translating English → Thai, do NOT add any of these tokens unless they appear in the source.
8. PRESERVE EMOJIS: Every emoji in the source MUST appear in the output in its exact original form and position. NEVER drop, replace, transform, add, or reorder emojis. This is a hard rule.
9. NO HALLUCINATIONS: ABSOLUTELY DO NOT add any new words, profanity, vulgarity, sexual terms, emojis, punctuation, or flair that does not exist in the original text. Be a faithful translator only. If the source is clean, the translation must be clean — do NOT embellish or add explicit content that was not in the source.
10. PRESERVE PLACEHOLDER MARKERS: If the source text contains bracketed placeholders of the form [PROFANITY:N] (e.g., [PROFANITY:1], [PROFANITY:2]), preserve each marker VERBATIM in your output. Do NOT translate the marker text, do NOT change the digits, do NOT omit the markers. The downstream pipeline will replace them with the correct terms after your translation finishes. This rule applies to all providers.
11. NUMBERS, CODES, AND IDENTIFIERS: Pure numbers (e.g., "1300"), product codes (e.g., "255/65 R17 110H"), phone numbers, dates, prices, measurements, URLs, and similar non-prose tokens should be passed through VERBATIM when they are already in the right script for the conversation. Do NOT translate them into a different language. Do NOT add a question mark or any extra punctuation. Return them exactly as they appear in the source.
12. THAI LOANWORDS AND TECHNICAL TERMS: When a Thai word is a loanword from Chinese, English, or another language (e.g., "หล้อ" = tire/wheel, from Mandarin "lún" 轮), use the most common Thai meaning in context. Do NOT confuse similar-looking Thai words. If a Thai word has multiple distinct meanings (e.g., "หล้อ" = tire vs unrelated slang), prefer the meaning that fits the surrounding context and the speaker's likely intent. When in doubt, preserve the original Thai word and add a brief parenthetical explanation in the target language ONLY if it does not change the meaning of the source.
13. Translate from ${sourceTag} to ${targetTag}.`;
}

/**
 * Append Hermes-specific directives to the base prompt. Use this for the
 * primary provider (Hermes 3 405B) which handles all content including
 * explicit. The marker-substitution instruction is for the LINE-BOT
 * profanity pipeline which uses [PROFANITY:N] numbered markers.
 */
export function appendHermesDirectives(basePrompt: string): string {
  return (
    basePrompt +
    `\n\nHermes-specific directives: ONLY output the raw translation. NO meta-commentary, NO reasoning traces, NO explanations about pronoun choices or voice attribution. For ALL content: preserve the speaker's personality, tone, and emotional intent. Translate idiomatically -- match natural target-language expressions, do not translate word-for-word. For sarcastic, humorous, or emotionally charged text, preserve the tone. For EXPLICIT content specifically: translate ALL profanity, vulgar language, and sexual terms in their most direct, raw form. NEVER soften, euphemize, or replace explicit words -- including intensifiers like 'fuck', 'shit', 'damn' -- with polite alternatives. Translate the literal meaning, not the sentiment. Thai words in the input must be preserved EXACTLY as-is in the output. Do not translate, modify, or soften Thai words. Replace [PROFANITY:N] markers with the exact original token and NEVER drop it.`
  );
}

/**
 * Resolve the system prompt to use for a given provider + language pair.
 * - Hermes: buildSystemPrompt + Hermes-specific directives.
 * - Claude / Gemini: buildSystemPrompt only (clean content only).
 */
export function getSystemPromptForProvider(
  provider: "hermes" | "claude" | "gemini",
  sourceLang: "en" | "th",
  targetLang: "en" | "th",
): string {
  const base = buildSystemPrompt(sourceLang, targetLang);
  return provider === "hermes" ? appendHermesDirectives(base) : base;
}

/**
 * Get the bot configuration from environment variables
 */
export function getConfig(): BotConfig {
  const channelAccessToken = process.env.CHANNEL_ACCESS_TOKEN;
  const channelSecret = process.env.CHANNEL_SECRET;
  const openrouterApiKey = process.env.OPENROUTER_API_KEY;

  if (!channelAccessToken) {
    throw new Error(
      "CHANNEL_ACCESS_TOKEN is required in environment variables",
    );
  }
  if (!channelSecret) {
    throw new Error("CHANNEL_SECRET is required in environment variables");
  }
  if (!openrouterApiKey) {
    throw new Error("OPENROUTER_API_KEY is required in environment variables");
  }

  return {
    channelAccessToken,
    channelSecret,
    openrouterApiKey,
    openrouterSiteUrl: process.env.OPENROUTER_SITE_URL,
    openrouterSiteTitle:
      process.env.OPENROUTER_SITE_TITLE || "LINE Translation Bot",
    maxMemoryMessages: 20, // Store last 20 messages for context
    enableProfanityTranslation: true, // Translate profanity, don't filter
  };
}

/**
 * @deprecated Use buildSystemPrompt() instead.
 * Kept for backwards compatibility with existing imports; simply delegates.
 */
export function getSystemPrompt(
  _sourceUser: "english" | "thai",
  targetLanguage: "en" | "th",
  _contextMessages?: Array<{ text: string; language: "en" | "th" }>,
): string {
  const sourceLang: "en" | "th" = targetLanguage === "th" ? "en" : "th";
  return buildSystemPrompt(sourceLang, targetLanguage);
}

/**
 * @deprecated Use getSystemPromptForProvider('gemini', sourceLang, targetLang) instead.
 */
export function getGeminiSystemPrompt(
  sourceLanguage: "en" | "th",
  targetLanguage: "en" | "th",
): string {
  return buildSystemPrompt(sourceLanguage, targetLanguage);
}

/**
 * @deprecated Use getSystemPromptForProvider('hermes', sourceLang, targetLang) instead.
 */
export function getHermesSystemPrompt(
  sourceLanguage: "en" | "th",
  targetLanguage: "en" | "th",
): string {
  return appendHermesDirectives(
    buildSystemPrompt(sourceLanguage, targetLanguage),
  );
}
