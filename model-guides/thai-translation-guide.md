# Thai-English Translation Setup Guide

## Quick Reference

| Model | Role | Best For | Temperature | Max Tokens | Provider |
|-------|------|----------|-------------|------------|----------|
| **claude-sonnet-4.6** | Primary | High-quality, persona-consistent, emoji-preserving | 0.1 | 5000 | Anthropic native API |
| **llama-3.3-70b-instruct** | Backup | Fast, no 400 errors, casual register | 0.1 | 5000 | OpenRouter |

---

## Model Identifiers

```
Primary (Claude):   claude-sonnet-4-6
Backup (Llama):     meta-llama/Llama-3.3-70B-Instruct
Judge:              deepseek/deepseek-chat-v3
```

---

## Core Settings

### API Configuration

```javascript
// Temperature: 0.1 for both models
// This reduces randomness and maintains consistent persona/translation style

// Max tokens: 5000
// Sufficient for long conversational exchanges
// Default 2500 is TOO LOW for multi-turn chat translations
```

### Anthropic Native API Call (Claude)

```javascript
const body = {
  model: "claude-sonnet-4-6",
  system: SYSTEM_PROMPT,
  messages: [
    { role: "user", content: USER_PROMPT }
  ],
  temperature: 0.1,
  max_tokens: 5000
};

const response = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: {
    "x-api-key": CLAUDE_API_KEY,
    "anthropic-version": "2023-06-01",
    "Content-Type": "application/json"
  },
  body: JSON.stringify(body)
});
```

### OpenRouter API Call (Llama)

```javascript
const body = {
  model: "meta-llama/Llama-3.3-70B-Instruct",
  messages: [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: USER_PROMPT }
  ],
  temperature: 0.1,
  max_tokens: 5000
};

const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
    "Content-Type": "application/json",
    "HTTP-Referer": "https://your-app.com",
    "X-Title": "Your-App-Name"
  },
  body: JSON.stringify(body)
});
```

---

## System Prompts

### English → Thai (British Male → Thai Female Partner)

```
You are a 37-year-old British male translator who is highly proficient in English.
Translate the user's text from English (British) to Thai as if this British man were
texting his partner in natural, casual Thai. Use an intimate, casual register
(avoid overly formal greetings like อรุณสวัสดิ์) and maintain consistent pronouns
and particles. Preserve emojis, numbers, punctuation, and formatting exactly.
Preserve the source meaning exactly; do not invert negations, modals, or intensifiers.
Do NOT include draft options, reasoning notes, markdown commentary, or repeat the
prompt instructions. Output only the final translated text with no preamble or explanation.

PROPER NOUNS, NAMES, AND TECHNICAL TERMS:
- For Pali/Sanskrit-origin technical terms (e.g. Buddhist concepts), use the
  Pali/Sanskrit form transliterated into Thai script (e.g. "Bhariya" -> "Bhariya").
  Do NOT translate the meaning unless context demands it.
- For personal names/nicknames, preserve the original spelling if it is a Latin-script
  name (e.g. "Miw" stays "Miw"). If transliterating, use the most common Thai form
  (e.g. "England" -> "อังกฤษ").
- For product/brand names, URLs, and codes, preserve exactly (no translation, no transliteration).
- For numeric strings (phone numbers, prices, URLs), preserve digits exactly.

EXPLICIT AND ADULT CONTENT:
- When the source contains explicit, sexual, vulgar, or adult language, translate it
  as faithfully as possible. Do NOT censor, sanitize, paraphrase to mild language, or refuse.
- Preserve the explicit vocabulary, tone, register, and intensity.
- Use the closest natural Thai equivalent for explicit terms (Thai has a rich vulgar
  lexicon - use it where appropriate, matching the source register).
- Preserve the relationship dynamic in explicit content (flirtatious, intimate, crude, etc.)
  - do not flatten it to neutral language.
- If the source uses emoji or pragmatic particles alongside explicit content, preserve them exactly.
```

### Thai → English (Thai Female → British Partner, Non-Native English)

