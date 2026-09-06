# Progress — LINE Translation Bot

## Completed

- [x] **Language parameter hardening** (commit `4babff6`)
  - Added `WRONG_LANG_OUTPUT_REGEX` safety guard
  - Added per-provider `TEMPERATURE` map + `getTemperatureForProvider()`
  - Added `buildSystemPrompt()` with full ruleset (OUTPUT LANGUAGE LOCK,
    SPEAKER PERSONA, PRESERVE THAI INTERNET SLANG, PRESERVE EMOJIS,
    NO HALLUCINATIONS, THAI QUESTIONS, …)
  - Added `appendHermesDirectives()` (Hermes-specific)
  - Added `getSystemPromptForProvider()` (router helper)
  - Replaced translator cascade with `runProvider()` that applies the safety
    guard
  - Mirrored all changes in `api/webhook.ts` (Vercel serverless function)
  - All 61 tests passed.

- [x] **Model integration** (this commit)
  - Primary: Claude Sonnet 4.6 via Anthropic API (claude-sonnet-5 model ID)
  - Fallback: Llama 3.3 70B via OpenRouter (meta-llama/Llama-3.3-70B-Instruct)
  - Both use temperature 0.1, max_tokens 5000
  - Updated provider cascade from 3-tier to 2-tier (Claude → Llama)
  - appendLlamaDirectives() renamed from appendHermesDirectives
  - Smoke test passes for both models

- [x] **Translation quality fixes** (this commit)
  - **Issue 1 (profanity marker leak)**: added rule 10 "PRESERVE
    PLACEHOLDER MARKERS" to `buildSystemPrompt` so Claude and Gemini
    preserve `[PROFANITY:N]` markers verbatim during the masked
    translation. Added a defensive marker-loss check in both
    `translateWithPipeline` (webhook) and `translateWithProfanityPipeline`
    (library) so the pipeline returns the masked translation rather than
    producing corrupted output if the marker is still lost.
  - **Issue 2 (numbers / codes returning error)**: changed the return
    type of `translate()` in `api/webhook.ts` from `Promise<string>` to
    `Promise<{ text: string; ok: boolean }>`. Now `ok: true` is set
    whenever any provider returned a response, even if that response
    equals the input (correct behavior for untranslatable tokens). The
    `if (result === text) return errorMessage` check has been replaced
    with `if (!result.ok) return errorMessage`. The `buildSystemPrompt`
    also gained rule 11 "NUMBERS, CODES, AND IDENTIFIERS" telling the
    model to pass such tokens through verbatim.
  - **Issue 3 (Thai loanword mistranslation)**: added rule 12 "THAI
    LOANWORDS AND TECHNICAL TERMS" to `buildSystemPrompt`. It calls
    out "หล้อ" = tire (from Mandarin "lún" 轮) and gives the model a
    decision procedure for choosing between competing meanings of Thai
    words with multiple senses.
  - Added 3 new tests covering the three new prompt rules. 64/64
    tests pass, `tsc --noEmit` clean.

- [x] **Native Anthropic routing for Claude** (this commit)
  - **Root cause**: production code was sending the Anthropic-format
    `CLAUDE_API_KEY` to the OpenRouter chat-completions endpoint, which
    rejects it with HTTP 401. The cascade then silently fell through to
    the Llama fallback, producing the symptoms in the live log: forbidden
    "mate" colloquialism, persona flips, lost softeners, invented currency,
    wrong meanings. Tests didn't catch it because they only ever exercised
    the OpenRouter code path.
  - **Fix**: new `src/core/anthropic.ts` with `callAnthropic()` posts to
    `https://api.anthropic.com/v1/messages` with `x-api-key` +
    `anthropic-version` headers and the Anthropic-native body shape. Both
    `api/webhook.ts` and `src/core/translate.ts` now route Claude
    through `callAnthropic()` and keep Llama on OpenRouter.
  - **Bonus**: `TIMEOUT_MS` raised from 15s → 25s in `api/webhook.ts` so
    legitimate slow Claude calls don't get killed by Vercel's 30s budget.
  - **Caveats**: `MODELS.CLAUDE` still holds the OpenRouter-style id for
    test back-compat. New code should use `ANTHROPIC_CLAUDE_MODEL`. Llama
    fallback prompt is still the full Claude prompt; a shorter Llama-tuned
    prompt is a roadmap item.

