# Active Context — LINE Translation Bot

## What we are working on right now

**Native Anthropic routing** — Claude Sonnet 4.6 is now reached via the
Anthropic native Messages API (`https://api.anthropic.com/v1/messages`)
instead of OpenRouter. Llama 3.3 70B stays on OpenRouter as the fallback.

## Recent decisions

- **New module `src/core/anthropic.ts`** with `callAnthropic()` that posts
  to `https://api.anthropic.com/v1/messages` with `x-api-key` +
  `anthropic-version` headers and the Anthropic-native body shape.
- **Claude → Anthropic native** in both `api/webhook.ts` and
  `src/translation/translator.ts` (runProvider() branches on provider).
- **Llama → OpenRouter** unchanged (it was always correct).
- **TIMEOUT_MS raised from 15s → 25s** in `api/webhook.ts` because Claude's
  documented P95 on en→th (~14s) was too close to 15s, causing spurious
  fallbacks to Llama. Vercel maxDuration is 30s (see `vercel.json`), so
  25s leaves a 5s safety margin.
- **MODELS.CLAUDE = `anthropic/claude-sonnet-4.6`** retained as a legacy
  OpenRouter-style alias for test back-compat, but production code must
  not call OpenRouter for Claude. The new constant is
  `ANTHROPIC_CLAUDE_MODEL = "claude-sonnet-4-6"` in `src/core/anthropic.ts`.

## Root cause we just fixed

Routing Claude through OpenRouter silently failed in production with
HTTP 401 (Anthropic-format `CLAUDE_API_KEY` is not a valid OpenRouter key).
The cascade at every call site caught the 401 and fell through to Llama,
producing the symptoms in the live log:

- repeated "mate" (explicitly forbidden by rule 2 of `buildSystemPrompt()`)
- persona flips (e.g. "หนูอยากโทร" on an en→th line that must be male)
- lost Thai softeners ("ค่ะ" / "คะ" / "นะ")
- invented currency ("£100" instead of "100")
- wrong-meaning translations ("I've got a sore throat" for "hungry, mouth hurts")

Tests didn't catch it because they only ever exercised the OpenRouter code
path (which 401'd quietly, but the tests didn't assert on provider
selection).

## Open work

- None for this milestone. Routes restored to intent; Llama fallback now
  uses a shorter, guide-tuned prompt with the safety rules preserved;
  hallucinated wrong-script words are rejected; "มิว" renders as "Miw".
- Roadmap items unchanged (per-chunk context, prompt caching, /stats).
- Follow-up: remove the legacy `MODELS.CLAUDE` OpenRouter-style alias
  once no test references it.
- Follow-up: rename `appendHermesDirectives` import in `api/webhook.ts`
  to `appendLlamaDirectives` (cosmetic — the alias is deprecated).
- Follow-up: the name rule is hardcoded to "มิว" → "Miw". If the cast
  changes, update rule 13 in `buildSystemPrompt()` and the
  NAME PRESERVATION line in `buildLlamaSystemPrompt()`.
- Follow-up: `isStandaloneThaiLaughter` only matches Arabic "5" runs.
  If Thai-script "๕๕๕" ever appears in practice, extend the regex.
- Follow-up: the kratom rule is hardcoded to "กระท่อม". If more
  fixed-transliteration terms are needed, extend rule 14 in
  `buildSystemPrompt()` and the FIXED TRANSLITERATIONS line in
  `buildLlamaSystemPrompt()`.
- **Refactor complete**: extracted shared cascade into
  `src/core/translate.ts`. Both `api/webhook.ts` and `src/bot/`
  now import from this single module. The two independent
  cascade implementations have been eliminated.
  - `src/core/translate.ts` exports: `runProvider`, `callOpenRouter`,
    `validateProviderOutput`, `maskProfanity`, `detectLanguage`,
    `getTargetLangCode`, `getSourceLangCode`, `translate`,
    `translateWithMemory`, `translateWithProfanityPipeline`.
  - `api/webhook.ts` imports `runProvider`, `maskProfanity`,
    `getTargetLangCode`, `getSourceLangCode` from `src/core/translate.ts`.
  - `src/translation/translator.ts` re-exports shared functions
    and keeps `translateWithProfanityPipelineAndMemory`.
  - `src/bot/bot.ts` and `src/bot/index.ts` import `translateWithMemory`
    from `src/core/translate.ts`.
  - `src/translation/memory.ts` updated with `fileURLToPath` fix.
  - `New Files/` directory removed.
