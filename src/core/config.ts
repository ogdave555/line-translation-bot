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
 * 1. Claude Sonnet 4.6 via the Anthropic native Messages API
 *    (CLAUDE_API_KEY, model id `claude-sonnet-4-6`).
 * 2. Llama 3.3 70B via OpenRouter (OPENROUTER_API_KEY, fallback only).
 *
 * The legacy `MODELS.CLAUDE` OpenRouter-style string is kept as an alias
 * for backwards compatibility with existing tests, but production code
 * must route Claude through `callAnthropic()` in src/core/anthropic.ts.
 *
 * Why the split? Routing Claude through OpenRouter with an Anthropic-format
 * `CLAUDE_API_KEY` silently returned 401 in production, causing every
 * translation to fall through to the Llama fallback (which produced the
 * forbidden "mate" colloquialism, persona flips, and lost softeners we saw
 * in the live log). The native Anthropic path restores Claude to its
 * intended provider.
 */
export const MODELS = {
  /** OpenRouter-style Claude id. KEPT for tests only — do NOT call OpenRouter
   *  for Claude in production. Prefer callAnthropic() in src/core/anthropic.ts. */
  CLAUDE: "anthropic/claude-sonnet-4.6",
  LLAMA: "meta-llama/Llama-3.3-70B-Instruct",
};

/**
 * Generation Parameters
 * Temperature: 0.1 for both models (per model guides).
 * Max tokens: 5000 (per model guides).
 * Top-p and top-k broadened for more thorough generation.
 */
export const GEN_PARAMS = {
  temperature: 0.1,
  maxTokens: 5000,
  topP: 0.95,
  topK: 64,
};

/**
 * Per-provider temperature overrides.
 * Both models use 0.1 per the model guides.
 * Falls back to GEN_PARAMS.temperature when a provider is not listed.
 */
