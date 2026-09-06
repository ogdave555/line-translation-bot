# Llama 3.3 70B — Thai Translation Quick Reference

## One-File Setup (Copy-Paste Ready)

```javascript
// ============================================
// LLAMA 3.3 70B — THAI TRANSLATION SETUP
// ============================================
// Model ID: meta-llama/Llama-3.3-70B-Instruct
// Provider: OpenRouter
// Temperature: 0.1
// Max Tokens: 5000
// Role: BACKUP TRANSLATION MODEL (No 400 errors!)
// ============================================
// NOTE: Llama has NO OpenRouter 400 errors (unlike Qwen)
//       Use as backup for Thai→English when Claude fails
// ============================================

const CONFIG = {
  model: "meta-llama/Llama-3.3-70B-Instruct",
  temperature: 0.1,
  max_tokens: 5000,
  provider: "openrouter"
};

// System Prompt: English → Thai (British Male → Thai Partner)
// CRITICAL: This is a MODIFIED prompt for Llama - shorter + casual register emphasis
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

// System Prompt: Thai → English (Thai Female → British Partner, Non-Native)
// NOTE: Same as Claude for th→en direction
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

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://your-app.com",
      "X-Title": "Your-App-Name"
    },
    body: JSON.stringify({
      model: CONFIG.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: CONFIG.temperature,
      max_tokens: CONFIG.max_tokens
    })
  });

  const data = await response.json();
  return data.choices[0].message.content;
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
| Pass Rate | 45% | 49% |
| Quality Score | Good | Good |
| P50 Latency | Fast | Fast |
| P95 Latency | Fast | Fast |
| 400 Errors | **0** | **0** |
| Emoji Preservation | Good (minor glitches) | Good |

---

## Why Llama Instead of Qwen?

| Feature | Llama 3.3 70B | Qwen 2.5 72B |
|---------|---------------|--------------|
| OpenRouter 400 errors | **None** ✅ | Thai→EN only ⚠️ |
| en→th quality | 45% | 52% |
| th→en quality | 49% | 38% |
| Emoji preservation | Minor glitches | Good |
| Cost | Lower | Higher |

**Bottom line:** Qwen has 400 errors on Thai→English. Llama does NOT. **Use Llama as backup for Thai→English specifically.**

---

## Strengths

- ✅ **NO OpenRouter 400 errors** — fully reliable, unlike Qwen
- ✅ **Fast** — lower latency than Claude
- ✅ **Lower cost** — more economical for high volume
- ✅ **Good casual register** — with explicit guidance
- ✅ **No script leak** — typically produces correct script

---

## Weaknesses

- ⚠️ **Emoji glitches** — sometimes renders as "🥰" instead of actual emoji character
- ⚠️ **Lower overall quality** — 47% pass rate vs Claude's 51%
- ⚠️ **Script-leak risk** — needs explicit guidance, shorter prompt helps
- ⚠️ **Persona drift** — temperature must stay at 0.1

---

## Key Differences from Claude

| Aspect | Claude | Llama |
|--------|--------|-------|
| Prompt length | Full detailed | Shorter + casual emphasis |
| Temperature | 0.1 | 0.1 |
| Max tokens | 5000 | 5000 |
| Emoji handling | Perfect | Minor glitches |
| Casual register | Good with full prompt | Better with shortened prompt + explicit casual guidance |
| Cost | Higher | Lower |
| Reliability | High | High |

---

## Critical: Llama-Specific Optimizations

1. **SHORTER PROMPT** — Llama benefits from a more concise prompt with explicit casual register section
2. **CASUAL REGISTER SECTION** — Must include "CRITICAL FOR LLAMA" casual Thai guidance
3. **PARTICLE GUIDANCE** — Explicitly list ่ะ, นะ, จ้า, เนอะ, ฮะ as preferred particles
4. **LINE CHAT ABBREVIATIONS** — Include examples like ส่วนตัว, อะไรนะ

---

## When to Use Llama

- **Backup to Claude** — when Claude unavailable or rate-limited
- **Thai→English backup** — specifically when Qwen fails with 400 errors
- **Cost-sensitive applications** — lower cost per call
- **High-volume translation** — where speed > absolute quality
- **Non-critical content** — where minor emoji glitches acceptable

## When NOT to Use Llama

- **Emoji-critical content** — use Claude for exact emoji preservation
- **Pali/Sanskrit terms** — Claude handles these more reliably
- **Premium quality requirements** — use Claude for quality-critical work

---

## Common Errors to Avoid

| ❌ Wrong | ✅ Correct |
|----------|-----------|
| Use Claude's long prompt | Use shortened prompt with casual emphasis |
| Temperature 0.3 | Temperature 0.1 |
| No emoji count instruction | Explicitly instruct to preserve emoji count |
| Trust emoji rendering | Verify emoji characters (not "🥰" string) |
| Use Qwen for th→en | Use Llama instead (no 400 errors) |

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Emoji shows as "🥰" string | Accept as known limitation, or switch to Claude |
| Script leak in output | Ensure prompt includes "Do NOT leave terms in Latin script" |
| Too formal output | Add explicit casual register guidance section |
| 400 errors | Switch to Llama (Qwen only has this issue) |
| Slow response | Reduce max_tokens if full response not needed |

---

*Model: meta-llama/Llama-3.3-70B-Instruct via OpenRouter*
*Role: BACKUP — use when Claude unavailable or for Thai→English when Qwen fails*
