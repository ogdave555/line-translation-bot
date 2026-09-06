# System Patterns — LINE Translation Bot

## Prompt builder pattern

Two prompt builders, one router:

1. `buildSystemPrompt(sourceLang, targetLang)` — **full Claude prompt**.
   12 rules (persona, pronoun rules, OUTPUT LANGUAGE LOCK,
   PRESERVE THAI INTERNET SLANG, PRESERVE EMOJIS, NO HALLUCINATIONS,
   THAI QUESTIONS, PRESERVE PLACEHOLDER MARKERS, NUMBERS/CODES/IDENTIFIERS,
   THAI LOANWORDS, …). ~5k chars.

2. `buildLlamaSystemPrompt(sourceLang, targetLang)` — **shorter,
   Llama-tuned**. Per-direction prompt verbatim from
   `model-guides/llama-quick-reference.md` (en→th = British male casual
   register; th→en = Thai female non-native with explicit forbidden-slang
   list), plus a thin **safety appendix** (OUTPUT LANGUAGE LOCK +
   `[PROFANITY:N]` marker preservation) that the guide prompts don't
   include but production relies on. ~2.5k chars.

3. `getSystemPromptForProvider(provider, sourceLang, targetLang)` —
   routes:
   - `claude` → `buildSystemPrompt(sourceLang, targetLang)`
   - `llama`  → `buildLlamaSystemPrompt(sourceLang, targetLang)`

The legacy `appendLlamaDirectives(base)` (and its deprecated alias
`appendHermesDirectives`) still exists for back-compat, but is no longer
used by production routing.

## Provider cascade pattern

```
[Claude Sonnet 4.6] (Anthropic API) ─── fail ───── [Llama 3.3 70B] (OpenRouter)
                                          │
                                          └── fail ── error message
```

- **Claude** is reached via the **Anthropic native Messages API** in
  `src/core/anthropic.ts` (`callAnthropic()`).
- **Llama** is reached via OpenRouter chat-completions in
  `src/translation/translator.ts` (`callOpenRouter()`).
- The two endpoints have different request shapes — do NOT collapse them.

`runProvider()` (in `src/translation/translator.ts`) branches on
`provider === "claude"` to call `callAnthropic()` and uses
`callOpenRouter()` for everything else. The `api/webhook.ts` cascade
calls each directly.

The `WRONG_LANG_OUTPUT_REGEX` guard is applied:

- Inside `callAnthropic()` (Claude path)
- Inside `callOpenRouter()` (Llama path)
- After masked-text translation in `translateWithProfanityPipeline()`

Throwing on empty / wrong-script output lets the cascade fall through.

## Safety guard pattern

`WRONG_LANG_OUTPUT_REGEX` (in `src/core/config.ts`) matches Cyrillic
(`\u0400-\u04FF`), Hiragana/Katakana (`\u3040-\u30FF`), CJK extension A
(`\u3400-\u4DBF`), CJK unified ideographs (`\u4E00-\u9FFF`), and Hangul
(`\uAC00-\uD7AF`). It is applied:

- After every `callOpenRouter()` in `runProvider()`.
- After masked-text translation in `translateWithProfanityPipeline()`.
- After every `callOpenRouter()` in `api/webhook.ts`.

This protects against the model "leaking" into Russian, Chinese, Japanese, or
Korean when the user wants en-GB or th-TH.

## Profanity masking pattern

`maskProfanity(text)` → `{ maskedText, profanityTokens }`:

- English: token-by-token test against `englishExplicit`.
- Thai: regex replace against `thaiExplicit`.
- Replaces each match with `[PROFANITY:N]` (numbered markers).
- Stores the original token for later re-translation through Hermes.

The masked text is translated through the cascade, then each profanity token
is re-translated individually through Hermes with the marker-substitution
directive.

## Code formatting

- Prettier auto-formatter on save (double quotes, 2-space indent, trailing
  commas in multi-line arg lists).
- Imports use `.js` extensions at runtime but `.ts` at typecheck time (the
  `tsx` runtime handles the resolution).