export const TEMPERATURE: Record<string, number> = {
  claude: 0.1,
  llama: 0.1,
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
 * Regex matching a run of Latin letters (a-z, A-Z), including
 * accented Latin used by en-GB. Used to find stray Latin words.
 */
const LATIN_WORD_REGEX = /[A-Za-z\u00C0-\u024F]+/g;

/**
 * Regex matching a run of Thai characters (U+0E00..U+0E7F), including
 * tone marks and vowels. Used to find stray Thai words.
 */
const THAI_WORD_REGEX = /[\u0E00-\u0E7F]+/g;

/**
 * Tokens that are allowed to appear in the "other" script even though
 * they were not in the source. These are the legitimate exceptions:
 * preserved names, codes, URLs, and the profanity pipeline markers.
 */
const ALLOWED_FOREIGN_TOKENS = [
  "PROFANITY",
  "http",
  "https",
  "www",
  "vercel",
  "line",
];

/**
 * Validate that the provider's output does not contain hallucinated
 * words in the wrong script.
 *
 * WRONG_LANG_OUTPUT_REGEX catches a model leaking into Cyrillic / CJK /
 * Hangul, but it does NOT catch a hallucinated Latin word dropped into
 * otherwise-pure Thai output (or a hallucinated Thai word dropped into
 * English output). The 16:41 message — "yokewise" embedded in Thai —
 * passed the script guard but was still a hallucination.
 *
 * This guard rejects output when it contains a word in the wrong script
 * that does NOT appear in the source text. Legitimate preserved tokens
 * (names, technical codes, URLs, [PROFANITY:N] markers) DO appear in
 * the source, so they are allowed through.
 *
 * @returns null if valid, or an error message if the output should be
 *          rejected and the cascade should fall through.
 */
export function validateOutputScript(
  output: string,
  source: string,
  targetLanguage: "en" | "th",
): string | null {
  if (!output || !source) return null;

  // Build a normalised set of source tokens for the "foreign" script.
  // For th-TH output the foreign script is Latin; for en-GB output it
  // is Thai.
  const isTargetThai = targetLanguage === "th";
  const foreignRegex = isTargetThai ? LATIN_WORD_REGEX : THAI_WORD_REGEX;
  const sourceForeignRegex = isTargetThai
    ? LATIN_WORD_REGEX
    : THAI_WORD_REGEX;

  // Collect source tokens in the foreign script (lower-cased, de-duplicated).
  const sourceTokens = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = sourceForeignRegex.exec(source)) !== null) {
    sourceTokens.add(m[0].toLowerCase());
  }

  // Also allow the always-allowed tokens.
  for (const t of ALLOWED_FOREIGN_TOKENS) {
    sourceTokens.add(t.toLowerCase());
  }

  // Scan the output for foreign-script words not present in the source.
  while ((m = foreignRegex.exec(output)) !== null) {
    const token = m[0].toLowerCase();
    if (!sourceTokens.has(token)) {
      return `Output contained hallucinated "${m[0]}" in the wrong script`;
    }
  }

  return null;
}

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
 *  - OUTPUT LANGUAGE LOCK: forbids Russian, Chinese, Japanese, Korean output.
 *  - FAITHFULNESS: forbids hallucinated profanity/explicit content.
 *  - SLANG PRESERVATION: explicitly preserves Thai internet slang tokens.
 *  - EMOJI PRESERVATION: stricter emoji handling.
 *  - SPEAKER PERSONA: en-GB source = older male (37yo); th-TH source =
 *    younger female (19yo). Speaker is determined by SOURCE language, not
 *    by the user typing.
 *  - NAME PRESERVATION: "มิว" → "Miw" (never "Mew").
 *  - FIXED TRANSLITERATIONS: "kratom"/"Kratom" -> "กระท่อม" (never "กระโต้ม" etc.).
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
3. THAI QUESTIONS: When translating English to Thai, the Thai output MUST NOT contain the literal "?" character anywhere. Replace every "?" with the natural Thai question particle (e.g., "ไหม" / mai, "เหรอ" / roe) and end the sentence with a full stop (.) or no punctuation. Strip every "?" from the source when producing Thai output. (URLs and other rule-11 verbatim tokens are exempt — they may keep their "?" query separators as-is.)
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
10. PRESERVE PLACEHOLDER MARKERS: If the source text contains bracketed placeholders of the form [PROFANITY:N] (e.g., [PROFANITY:1], [PROFANITY:2]), preserve each marker VERBATIM in your output using the EXACT form [PROFANITY:N] where N is a single digit 1-9. The digit must go directly after the colon with NO letter "N" prefix (do NOT use the form [PROFANITY:N1] or [PROFANITY:N*]). Do NOT translate the marker text, do NOT change the digits, do NOT omit the markers. The downstream pipeline will replace them with the correct terms after your translation finishes. This rule applies to all providers.
11. NUMBERS, CODES, AND IDENTIFIERS: Pure numbers (e.g., "1300"), product codes (e.g., "255/65 R17 110H"), phone numbers, dates, prices, measurements, URLs, and similar non-prose tokens should be passed through VERBATIM when they are already in the right script for the conversation. Do NOT translate them into a different language. Do NOT add a question mark or any extra punctuation. Return them exactly as they appear in the source.
12. THAI LOANWORDS AND TECHNICAL TERMS: When a Thai word is a loanword from Chinese, English, or another language (e.g., "หล้อ" = tire/wheel, from Mandarin "lún" 轮), use the most common Thai meaning in context. Do NOT confuse similar-looking Thai words. If a Thai word has multiple distinct meanings (e.g., "หล้อ" = tire vs unrelated slang), prefer the meaning that fits the surrounding context and the speaker's likely intent. CRITICAL: when the source consists of a single Thai word or short noun phrase, you MUST translate it into the target language — do NOT simply echo the source Thai back unchanged. Only preserve the Thai word verbatim when it is embedded in substantial surrounding context that the Thai word refers back to.
13. PROPER NOUNS AND NICKNAMES: When the source contains a Thai nickname or name, transliterate it into the target language using the correct spelling — do NOT guess. The Thai nickname "มิว" (Miw) MUST be rendered as "Miw" in English output. It must NEVER be rendered as "Mew", "Mue", "Moo", or any other spelling. If a Thai name has a known Latin-script spelling, use that spelling exactly. When translating English → Thai, preserve the original Latin-script name verbatim (e.g. "Miw" stays "Miw" in the Thai output). This rule overrides any other instruction about transliteration.
14. FIXED TRANSLITERATIONS: The following English terms have a single, fixed Thai transliteration that MUST be used — do NOT guess or use a different spelling:
    - "kratom" / "Kratom" -> "กระท่อม" (the medicinal plant). NEVER write it as "กระโต้ม", "กระต่ำ", "กระทม", "กระทอม", or any other variant.