- [x] **Shorter Llama-tuned fallback prompt** (this commit)
  - Added `buildLlamaSystemPrompt(sourceLang, targetLang)` to
    `src/core/config.ts` that returns the per-direction prompts from
    `model-guides/llama-quick-reference.md` (en→th: British male casual
    register; th→en: Thai female non-native with explicit forbidden-slang
    list), plus a thin **safety appendix** (OUTPUT LANGUAGE LOCK +
    `[PROFANITY:N]` marker preservation) that the guide prompts don't
    include but the production system relies on.
  - Wired `getSystemPromptForProvider('llama', …)` to use
    `buildLlamaSystemPrompt()` instead of `appendLlamaDirectives(buildSystemPrompt(…))`.
  - Mirrored in `api/webhook.ts` (Llama fallback now also uses the
    shorter prompt via the shared helper).
  - **Measured**: Llama prompt is 2,488–2,632 chars vs the Claude prompt's
    5,183 chars — roughly **half the length**, matching the guide's
    recommendation.
  - **Why not use the guide prompts verbatim?** They omit two production
    safety rules: the wrong-script guard (which prevents Llama from
    leaking into RU/ZH/JA/KR) and the placeholder-marker preservation
    rule (which the profanity pipeline relies on). Both are appended as a
    short safety block at the end.

- [x] **Name preservation rule**
  - The Thai nickname "มิว" was being rendered as "Mew" in English output
    because the model guide said "Miw stays Miw" but the guide is a
    reference doc — the prompt the model actually sees (`buildSystemPrompt`)
    had no name-preservation rule.
  - Added rule 13 "PROPER NOUNS AND NICKNAMES" to `buildSystemPrompt()`:
    "มิว" (Miw) MUST be rendered as "Miw" in English output, NEVER as
    "Mew", "Mue", "Moo", or any other spelling. Also preserves the
    original Latin-script name verbatim when translating English → Thai.
  - Mirrored the same rule in the Llama safety appendix
    (`buildLlamaSystemPrompt`), so both providers see it.
  - JSDoc on `buildSystemPrompt` updated to mention the rule; the
    stale "12-rule" reference in `getSystemPromptForProvider`'s JSDoc
    corrected to "14-rule".
- [x] **Skip standalone Thai laughter**
  - Messages that are only a run of Arabic "5"s ("55", "555", "5555", …)
    are Thai internet slang for "hahaha" and carry nothing to translate.
  - Added `isStandaloneThaiLaughter()` to `src/core/utils.ts` and wired it
    into the webhook filter chain in `api/webhook.ts` so these messages
    are skipped before any API call.
  - Smoke-verified: 11/11 cases pass (55/555/5555/5555555555 + whitespace
    variants → skip; single "5", "5555 hello", "hello 555", "55a55", "" →
    not skipped).
- [x] **Fixed kratom transliteration**
  - The bot kept rendering "kratom"/"Kratom" as "กระโต้ม", "กระต่ำ",
    "กระทม", "กระทอม", etc. instead of the correct "กระท่อม".
  - Added rule 14 "FIXED TRANSLITERATIONS" to `buildSystemPrompt()` and a
    matching line in the Llama safety appendix, both spelling out the
    correct form and the forbidden variants.
  - Verified: both Claude and Llama prompts contain "กระท่อม" and the
    forbidden-spelling list.
