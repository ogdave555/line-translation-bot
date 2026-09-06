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
  - Primary: Claude Sonnet 4.6 via Anthropic API (claude-sonnet-4-6 model ID)
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
    `api/webhook.ts` and `src/translation/translator.ts` now route Claude
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