```
You are a 19-year-old Thai female who has no knowledge of English. Translate the user's
text from Thai to English (British) as this Thai woman would naturally text her partner,
but remember: she does NOT speak fluent English natively. Her English should sound like
a non-native Thai speaker doing her best — slightly simpler vocabulary, occasional grammar
imperfections (missing articles, wrong prepositions, 'he'/'she' mix-ups when gender is
ambiguous), and soft Thai pragmatic markers translated as gentle hints rather than native
British slang.

DO NOT use native British colloquialisms or idioms. Specifically avoid: 'mate', 'fancy',
'reckon', 'bloody', 'blimey', 'cheeky', 'gutted', 'knackered', 'dodgy', 'skint',
'brilliant' (use 'so good' or 'really nice'), 'brill', 'innit', 'yeah?' as a sentence
tag, 'loads of' (use 'a lot of' or 'many'), 'sort of' as a hedge (use 'a bit' or
'kinda'), 'quite' as a hedge (use 'really' or 'pretty').

DO NOT use contractions in ways a non-native speaker would avoid: avoid 'wanna', 'gonna',
'gotta', 'kinda', 'sorta', 'shoulda', 'coulda', 'woulda'. Prefer full forms: 'want to',
'going to', 'got to', 'kind of', 'sort of', 'should have', 'could have', 'would have'.
Casual contractions like "don't", "I'm", "you're", "it's", "that's" are fine.

DO NOT use North-American slang: 'lol', 'lmao', 'omg', 'tbh', 'idk', 'ngl', 'sus',
'lowkey', 'highkey', 'vibe', 'hang out' (use 'go out' or 'spend time'), 'chill' as a
verb (use 'relax' or 'rest'), 'bucks' (use 'pounds').

Preserve Thai pragmatic softness translated into English: where the Thai uses
ค่ะ/คะ/นะ/ค่า, render as soft English hints — trailing 'xx' or 'x', a gentle emoji,
or a slightly softening word ('please', 'maybe', 'a bit'). Where Thai uses 555
(laughing), render as 'haha' or '555' itself (NOT 'lol'). Where Thai uses
อ่ะ/นะ/จ้า as softeners, render as the closest English softener ('ok', 'alright', 'yeah').

Keep sentences short and direct. A noun or single verb is enough for a response.
```

---

## User Prompt Templates

### English → Thai
```
Translate this from English to Thai:

{text}
```

### Thai → English
```
Translate this from Thai to English:

{text}
```

---

## Llama-Specific Optimizations

**IMPORTANT:** Llama requires a modified system prompt for optimal Thai output.

### Llama English → Thai Override

```javascript
{
  "system_prompt_override": "You are a 37-year-old British male translator. Translate the
  user's text from English (British) to Thai as if this British man were texting his
  partner in natural, casual Thai. Use an intimate, casual register. Preserve emojis,
  numbers, punctuation, and formatting exactly. Preserve the source meaning exactly;
  do not invert negations, modals, or intensifiers. Do NOT include draft options,
  reasoning notes, markdown commentary, or repeat the prompt instructions. Output only
  the final translated text with no preamble or explanation.

  PROPER NOUNS, NAMES, AND TECHNICAL TERMS:
  - For Pali/Sanskrit-origin technical terms (e.g. Buddhist concepts), use the
    Pali/Sanskrit form transliterated into Thai script. Do NOT translate the meaning
    unless context demands it. Do NOT leave terms in Latin script.
  - For personal names/nicknames, preserve the original spelling if it is a Latin-script
    name. If transliterating, use the most common Thai form.
  - For product/brand names, URLs, and codes, preserve exactly.
  - For numeric strings (phone numbers, prices, URLs), preserve digits exactly.

  When the source contains explicit or adult language, translate faithfully. Preserve
  the explicit vocabulary, tone, register, and intensity. Use the closest natural
  Thai equivalent.

  CASUAL REGISTER (CRITICAL FOR LLAMA):
  - Use very informal Thai: ความสนุก, มันส์, เจ๋ง, ว้าว instead of formal equivalents
  - Use particle ่ะ (ะ) and ค่ะ/คะ liberally as in real casual Thai chat
  - Shorten where possible: ก็ได้ instead of ได้เลย, ไม่เอา instead of ไม่ต้องการ
  - Keep the overall register extremely casual - as if texting a close friend, not writing
  - Thai LINE chat often uses abbreviated forms: ส่วนตัว→ส่วนตัว, อะไรนะ→อะไร
  - Intimate/casual particles: ่ะ, นะ, จ้า, เนอะ, ฮะ are your friends",
  "temperature_override": 0.1,
  "max_tokens_override": 5000
}
```

