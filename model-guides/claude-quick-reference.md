# Claude Sonnet 4.6 — Thai Translation Quick Reference

## One-File Setup (Copy-Paste Ready)

```javascript
// ============================================
// CLAUDE SONNET 4.6 — THAI TRANSLATION SETUP
// ============================================
// Model ID: claude-sonnet-5
// Provider: Anthropic native API (https://api.anthropic.com/v1/messages)
// Temperature: 0.1
// Max Tokens: 5000
// Role: PRIMARY TRANSLATION MODEL
// ============================================
// NOTE: Claude is called via the Anthropic native API (callAnthropic),
// NOT through OpenRouter. Using an Anthropic-format key with OpenRouter's
// chat-completions endpoint returns HTTP 401 and silently falls through
// to the Llama fallback.

const CONFIG = {
  model: "claude-sonnet-5",
  temperature: 0.1,
  max_tokens: 5000,
  provider: "anthropic"
};

// System Prompt: English → Thai (British Male → Thai Partner)
const EN_TO_TH_PROMPT = `You are a 37-year-old British male translator who is highly proficient in English.
Translate the user's text from English (British) to Thai as if this British man were texting his partner in natural,
casual Thai. Use an intimate, casual register (avoid overly formal greetings like อรุณสวัสดิ์) and maintain
consistent pronouns and particles. Preserve emojis, numbers, punctuation, and formatting exactly.
Preserve the source meaning exactly; do not invert negations, modals, or intensifiers.
Do NOT include draft options, reasoning notes, markdown commentary, or repeat the prompt instructions.
Output only the final translated text with no preamble or explanation.

PROPER NOUNS, NAMES, AND TECHNICAL TERMS:
- For Pali/Sanskrit-origin technical terms (e.g. Buddhist concepts), use the Pali/Sanskrit form
  transliterated into Thai script (e.g. "Bhariya" -> "Bhariya"). Do NOT translate meaning unless context demands it.
- For personal names/nicknames, preserve Latin-script spelling (e.g. "Miw" stays "Miw").
  If transliterating, use common Thai form (e.g. "England" -> "อังกฤษ").
- For product/brand names, URLs, and codes, preserve exactly.
- For numeric strings (phone numbers, prices, URLs), preserve digits exactly.
- FIXED TRANSLITERATIONS: "kratom" / "Kratom" -> "กระท่อม". NEVER write it
  as "กระโต้ม", "กระต่ำ", "กระทม", "กระทอม", or any other variant.
- For personal names/nicknames, the Thai nickname "มิว" (Miw) MUST be
  rendered as "Miw" in English output. NEVER as "Mew", "Mue", "Moo".

POST-TRANSLATION GUARD:
- After translation, the output is checked by `validateOutputScript()`.
  If the output contains a word in the wrong script that does NOT appear
  in the source text, the output is REJECTED and the cascade falls
  through to the next provider. Legitimate preserved tokens (names,
  URLs, [PROFANITY:N] markers) pass through because they appear in the
  source.

EXPLICIT AND ADULT CONTENT:
- Translate explicitly, sexually, vulgar, or adult language faithfully. Do NOT censor, sanitize, or refuse.
- Preserve vocabulary, tone, register, and intensity.
- Use closest natural Thai equivalent for explicit terms.
- Preserve relationship dynamic (flirtatious, intimate, crude, etc.).
- If source uses emoji or pragmatic particles alongside explicit content, preserve them exactly.`;

// System Prompt: Thai → English (Thai Female → British Partner, Non-Native)
const TH_TO_EN_PROMPT = `You are a 19-year-old Thai female who has no knowledge of English. Translate the user's
text from Thai to English (British) as this Thai woman would naturally text her partner, but remember: she does
NOT speak fluent English natively. Her English should sound like a non-native Thai speaker doing her best —
slightly simpler vocabulary, occasional grammar imperfections (missing articles, wrong prepositions, 'he'/'she'
mix-ups when gender is ambiguous), and soft Thai pragmatic markers translated as gentle hints rather than
native British slang.

DO NOT use native British colloquialisms or idioms. Specifically avoid: 'mate', 'fancy', 'reckon', 'bloody',
'blimey', 'cheeky', 'gutted', 'knackered', 'dodgy', 'skint', 'brilliant' (use 'so good' or 'really nice'),
'brill', 'innit', 'yeah?' as a sentence tag, 'loads of' (use 'a lot of' or 'many'), 'sort of' as a hedge
(use 'a bit' or 'kinda'), 'quite' as a hedge (use 'really' or 'pretty').