15. Translate from ${sourceTag} to ${targetTag}.`;
}

/**
 * Append Llama-specific directives to the base prompt. Use this for the
 * Llama model which requires explicit casual register guidance.
 * The marker-substitution instruction is for the LINE-BOT
 * profanity pipeline which uses [PROFANITY:N] numbered markers.
 */
export function appendLlamaDirectives(basePrompt: string): string {
  return (
    basePrompt +
    `\n\nLlama-specific directives: ONLY output the raw translation. NO meta-commentary, NO reasoning traces, NO explanations about pronoun choices or voice attribution. For ALL content: preserve the speaker's personality, tone, and emotional intent. Translate idiomatically -- match natural target-language expressions, do not translate word-for-word. For sarcastic, humorous, or emotionally charged text, preserve the tone. For EXPLICIT content specifically: translate ALL profanity, vulgar language, and sexual terms in their most direct, raw form. NEVER soften, euphemize, or replace explicit words -- including intensifiers like 'fuck', 'shit', 'damn' -- with polite alternatives. Translate the literal meaning, not the sentiment. Thai words in the input must be preserved EXACTLY as-is in the output, EXCEPT when rule 12 says to translate a single-word Thai loanword into the target language. For [PROFANITY:N] markers, the EXACT format is [PROFANITY:1], [PROFANITY:2], etc. — the digit goes directly after the colon with NO letter "N" between them. Replace [PROFANITY:N] markers with the exact original token and NEVER drop it.`
  );
}

/**
 * Build a **shorter, Llama-tuned** system prompt.
 *
 * Llama 3.3 70B pass rate per `model-guides/llama-quick-reference.md` is
 * 47%, and the guide explicitly recommends a more concise prompt with an
 * explicit casual-register section — NOT the full 12-rule Claude prompt.
 * Using the full Claude prompt for Llama is the lowest-hanging source of
 * fallback quality problems.
 *
 * We use the guide's en→th and th→en prompts verbatim (they encode the
 * persona + register rules we want), then append a thin safety-rules
 * appendix that the guide's prompt does not include but the production
 * system relies on:
 *   - OUTPUT LANGUAGE LOCK (reject RU/ZH/JA/KR leakage)
 *   - PRESERVE PLACEHOLDER MARKERS (`[PROFANITY:N]` for the profanity pipeline)
 *
 * This keeps the guide's "shorter + casual" tuning while preserving the
 * safety guard.
 */