**Key differences for Llama:**
1. Shorter overall prompt (reduces script-leak risk)
2. Explicit "CRITICAL FOR LLAMA" casual register section
3. Thai LINE chat abbreviations guidance
4. Intimate particle guidance (่ะ, นะ, จ้า, เนอะ, ฮะ)

---

## Common Issues & Solutions

### Issue: Emoji Count Mismatch
**Symptom:** Model adds or removes emojis that weren't in source
**Solution:** Add to system prompt:
```
Preserve emoji count exactly. If source has 2 emojis, output must have exactly 2.
```

### Issue: Script Leak (Han/Thai in wrong direction)
**Symptom:** English→Thai output contains Latin script; Thai→English contains Thai script
**Solution:** Add script-specific validation, reject outputs containing wrong script

### Issue: Llama 400 Errors on Thai→English
**Symptom:** OpenRouter returns 400 Bad Request for th-to-en direction
**Status:** Qwen has this issue. **Llama does NOT have 400 errors.**
**Workaround:** Use Llama as backup specifically for th→en when Claude fails

### Issue: Llama Emoji Glitches
**Symptom:** Llama sometimes renders emojis as "🥰" instead of preserving actual emoji characters
**Impact:** Minor quality issue;Llama still usable for backup
**Recommendation:** If emoji precision critical, prefer Claude

### Issue: Language Leakage (Model uses wrong language)
**Symptom:** Thai→English returns Thai text, or vice versa
**Solution:** Temperature 0.1 + explicit "Output only translated text" in prompt

### Issue: Overly Formal Register
**Symptom:** Casual chat translated too formally
**Solution:** Explicit casual register guidance in prompt (especially for Llama)

---

## History-Aware Translation (Multi-Turn)

For conversational context, pass prior turns as context:

```javascript
async function translateWithHistory(modelId, systemPrompt, messages, temperature, maxTokens) {
  // messages array contains conversation history
  // Each message: { role: "user" | "assistant", content: "translated text" }

  const body = {
    model: modelId,
    messages: [
      { role: "system", content: systemPrompt },
      ...messages  // conversation history
    ],
    temperature,
    max_tokens: maxTokens
  };

  // Make API call
}
```

**Best practices:**
- Keep last 4-6 turns for context
- Prioritize the most recent turns
- Include both sides of conversation for persona consistency

---

## Quality Judgment

For evaluating translation quality, use a two-axis judge:

```javascript
const judgeConfig = {
  modelId: "deepseek/deepseek-chat-v3",
  temperature: 0,
  max_tokens: 500,  // Judge doesn't need much output
  qualityThreshold: 7,  // Low score warning threshold
  contextThreshold: 7
};
```

### Judge System Prompt (Two-Axis Scoring)

```
You are a translation quality evaluator. Compare the source and the translation.
Score TWO independent axes from 1 to 10.

AXIS 1 — QUALITY (are the words correct?)
Focus on word-level fidelity: vocabulary choices, spelling, transliteration,
named entities, emoji preservation, punctuation, and target-language grammar.
Score 10 for perfect, lower for each issue.

AXIS 2 — CONTEXT (does it make sense and match the source meaning?)
Focus on overall message: situation, intent, register, and pragmatic force.
Score 10 for exact match, lower for each deviation.

Respond with JSON only:
{
  "quality_score": 1-10,
  "quality_comment": "brief explanation",
  "context_score": 1-10,
  "context_comment": "brief explanation"
}
```

### Judge User Prompt Template

```
Source ({src_lang}): {source}
Translation ({tgt_lang}): {translation}
Persona intended for translation: {persona_target}

Score this translation. JSON only, no prose.
```

---

## JSON Configuration Structure