- [x] **Extracted shared cascade into src/core/translate.ts**
  - Created `src/core/translate.ts` with shared cascade logic:
    `runProvider`, `callOpenRouter`, `validateProviderOutput`,
    `maskProfanity`, `detectLanguage`, `getTargetLangCode`,
    `getSourceLangCode`, `translate`, `translateWithMemory`,
    `translateWithProfanityPipeline`, `OPENROUTER_API_URL`.
  - `api/webhook.ts` imports `runProvider`, `maskProfanity`,
    `getTargetLangCode`, `getSourceLangCode` from `src/core/translate.ts`
    instead of duplicating the cascade inline.
  - `src/core/translate.ts` re-exports shared functions from
    `src/core/translate.ts` and keeps `translateWithProfanityPipelineAndMemory`.
  - `src/bot/bot.ts` and `src/bot/index.ts` import `translateWithMemory`
    from `src/core/translate.ts` instead of `src/translation/translator.ts`.
  - `src/translation/memory.ts` updated with `fileURLToPath` fix.
  - Removed `New Files/` directory (cleaned-up scratch copies).
  - This eliminates the two independent cascade implementations that
    were drifting apart (the `validateOutputScript` gap was a concrete
    example).
- [x] **Updated model-guides to reflect API routing**
  - `claude-quick-reference.md`: fixed provider from "OpenRouter" to
    "Anthropic native API", model ID from "anthropic/claude-sonnet-4.6"
    to "claude-sonnet-5", API call example now uses
    `https://api.anthropic.com/v1/messages` with `x-api-key` +
    `anthropic-version` headers, footer updated.
  - `llama-quick-reference.md`: added the kratom rule and the
    post-translation guard note.
  - `thai-translation-guide.md`: fixed quick-reference table, model
    identifiers, split the API call example into Anthropic-native (Claude)
    and OpenRouter (Llama), updated JSON config and footer.
  - `README.md` (model-guides): fixed Claude model ID and provider.
  - `glossary.md`: added "Fixed Transliterations" section with kratom
    and Miw entries, plus a "Post-Translation Guard" section.

## Roadmap

- [ ] Optional: split long messages through `buildSystemPrompt` with a
      per-chunk context block (currently the chunked path in `webhook.ts` does
      not pass conversation context to each chunk).
- [ ] Optional: cache `buildSystemPrompt()` results for hot source/target
      pairs (negligible perf gain, deferred until profiling shows it matters).
- [ ] Optional: add a `/stats` admin command to report
      `usedFallback` / `usedExplicit` counts.
- [ ] Optional: remove the legacy `MODELS.CLAUDE` OpenRouter-style alias
      once no test references it (search for `MODELS.CLAUDE` first).

## Technical debt

- The profanity pipeline's Thai regex loop in `maskProfanity()` uses
  `replace()` + `lastIndex` reset, which is O(n²) in the worst case for very
  long Thai inputs. Not a problem at current message sizes but worth a
  follow-up.
- `getSystemPrompt()` legacy alias in `src/core/config.ts` ignores
  `_sourceUser` and `_contextMessages`. It only exists to keep the import
  surface stable. New code should use `getSystemPromptForProvider()`.
- The marker-preservation rule is enforced by both the prompt and a
  defensive code check. The defensive check is there as a safety net
  because models occasionally ignore prompt instructions. A future
  improvement would be to make the marker format less translateable
  (e.g. `<<<P1>>>` instead of `[PROFANITY:1]`).
- `MODELS.CLAUDE = "anthropic/claude-sonnet-4.6"` is an OpenRouter-style
  string kept for test back-compat. Production code must not call
  OpenRouter for Claude — use `callAnthropic()` instead. Removing the
  alias would be safe once tests stop referencing it.
- `api/webhook.ts` no longer uses `appendHermesDirectives` (Llama path
  routes through `getSystemPromptForProvider`). The function and its
  alias remain exported in `src/core/config.ts` for back-compat.