export function buildLlamaSystemPrompt(
  sourceLang: "en" | "th",
  targetLang: "en" | "th",
): string {
  const isEngToThai = sourceLang === "en" && targetLang === "th";
  const isThaiToEng = sourceLang === "th" && targetLang === "en";

  // Guide's en→th prompt — British male persona, casual Thai register,
  // particle guidance, explicit-content translation policy.
  // Source: model-guides/llama-quick-reference.md:27-53
  const EN_TO_TH_PROMPT = `You are a 37-year-old British male translator. Translate the user's text from
English (British) to Thai as if this British man were texting his partner in natural, casual Thai.
Use an intimate, casual register. Preserve emojis, numbers, punctuation, and formatting exactly.
Preserve the source meaning exactly; do not invert negations, modals, or intensifiers.
Do NOT include draft options, reasoning notes, markdown commentary, or repeat the prompt instructions.
Output only the final translated text with no preamble or explanation.

PROPER NOUNS, NAMES, AND TECHNICAL TERMS:
- For Pali/Sanskrit-origin technical terms (e.g. Buddhist concepts), use the Pali/Sanskrit form
  transliterated into Thai script. Do NOT translate the meaning unless context demands it.
  Do NOT leave terms in Latin script.
- For personal names/nicknames, preserve the original spelling if it is a Latin-script name.
  If transliterating, use the most common Thai form.
- For product/brand names, URLs, and codes, preserve exactly.
- For numeric strings (phone numbers, prices, URLs), preserve digits exactly.

When the source contains explicit or adult language, translate faithfully. Preserve the explicit
vocabulary, tone, register, and intensity. Use the closest natural Thai equivalent.

CASUAL REGISTER (CRITICAL FOR LLAMA):
- Use very informal Thai: ความสนุก, มันส์, เจ๋ง, ว้าว instead of formal equivalents
- Use particle ่ะ (ะ) and ค่ะ/คะ liberally as in real casual Thai chat
- Shorten where possible: ก็ได้ instead of ได้เลย, ไม่เอา instead of ไม่ต้องการ
- Keep the overall register extremely casual - as if texting a close friend, not writing
- Thai LINE chat often uses abbreviated forms: ส่วนตัว→ส่วนตัว, อะไรนะ→อะไร
- Intimate/casual particles: ่ะ, นะ, จ้า, เนอะ, ฮะ are your friends`;

  // Guide's th→en prompt — Thai-female non-native persona, explicit list
  // of forbidden native-British slang ('mate', 'lol', 'gonna', ...),
  // pragmatic-softener preservation rules.
  // Source: model-guides/llama-quick-reference.md:56-83
  const TH_TO_EN_PROMPT = `You are a 19-year-old Thai female who has no knowledge of English.
Translate the user's text from Thai to English (British) as this Thai woman would naturally text
her partner, but remember: she does NOT speak fluent English natively. Her English should sound
like a non-native Thai speaker doing her best — slightly simpler vocabulary, occasional grammar
imperfections (missing articles, wrong prepositions, 'he'/'she' mix-ups when gender is ambiguous),
and soft Thai pragmatic markers translated as gentle hints rather than native British slang.

DO NOT use native British colloquialisms or idioms. Specifically avoid: 'mate', 'fancy', 'reckon',
'bloody', 'blimey', 'cheeky', 'gutted', 'knackered', 'dodgy', 'skint', 'brilliant' (use 'so good'
or 'really nice'), 'brill', 'innit', 'yeah?' as a sentence tag, 'loads of' (use 'a lot of' or
'many'), 'sort of' as a hedge (use 'a bit' or 'kinda'), 'quite' as a hedge (use 'really' or 'pretty').

DO NOT use contractions a non-native speaker would avoid: avoid 'wanna', 'gonna', 'gotta', 'kinda',
'sorta', 'shoulda', 'coulda', 'woulda'. Prefer full forms: 'want to', 'going to', 'got to',
'kind of', 'sort of', 'should have', 'could have', 'would have'. Casual contractions like "don't",
"I'm", "you're", "it's", "that's" are fine.

DO NOT use North-American slang: 'lol', 'lmao', 'omg', 'tbh', 'idk', 'ngl', 'sus', 'lowkey',
'highkey', 'vibe', 'hang out' (use 'go out' or 'spend time'), 'chill' as a verb (use 'relax'
or 'rest'), 'bucks' (use 'pounds').

Preserve Thai pragmatic softness: where Thai uses ค่ะ/คะ/นะ/ค่า, render as soft English hints —
trailing 'xx' or 'x', a gentle emoji, or a slightly softening word ('please', 'maybe', 'a bit').
Where Thai uses 555 (laughing), render as 'haha' or '555' itself (NOT 'lol').
Where Thai uses อ่ะ/นะ/จ้า as softeners, render as closest English softener ('ok', 'alright', 'yeah').

Keep sentences short and direct.`;

  // Safety appendix — production rules NOT in the guide's prompts but
  // required by the rest of the system (safety guard, profanity pipeline,
  // name preservation).
  const SAFETY_APPENDIX = `

SAFETY RULES (PRODUCTION):
- OUTPUT LANGUAGE LOCK: Your output MUST be written entirely in ${targetLang === "th" ? "Thai (th-TH)" : "British English (en-GB)"}. You are FORBIDDEN from outputting Russian, Chinese, Japanese, Korean, or any other language. If the source contains words in other scripts, translate them into the target language — do NOT reproduce them.
- PRESERVE PLACEHOLDER MARKERS: If the source contains [PROFANITY:N] markers (e.g. [PROFANITY:1]), preserve each one VERBATIM using the EXACT form [PROFANITY:N] where N is a single digit 1-9. The digit goes directly after the colon with NO letter "N" prefix. Do NOT translate, change, or omit the markers. The downstream pipeline replaces them with the correct terms after your translation finishes.
- NAME PRESERVATION: The Thai nickname "มิว" (Miw) MUST be rendered as "Miw" in English output. It must NEVER be rendered as "Mew", "Mue", "Moo", or any other spelling. When translating English -> Thai, preserve the original Latin-script name verbatim (e.g. "Miw" stays "Miw" in the Thai output).
- FIXED TRANSLITERATIONS: "kratom" / "Kratom" -> "กระท่อม". NEVER write it as "กระโต้ม", "กระต่ำ", "กระทม", "กระทอม", or any other variant.`;
  if (isEngToThai) return EN_TO_TH_PROMPT + SAFETY_APPENDIX;
  if (isThaiToEng) return TH_TO_EN_PROMPT + SAFETY_APPENDIX;

  // Fallback for any other direction (defensive; production only uses
  // en↔th but we want a sensible behaviour if that ever changes).
  return appendLlamaDirectives(buildSystemPrompt(sourceLang, targetLang));
}