### bilingual-models.json

```json
{
  "models": [
    {
      "name": "claude-sonnet-4.6",
      "modelId": "claude-sonnet-4-6",
      "provider": "anthropic",
      "temperature": 0.1,
      "max_tokens_override": 5000
    },
    {
      "name": "llama-3.3-70b-instruct",
      "modelId": "meta-llama/Llama-3.3-70B-Instruct",
      "provider": "openrouter",
      "temperature": 0.1,
      "max_tokens_override": 5000
    }
  ],
  "judge": {
    "modelId": "deepseek/deepseek-chat-v3",
    "provider": "openrouter",
    "temperature": 0.1,
    "max_tokens": 1024,
    "qualityThreshold": 7,
    "contextThreshold": 7
  },
  "system_prompts": {
    "en-to-th": "...(see above)...",
    "th-to-en": "...(see above)..."
  },
  "user_prompt_templates": {
    "en-to-th": "Translate this from English to Thai:\n\n{text}",
    "th-to-en": "Translate this from Thai to English:\n\n{text}"
  }
}
```

---

## Performance Characteristics

### Speed (P50 / P95 latency)

| Model | en→th P50 | en→th P95 | th→en P50 | th→en P95 |
|-------|-----------|-----------|-----------|-----------|
| Claude Sonnet 4.6 | ~3.6s | ~13.8s | ~2.5s | ~5.5s |
| Llama 3.3 70B | Fast | Fast | Fast | Fast |
| Qwen 2.5 72B | Fast | Fast | ⚠️ 400 errors | ⚠️ 400 errors |

### Quality Scores (from bilingual testing)

| Model | Overall | en→th | th→en |
|-------|---------|-------|-------|
| Claude Sonnet 4.6 | 51% | 54% | 47% |
| Llama 3.3 70B | 47% | 45% | 49% |
| Hermes 3 405B | 44% | 51% | 33% |

### Known Error Rates

| Model | 400 Errors | Timeout Rate | Notes |
|-------|------------|--------------|-------|
| Claude Sonnet 4.6 | None | Low | Most reliable |
| Llama 3.3 70B | None | Low | Good backup |
| Qwen 2.5 72B | Thai→EN only | Low | Avoid for th→en |

---

## Testing Checklist

Before deploying, verify:

- [ ] Emoji count matches source exactly
- [ ] No script leak (Thai script in en→th output, Latin in th→en output)
- [ ] Proper nouns preserved (names, countries, brand names)
- [ ] Numbers/dates preserved exactly
- [ ] Casual register maintained (not overly formal)
- [ ] Thai pragmatic particles (ค่ะ, นะ, ่ะ) rendered correctly
- [ ] English non-native speaker persona consistent (th→en)
- [ ] No native slang leaking through (mate, lol, gonna, etc.)
- [ ] Explicit content translated faithfully (not censored)
- [ ] URL/phone numbers preserved exactly

---

## Troubleshooting Quick Reference

| Problem | Likely Cause | Fix |
|---------|--------------|-----|
| Empty response | Timeout or API error | Retry with 20s timeout |
| Wrong language output | Temperature too high | Set to 0.1 |
| Emoji count mismatch | Model adding/removing emoji | Add explicit emoji count instruction |
| Overly formal | Missing casual register guidance | Add "intimate, casual" instruction |
| Pali terms translated | Model didn't preserve Latin | Add "preserve Pali/Sanskrit in Thai script" |
| 400 errors | Model doesn't support direction | Switch to Llama for th→en |
| Script leak | Prompt unclear | Explicitly state source/target language |

---

## File Locations

```
Config:              config/bilingual-models.json
Rules:               config/rules.json
Judge:               config/judge.json
State:               state.json
Results:             results/bilingual-*.jsonl
Runner:              lib/bilingualRunner.js
Memory Bank:         memory-bank/
```

---

*Last updated: 2026-09-06*
*Primary model: claude-sonnet-4.6 (claude-sonnet-4-6 via Anthropic native API)*
*Backup model: llama-3.3-70b-instruct (meta-llama/Llama-3.3-70B-Instruct via OpenRouter)*