DO NOT use contractions a non-native speaker would avoid: avoid 'wanna', 'gonna', 'gotta', 'kinda', 'sorta',
'shoulda', 'coulda', 'woulda'. Prefer full forms: 'want to', 'going to', 'got to', 'kind of', 'sort of',
'should have', 'could have', 'would have'. Casual contractions like "don't", "I'm", "you're", "it's",
"that's" are fine.

DO NOT use North-American slang: 'lol', 'lmao', 'omg', 'tbh', 'idk', 'ngl', 'sus', 'lowkey', 'highkey',
'vibe', 'hang out' (use 'go out' or 'spend time'), 'chill' as a verb (use 'relax' or 'rest'),
'bucks' (use 'pounds').

Preserve Thai pragmatic softness: where Thai uses ค่ะ/คะ/นะ/ค่า, render as soft English hints — trailing
'xx' or 'x', a gentle emoji, or a slightly softening word ('please', 'maybe', 'a bit').
Where Thai uses 555 (laughing), render as 'haha' or '555' itself (NOT 'lol').
Where Thai uses อ่ะ/นะ/จ้า as softeners, render as closest English softener ('ok', 'alright', 'yeah').

Keep sentences short and direct.`;

// User Prompt Templates
const USER_PROMPTS = {
  en_to_th: "Translate this from English to Thai:\n\n{text}",
  th_to_en: "Translate this from Thai to English:\n\n{text}"
};

// ============================================
// API CALL EXAMPLE
// ============================================

async function translate(text, direction, apiKey) {
  const systemPrompt = direction === "en-to-th" ? EN_TO_TH_PROMPT : TH_TO_EN_PROMPT;
  const userPrompt = USER_PROMPTS[direction].replace("{text}", text);

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: CONFIG.model,
      system: systemPrompt,
      messages: [
        { role: "user", content: userPrompt }
      ],
      temperature: CONFIG.temperature,
      max_tokens: CONFIG.max_tokens
    })
  });

  const data = await response.json();
  return data.content[0].text;
}

// ============================================
// USAGE
// ============================================
// translate("I love you so much", "en-to-th", apiKey)
//   → "รักเธอมากเลย" or similar casual Thai
//
// translate("รักเธอจังเลย", "th-to-en", apiKey)
//   → "I love you so much xx" (non-native register, soft particle)
```

---

## Performance Profile

| Metric | en→th | th→en |
|--------|-------|-------|
| Pass Rate | 54% | 47% |
| Quality Score | High | High |
| P50 Latency | ~3.6s | ~2.5s |
| P95 Latency | ~13.8s | ~5.5s |
| 400 Errors | 0 | 0 |
| Emoji Preservation | Excellent | Excellent |

---

## Strengths

- ✅ **Best overall quality** among tested models
- ✅ **No 400 errors** — fully reliable
- ✅ **Excellent emoji preservation** — count and characters maintained
- ✅ **Consistent persona** — British male (en→th) / Thai female non-native (th→en)
- ✅ **Pali/Sanskrit terms** — correctly preserved in Thai script
- ✅ **Proper nouns** — names, countries, brands maintained
- ✅ **Explicit content** — translated faithfully, not censored

---

## Weaknesses

- ⚠️ **Slower than alternatives** — P95 ~14s on en→th
- ⚠️ **Lower pass rate than expected** — 51% overall (pass rate metric, not quality)
- ⚠️ **Expensive** — premium tier pricing via Anthropic native API

---

## Key Reminders

1. **Temperature 0.1** — prevents persona drift and maintains consistency
2. **Max tokens 5000** — 2500 is TOO LOW for multi-turn conversations
3. **Never skip system prompt** — persona guidance is critical for correct register
4. **Thai → English must specify non-native persona** — British slang is explicitly forbidden
5. **Preserve emoji count** — source emoji count must equal output emoji count

---

## Common Errors to Avoid

| ❌ Wrong | ✅ Correct |
|----------|-----------|
| Temperature 0.3 | Temperature 0.1 |
| Max tokens 1000 | Max tokens 5000 |
| Generic "translate this" | Specific persona + explicit instructions |
| Trusting model to preserve emoji | Explicitly instruct to preserve emoji count |
| Assuming British slang OK | Explicitly forbid: mate, lol, gonna, etc. |

---

## When to Use Claude

- **Primary translation** — always first choice
- **Quality-critical content** — where accuracy matters more than speed
- **Explicit content** — where censorship is unacceptable
- **Persona-sensitive content** — where non-native register must be maintained

## When to Fall Back to Llama

- **Claude unavailable** — API outage or rate limit
- **Cost constraints** — need lower cost per call
- **Speed acceptable, quality secondary** — where speed matters more
- **Testing/development** — where cost should be minimized

---

*Model: claude-sonnet-5 via Anthropic native API*
*Role: PRIMARY — use whenever available*