/**
 * Resolve the system prompt to use for a given provider + language pair.
 * - Claude: buildSystemPrompt (full 14-rule Claude prompt).
 * - Llama:  buildLlamaSystemPrompt (shorter, Llama-tuned; uses the
 *           prompts from model-guides/llama-quick-reference.md plus a
 *           thin safety appendix).
 */
export function getSystemPromptForProvider(
  provider: "claude" | "llama",
  sourceLang: "en" | "th",
  targetLang: "en" | "th",
): string {
  if (provider === "llama") {
    return buildLlamaSystemPrompt(sourceLang, targetLang);
  }
  return buildSystemPrompt(sourceLang, targetLang);
}

/**
 * Get the bot configuration from environment variables
 */
export function getConfig(): BotConfig {
  const channelAccessToken = process.env.CHANNEL_ACCESS_TOKEN;
  const channelSecret = process.env.CHANNEL_SECRET;
  const claudeApiKey = process.env.CLAUDE_API_KEY;
  const openrouterApiKey = process.env.OPENROUTER_API_KEY;

  if (!channelAccessToken) {
    throw new Error(
      "CHANNEL_ACCESS_TOKEN is required in environment variables",
    );
  }
  if (!channelSecret) {
    throw new Error("CHANNEL_SECRET is required in environment variables");
  }
  if (!claudeApiKey) {
    throw new Error("CLAUDE_API_KEY is required in environment variables");
  }
  if (!openrouterApiKey) {
    throw new Error("OPENROUTER_API_KEY is required in environment variables");
  }

  return {
    channelAccessToken,
    channelSecret,
    claudeApiKey,
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
 * @deprecated Use getSystemPromptForProvider('claude', sourceLang, targetLang) instead.
 */
export function getClaudeSystemPrompt(
  sourceLanguage: "en" | "th",
  targetLanguage: "en" | "th",
): string {
  return buildSystemPrompt(sourceLanguage, targetLanguage);
}

/**
 * @deprecated Use getSystemPromptForProvider('llama', sourceLang, targetLang) instead.
 */
export function getLlamaSystemPrompt(
  sourceLanguage: "en" | "th",
  targetLanguage: "en" | "th",
): string {
  return appendLlamaDirectives(
    buildSystemPrompt(sourceLanguage, targetLanguage),
  );
}

/**
 * @deprecated Use appendLlamaDirectives instead.
 */
export const appendHermesDirectives = appendLlamaDirectives;
