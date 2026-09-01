# System Patterns — LINE Translation Bot

## Prompt builder pattern

All translation prompts go through a single pipeline:

1. `buildSystemPrompt(sourceLang, targetLang)` — base prompt with:
   - Speaker persona (older male for `en` source, younger female for `th` source)
   - Pronoun rules per direction
   - OUTPUT LANGUAGE LOCK (forbids RU/ZH/JA/KR; target name is "Thai" or
     "British English")
   - PRESERVE THAI INTERNET SLANG list (`555`, `ฮ่า`, `อิ`, …)
   - PRESERVE EMOJIS rule
   - NO HALLUCINATIONS rule
   - THAI QUESTIONS rule (no `?` in en-GB → th-TH)
   - Tag at the bottom: `Translate from en-GB to th-TH.`

2. `appendHermesDirectives(base)` — only for the Hermes provider. Adds:
   - "NO meta-commentary, NO reasoning traces"
   - "Translate idiomatically"
   - "Thai words in the input must be preserved EXACTLY"
   - `[PROFANITY:N]` marker substitution rule (used by the pipeline)

3. `getSystemPromptForProvider(provider, sourceLang, targetLang)` — combines
   the two above per provider.

## Provider cascade pattern

```
[Hermes 3] ──┐
             │  fail
[Claude Sonnet 5] ──┐   (only if !isExplicit || bypassExplicitCheck)
                    │   fail
[Gemini 3.7 Flash] ─┘
```

Each provider call goes through `runProvider()` which:

- Sends the request via `callOpenRouter()`
- Checks the response against `WRONG_LANG_OUTPUT_REGEX`
- Throws on empty / wrong-script output, allowing the cascade to fall through

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
